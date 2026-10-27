/* ONVISUAL / MEETINGS — local catalog.
   Video files remain in the owner's Zoom or Yandex cloud.
   Metadata and pasted transcripts stay in this browser until a private team backend is connected. */
(function(){
  'use strict';
  var STORE='onvisualHubMeetingsV1';
  var root=document.getElementById('meetings');
  if(!root)return;
  var list=document.getElementById('meetingFolders');
  var detail=document.getElementById('meetingDetail');
  var form=document.getElementById('meetingForm');
  var modal=document.getElementById('meetingModal');
  var search=document.getElementById('meetingSearch');
  var projectTabs=document.getElementById('mtProjectTabs');
  var activeProject='all';
  var editing=null, selected=null;
  var meetings=[];
  try {var value=JSON.parse(localStorage.getItem(STORE)||'[]');meetings=Array.isArray(value)?value:[]}catch(e){meetings=[]}
  function safe(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
  function makeId(){return 'meet-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function save(){
    try{localStorage.setItem(STORE,JSON.stringify(meetings));return true}
    catch(e){alert('Недостаточно памяти браузера. Сократи расшифровку или оставь ссылку на файл в Zoom/Диске.');return false}
  }

  // Local MP4 stays on this device in IndexedDB. It is never sent to public Vercel.
  var activeVideoObjectURL=null;
  function openVideoDB(){
    return new Promise(function(resolve,reject){
      if(!('indexedDB' in window)){reject(new Error('Браузер не поддерживает локальное хранилище видео'));return}
      var req=indexedDB.open('onvisualMeetingVideosV1',1);
      req.onupgradeneeded=function(){var db=req.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos',{keyPath:'id'})};
      req.onsuccess=function(){resolve(req.result)};
      req.onerror=function(){reject(req.error||new Error('Ошибка IndexedDB'))};
    });
  }
  async function writeVideo(id,file){
    var db=await openVideoDB();
    try{
      await new Promise(function(resolve,reject){
        var tx=db.transaction('videos','readwrite');
        tx.objectStore('videos').put({id:id,blob:file,name:file.name,type:file.type});
        tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error||new Error('Недостаточно места для видео'))};
        tx.onabort=function(){reject(tx.error||new Error('Сохранение видео отменено'))};
      });
    }finally{db.close()}
  }
  async function readVideo(id){
    var db=await openVideoDB();
    try{
      return await new Promise(function(resolve,reject){
        var tx=db.transaction('videos','readonly');
        var request=tx.objectStore('videos').get(id);
        request.onsuccess=function(){resolve(request.result||null)};
        request.onerror=function(){reject(request.error||new Error('Не удалось открыть видео'))};
      });
    }finally{db.close()}
  }
  async function removeVideo(id){
    var db=await openVideoDB();
    try{await new Promise(function(resolve,reject){
      var tx=db.transaction('videos','readwrite');
      tx.objectStore('videos').delete(id);
      tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error)};
    })}finally{db.close()}
  }
  function revokeCurrentVideo(){
    if(activeVideoObjectURL){URL.revokeObjectURL(activeVideoObjectURL);activeVideoObjectURL=null}
  }
  async function renderLocalVideo(m){
    var slot=detail.querySelector('#mtLocalVideoSlot');
    if(!slot)return;
    try{
      var item=await readVideo(m.id);
      if(selected!==m.id||!slot.isConnected)return;
      if(!item||!item.blob){slot.textContent='Локальное видео не найдено в этом браузере. Прикрепи MP4 заново.';return}
      activeVideoObjectURL=URL.createObjectURL(item.blob);
      var player=document.createElement('video');
      player.className='mt-video';
      player.controls=true;
      player.preload='metadata';
      player.src=activeVideoObjectURL;
      slot.replaceChildren(player);
    }catch(err){if(selected===m.id&&slot.isConnected)slot.textContent='Ошибка открытия локального видео: '+err.message}
  }

  function fmt(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return d||'Без даты';return d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4)}
  function validUrl(v){if(!v)return '';try{var u=new URL(v);return u.protocol==='https:'?u.href:''}catch(e){return ''}}
  function label(value){return safe(value||'Не указано')}
  function getCurrent(){return meetings.find(function(x){return x.id===selected})}
  function actionRows(m){
    return String(m.actions||'').split('\n').map(function(s){return s.trim()}).filter(Boolean).map(function(line,index){
      var p=line.split('|').map(function(s){return s.trim()});
      return {key:index+':'+line,title:p[0]||'',owner:p[1]||'',due:/^\d{4}-\d{2}-\d{2}$/.test(p[2]||'')?p[2]:''};
    }).filter(function(t){return t.title});
  }
  function linkHtml(raw,text){
    var url=validUrl(raw);
    return url?'<a class="mt-link" href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">'+safe(text)+' ↗</a>':'';
  }
  function isProject(scope){return scope==='ONVISUAL'||scope==='Мультвселенная'}
  function projectValue(scope){return isProject(scope)?scope:'unassigned'}
  function projectName(scope){
    return scope==='ONVISUAL'?'ONVISUAL':scope==='Мультвселенная'?'Мультвселенная':'На распределение';
  }
  function render(){
    var q=(search.value||'').toLowerCase().trim();
    var entries=meetings.filter(function(m){
      return (activeProject==='all'||projectValue(m.scope)===activeProject)&&
        (!q||[m.title,m.date,m.scope,m.participants,m.summary,m.transcriptText].join(' ').toLowerCase().includes(q));
    }).sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')});
    var allCount=meetings.length;
    document.getElementById('meetingCount').textContent=String(allCount);
    document.getElementById('meetingVideoCount').textContent=String(meetings.filter(function(m){return !!(m.videoUrl||m.localVideoName)}).length);
    document.getElementById('meetingTranscriptCount').textContent=String(meetings.filter(function(m){return !!(m.transcriptText||m.transcriptUrl)}).length);
    var counters=[
      ['mtProjectAllCount',allCount],
      ['mtProjectOnvisualCount',meetings.filter(function(m){return projectValue(m.scope)==='ONVISUAL'}).length],
      ['mtProjectMultiverseCount',meetings.filter(function(m){return projectValue(m.scope)==='Мультвселенная'}).length],
      ['mtProjectUnassignedCount',meetings.filter(function(m){return projectValue(m.scope)==='unassigned'}).length]
    ];
    counters.forEach(function(pair){
      var n=document.getElementById(pair[0]);if(n)n.textContent=String(pair[1]);
    });
    projectTabs.querySelectorAll('[data-meeting-project]').forEach(function(b){
      var active=b.dataset.meetingProject===activeProject;
      b.classList.toggle('is-active',active);
      b.setAttribute('aria-pressed',String(active));
    });
    list.innerHTML='';
    if(!entries.length){
      list.innerHTML='<div class="mt-empty"><div>◌</div><h3>'+(q||activeProject!=='all'?'Встреч не найдено':'Пока нет сохранённых встреч')+'</h3><p>Выбери ONVISUAL или Мультвселенная при создании встречи. Записи Zoom без проекта попадут в «На распределение».</p></div>';
      renderDetail();
      return;
    }
    var order=['ONVISUAL','Мультвселенная','unassigned'];
    order.forEach(function(project){
      var matches=entries.filter(function(m){return projectValue(m.scope)===project});
      if(!matches.length)return;
      var group=document.createElement('div');
      group.className='mt-project-group mt-project-'+(project==='ONVISUAL'?'ov':project==='Мультвселенная'?'mv':'pending');
      group.innerHTML='<div class="mt-project-heading"><span>'+safe(projectName(project))+'</span><b>'+matches.length+'</b></div>';
      var dates={};matches.forEach(function(m){(dates[m.date]||(dates[m.date]=[])).push(m)});
      Object.keys(dates).sort().reverse().forEach(function(date){
        var folder=document.createElement('div');
        folder.className='mt-folder';
        folder.innerHTML='<div class="mt-folder-title"><span class="mt-folder-symbol">▤</span><div><strong>'+safe(fmt(date))+'</strong><small>'+dates[date].length+' встреч</small></div></div><div class="mt-folder-entries"></div>';
        var body=folder.querySelector('.mt-folder-entries');
        dates[date].forEach(function(m){
          var b=document.createElement('button');
          b.type='button';
          b.className='mt-entry'+(selected===m.id?' is-active':'');
          b.innerHTML='<span class="mt-entry-name"><strong>'+safe(m.title)+'</strong><small>'+(m.participants?safe(m.participants):'Встреча Zoom / ручная запись')+'</small></span>'+
            '<span class="mt-entry-tags">'+((m.videoUrl||m.localVideoName)?'<i>▶ Видео</i>':'')+((m.transcriptText||m.transcriptUrl)?'<i>≡ Текст</i>':'')+'</span>';
          b.addEventListener('click',function(){selected=m.id;render()});
          body.appendChild(b);
        });
        group.appendChild(folder);
      });
      list.appendChild(group);
    });
    renderDetail();
  }
  function renderDetail(){
    revokeCurrentVideo();
    var m=getCurrent();
    if(!m){
      detail.innerHTML='<div class="mt-placeholder"><div class="mt-placeholder-orbit">◌</div><h3>Архив созвонов</h3><p>Выбери встречу слева или создай новую. В одной папке могут лежать несколько созвонов за день.</p></div>';
      return;
    }
    var video=validUrl(m.videoUrl),tr=validUrl(m.transcriptUrl);
    var isDirectVideo=video&&/\.(mp4|webm|ogg)(?:$|[?#])/i.test(video);
    var rows=actionRows(m),imported=m.sentTaskKeys||[];
    detail.innerHTML='<div class="mt-detail-head"><div><span class="mt-kicker">'+safe(projectName(m.scope))+' / '+safe(fmt(m.date))+'</span><h2>'+safe(m.title)+'</h2>'+
      '<p>'+(m.participants?'Участники: '+safe(m.participants):'Участники не указаны')+'</p></div><div class="mt-detail-actions"><button type="button" id="mtEdit">Редактировать</button><button type="button" id="mtDelete" class="mt-danger">Удалить</button></div></div>'+
      '<div class="mt-assign-row"><label for="mtMoveProject">Проект встречи</label><select id="mtMoveProject" aria-label="Переместить встречу в проект">'+'<option value="" '+(!isProject(m.scope)?'selected':'')+'>На распределение</option>'+'<option value="ONVISUAL" '+(m.scope==='ONVISUAL'?'selected':'')+'>ONVISUAL</option>'+'<option value="Мультвселенная" '+(m.scope==='Мультвселенная'?'selected':'')+'>Мультвселенная</option></select>'+'<span>При выборе проекта встреча и её папка автоматически перемещаются в соответствующий раздел.</span></div>'+'<div class="mt-media-grid"><section class="mt-content-card"><div class="mt-card-label"><span>01 / VIDEO</span><b>Запись созвона</b></div>'+
      (m.localVideoName?'<div id="mtLocalVideoSlot" class="mt-video-local-slot">Открываю видео с этого компьютера…</div>':isDirectVideo?'<video class="mt-video" controls preload="metadata" src="'+safe(video)+'"></video>':video?'<div class="mt-media-placeholder"><span>▶</span><p>Видео хранится в Zoom / облаке</p></div>':'<div class="mt-media-placeholder"><span>▷</span><p>Видео пока не прикреплено</p></div>')+
      (m.localVideoName?'<small>Локальная копия: '+safe(m.localVideoName)+' — только в этом браузере на этом устройстве.</small>':video?linkHtml(video,'Открыть запись / скачать'):'<small>Добавь MP4 с компьютера или защищённую облачную ссылку через «Редактировать».</small>')+
      '</section><section class="mt-content-card"><div class="mt-card-label"><span>02 / TRANSCRIPT</span><b>Расшифровка</b></div>'+
      (m.transcriptText?'<div class="mt-transcript-preview">'+safe(m.transcriptText)+'</div>':'<div class="mt-media-placeholder mt-text-placeholder"><span>≡</span><p>Текст можно вставить или прикрепить файлом VTT/TXT</p></div>')+
      '<div class="mt-inline-actions">'+(m.transcriptText?'<button type="button" id="mtDownloadTranscript">Скачать TXT ↓</button>':'')+(tr?linkHtml(tr,'Открыть расшифровку'):'')+'</div>'+
      (m.zoomTranscriptAvailable&&!m.transcriptText?'<button type="button" class="mt-zoom-get-transcript" id="mtZoomTranscript" data-uuid="'+safe(m.zoomUuid||'')+'">Получить расшифровку Zoom</button>':'')+'</section></div>'+
      '<section class="mt-content-card mt-notes"><div class="mt-card-label"><span>03 / NOTES</span><b>Протокол и решения</b></div>'+
      '<h4>Краткие итоги</h4><p class="mt-preserve">'+safe(m.summary||'Итоги будут добавлены после обработки расшифровки.')+'</p>'+
      '<h4>Принятые решения</h4><p class="mt-preserve">'+safe(m.decisions||'Пока не зафиксированы.')+'</p></section>'+
      '<section class="mt-content-card mt-actions"><div class="mt-card-label"><span>04 / ACTIONS</span><b>Задачи по встрече</b></div>'+
      (rows.length?'<div class="mt-action-list">'+rows.map(function(t){
        var done=imported.includes(t.key);
        return '<div><span>'+safe(t.title)+'</span><small>'+safe(t.owner||'Без ответственного')+(t.due?' · '+safe(fmt(t.due)):' · Срок не указан')+'</small><em>'+(done?'В задачах ✓':'К передаче')+'</em></div>';
      }).join('')+'</div><button type="button" id="mtTransferTasks" class="mt-primary">Добавить новые задачи в хаб</button>':
      '<p class="mt-preserve">Пока нет задач. Можно указать одну задачу в строке: название | ответственный | дата ГГГГ-ММ-ДД.</p>')+
      '<small>Задачи передаются в текущую доску «Задачи» на этом устройстве. Перед публикацией для всей команды нужна синхронизация хаба.</small></section>';
    if(m.localVideoName)renderLocalVideo(m);
    detail.querySelector('#mtMoveProject').addEventListener('change',function(e){
      var next=e.target.value;
      if(next!==''&&!isProject(next))return;
      if(m.scope===next)return;
      m.scope=next;
      if(!save())return;
      if(activeProject!=='all')activeProject=projectValue(next);
      if(m.zoomUuid&&isProject(next)){
        document.dispatchEvent(new CustomEvent('onvisual:meeting-project-assigned',{
          detail:{zoomUuid:m.zoomUuid,project:next}
        }));
      }
      render();
    });
    detail.querySelector('#mtEdit').addEventListener('click',function(){openForm(m.id)});
    detail.querySelector('#mtDelete').addEventListener('click',function(){
      if(!confirm('Удалить встречу «'+m.title+'» из локального каталога? Запись в Zoom/Диске останется.'))return;
      if(m.localVideoName)removeVideo(m.id).catch(function(){/* keep deletion local */});
      meetings=meetings.filter(function(x){return x.id!==m.id}); selected=null;save();render();
    });
    var down=detail.querySelector('#mtDownloadTranscript');
    if(down)down.addEventListener('click',function(){
      var blob=new Blob([m.transcriptText],{type:'text/plain;charset=utf-8'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');a.href=url;a.download='ONVISUAL_'+m.date+'_transcript.txt';a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);
    });
    var transfer=detail.querySelector('#mtTransferTasks');
    if(transfer)transfer.addEventListener('click',function(){
      if(!isProject(m.scope)){alert('Сначала выбери проект: ONVISUAL или Мультвселенная.');return;}
      var todo=rows.filter(function(t){return !imported.includes(t.key)});
      if(!todo.length){alert('Все задачи из этой встречи уже перенесены.');return}
      if(!confirm('Добавить '+todo.length+' новых задач в раздел «Задачи» на этом устройстве?'))return;
      try{
        if(typeof tasks!=='undefined'&&typeof writeStore==='function'&&typeof renderTasks==='function'){
          todo.forEach(function(t){
            tasks.unshift({id:makeId(),title:t.title,scope:m.scope||'Общее',status:'new',due:t.due,dueTime:'',owner:t.owner,note:'Из встречи '+fmt(m.date)+' — '+m.title});
          });
          writeStore('onvisualHubTasksV1',tasks); renderTasks();
        }else{throw new Error('Tasks API is not ready')}
        m.sentTaskKeys=(m.sentTaskKeys||[]).concat(todo.map(function(t){return t.key}));
        if(save())render();
      }catch(e){alert('Не получилось передать задачи: '+e.message)}
    });
  }
  function openForm(id){
    editing=id||null;
    var m=meetings.find(function(x){return x.id===id});
    form.reset();
    var now=new Date();var today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    form.elements.date.value=m?m.date:today;
    ['title','scope','participants','videoUrl','transcriptUrl','transcriptText','summary','decisions','actions'].forEach(function(key){
      if(m&&form.elements[key])form.elements[key].value=m[key]||'';
    });
    if(!m && isProject(activeProject))form.elements.scope.value=activeProject;
    document.getElementById('mtModalTitle').textContent=m?'Изменить встречу':'Новая встреча';
    modal.showModal();
  }
  document.getElementById('mtAddMeeting').addEventListener('click',function(){openForm()});
  document.getElementById('mtCancelMeeting').addEventListener('click',function(){modal.close()});
  document.getElementById('mtCancelMeetingFooter').addEventListener('click',function(){modal.close()});
  search.addEventListener('input',render);
  projectTabs.addEventListener('click',function(e){
    var tab=e.target.closest('[data-meeting-project]');
    if(!tab)return;
    activeProject=tab.dataset.meetingProject;
    selected=null;
    render();
  });
  document.getElementById('mtExport').addEventListener('click',function(){
    var blob=new Blob([JSON.stringify(meetings,null,2)],{type:'application/json;charset=utf-8'});
    var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='onvisual_meetings_backup.json';a.click();
    setTimeout(function(){URL.revokeObjectURL(url)},1000);
  });
  document.getElementById('meetTranscriptFile').addEventListener('change',async function(e){
    var f=e.target.files&&e.target.files[0];if(!f)return;
    if(f.size>280000){alert('Этот текстовый файл слишком большой для браузерного черновика. Прикрепи ссылку на него в Zoom/Диске.');e.target.value='';return}
    try{form.elements.transcriptText.value=await f.text()}catch(err){alert('Не удалось прочитать файл')}
    e.target.value='';
  });
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var fd=new FormData(form);
    var data={};
    ['date','title','scope','participants','videoUrl','transcriptUrl','transcriptText','summary','decisions','actions'].forEach(function(k){data[k]=String(fd.get(k)||'').trim()});
    if(!data.title||!data.date){alert('Заполни дату и название');return}
    if(!isProject(data.scope)){alert('Выбери проект: ONVISUAL или Мультвселенная.');return}
    if(data.videoUrl&&!validUrl(data.videoUrl)){alert('Ссылка на видео должна начинаться с https://');return}
    if(data.transcriptUrl&&!validUrl(data.transcriptUrl)){alert('Ссылка на расшифровку должна начинаться с https://');return}
    var prev=meetings.find(function(x){return x.id===editing});
    var isNew=!prev;
    var fileInput=document.getElementById('meetLocalVideoFile');
    var file=fileInput&&fileInput.files&&fileInput.files[0];
    if(file&&(!/^video\/(mp4|webm)$/.test(file.type)&&!/\.mp4$|\.webm$/i.test(file.name))){alert('Можно прикрепить только MP4 или WebM');return}
    if(file&&file.size>1200*1024*1024){alert('Видео больше 1,2 ГБ. Используй защищённое облачное хранилище.');return}
    if(!prev)prev={id:makeId(),createdAt:new Date().toISOString(),sentTaskKeys:[]};
    var submit=form.querySelector('button[type="submit"]');
    if(file){
      submit.disabled=true;submit.textContent='Сохраняю видео...';
      try{
        await writeVideo(prev.id,file);
        data.localVideoName=file.name;
        data.localVideoSize=file.size;
      }catch(err){
        alert('Не удалось сохранить MP4 в браузере: '+err.message);
        submit.disabled=false;submit.textContent='Сохранить встречу';
        return;
      }
      submit.disabled=false;submit.textContent='Сохранить встречу';
    }
    Object.assign(prev,data);
    if(isNew)meetings.push(prev);
    selected=prev.id;
    if(!save())return;
    if(prev.zoomUuid&&isProject(prev.scope)){
      document.dispatchEvent(new CustomEvent('onvisual:meeting-project-assigned',{
        detail:{zoomUuid:prev.zoomUuid,project:prev.scope}
      }));
    }
    modal.close();render();
  });

  // Zoom import merges only cloud-sourced fields, preserving user-edited notes and tasks.
  document.addEventListener('onvisual:meetings-import',function(event){
    var records=Array.isArray(event.detail?.records)?event.detail.records:[];
    var changed=false;
    records.forEach(function(rec){
      if(!rec||typeof rec.zoomUuid!=='string'||!rec.zoomUuid)return;
      var old=meetings.find(function(m){return m.zoomUuid===rec.zoomUuid});
      if(old){
        if(isProject(rec.scope)&&old.scope!==rec.scope){old.scope=rec.scope;changed=true}
        if(rec.transcriptText&&!old.transcriptText){old.transcriptText=String(rec.transcriptText);changed=true}
        if(rec.videoUrl&&!old.videoUrl){old.videoUrl=String(rec.videoUrl);changed=true}
        if(rec.zoomVideoAvailable&&!old.zoomVideoAvailable){old.zoomVideoAvailable=true;changed=true}
        if(rec.zoomTranscriptAvailable&&!old.zoomTranscriptAvailable){old.zoomTranscriptAvailable=true;changed=true}
        return;
      }
      // A transcript-only update may arrive after the user deleted the imported meeting.
      if(!rec.title||!rec.date)return;
      var newMeeting={
        id:makeIdSafe(),createdAt:new Date().toISOString(),sentTaskKeys:[],
        title:String(rec.title).slice(0,160),date:String(rec.date).slice(0,10),
        scope:isProject(rec.scope)?rec.scope:'',participants:'',videoUrl:rec.videoUrl||'',
        transcriptUrl:'',transcriptText:rec.transcriptText||'',
        summary:'',decisions:'',actions:'',
        zoomUuid:rec.zoomUuid,zoomMeetingId:rec.zoomMeetingId||'',
        zoomVideoAvailable:!!rec.zoomVideoAvailable,
        zoomTranscriptAvailable:!!rec.zoomTranscriptAvailable
      };
      meetings.push(newMeeting);changed=true;
    });
    if(changed){save();render()}
  });
  function makeIdSafe(){return makeIdUnused()}
  function makeIdUnused(){return 'meet-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}

  render();
})();