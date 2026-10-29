/* ONVISUAL Zoom team archive: private server index, cloud VTT, project assignments. */
(function(){
 'use strict';
 var panel=document.getElementById('mtZoomPanel');if(!panel)return;
 var keyInput=document.getElementById('mtZoomKey');
 var monthInput=document.getElementById('mtZoomMonth');
 var button=document.getElementById('mtZoomSync');
 var connectButton=document.getElementById('mtZoomConnect');
 var statusEl=document.getElementById('mtZoomState');
 var results=document.createElement('div');
 results.id='mtZoomResults';results.className='mt-zoom-results';panel.appendChild(results);
 var archiveRecords=[];
 var authorized=false;
 monthInput.value=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Europe/Moscow'}).format(new Date()).slice(0,7);
 button.textContent='Проверить новые записи Zoom';
 function status(s,error){
   statusEl.textContent=s;statusEl.classList.toggle('error',!!error);
 }
 function showLocked(){
   panel.classList.add('mt-archive-locked');
   results.innerHTML='<div class="mt-lock-notice"><strong>Архив встреч закрыт на этом устройстве</strong><p>Записи, видео и PDF сохранены на сервере. Чтобы увидеть их на iPhone, один раз введи ключ доступа и нажми «Открыть архив встреч». Нули на этой странице не означают, что встречи удалены.</p></div>';
   ['meetingCount','meetingVideoCount','meetingTranscriptCount','mtProjectAllCount','mtProjectOnvisualCount','mtProjectMultiverseCount','mtProjectUnassignedCount'].forEach(function(id){
     var node=document.getElementById(id);if(node)node.textContent='—';
   });
   var list=document.getElementById('meetingFolders');
   if(list)list.setAttribute('aria-busy','true');
 }
 function clearLocked(){
   panel.classList.remove('mt-archive-locked');
   var list=document.getElementById('meetingFolders');
   if(list)list.removeAttribute('aria-busy');
 }
 function esc(s){return String(s??'').replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]})}
 async function api(action,options){
   options=options||{};
   var url='/api/meeting-archive?action='+encodeURIComponent(action);
   if(options.uuid)url+='&uuid='+encodeURIComponent(options.uuid);
   var headers={'Accept':'application/json','X-ONVISUAL-REQUEST':'1'};
   if(options.auth)headers.Authorization='Bearer '+options.auth;
   if(options.body)headers['Content-Type']='application/json';
   var res=await fetch(url,{method:options.body?'POST':'GET',credentials:'same-origin',cache:'no-store',
     headers,body:options.body?JSON.stringify(options.body):undefined});
   var data=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(data.error||'Ошибка архива ('+res.status+')');
   return data;
 }
 function toLocal(m){
   var time='',localDate=m.date||String(m.startTime||'').slice(0,10);
   try{
     var dt=new Date(m.startTime);
     if(!isNaN(dt)){
       time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(dt);
       localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(dt);
     }
   }catch(e){}
   return {
     zoomUuid:m.uuid,zoomMeetingId:m.zoomId||'',
     zoomSource:m.source||'zoom',
     title:(m.title||'Zoom Meeting')+((m.source==='local')?'':(time?' · '+time:'')),
     date:localDate,
     scope:m.project||'',videoUrl:m.videoUrl||'',
     transcriptStored:!!m.transcriptStored,summaryStored:!!m.summaryStored,summaryDocUrl:m.summaryDocUrl||'',privateVideoStored:!!m.privateVideoStored,
     zoomVideoAvailable:!!m.hasVideo,zoomTranscriptAvailable:!!m.hasTranscript,
     transcriptText:'',transcriptUrl:'',summary:'',decisions:'',actions:'',
   };
 }
 var briefsLoaded=new Set();
 async function loadBriefs(){
   var ready=archiveRecords.filter(m=>m.summaryStored&&!briefsLoaded.has(m.uuid));
   for(var i=0;i<ready.length;i+=3){
     await Promise.all(ready.slice(i,i+3).map(async function(m){
       try{
         var result=await api('brief',{uuid:m.uuid});
         briefsLoaded.add(m.uuid);
         document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{
           detail:{records:[{zoomUuid:m.uuid,summary:result.overview,
             decisions:result.decisions?.length?result.decisions.map(v=>'• '+v).join('\n'):result.note,
             actions:(result.tasks||[]).map(t=>[t.title,t.owner,t.due].join(' | ')).join('\n'),
             briefSource:'zoom_summary'}]}
         }));
       }catch(e){}
     }));
   }
 }
 document.addEventListener('onvisual:meeting-video-requested',async function(event){
   var uuid=event.detail?.uuid;
   if(!uuid)return;
   try{
     var result=await api('video-link',{uuid});
     document.dispatchEvent(new CustomEvent('onvisual:meeting-video-ready',{
       detail:{uuid,url:result.url,source:result.source}
     }));
   }catch(e){status('Видео ещё не доступно для просмотра: '+e.message,true)}
 });
 document.addEventListener('onvisual:meeting-video-upload',async function(event){
   var d=event.detail||{},file=d.file;
   if(!file||!d.uuid)return;
   try{
     if(!authorized)throw new Error('Сначала подключи защищённый архив Zoom');
     if(!/\.mp4$/i.test(file.name)||file.size>1200*1024*1024)throw new Error('Нужен MP4 до 1,2 ГБ');
     status('Загружаю MP4 в защищённое командное хранилище. Не закрывай вкладку.',false);
     var signed=await api('video-upload-url',{body:{uuid:d.uuid,size:file.size}});
     var upload=await fetch(signed.url,{method:'PUT',body:file,headers:{'Content-Type':'video/mp4'}});
     if(!upload.ok)throw new Error('Хранилище отклонило загрузку: HTTP '+upload.status);
     var uploadedFile=await upload.json();
     if(!uploadedFile.url)throw new Error('Не получено подтверждение адреса файла');
     var uploadedUrl=new URL(uploadedFile.url);
     if(!/\.private\.blob\.vercel-storage\.com$/i.test(uploadedUrl.hostname))throw new Error('Хранилище вернуло неправильный адрес');
     var actualPath=decodeURIComponent(uploadedUrl.pathname.slice(1));
     var confirmed=await api('video-confirm',{body:{uuid:d.uuid,pathname:actualPath}});
     if(!confirmed.ok)throw new Error('Сервер не подтвердил привязку MP4');
     var check=await api('video-link',{uuid:d.uuid});
     if(check.source!=='private')throw new Error('Сервер пока не видит файл, повтори проверку');
     document.dispatchEvent(new CustomEvent('onvisual:meeting-video-ready',{
       detail:{uuid:d.uuid,url:check.url,source:'private',stored:true}
     }));
     status('Видео успешно загружено. Смотреть могут все участники с доступом к защищённому хабу.',false);
   }catch(e){status('Не удалось загрузить видео: '+e.message,true)}
   finally{if(d.input){d.input.disabled=false;d.input.value=''}}
 });
 function imported(archive){
   var gone=Array.isArray(archive.deletedUuids)?archive.deletedUuids:[];
   if(gone.length)document.dispatchEvent(new CustomEvent('onvisual:meetings-deleted-from-server',{detail:{uuids:gone}}));
   archiveRecords=(archive.meetings||[]).filter(function(m){return !gone.includes(m.uuid)});
   if(archiveRecords.length){
     document.dispatchEvent(new CustomEvent('onvisual:meetings-import',
       {detail:{records:archiveRecords.map(toLocal)}}));
   }
   loadBriefs().catch(function(){});
   var unassigned=archiveRecords.filter(m=>!m.project).length;
   var videos=archiveRecords.filter(m=>m.hasVideo||m.privateVideoStored).length;
   var savedVideos=archiveRecords.filter(m=>m.privateVideoStored).length;
   var zoomOnlyVideos=archiveRecords.filter(m=>m.hasVideo&&!m.privateVideoStored).length;
   var transcripts=archiveRecords.filter(m=>m.transcriptStored).length;
   var summaries=archiveRecords.filter(m=>m.summaryStored).length;
   results.innerHTML='<div class="mt-zoom-list-title">Облачный архив Zoom <small>'+
     esc(String(archiveRecords.length))+' встреч</small></div>'+
     '<div class="mt-cloud-stats"><span>'+savedVideos+' MP4 сохранено в хабе</span><span>'+zoomOnlyVideos+' видео пока только в Zoom</span><span>'+transcripts+' расшифровок</span><span>'+summaries+' резюме Zoom</span><span>'+unassigned+' на распределение</span></div>'+
     '<p class="mt-cloud-hint">Все встречи сохраняются в защищённом архиве хаба. MP4 из Zoom автоматически копируются по очереди; пока копия не готова, видео открывается в Zoom. Резюме и расшифровки уже сохраняются отдельно. Встречи, удалённые из хаба, повторно не импортируются.</p>';
 }
 async function reconcileLocalProjects(){
   try{
     var local=JSON.parse(localStorage.getItem('onvisualHubMeetingsV1')||'[]');
     if(!Array.isArray(local))return;
     var byUuid=new Map(local.filter(m=>m.zoomUuid&&['ONVISUAL','Мультвселенная'].includes(m.scope))
       .map(m=>[m.zoomUuid,m.scope]));
     for(const meeting of archiveRecords){
       if(meeting.project||!byUuid.has(meeting.uuid))continue;
       try{
         var desired=byUuid.get(meeting.uuid);
         await api('assign',{body:{uuid:meeting.uuid,project:desired}});
         meeting.project=desired;
       }catch(e){status('Не удалось перенести выбранный проект в общий архив: '+e.message,true)}
     }
   }catch(e){}
 }

 async function getArchive(){
   var a=await api('list');
   clearLocked();
   imported(a);
   await reconcileLocalProjects();
   status('Архив встреч доступен для просмотра всем, у кого есть ссылка на хаб. Изменения и синхронизация Zoom доступны только администратору.',false);
 }
 async function connect(){
   var key=keyInput.value.trim();
   if(!key){if(!authorized)throw new Error('Введи ключ доступа к архиву — он настраивается отдельно для Safari на iPhone');return}
   if(key.length<20)throw new Error('Ключ доступа должен содержать не менее 20 символов');
   await api('login',{body:{},auth:key});
   keyInput.value='';
   authorized=true;
 }
 if(connectButton)connectButton.addEventListener('click',async function(){
   connectButton.disabled=true;connectButton.textContent='Подключаю архив…';
   try{
     await connect();
     await getArchive();
     status('Администратор подключён. Просмотр встреч доступен всем по ссылке, редактирование — только с ключом.',false);
   }catch(e){showLocked();status('Не удалось открыть архив: '+e.message,true)}
   finally{connectButton.disabled=false;connectButton.textContent='Открыть архив встреч'}
 });
 keyInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();if(connectButton)connectButton.click()}});

 button.addEventListener('click',async function(){
   button.disabled=true;button.textContent='Проверяю Zoom...';
   try{
     if(!authorized&&keyInput.value.trim())await connect();
     await getArchive();
     var month=monthInput.value;
     if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Выбери месяц');
     var result=await api('sync',{body:{month}});
     imported(result);
     var sync=result.synced||{};
     status('Синхронизация завершена. Zoom вернул '+(sync.discovered||0)+' записей за '+month+
       '. Новых/обновлённых: '+(sync.updated||0)+'. Расшифровок: '+(sync.transcripts||0)+'. Копирование MP4 в закрытое хранилище выполняется отдельным ежедневным процессом.',false);
   }catch(e){status('Ошибка подключения: '+e.message,true)}
   finally{button.disabled=false;button.textContent='Проверить новые записи Zoom'}
 });
 document.addEventListener('onvisual:meeting-transcript-upload',async function(event){
   var d=event.detail||{},file=d.file,input=d.input;
   if(!file||!input)return;
   try{
     if(!authorized)throw new Error('Открой защищённый архив Zoom через поле подключения');
     if(file.size>800000||!/\.(txt|vtt|srt)$/i.test(file.name))
       throw new Error('Допустимы файлы TXT, VTT, SRT не более 800 КБ');
     status('Сохраняю исходный файл расшифровки в закрытом архиве...',false);
     var transcript=await file.text();
     var reply=await api('upload-transcript',{body:{
       uuid:d.uuid,title:d.title,date:d.date,project:d.project,startTime:d.startTime,transcript
     }});
     if(!reply.fileSaved)throw new Error('Сервер не подтвердил запись файла');
     document.dispatchEvent(new CustomEvent('onvisual:meeting-transcript-uploaded',{
       detail:{meetingId:d.meetingId,uuid:reply.uuid}
     }));
     status('Файл '+file.name+' сохранён в защищённой папке встречи. Его можно скачать из хаба.',false);
   }catch(e){
     status('Не удалось прикрепить TXT/VTT: '+e.message,true);
   }finally{input.disabled=false;input.value=''}
 });
 document.addEventListener('onvisual:meeting-delete-confirmed',function(event){
   var uuid=event.detail?.uuid;
   if(!uuid)return;
   archiveRecords=archiveRecords.filter(function(m){return m.uuid!==uuid});
   briefsLoaded.add(uuid);
   var card=results.querySelector('.mt-zoom-list-title small');
   if(card)card.textContent=String(archiveRecords.length)+' встреч';
   getArchive().catch(function(e){status('Удаление сохранено, но список пока не обновился: '+e.message,true)});
 });
 document.addEventListener('onvisual:meeting-project-assigned',async function(e){
   var uuid=e.detail?.zoomUuid,project=e.detail?.project;
   if(!uuid||!project)return;
   try{
     if(!authorized)throw new Error('Сначала открой защищённый архив Zoom');
     await api('assign',{body:{uuid,project}});
     var r=archiveRecords.find(x=>x.uuid===uuid);
     if(r)r.project=project;
     status('Сохранено для команды: встреча перенесена в «'+project+'».',false);
   }catch(err){status('Проект изменён в этом браузере, но не сохранён для команды: '+err.message,true)}
 });
 document.addEventListener('click',async function(e){
   var summaryButton=e.target.closest('#mtGetZoomSummary');
   if(summaryButton){
     var uuid=summaryButton.dataset.uuid;
     summaryButton.disabled=true;summaryButton.textContent='Проверяю Zoom...';
     try{
       if(!authorized)throw new Error('Сначала подключи защищённый архив Zoom');
       await api('summary',{uuid});
       document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{detail:{records:[{zoomUuid:uuid,summaryStored:true}]}}));
       status('Готовое резюме Zoom добавлено как файл в карточку встречи.',false);
     }catch(err){status('Резюме Zoom недоступно: '+err.message,true)}
     finally{summaryButton.disabled=false;summaryButton.textContent='Проверить готовое резюме'}
     return;
   }
   var btn=e.target.closest('#mtZoomTranscript');
   if(!btn)return;
   var uuid=btn.dataset.uuid;
   if(!uuid){return}
   btn.disabled=true;btn.textContent='Получаю VTT...';
   try{
     if(!authorized)throw new Error('Сначала подключи защищённый архив Zoom');
     var result=await api('transcript',{uuid});
     document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{
       detail:{records:[{zoomUuid:uuid,transcriptStored:true,zoomTranscriptAvailable:true}]}
     }));
     status('Файл расшифровки Zoom добавлен в защищённую папку встречи.',false);
   }catch(err){status('Не удалось загрузить расшифровку: '+err.message,true)}
   finally{btn.disabled=false;btn.textContent='Получить расшифровку Zoom'}
 });
 getArchive().catch(function(e){
   status('Не удалось загрузить общий каталог. Данные не удалены: '+e.message,true);
   results.innerHTML='<div class="mt-lock-notice"><strong>Временная ошибка загрузки</strong><p>Архив хранится на сервере. Обнови страницу для повторного подключения — ключ для просмотра не нужен.</p></div>';
 });
})();
