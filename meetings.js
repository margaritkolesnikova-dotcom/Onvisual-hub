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
    document.getElementById('meetingVideoCount').textContent=String(meetings.filter(function(m){return !!(m.videoUrl||m.localVideoName||m.privateVideoStored||m.zoomVideoAvailable)}).length);
    document.getElementById('meetingTranscriptCount').textContent=String(meetings.filter(function(m){return !!(m.transcriptText||m.transcriptUrl||m.transcriptStored)}).length);
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
            '<span class="mt-entry-tags">'+((m.videoUrl||m.localVideoName||m.privateVideoStored||m.zoomVideoAvailable)?'<i>▶ Видео</i>':'')+((m.transcriptText||m.transcriptUrl||m.transcriptStored)?'<i>≡ TXT/VTT</i>':'')+(m.summaryStored?'<i>▤ Главный PDF</i>':'')+'</span>';
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
    var hasSharedVideo=!!(m.zoomUuid&&m.privateVideoStored);
    var hasPrivateTranscript=!!(m.zoomUuid&&m.transcriptStored);
    var hasPrivateSummary=!!(m.zoomUuid&&m.summaryStored);
    var fileUrl=function(kind){return '/api/meeting-archive?action=download&kind='+kind+'&uuid='+encodeURIComponent(m.zoomUuid||'')};
    var isDirectVideo=video&&/\.(mp4|webm|ogg)(?:$|[?#])/i.test(video);
    var rows=actionRows({...m,actions:m.actions||m.autoActions||''}),imported=m.sentTaskKeys||[];
    detail.innerHTML='<div class="mt-detail-head"><div><span class="mt-kicker">'+safe(projectName(m.scope))+' / '+safe(fmt(m.date))+'</span><h2>'+safe(m.title)+'</h2>'+
      '<p>'+(m.participants?'Участники: '+safe(m.participants):'Участники не указаны')+'</p></div><div class="mt-detail-actions"><button type="button" id="mtEdit">Редактировать</button><button type="button" id="mtDelete" class="mt-danger">Удалить</button></div></div>'+
      '<div class="mt-assign-row"><label for="mtMoveProject">Проект встречи</label><select id="mtMoveProject" aria-label="Переместить встречу в проект">'+'<option value="" '+(!isProject(m.scope)?'selected':'')+'>На распределение</option>'+'<option value="ONVISUAL" '+(m.scope==='ONVISUAL'?'selected':'')+'>ONVISUAL</option>'+'<option value="Мультвселенная" '+(m.scope==='Мультвселенная'?'selected':'')+'>Мультвселенная</option></select>'+'<span>При выборе проекта встреча и её папка автоматически перемещаются в соответствующий раздел.</span></div>'+'<section class="mt-main-report"><div class="mt-report-icon">▤</div><div class="mt-report-info"><div class="mt-report-eyebrow">ГЛАВНЫЙ ДОКУМЕНТ · ПО ИТОГАМ ВСТРЕЧИ</div><h3>Итоги встречи.pdf</h3><p>Главное · Что объясняли · Решения · Задачи по участникам · Открытые вопросы · Следующие шаги · Материалы</p><small>Формируется из оригинального резюме Zoom и доступной расшифровки. Неподтверждённые решения и сроки не добавляются.</small></div>'+
      (hasPrivateSummary?'<a class="mt-report-open" href="'+safe(fileUrl('report_pdf'))+'" target="_blank" rel="noopener noreferrer">Открыть главный PDF ↗</a>':'<span class="mt-report-pending">Ждём резюме Zoom</span>')+'</section>'+
      '<div class="mt-media-grid"><section class="mt-content-card"><div class="mt-card-label"><span>01 / VIDEO</span><b>Запись созвона</b></div>'+
      (hasSharedVideo?'<div id="mtSharedVideoSlot" class="mt-video-local-slot">Подключаю защищённое видео команды…</div>':
        m.zoomUuid&&m.zoomVideoAvailable?'<div id="mtSharedVideoSlot" class="mt-media-placeholder"><span>▶</span><p>Получаю ссылку на облачную запись Zoom…</p></div>':
        m.localVideoName?'<div id="mtLocalVideoSlot" class="mt-video-local-slot">Открываю видео с этого компьютера…</div>':
        isDirectVideo?'<video class="mt-video" controls preload="metadata" src="'+safe(video)+'"></video>':
        video?'<div class="mt-media-placeholder"><span>▶</span><p>Видео хранится по внешней ссылке</p></div>':
        '<div class="mt-media-placeholder"><span>▷</span><p>Видео ещё не загружено в общий архив</p></div>')+
      (video&&!hasSharedVideo?linkHtml(video,'Открыть внешнюю запись'):'')+
      (m.localVideoName&&!hasSharedVideo?'<small>Локальная копия доступна только в этом браузере.</small>':'')+
      (m.zoomUuid?'<div class="mt-file-import"><label for="mtAttachVideoFile">Видео MP4 для просмотра всей командой (до 1,2 ГБ)</label><input type="file" id="mtAttachVideoFile" accept=".mp4,video/mp4"/><small>Видео загружается в закрытое облачное хранилище. Это не публичная ссылка.</small></div>':'')+
      '</section><section class="mt-content-card"><div class="mt-card-label"><span>02 / TRANSCRIPT</span><b>Расшифровка · файл</b></div>'+
      (hasPrivateTranscript?
        '<div class="mt-file-entry"><span class="mt-file-symbol">≡</span><div class="mt-file-info"><strong>Расшифровка встречи</strong><small>Оригинальный файл Zoom · VTT / TXT</small></div><a class="mt-file-action" href="'+safe(fileUrl('transcript'))+'">Скачать файл ↓</a></div>':
       m.transcriptText?
        '<div class="mt-file-entry"><span class="mt-file-symbol">≡</span><div class="mt-file-info"><strong>Расшифровка встречи.txt</strong><small>Документ прикреплён в текущем браузере</small></div><button class="mt-file-action" id="mtDownloadTranscript" type="button">Скачать TXT ↓</button></div>':
        tr?'<div class="mt-file-entry"><span class="mt-file-symbol">≡</span><div class="mt-file-info"><strong>Расшифровка встречи</strong><small>Файл во внешнем хранилище</small></div>'+linkHtml(tr,'Открыть файл')+'</div>':
        '<div class="mt-media-placeholder mt-text-placeholder"><span>≡</span><p>Файл расшифровки ещё не получен</p></div>')+
      (m.zoomTranscriptAvailable&&!hasPrivateTranscript&&!m.transcriptText?'<button type="button" class="mt-zoom-get-transcript" id="mtZoomTranscript" data-uuid="'+safe(m.zoomUuid||'')+'">Загрузить VTT из Zoom</button>':'')+
      (!hasPrivateTranscript?'<div class="mt-file-import"><label for="mtAttachTranscriptFile">Прикрепить полный TXT/VTT в архив</label><input type="file" id="mtAttachTranscriptFile" accept=".txt,.vtt,.srt,text/plain,text/vtt" /></div>':'')+'</section></div>'+
      '<section class="mt-content-card mt-summary-document"><div class="mt-card-label"><span>03 / ORIGINAL ZOOM SUMMARY</span><b>Исходное резюме Zoom · PDF</b></div>'+
      (hasPrivateSummary?
        '<div class="mt-file-entry"><span class="mt-file-symbol">▤</span><div class="mt-file-info"><strong>Оригинал Zoom Summary.pdf</strong><small>Исходный документ Zoom, без обработки</small></div><a class="mt-file-action" href="'+safe(fileUrl('summary_pdf'))+'" target="_blank" rel="noopener noreferrer">Открыть PDF ↗</a></div>':
        m.summaryDocUrl?
        '<div class="mt-file-entry"><span class="mt-file-symbol">▤</span><div class="mt-file-info"><strong>Резюме в Zoom</strong><small>Документ готов в аккаунте Zoom</small></div>'+linkHtml(validUrl(m.summaryDocUrl),'Открыть в Zoom')+'</div>':
        '<p class="mt-summary-pending">Готовый документ пока не получен из Zoom. Для автоматического импорта требуется разрешение <code>meeting_summary:read:admin</code> в Zoom Marketplace.</p>')+
      (m.zoomUuid&&!hasPrivateSummary&&m.zoomSource!=='local'?'<button type="button" id="mtGetZoomSummary" class="mt-zoom-get-transcript" data-uuid="'+safe(m.zoomUuid)+'">Проверить готовое резюме</button>':'')+
      '</section>'+
      '<section class="mt-content-card mt-notes"><div class="mt-card-label"><span>04 / NOTES</span><b>Протокол и решения</b></div>'+
      '<h4>Краткий протокол</h4><p class="mt-preserve">'+safe(m.autoSummary||m.summary||'Итоги будут добавлены после обработки расшифровки.')+'</p>'+
      '<h4>Решения и договорённости</h4><p class="mt-preserve">'+safe(m.autoDecisions||m.decisions||'Пока не зафиксированы.')+'</p></section>'+
      '<section class="mt-content-card mt-actions"><div class="mt-card-label"><span>05 / ACTIONS</span><b>Задачи · кратко</b></div>'+
      (rows.length?'<div class="mt-action-list">'+rows.slice(0,8).map(function(t){
        var done=imported.includes(t.key);
        return '<div><span>'+safe(t.title)+'</span><small>'+safe(t.owner||'Без ответственного')+(t.due?' · '+safe(fmt(t.due)):' · Срок не указан')+'</small><em>'+(done?'В задачах ✓':'К передаче')+'</em></div>';
      }).join('')+'</div>'+(rows.length>8?'<small>Показаны первые 8 задач из '+rows.length+'. Полный список — в PDF и доступен для передачи на доску.</small>':'')+'<button type="button" id="mtTransferTasks" class="mt-primary">Добавить новые задачи в хаб</button>':
      '<p class="mt-preserve">Пока нет задач. Можно указать одну задачу в строке: название | ответственный | дата ГГГГ-ММ-ДД.</p>')+
      '<small>Задачи передаются в текущую доску «Задачи» на этом устройстве. Перед публикацией для всей команды нужна синхронизация хаба.</small></section>';
    if(m.localVideoName&&!hasSharedVideo&&!m.zoomVideoAvailable)renderLocalVideo(m);
    if(m.zoomUuid&&(hasSharedVideo||m.zoomVideoAvailable)){
      document.dispatchEvent(new CustomEvent('onvisual:meeting-video-requested',{detail:{uuid:m.zoomUuid}}));
    }
    var sharedVideoInput=detail.querySelector('#mtAttachVideoFile');
    if(sharedVideoInput){
      sharedVideoInput.addEventListener('change',function(){
        var f=sharedVideoInput.files&&sharedVideoInput.files[0];
        if(!f)return;
        if(!/\.mp4$/i.test(f.name)||f.size>1200*1024*1024){alert('Выбери MP4 не более 1,2 ГБ');sharedVideoInput.value='';return}
        sharedVideoInput.disabled=true;
        document.dispatchEvent(new CustomEvent('onvisual:meeting-video-upload',{
          detail:{uuid:m.zoomUuid,file:f,input:sharedVideoInput}
        }));
      });
    }
    var transcriptInput=detail.querySelector('#mtAttachTranscriptFile');
    if(transcriptInput){
      transcriptInput.addEventListener('change',function(){
        var file=transcriptInput.files&&transcriptInput.files[0];
        if(!file)return;
        if(file.size>800000){alert('TXT/VTT слишком большой (максимум 800 КБ)');transcriptInput.value='';return}
        if(!isProject(m.scope)){alert('Сначала выбери проект встречи');transcriptInput.value='';return}
        transcriptInput.disabled=true;
        var t=String(m.title).match(/(?:^| )- (\d{2}):(\d{2})-(\d{2}):(\d{2})/);
        var clock=t?t[1]+':'+t[2]:'12:00';
        var localUUID=(m.zoomUuid||'LOCAL'+String(m.date).replace(/-/g,'')+clock.replace(':',''));
        document.dispatchEvent(new CustomEvent('onvisual:meeting-transcript-upload',{
          detail:{meetingId:m.id,uuid:localUUID,date:m.date,title:m.title,
            project:m.scope,startTime:new Date(m.date+'T'+clock+':00+03:00').toISOString().replace('.000Z','Z'),
            file:file,input:transcriptInput}
        }));
      });
    }
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
  document.addEventListener('onvisual:meeting-video-ready',function(event){
    var d=event.detail||{};
    var m=meetings.find(function(x){return x.zoomUuid===d.uuid});
    if(!m||!d.url)return;
    if(d.stored&&!m.privateVideoStored){m.privateVideoStored=true;save()}
    if(selected!==m.id)return;
    var slot=detail.querySelector('#mtSharedVideoSlot');
    if(!slot)return;
    var href=validUrl(d.url);if(!href)return;
    if(d.source==='private'){
      var player=document.createElement('video');
      player.controls=true;player.preload='metadata';player.className='mt-video';player.playsInline=true;player.src=href;
      var link=document.createElement('a');link.className='mt-link';link.textContent='Открыть видео в новой вкладке ↗';link.href=href;link.target='_blank';link.rel='noopener noreferrer';
      slot.replaceChildren(player,link);
      slot.classList.remove('mt-media-placeholder');
    }else{
      slot.innerHTML='<span>▶</span><p>Облачная запись Zoom доступна по ссылке</p>';
      var a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.className='mt-file-action';a.textContent='Смотреть в Zoom ↗';
      slot.appendChild(a);
    }
  });
    document.addEventListener('onvisual:meeting-transcript-uploaded',function(event){
    var d=event.detail||{};
    var m=meetings.find(function(x){return x.id===d.meetingId});
    if(!m||!d.uuid)return;
    m.zoomUuid=d.uuid;m.zoomSource=m.zoomSource||'local';
    m.transcriptStored=true;m.zoomTranscriptAvailable=true;
    if(save())render();
  });
  document.addEventListener('onvisual:meetings-import',function(event){
    var records=Array.isArray(event.detail?.records)?event.detail.records:[];
    var changed=false;
    records.forEach(function(rec){
      if(!rec||typeof rec.zoomUuid!=='string'||!rec.zoomUuid)return;
      var old=meetings.find(function(m){return m.zoomUuid===rec.zoomUuid});
      // Attach a native Zoom summary to the corresponding manually saved meeting
      // by project topic, local date and approximate time, avoiding duplicate folders.
      if(!old&&rec.zoomSource==='zoom_summary'&&rec.title&&rec.date){
        var sourceTime=String(rec.title).match(/ · (\d{2}):(\d{2})$/);
        var sourceBase=String(rec.title).replace(/ · \d{2}:\d{2}$/,'').trim().toLowerCase();
        if(sourceTime){
          var sourceMinutes=+sourceTime[1]*60 + +sourceTime[2];
          old=meetings.find(function(m){
            if(m.zoomUuid||m.date!==rec.date)return false;
            var localTime=String(m.title).match(/ - (\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
            if(!localTime)return false;
            var localMinutes=+localTime[1]*60 + +localTime[2];
            var localBase=String(m.title).replace(/ - \d{2}:\d{2}-\d{2}:\d{2}$/,'').trim().toLowerCase();
            return Math.abs(localMinutes-sourceMinutes)<=20&&localBase===sourceBase;
          });
          if(old){
            old.zoomUuid=rec.zoomUuid;old.zoomSource='zoom_summary';changed=true;
            if(isProject(old.scope))document.dispatchEvent(new CustomEvent('onvisual:meeting-project-assigned',{
              detail:{zoomUuid:old.zoomUuid,project:old.scope}
            }));
          }
        }
      }
      // Backfill a meeting manually created before its audio was transcribed.
      if(!old&&rec.zoomSource==='local'&&rec.title&&rec.date){
        old=meetings.find(function(m){
          return !m.zoomUuid&&m.date===rec.date&&m.title.trim()===rec.title.trim()
        });
        if(old){old.zoomUuid=rec.zoomUuid;old.zoomSource='local';changed=true}
      }
      if(old){
        if(rec.title&&old.title===String(rec.title).replace(/ · \d{2}:\d{2}$/,'')){old.title=rec.title;changed=true}
        if(rec.date&&old.date!==rec.date){old.date=rec.date;changed=true}
        if(isProject(rec.scope)&&old.scope!==rec.scope){old.scope=rec.scope;changed=true}
        if(rec.transcriptText&&!old.transcriptText){old.transcriptText=String(rec.transcriptText);changed=true}
        if(rec.videoUrl&&!old.videoUrl){old.videoUrl=String(rec.videoUrl);changed=true}
        if(rec.zoomVideoAvailable&&!old.zoomVideoAvailable){old.zoomVideoAvailable=true;changed=true}
        if(rec.zoomTranscriptAvailable&&!old.zoomTranscriptAvailable){old.zoomTranscriptAvailable=true;changed=true}
        if(rec.transcriptStored&&!old.transcriptStored){old.transcriptStored=true;changed=true}
        if(rec.summaryStored&&!old.summaryStored){old.summaryStored=true;changed=true}
        if(rec.summaryDocUrl&&!old.summaryDocUrl){old.summaryDocUrl=String(rec.summaryDocUrl);changed=true}
        if(rec.privateVideoStored&&!old.privateVideoStored){old.privateVideoStored=true;changed=true}
        if(rec.summary&&!old.autoSummary){old.autoSummary=String(rec.summary).slice(0,1200);changed=true}
        if(rec.decisions&&!old.autoDecisions){old.autoDecisions=String(rec.decisions).slice(0,1600);changed=true}
        if(rec.actions&&!old.autoActions){old.autoActions=String(rec.actions).slice(0,6000);changed=true}
        if(rec.summary&&!old.summary){old.summary=String(rec.summary).slice(0,1200);changed=true}
        if(rec.decisions&&!old.decisions){old.decisions=String(rec.decisions).slice(0,1600);changed=true}
        if(rec.actions&&!old.actions){old.actions=String(rec.actions).slice(0,6000);changed=true}
        if(rec.zoomSource&&!old.zoomSource){old.zoomSource=rec.zoomSource;changed=true}
        return;
      }
      // A transcript-only update may arrive after the user deleted the imported meeting.
      if(!rec.title||!rec.date)return;
      var newMeeting={
        id:makeIdSafe(),createdAt:new Date().toISOString(),sentTaskKeys:[],
        title:String(rec.title).slice(0,160),date:String(rec.date).slice(0,10),
        scope:isProject(rec.scope)?rec.scope:'',participants:'',videoUrl:rec.videoUrl||'',
        transcriptUrl:'',transcriptText:rec.transcriptText||'',
        summary:rec.summary||'',decisions:rec.decisions||'',actions:rec.actions||'',
        zoomUuid:rec.zoomUuid,zoomMeetingId:rec.zoomMeetingId||'',zoomSource:rec.zoomSource||'zoom',
        zoomVideoAvailable:!!rec.zoomVideoAvailable,
        zoomTranscriptAvailable:!!rec.zoomTranscriptAvailable,
        transcriptStored:!!rec.transcriptStored,summaryStored:!!rec.summaryStored,summaryDocUrl:rec.summaryDocUrl||'',privateVideoStored:!!rec.privateVideoStored
      };
      meetings.push(newMeeting);changed=true;
    });
    if(changed){save();render()}
  });
  function makeIdSafe(){return makeIdUnused()}
  function makeIdUnused(){return 'meet-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}

  render();
})();