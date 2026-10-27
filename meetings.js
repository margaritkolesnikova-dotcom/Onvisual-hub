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
  var filter=document.getElementById('meetingScope');
  var editing=null, selected=null;
  var meetings=[];
  try {var value=JSON.parse(localStorage.getItem(STORE)||'[]');meetings=Array.isArray(value)?value:[]}catch(e){meetings=[]}
  function safe(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
  function makeId(){return 'meet-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function save(){
    try{localStorage.setItem(STORE,JSON.stringify(meetings));return true}
    catch(e){alert('Недостаточно памяти браузера. Сократи расшифровку или оставь ссылку на файл в Zoom/Диске.');return false}
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
  function render(){
    var q=(search.value||'').toLowerCase().trim();
    var s=filter.value;
    var entries=meetings.filter(function(m){
      return (s==='all'||m.scope===s)&&(!q||[m.title,m.date,m.scope,m.participants,m.summary,m.transcriptText].join(' ').toLowerCase().includes(q));
    }).sort(function(a,b){return (b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')});
    var groups={};entries.forEach(function(m){(groups[m.date]||(groups[m.date]=[])).push(m)});
    document.getElementById('meetingCount').textContent=String(meetings.length);
    document.getElementById('meetingVideoCount').textContent=String(meetings.filter(function(m){return !!m.videoUrl}).length);
    document.getElementById('meetingTranscriptCount').textContent=String(meetings.filter(function(m){return !!(m.transcriptText||m.transcriptUrl)}).length);
    list.innerHTML='';
    if(!entries.length){
      list.innerHTML='<div class="mt-empty"><div>◌</div><h3>'+(q||s!=='all'?'Ничего не найдено':'Пока нет сохранённых встреч')+'</h3><p>Новая встреча появится здесь внутри папки с датой созвона.</p></div>';
    }
    Object.keys(groups).sort().reverse().forEach(function(date){
      var el=document.createElement('div');el.className='mt-folder';
      el.innerHTML='<div class="mt-folder-title"><span class="mt-folder-symbol">▤</span><div><strong>'+safe(fmt(date))+'</strong><small>'+groups[date].length+' встреч</small></div></div><div class="mt-folder-entries"></div>';
      var body=el.querySelector('.mt-folder-entries');
      groups[date].forEach(function(m){
        var b=document.createElement('button');b.type='button';b.className='mt-entry'+(selected===m.id?' is-active':'');
        b.innerHTML='<span class="mt-entry-name"><strong>'+safe(m.title)+'</strong><small>'+label(m.scope)+(m.participants?' · '+safe(m.participants):'')+'</small></span>'+
          '<span class="mt-entry-tags">'+(m.videoUrl?'<i>▶ Видео</i>':'')+((m.transcriptText||m.transcriptUrl)?'<i>≡ Текст</i>':'')+'</span>';
        b.addEventListener('click',function(){selected=m.id;render()});
        body.appendChild(b);
      });
      list.appendChild(el);
    });
    renderDetail();
  }
  function renderDetail(){
    var m=getCurrent();
    if(!m){
      detail.innerHTML='<div class="mt-placeholder"><div class="mt-placeholder-orbit">◌</div><h3>Архив созвонов</h3><p>Выбери встречу слева или создай новую. В одной папке могут лежать несколько созвонов за день.</p></div>';
      return;
    }
    var video=validUrl(m.videoUrl),tr=validUrl(m.transcriptUrl);
    var isDirectVideo=video&&/\.(mp4|webm|ogg)(?:$|[?#])/i.test(video);
    var rows=actionRows(m),imported=m.sentTaskKeys||[];
    detail.innerHTML='<div class="mt-detail-head"><div><span class="mt-kicker">'+label(m.scope)+' · '+safe(fmt(m.date))+'</span><h2>'+safe(m.title)+'</h2>'+
      '<p>'+(m.participants?'Участники: '+safe(m.participants):'Участники не указаны')+'</p></div><div class="mt-detail-actions"><button type="button" id="mtEdit">Редактировать</button><button type="button" id="mtDelete" class="mt-danger">Удалить</button></div></div>'+
      '<div class="mt-media-grid"><section class="mt-content-card"><div class="mt-card-label"><span>01 / VIDEO</span><b>Запись созвона</b></div>'+
      (isDirectVideo?'<video class="mt-video" controls preload="metadata" src="'+safe(video)+'"></video>':video?'<div class="mt-media-placeholder"><span>▶</span><p>Видео хранится в Zoom / облаке</p></div>':'<div class="mt-media-placeholder"><span>▷</span><p>Видео пока не прикреплено</p></div>')+
      (video?linkHtml(video,'Открыть запись / скачать'):'<small>Добавь ссылку на облачную запись через «Редактировать».</small>')+
      '</section><section class="mt-content-card"><div class="mt-card-label"><span>02 / TRANSCRIPT</span><b>Расшифровка</b></div>'+
      (m.transcriptText?'<div class="mt-transcript-preview">'+safe(m.transcriptText)+'</div>':'<div class="mt-media-placeholder mt-text-placeholder"><span>≡</span><p>Текст можно вставить или прикрепить файлом VTT/TXT</p></div>')+
      '<div class="mt-inline-actions">'+(m.transcriptText?'<button type="button" id="mtDownloadTranscript">Скачать TXT ↓</button>':'')+(tr?linkHtml(tr,'Открыть расшифровку'):'')+'</div></section></div>'+
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
    detail.querySelector('#mtEdit').addEventListener('click',function(){openForm(m.id)});
    detail.querySelector('#mtDelete').addEventListener('click',function(){
      if(!confirm('Удалить встречу «'+m.title+'» из локального каталога? Запись в Zoom/Диске останется.'))return;
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
    form.elements.date.value=m?m.date:new Date().toLocaleDateString('en-CA');
    ['title','scope','participants','videoUrl','transcriptUrl','transcriptText','summary','decisions','actions'].forEach(function(key){
      if(m&&form.elements[key])form.elements[key].value=m[key]||'';
    });
    document.getElementById('mtModalTitle').textContent=m?'Изменить встречу':'Новая встреча';
    modal.showModal();
  }
  document.getElementById('mtAddMeeting').addEventListener('click',function(){openForm()});
  document.getElementById('mtCancelMeeting').addEventListener('click',function(){modal.close()});
  search.addEventListener('input',render);
  filter.addEventListener('change',render);
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
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var fd=new FormData(form);
    var data={};
    ['date','title','scope','participants','videoUrl','transcriptUrl','transcriptText','summary','decisions','actions'].forEach(function(k){data[k]=String(fd.get(k)||'').trim()});
    if(!data.title||!data.date){alert('Заполни дату и название');return}
    if(data.videoUrl&&!validUrl(data.videoUrl)){alert('Ссылка на видео должна начинаться с https://');return}
    if(data.transcriptUrl&&!validUrl(data.transcriptUrl)){alert('Ссылка на расшифровку должна начинаться с https://');return}
    var prev=meetings.find(function(x){return x.id===editing});
    if(prev){Object.assign(prev,data)}else{
      prev=Object.assign({id:makeId(),createdAt:new Date().toISOString(),sentTaskKeys:[]},data);
      meetings.push(prev);
    }
    selected=prev.id;
    if(!save())return;
    modal.close();render();
  });
  render();
})();