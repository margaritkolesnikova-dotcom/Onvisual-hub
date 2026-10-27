/* Zoom sync user-initiated, no credentials or API tokens in browser storage. */
(function(){
  'use strict';
  var panel=document.getElementById('mtZoomPanel');
  if(!panel)return;
  var keyField=document.getElementById('mtZoomKey');
  var monthField=document.getElementById('mtZoomMonth');
  var button=document.getElementById('mtZoomSync');
  var state=document.getElementById('mtZoomState');
  function currentMonth(){
    var p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date());
    return p.slice(0,7);
  }
  monthField.value=currentMonth();
  function status(message, isError){
    state.textContent=message;
    state.classList.toggle('error',!!isError);
  }
  function dateAtMoscow(date){
    try {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
    catch {return (date||'').slice(0,10);}
  }
  async function request(query,key){
    var res=await fetch('/api/zoom-sync?'+new URLSearchParams(query),{
      method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+key,Accept:'application/json'}
    });
    var data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.message||'Ошибка Zoom API ('+res.status+').');
    return data;
  }
  function send(records){
    if(!records.length)return {added:0,updated:0};
    document.dispatchEvent(new CustomEvent('onvisual:meetings-import',{detail:{records}}));
  }
  button.addEventListener('click',async function(){
    var key=keyField.value.trim();
    var month=monthField.value;
    if(key.length<20){status('Введи ключ синхронизации из MEETINGS_SYNC_KEY (не менее 20 символов).',true);return}
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){status('Выбери месяц для импорта.',true);return}
    button.disabled=true;button.textContent='Подключаем Zoom...';
    try{
      var data=await request({operation:'list',month},key);
      var records=(data.meetings||[]).filter(function(m){return !!m.uuid&&!!m.startTime}).map(function(m){
        return {
          zoomUuid:m.uuid,
          zoomMeetingId:m.meetingId||'',
          title:m.title||'Созвон Zoom',
          date:dateAtMoscow(m.startTime),
          scope:'ONVISUAL',
          participants:'',
          videoUrl:m.videoUrl||'',
          transcriptUrl:'',
          transcriptText:'',
          summary:'',
          decisions:'',
          actions:'',
          zoomVideoAvailable:!!m.videoAvailable,
          zoomTranscriptAvailable:!!m.transcriptAvailable
        };
      });
      send(records);
      if(!data.count){status('За '+month+' облачных записей не найдено. Проверь, включена ли Cloud Recording в Zoom.',false);return}
      status('Получено '+records.length+' встреч. Загружаю доступные расшифровки...',false);
      var candidates=records.filter(function(x){return x.zoomTranscriptAvailable;});
      var finished=0,ok=0,errors=0;
      // Fetch a bounded batch each time; re-syncing only fills missing transcripts.
      for(var i=0;i<candidates.length;i+=3){
        var batch=candidates.slice(i,i+3);
        var results=await Promise.all(batch.map(async function(item){
          try{
            var result=await request({operation:'transcript',uuid:item.zoomUuid},key);
            return {zoomUuid:item.zoomUuid,transcriptText:result.text||''};
          }catch(e){errors++;return null}
        }));
        var changes=results.filter(Boolean);
        if(changes.length){send(changes);ok+=changes.length}
        finished+=batch.length;
        status('Встречи: '+records.length+'. Расшифровки: '+finished+'/'+candidates.length+'.',false);
      }
      status('Синхронизировано '+records.length+' встреч; доступных расшифровок загружено '+ok+'.'+(errors?' Не удалось получить: '+errors+'.':'')+(data.hasMore?' Zoom вернул не все страницы; выбери более узкий период.':''),false);
    }catch(error){
      status(error.message||'Ошибка синхронизации с Zoom.',true);
    }finally{button.disabled=false;button.textContent='Синхронизировать Zoom'}
  });
  document.addEventListener('click',async function(e){
    if(!e.target.closest('#mtZoomTranscript'))return;
    var uuid=e.target.closest('#mtZoomTranscript').dataset.uuid;
    var key=keyField.value.trim();
    if(key.length<20){status('Введи ключ синхронизации сверху, чтобы загрузить VTT.',true);panel.scrollIntoView({behavior:'smooth',block:'center'});return}
    var clicked=e.target.closest('#mtZoomTranscript');
    clicked.disabled=true;clicked.textContent='Загружаю текст...';
    try{
      var result=await request({operation:'transcript',uuid},key);
      send([{zoomUuid:uuid,transcriptText:result.text||''}]);
      status('Расшифровка добавлена в папку встречи.',false);
    }catch(error){status(error.message||'Ошибка расшифровки.',true);clicked.disabled=false;clicked.textContent='Получить расшифровку Zoom'}
  });
})();