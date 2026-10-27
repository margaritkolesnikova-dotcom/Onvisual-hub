/* ONVISUAL / ZOOM MEETINGS: list first, import only selected meeting.
   All OAuth credentials stay on Vercel. User sync key stays in memory only. */
(function(){
  'use strict';
  var panel=document.getElementById('mtZoomPanel');
  if(!panel)return;
  var keyField=document.getElementById('mtZoomKey');
  var monthField=document.getElementById('mtZoomMonth');
  var button=document.getElementById('mtZoomSync');
  var state=document.getElementById('mtZoomState');
  var results=document.createElement('div');
  results.id='mtZoomResults';
  results.className='mt-zoom-results';
  panel.appendChild(results);
  var candidates=[];
  function escape(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})}
  function currentMonth(){
    var p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date());
    return p.slice(0,7);
  }
  monthField.value=currentMonth();
  button.textContent='Показать записи Zoom';
  function status(message,isError){
    state.textContent=message;
    state.classList.toggle('error',!!isError);
  }
  function dateAtMoscow(date){
    try {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date))}
    catch(e){return (date||'').slice(0,10)}
  }
  function displayDate(date){
    try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date))}
    catch(e){return String(date||'')}
  }
  async function request(query,key){
    var res=await fetch('/api/zoom-sync?'+new URLSearchParams(query),{
      method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+key,Accept:'application/json'}
    });
    var data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.message||'Ошибка Zoom API ('+res.status+').');
    return data;
  }
  function send(record){
    document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{detail:{records:[record]}}));
  }
  function showList(){
    if(!candidates.length){results.innerHTML='';return}
    results.innerHTML='<div class="mt-zoom-list-title">Записи Zoom за выбранный месяц <small>Выбери одну встречу. Первая — самая поздняя по дате.</small></div>'+
      candidates.map(function(m,i){
        return '<div class="mt-zoom-record" data-zoom-index="'+i+'">'+
          '<span class="mt-zoom-order">0'+(i+1)+'</span>'+
          '<div class="mt-zoom-record-main"><strong>'+escape(m.title||'Созвон Zoom')+'</strong>'+
          '<small>'+escape(displayDate(m.startTime))+'</small>'+
          '<div class="mt-zoom-tags"><span>'+(m.videoAvailable?'Видео MP4 есть':'Видео MP4 не найдено')+'</span><span>'+(m.transcriptAvailable?'Расшифровка есть':'Расшифровка отсутствует')+'</span></div></div>'+
          '<div class="mt-zoom-pick"><button type="button" data-zoom-to="Мультвселенная" data-zoom-index="'+i+'">В Мультвселенную</button>'+
          '<button type="button" data-zoom-to="ONVISUAL" data-zoom-index="'+i+'">В ONVISUAL</button></div></div>';
      }).join('');
  }
  button.addEventListener('click',async function(){
    var key=keyField.value.trim(),month=monthField.value;
    if(key.length<20){status('Введи ключ синхронизации MEETINGS_SYNC_KEY (не менее 20 символов).',true);return}
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){status('Выбери месяц записей.',true);return}
    button.disabled=true;results.innerHTML='';button.textContent='Получаю список...';
    try{
      var data=await request({operation:'list',month},key);
      candidates=(data.meetings||[]).filter(function(m){return !!m.uuid&&!!m.startTime})
        .sort(function(a,b){return String(b.startTime).localeCompare(String(a.startTime))});
      showList();
      status(candidates.length
        ?'Найдено '+candidates.length+' облачных записей. Выбери нужную встречу и проект. Остальные не будут импортированы.'
        :'За '+month+' облачных записей нет. Проверь Cloud Recording и нужный аккаунт Zoom.',false);
    }catch(e){candidates=[];status(e.message||'Не удалось связаться с Zoom.',true)}
    finally{button.disabled=false;button.textContent='Показать записи Zoom'}
  });
  results.addEventListener('click',async function(e){
    var btn=e.target.closest('[data-zoom-to]');
    if(!btn)return;
    var index=Number(btn.dataset.zoomIndex),scope=btn.dataset.zoomTo;
    var m=candidates[index];
    if(!m||!['ONVISUAL','Мультвселенная'].includes(scope))return;
    if(!confirm('Перенести «'+m.title+'» ('+displayDate(m.startTime)+') в проект «'+scope+'»?'))return;
    var key=keyField.value.trim();
    if(key.length<20){status('Укажи ключ синхронизации сверху.',true);return}
    var record={
      zoomUuid:m.uuid,zoomMeetingId:m.meetingId||'',title:m.title||'Созвон Zoom',
      date:dateAtMoscow(m.startTime),scope:scope,participants:'',videoUrl:m.videoUrl||'',
      transcriptUrl:'',transcriptText:'',summary:'',decisions:'',actions:'',
      zoomVideoAvailable:!!m.videoAvailable,zoomTranscriptAvailable:!!m.transcriptAvailable
    };
    btn.disabled=true;btn.textContent='Переношу...';
    var transcriptIssue='';
    if(m.transcriptAvailable){
      try{
        var transcript=await request({operation:'transcript',uuid:m.uuid},key);
        record.transcriptText=transcript.text||'';
        if(!record.transcriptText)transcriptIssue='Zoom вернул пустую расшифровку.';
      }catch(err){transcriptIssue=err.message||'Расшифровку не удалось получить.'}
    }else{transcriptIssue='Для этой встречи в Zoom нет готовой VTT-расшифровки.'}
    send(record);
    status('Встреча «'+m.title+'» добавлена в «'+scope+'»'+
      (record.videoUrl?' со ссылкой на видео Zoom':' (нет ссылки для просмотра MP4)')+
      (record.transcriptText?' и полной расшифровкой.':'. '+transcriptIssue),!!transcriptIssue||!record.videoUrl);
    btn.disabled=false;btn.textContent='Обновить / перенести';
  });
  document.addEventListener('click',async function(e){
    var btn=e.target.closest('#mtZoomTranscript');
    if(!btn)return;
    var uuid=btn.dataset.uuid,key=keyField.value.trim();
    if(key.length<20){status('Введи ключ синхронизации в блоке Zoom выше.',true);panel.scrollIntoView({behavior:'smooth',block:'center'});return}
    btn.disabled=true;btn.textContent='Загружаю текст...';
    try{
      var result=await request({operation:'transcript',uuid:uuid},key);
      send({zoomUuid:uuid,transcriptText:result.text||''});
      status('Расшифровка добавлена в карточку встречи.',false);
    }catch(err){status(err.message||'Ошибка загрузки VTT.',true)}
    finally{btn.disabled=false;btn.textContent='Получить расшифровку Zoom'}
  });
})();