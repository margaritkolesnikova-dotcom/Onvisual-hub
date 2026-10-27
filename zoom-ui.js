/* ONVISUAL Zoom team archive: private server index, cloud VTT, project assignments. */
(function(){
 'use strict';
 var panel=document.getElementById('mtZoomPanel');if(!panel)return;
 var keyInput=document.getElementById('mtZoomKey');
 var monthInput=document.getElementById('mtZoomMonth');
 var button=document.getElementById('mtZoomSync');
 var statusEl=document.getElementById('mtZoomState');
 var results=document.createElement('div');
 results.id='mtZoomResults';results.className='mt-zoom-results';panel.appendChild(results);
 var archiveRecords=[];
 var authorized=false;
 monthInput.value=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Europe/Moscow'}).format(new Date()).slice(0,7);
 button.textContent='Проверить новые записи';
 function status(s,error){
   statusEl.textContent=s;statusEl.classList.toggle('error',!!error);
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
   return {
     zoomUuid:m.uuid,zoomMeetingId:m.zoomId||'',title:m.title||'Zoom Meeting',
     date:m.date||String(m.startTime||'').slice(0,10),
     scope:m.project||'',videoUrl:m.videoUrl||'',
     zoomVideoAvailable:!!m.hasVideo,zoomTranscriptAvailable:!!m.hasTranscript,
     transcriptText:'',transcriptUrl:'',summary:'',decisions:'',actions:'',
   };
 }
 function imported(archive){
   archiveRecords=archive.meetings||[];
   if(archiveRecords.length){
     document.dispatchEvent(new CustomEvent('onvisual:meetings-import',
       {detail:{records:archiveRecords.map(toLocal)}}));
   }
   var unassigned=archiveRecords.filter(m=>!m.project).length;
   var videos=archiveRecords.filter(m=>m.hasVideo).length;
   var transcripts=archiveRecords.filter(m=>m.hasTranscript).length;
   results.innerHTML='<div class="mt-zoom-list-title">Облачный архив Zoom <small>'+
     esc(String(archiveRecords.length))+' встреч</small></div>'+
     '<div class="mt-cloud-stats"><span>'+videos+' видео</span><span>'+transcripts+' расшифровок</span><span>'+unassigned+' на распределение</span></div>'+
     '<p class="mt-cloud-hint">Новые встречи появляются в папке «На распределение». Выбери встречу слева и назначь ONVISUAL или Мультвселенной. Записи остаются в защищённом облаке Zoom.</p>';
 }
 async function getArchive(){
   var a=await api('list');
   authorized=true;
   imported(a);
   status('Подключено к общему архиву Zoom. Записи обновляются автоматически каждый день, а также по кнопке.',false);
 }
 async function connect(){
   var key=keyInput.value.trim();
   if(!key){if(!authorized){status('Для просмотра защищённого архива нужен ключ синхронизации.',true);return}return}
   if(key.length<20){status('Ключ должен содержать не менее 20 символов.',true);return}
   await api('login',{body:{},auth:key});
   keyInput.value='';
   authorized=true;
 }
 button.addEventListener('click',async function(){
   button.disabled=true;button.textContent='Проверяю Zoom...';
   try{
     await connect();
     if(!authorized)return;
     var month=monthInput.value;
     if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Выбери месяц');
     var result=await api('sync',{body:{month}});
     imported(result);
     var sync=result.synced||{};
     status('Синхронизация завершена. Zoom вернул '+(sync.discovered||0)+' записей за '+month+
       '. Новых/обновлённых: '+(sync.updated||0)+'. Загружено расшифровок: '+(sync.transcripts||0)+'.',false);
   }catch(e){status('Ошибка подключения: '+e.message,true)}
   finally{button.disabled=false;button.textContent='Проверить новые записи'}
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
   var btn=e.target.closest('#mtZoomTranscript');
   if(!btn)return;
   var uuid=btn.dataset.uuid;
   if(!uuid){return}
   btn.disabled=true;btn.textContent='Получаю VTT...';
   try{
     if(!authorized)throw new Error('Сначала подключи защищённый архив Zoom');
     var result=await api('transcript',{uuid});
     document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{
       detail:{records:[{zoomUuid:uuid,transcriptText:result.transcript}]}
     }));
     status('Расшифровка Zoom добавлена к записи встречи.',false);
   }catch(err){status('Не удалось загрузить расшифровку: '+err.message,true)}
   finally{btn.disabled=false;btn.textContent='Получить расшифровку Zoom'}
 });
 getArchive().catch(function(e){
   authorized=false;
   status('Облачный архив защищён. Введи ключ и нажми «Проверить новые записи», чтобы подключиться. '+(e.message==='Введите ключ архива Zoom для доступа к встречам'?'':'('+e.message+')'),false);
 });
})();
