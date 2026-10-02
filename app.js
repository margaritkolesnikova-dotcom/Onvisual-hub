const sections=[...document.querySelectorAll('.section')];
const links=[...document.querySelectorAll('.nav-link')];
const sidebar=document.getElementById('sidebar');
function show(id){sections.forEach(s=>s.classList.toggle('active',s.id===id));links.forEach(a=>a.classList.toggle('active',a.dataset.target===id));sidebar.classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
links.forEach(a=>a.addEventListener('click',()=>show(a.dataset.target)));
document.querySelectorAll('[data-go]').forEach(c=>c.addEventListener('click',()=>show(c.dataset.go)));
document.getElementById('menuBtn').addEventListener('click',()=>sidebar.classList.toggle('open'));
document.querySelectorAll('.tabbar').forEach(bar=>{bar.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{bar.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const scope=bar.parentElement;scope.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.dataset.pane===btn.dataset.tab));}));});
const search=document.getElementById('globalSearch');search.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();if(!q)return;const target=[...document.querySelectorAll('[data-go],.nav-link')].find(el=>el.textContent.toLowerCase().includes(q));if(target){const id=target.dataset.go||target.dataset.target;if(id)show(id);}});
const grid=document.getElementById('calendarGrid');if(grid){['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d=>{const el=document.createElement('div');el.textContent=d;el.style.fontWeight='700';el.style.color='#8e96a8';grid.appendChild(el)});for(let i=1;i<=35;i++){const el=document.createElement('div');el.textContent=i<=30?i:'';grid.appendChild(el)}}

// Global interaction pass
document.querySelectorAll('[data-go]').forEach(el=>{
  el.setAttribute('tabindex','0');
  el.setAttribute('role','button');
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();show(el.dataset.go);}
  });
});

document.querySelectorAll('[data-tab-go]').forEach(el=>{
  el.addEventListener('click',()=>{
    const section=el.closest('.section');
    const target=el.dataset.tabGo;
    const tab=section?.querySelector('.tab[data-tab="'+target+'"]');
    if(tab){ tab.click(); section.scrollIntoView({behavior:'smooth',block:'start'}); }
  });
});

document.querySelectorAll('.scope-filters').forEach(group=>{
  group.querySelectorAll('.scope-filter').forEach(btn=>{
    btn.addEventListener('click',()=>{
      group.querySelectorAll('.scope-filter').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});


// ==========================================
// Tasks + Calendar persistent interactions
// ==========================================
const STORAGE_TASKS='onvisualHubTasksV1';
const STORAGE_EVENTS='onvisualHubEventsV1';
const readStore=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}};
const writeStore=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

let tasks=readStore(STORAGE_TASKS);
let events=readStore(STORAGE_EVENTS);
let activeTaskScope='all';
let editingTaskId=null;
let editingEventId=null;

const taskBoard=document.getElementById('taskBoard');
const taskModal=document.getElementById('taskModal');
const taskForm=document.getElementById('taskForm');
const addTaskBtn=document.getElementById('addTaskBtn');

function formatDateRu(value){
  if(!value)return '';
  const d=new Date(value+'T12:00:00');
  return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short'}).format(d);
}

function renderTasks(){
  if(!taskBoard)return;
  taskBoard.querySelectorAll('.kanban-column').forEach(col=>{
    const status=col.dataset.status;
    const list=col.querySelector('.task-list');
    const filtered=tasks.filter(t=>t.status===status && (activeTaskScope==='all'||t.scope===activeTaskScope));
    list.innerHTML='';
    filtered.forEach(t=>{
      const card=document.createElement('article');
      card.className='task-card';
      card.dataset.id=t.id;
      card.innerHTML=`
        <div class="task-card-top"><span class="task-scope">${t.scope}</span><button class="task-delete" aria-label="Удалить задачу">×</button></div>
        <h4>${escapeHtml(t.title)}</h4>
        ${t.note?'<p>'+escapeHtml(t.note)+'</p>':''}
        <div class="task-meta">
          ${t.owner?'<span>Ответственный: <b>'+escapeHtml(t.owner)+'</b></span>':''}
          ${t.due?'<span>Срок: <b>'+formatDateRu(t.due)+(t.dueTime?' · '+escapeHtml(t.dueTime):'')+'</b></span>':''}
        </div>
        <select class="task-status-select" aria-label="Статус задачи">
          <option value="new" ${t.status==='new'?'selected':''}>Новая</option>
          <option value="progress" ${t.status==='progress'?'selected':''}>В работе</option>
          <option value="review" ${t.status==='review'?'selected':''}>На проверке</option>
          <option value="done" ${t.status==='done'?'selected':''}>Готово</option>
        </select>`;
      card.addEventListener('click',e=>{
        if(e.target.closest('.task-delete')||e.target.closest('.task-status-select'))return;
        openTaskEditor(t.id);
      });
      card.querySelector('.task-delete').addEventListener('click',e=>{
        e.stopPropagation();
        tasks=tasks.filter(x=>x.id!==t.id);writeStore(STORAGE_TASKS,tasks);renderTasks();
      });
      card.querySelector('.task-status-select').addEventListener('click',e=>e.stopPropagation());
      card.querySelector('.task-status-select').addEventListener('change',e=>{
        t.status=e.target.value;writeStore(STORAGE_TASKS,tasks);renderTasks();
      });
      list.appendChild(card);
    });
    col.querySelector('h3 span').textContent=filtered.length;
    col.querySelector('.task-empty').style.display=filtered.length?'none':'block';
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function openTaskEditor(id=null){
  editingTaskId=id;
  taskForm.reset();
  const titleEl=taskModal.querySelector('.modal-head h2');
  const submit=taskForm.querySelector('.primary-modal');
  if(id){
    const t=tasks.find(x=>x.id===id);
    if(!t)return;
    taskForm.elements.title.value=t.title||'';
    taskForm.elements.scope.value=t.scope||'ONVISUAL';
    taskForm.elements.status.value=t.status||'new';
    taskForm.elements.due.value=t.due||'';
    taskForm.elements.dueTime.value=t.dueTime||'';
    taskForm.elements.owner.value=t.owner||'';
    taskForm.elements.note.value=t.note||'';
    titleEl.textContent='Редактировать задачу';
    submit.textContent='Сохранить изменения';
  }else{
    titleEl.textContent='Добавить задачу';
    submit.textContent='Добавить задачу';
  }
  taskModal.showModal();
}
addTaskBtn?.addEventListener('click',()=>openTaskEditor());
taskForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(taskForm);
  const payload={
    title:fd.get('title').trim(),
    scope:fd.get('scope'),
    status:fd.get('status'),
    due:fd.get('due'),
    dueTime:fd.get('dueTime'),
    owner:fd.get('owner').trim(),
    note:fd.get('note').trim()
  };
  if(editingTaskId){
    const t=tasks.find(x=>x.id===editingTaskId);
    if(t)Object.assign(t,payload);
  }else{
    tasks.unshift({id:uid(),...payload});
  }
  writeStore(STORAGE_TASKS,tasks);
  editingTaskId=null;
  taskForm.reset();
  taskModal.close();
  renderTasks();
});

document.getElementById('taskFilters')?.querySelectorAll('[data-scope]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeTaskScope=btn.dataset.scope;
    document.getElementById('taskFilters').querySelectorAll('.scope-filter').forEach(x=>x.classList.toggle('active',x===btn));
    renderTasks();
  });
});

document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>{
  document.getElementById(btn.dataset.close)?.close();
}));

renderTasks();

// Calendar
const calendarGrid=document.getElementById('calendarGrid');
const calendarTitle=document.getElementById('calendarTitle');
const calendarEventList=document.getElementById('calendarEventList');
const eventModal=document.getElementById('eventModal');
const eventForm=document.getElementById('eventForm');
let calendarCursor=new Date(2026,8,1);

function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function isoDate(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')}

function openEventEditor(id=null,date=''){
  editingEventId=id;
  eventForm.reset();
  const titleEl=eventModal.querySelector('.modal-head h2');
  const submit=eventForm.querySelector('.primary-modal');
  if(id){
    const ev=events.find(x=>x.id===id);
    if(!ev)return;
    eventForm.elements.title.value=ev.title||'';
    eventForm.elements.date.value=ev.date||'';
    eventForm.elements.time.value=ev.time||'';
    eventForm.elements.type.value=ev.type||'Дедлайн';
    eventForm.elements.scope.value=ev.scope||'ONVISUAL';
    eventForm.elements.owner.value=ev.owner||'';
    eventForm.elements.note.value=ev.note||'';
    titleEl.textContent='Редактировать событие';
    submit.textContent='Сохранить изменения';
  }else{
    if(date)eventForm.elements.date.value=date;
    titleEl.textContent='Добавить событие';
    submit.textContent='Добавить в календарь';
  }
  eventModal.showModal();
}

function renderCalendar(){
  if(!calendarGrid)return;
  calendarGrid.innerHTML='';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d=>{
    const el=document.createElement('div');el.className='cal-weekday';el.textContent=d;calendarGrid.appendChild(el);
  });
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  calendarTitle.textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(calendarCursor).replace(/^./,c=>c.toUpperCase());
  const first=new Date(y,m,1);
  const offset=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  for(let i=0;i<offset;i++){const blank=document.createElement('div');blank.className='cal-day cal-blank';calendarGrid.appendChild(blank)}
  for(let d=1;d<=days;d++){
    const date=isoDate(y,m,d);
    const dayEvents=events.filter(ev=>ev.date===date);
    const cell=document.createElement('button');
    cell.type='button';cell.className='cal-day';
    cell.innerHTML='<span class="cal-number">'+d+'</span><div class="cal-event-dots"></div>';
    const dots=cell.querySelector('.cal-event-dots');
    dayEvents.slice(0,3).forEach(ev=>{
      const dot=document.createElement('span');
      dot.className='cal-event-dot '+(ev.scope==='Мультвселенная'?'mv':ev.scope==='Общее'?'shared':'studio');
      dot.title=ev.title;dots.appendChild(dot);
    });
    if(dayEvents.length>3){const more=document.createElement('small');more.textContent='+'+(dayEvents.length-3);dots.appendChild(more)}
    cell.addEventListener('click',()=>openEventEditor(null,date));
    calendarGrid.appendChild(cell);
  }
  renderCalendarEventList();
}

function renderCalendarEventList(){
  if(!calendarEventList)return;
  const key=monthKey(calendarCursor);
  const monthEvents=events.filter(ev=>ev.date.startsWith(key)).sort((a,b)=>a.date.localeCompare(b.date));
  calendarEventList.innerHTML='';
  if(!monthEvents.length){
    calendarEventList.innerHTML='<div class="calendar-empty-state">В этом месяце пока нет событий. Нажмите «Добавить событие» или выберите дату в календаре.</div>';
    return;
  }
  monthEvents.forEach(ev=>{
    const row=document.createElement('article');
    row.className='calendar-event-row';
    row.innerHTML=`
      <div class="calendar-event-date"><strong>${new Date(ev.date+'T12:00:00').getDate()}</strong><span>${new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(new Date(ev.date+'T12:00:00'))}</span></div>
      <div><small>${escapeHtml(ev.type)} / ${escapeHtml(ev.scope)}${ev.time?' / '+escapeHtml(ev.time):''}</small><h4>${escapeHtml(ev.title)}</h4>${ev.note?'<p>'+escapeHtml(ev.note)+'</p>':''}</div>
      <div class="calendar-event-side">${ev.owner?'<span>'+escapeHtml(ev.owner)+'</span>':''}<button class="event-delete" aria-label="Удалить событие">×</button></div>`;
    row.addEventListener('click',e=>{
      if(e.target.closest('.event-delete'))return;
      openEventEditor(ev.id);
    });
    row.querySelector('.event-delete').addEventListener('click',e=>{
      e.stopPropagation();
      events=events.filter(x=>x.id!==ev.id);writeStore(STORAGE_EVENTS,events);renderCalendar();
    });
    calendarEventList.appendChild(row);
  });
}

document.getElementById('addEventBtn')?.addEventListener('click',()=>openEventEditor());
document.getElementById('prevMonthBtn')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()});
document.getElementById('nextMonthBtn')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()});

eventForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(eventForm);
  const date=fd.get('date');
  const payload={
    title:fd.get('title').trim(),
    date,
    time:fd.get('time'),
    type:fd.get('type'),
    scope:fd.get('scope'),
    owner:fd.get('owner').trim(),
    note:fd.get('note').trim()
  };
  if(editingEventId){
    const ev=events.find(x=>x.id===editingEventId);
    if(ev)Object.assign(ev,payload);
  }else{
    events.push({id:uid(),...payload});
  }
  writeStore(STORAGE_EVENTS,events);
  const dt=new Date(date+'T12:00:00');
  calendarCursor=new Date(dt.getFullYear(),dt.getMonth(),1);
  editingEventId=null;
  eventForm.reset();
  eventModal.close();
  renderCalendar();
});

renderCalendar();


// ==========================================
// PRODUCTION / Monster Zip
// Snapshot from current source sheet, 01.10.2026
// ==========================================
const productionItems=[
{id:"01",num:"1",title:"Башня из кубиков",creator:"Алексей",due:"2026-09-19",folder:"https://disk.yandex.ru/d/dPKrhMgOeoOtnQ",finalLink:"https://disk.yandex.ru/i/WboK8d03x7ii1A",duration:"0:25",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово","Не опубликовано"]},
{id:"02",num:"2",title:"Воздушные шары",creator:"Алексей",due:"2026-09-21",folder:"https://disk.yandex.ru/d/z_IWMSGtCtmqhw",finalLink:"https://disk.yandex.ru/i/n_ahrIT1W_yQ7A",duration:"0:26",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово","Не опубликовано"]},
{id:"03",num:"3",title:"Заплатка",creator:"Алексей",due:"2026-09-23",folder:"https://disk.yandex.ru/d/XciiwhSgDL8pOA",finalLink:"https://disk.yandex.ru/i/107v94tzWeaRYQ",duration:"0:26",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово","Не опубликовано"]},
{id:"04",num:"4",title:"Качели",creator:"Дмитрий",due:"2026-09-18",folder:"https://disk.yandex.ru/d/Zxge1EUp5SHTHw",duration:"",stages:["Готово","Не начато","Не начато","Не начато","Не начато","Не начато","Не начато","Не опубликовано"]},
{id:"05",num:"5",title:"Прятки",creator:"Дмитрий",due:"2026-09-20",folder:"https://disk.yandex.ru/d/tC1__WEOs7sG9A",finalLink:"https://disk.yandex.ru/i/v1lmATyJk0hcJw",duration:"0:25",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово","Не опубликовано"]},
{id:"06",num:"6",title:"Солнечный зайчик",creator:"Дмитрий",due:"2026-09-22",folder:"https://disk.yandex.ru/d/ylBOte-1d7lkHw",finalLink:"https://disk.yandex.ru/i/HC0zv1mEBi7z7w",duration:"0:19",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово","Не опубликовано"]},
{id:"07",num:"7",title:"Уборка",creator:"Анна",due:"2026-09-18",folder:"https://disk.yandex.ru/d/ZcessXq7FqRumw",duration:"",stages:["Готово","Готово","Готово","В работе","Готово","На правках","Не начато","Не опубликовано"]},
{id:"08",num:"8",title:"Подарок",creator:"Анна",due:"2026-09-20",folder:"https://disk.yandex.ru/d/BbLJGuwaq3IaSQ",duration:"",stages:["Готово","В работе","В работе","Не начато","Не начато","Не начато","Не начато","Не опубликовано"]},
{id:"09",num:"9",title:"Пружина",creator:"Алексей",due:"2026-09-25",folder:"https://disk.yandex.ru/d/IoIyEH3ceJSbVQ",finalLink:"https://disk.yandex.ru/i/lc2ARZ6TI3V9dQ",duration:"0:24",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово",""]},
{id:"10",num:"10",title:"Осенний лист",creator:"Алексей",due:"2026-09-27",folder:"https://disk.yandex.ru/d/vugopTqxhyhTXQ",finalLink:"https://disk.yandex.ru/i/qRr2r2_34IeY1A",duration:"0:25",stages:["Готово","Готово","Готово","Готово","Готово","Готово","Готово",""]},
{id:"11",num:"11",title:"Карандаш",creator:"Анна",due:"2026-09-25",folder:"https://disk.yandex.ru/d/9lO-ZnTXEYZ8hQ",duration:"",stages:["Готово","В работе","Не начато","Не начато","Не начато","Не начато","Не начато",""]},
{id:"12",num:"12",title:"Найди звезду",creator:"Алексей",due:"2026-09-29",folder:"https://disk.yandex.ru/d/xthQfps4Wd80nw",duration:"",stages:["Готово","В работе","Не начато","Не начато","Не начато","Не начато","Не начато",""]},
{id:"13",num:"13",title:"Осенняя математика",creator:"Дмитрий",due:"2026-09-25",folder:"https://disk.yandex.ru/d/z9zI5ilXb4Y_BQ",duration:"",stages:["Готово","Готово","Готово","Готово","Готово","В работе","Не начато",""]},
{id:"autumn-print",num:"14",title:"Осенний опечаток",creator:"Дмитрий",due:"2026-09-27",folder:"https://disk.yandex.ru/d/pDiHfMGBfqtTlw",duration:"",stages:["Готово","Готово","На правках","В работе","В работе","Не начато","Не начато",""]},
{id:"foam-bath",num:"15",title:"Пенная ванна",creator:"Анна",due:"2026-09-29",folder:"https://disk.yandex.ru/d/QV1Kr27uU25aNA",duration:"",stages:["Готово","Не начато","Не начато","Не начато","Не начато","Не начато","Не начато",""]},
{id:"16",num:"16",title:"Крепость для двоих",creator:"",due:"",folder:"https://disk.yandex.ru/d/AqfyBNnpdnKneg",duration:"",stages:["","","","","","","",""]},
{id:"17",num:"17",title:"Калькулятор",creator:"",due:"",folder:"https://disk.yandex.ru/d/z6XJTQTT6dfSeQ",duration:"",stages:["","","","","","","",""]},
{id:"18",num:"DEV",title:"Проработка персонажей",creator:"Алексей",due:"2026-09-28",folder:"https://disk.yandex.ru/d/lPYDQselCV0eXA",finalLink:"https://disk.yandex.ru/i/dvfT0tD8U5kJNQ",duration:"",stages:["Готово","","","","","","Готово",""]},
{id:"locations",num:"DEV",title:"Проработка локаций",creator:"Алексей",due:"2026-10-02",folder:"https://disk.yandex.ru/d/OUCaeCRE5XWa2g",duration:"",stages:["В работе","","","","","","Не начато",""]},
{id:"20",num:"18",title:"Коробка кота",creator:"",due:"",folder:"https://disk.yandex.ru/d/OyQNpy8E6r3POg",duration:"",stages:["","","","","","","",""]},
{id:"21",num:"19",title:"Чистим зубы",creator:"",due:"",folder:"https://disk.yandex.ru/d/ZabPGH-2UsHZ1Q",duration:"",stages:["","","","","","","",""]},
{id:"22",num:"20",title:"Домино",creator:"Дмитрий",due:"",folder:"https://disk.yandex.ru/d/0nUYG0L3nxNE-A",duration:"",stages:["","В работе","","","","","",""]},
{id:"23",num:"21",title:"Пузырчатая упаковка",creator:"Дмитрий",due:"",folder:"https://disk.yandex.ru/d/6DnY1fZQlmq4Xg",duration:"",stages:["","В работе","","","","","",""]},
{id:"24",num:"22",title:"Краасная кнопка",creator:"",due:"",folder:"https://disk.yandex.ru/d/QofUZAanAhmkSw",duration:"",stages:["","","","","","","",""]}
];

const prodStageNames=["Сценарий","Кадры","Видео","Аудио","Монтаж","Правки","Final","Публикация"];
let prodStageFilter=null;

function productionClass(item){
  const final=item.stages[6];
  if(final==="Готово") return "ready";
  const due=item.due?new Date(item.due+"T23:59:59"):null;
  const now=new Date();
  if(due && due<now) return "risk";
  if(item.stages.includes("На правках")) return "revision";
  if(item.stages.includes("В работе")) return "work";
  return "plan";
}
function productionLabel(cls){
  return ({ready:"Готово",risk:"Риск",revision:"На правках",work:"В работе",plan:"План"})[cls]||cls;
}
function isProductionEpisode(item){
  return Boolean(item.title && String(item.num||"").trim() && String(item.num||"").trim()!=="DEV");
}
function isProductionExtraTask(item){
  return Boolean(item.title) && !isProductionEpisode(item);
}

function normalizeProductionStages(item){
  if(!isProductionEpisode(item)){
    return prodStageNames.map(()=> "Не применимо");
  }

  // Сценарий: название ролика есть в E, статус сценария берём строго из H.
  const scenarioStatus=item.stages?.[0]||"Не начато";
  const productionApplicable=scenarioStatus==="Готово" && Boolean(item.due);

  return prodStageNames.map((_,i)=>{
    const value=item.stages?.[i];
    if(i===0)return scenarioStatus;
    if(!productionApplicable)return "Не применимо";
    return value||"Не начато";
  });
}
function productionProgress(item){
  const stages=normalizeProductionStages(item);
  const applicable=stages.filter(x=>x!=="Не применимо");
  const completed=applicable.filter(x=>x==="Готово").length;
  return applicable.length?Math.round(completed/applicable.length*100):0;
}
function productionStageDot(status,name,index){
  if(index===6){
    const ready=status==="Готово";
    return '<span class="prod-stage-dot prod-stage-special stage-final '+(ready?'is-ready':'is-empty')+'" title="Final: '+status+'" aria-label="Final: '+status+'">'+(ready?'F':'')+'</span>';
  }
  if(index===7){
    const published=status==="Опубликовано"||status==="Готово";
    return '<span class="prod-stage-dot prod-stage-special stage-published '+(published?'is-ready':'is-empty')+'" title="Публикация: '+status+'" aria-label="Публикация: '+status+'">'+(published?'✓':'')+'</span>';
  }
  const cls=status==="Готово"?"stage-done":status==="В работе"?"stage-work":status==="На правках"?"stage-revision":status==="Не применимо"?"stage-na":"stage-empty";
  const symbol=status==="Готово"?"✓":status==="В работе"?"◐":status==="На правках"?"↺":status==="Не применимо"?"—":"";
  return '<span class="prod-stage-dot '+cls+'" title="'+name+': '+status+'" aria-label="'+name+': '+status+'">'+symbol+'</span>';
}
function prodDate(value){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit"}).format(new Date(value+"T12:00:00"));
}
function isProductionFinished(item){
  if(isProductionEpisode(item)){
    // P = Final. Если P = "Готово", ролик закрыт для контроля дедлайна.
    return String(item.stages?.[6]||"").trim()==="Готово";
  }
  // Дополнительные задачи тоже считаем закрытыми по итоговому статусу P = "Готово".
  return String(item.stages?.[6]||"").trim()==="Готово";
}

function renderProductionDeadlines(){
  const overdueHost=document.getElementById("overdueDeadlineList");
  const upcomingHost=document.getElementById("upcomingDeadlineList");
  if(!overdueHost||!upcomingHost)return;

  const today=new Date();
  today.setHours(0,0,0,0);
  const upcomingLimit=new Date(today);
  upcomingLimit.setDate(upcomingLimit.getDate()+5);

  const withDue=productionItems
    .filter(item=>item.due && item.title && !isProductionFinished(item))
    .map(item=>({...item,_due:new Date(item.due+"T00:00:00")}))
    .filter(item=>!isNaN(item._due));

  const overdue=withDue
    .filter(item=>item._due<today)
    .sort((a,b)=>b._due-a._due);

  const upcoming=withDue
    .filter(item=>item._due>=today && item._due<=upcomingLimit)
    .sort((a,b)=>a._due-b._due);

  const daysDiff=(date)=>Math.round((date-today)/86400000);

  const renderItem=(item,isOverdue)=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className=isOverdue?"deadline-risk":"deadline-upcoming";
    const diff=daysDiff(item._due);
    const timing=isOverdue
      ? "Просрочено на "+Math.abs(diff)+" дн."
      : diff===0 ? "Сегодня"
      : diff===1 ? "Завтра"
      : "Через "+diff+" дн.";
    btn.innerHTML=
      '<span class="deadline-copy">'+
        '<b>'+escapeHtml(item.title)+'</b>'+
        '<small>'+escapeHtml(item.creator||"Не назначен")+(isProductionExtraTask(item)?" · доп. задача":"")+'</small>'+
        '<em>'+timing+'</em>'+
      '</span>'+
      '<strong>'+prodDate(item.due)+'</strong>';
    btn.addEventListener("click",()=>openProductionDetail(item.id));
    return btn;
  };

  overdueHost.innerHTML="";
  upcomingHost.innerHTML="";
  overdue.forEach(item=>overdueHost.appendChild(renderItem(item,true)));
  upcoming.forEach(item=>upcomingHost.appendChild(renderItem(item,false)));

  if(!overdue.length)overdueHost.innerHTML='<div class="deadline-empty">Просроченных дедлайнов нет</div>';
  if(!upcoming.length)upcomingHost.innerHTML='<div class="deadline-empty">На ближайшие 5 дней дедлайнов нет</div>';

  const overdueCount=document.getElementById("overdueDeadlineCount");
  const upcomingCount=document.getElementById("upcomingDeadlineCount");
  if(overdueCount)overdueCount.textContent=String(overdue.length);
  if(upcomingCount)upcomingCount.textContent=String(upcoming.length);
}

function renderProductionExtraTasks(){
  const host=document.getElementById("productionExtraTasks");
  if(!host)return;
  const tasks=productionItems.filter(isProductionExtraTask);
  host.innerHTML="";
  if(!tasks.length){
    host.innerHTML='<div class="production-empty">Дополнительных задач сейчас нет.</div>';
    return;
  }
  tasks.forEach(item=>{
    const row=document.createElement("article");
    row.className="production-extra-task";
    const rawStatus=(item.stages||[]).find(s=>s && s!=="Не начато" && s!=="Не применимо")||"План";
    row.innerHTML=`
      <div><small>ДОП. ЗАДАЧА</small><strong>${escapeHtml(item.title)}</strong></div>
      <span>${item.creator?escapeHtml(item.creator):"—"}</span>
      <span>${prodDate(item.due)}</span>
      <b>${escapeHtml(rawStatus)}</b>`;
    row.addEventListener("click",()=>openProductionDetail(item.id));
    host.appendChild(row);
  });
}

function renderProductionRows(){
  const host=document.getElementById("productionRows");
  if(!host)return;
  const search=(document.getElementById("prodSearch")?.value||"").trim().toLowerCase();
  const creator=document.getElementById("prodCreatorFilter")?.value||"all";
  const status=document.getElementById("prodStatusFilter")?.value||"all";
  let rows=productionItems.filter(isProductionEpisode).filter(item=>{
    if(search && !item.title.toLowerCase().includes(search))return false;
    if(creator!=="all" && item.creator!==creator)return false;
    if(status!=="all" && productionClass(item)!==status)return false;
    if(prodStageFilter!==null){
      const stageValue=normalizeProductionStages(item)[prodStageFilter];
      if(stageValue==="Не применимо"||stageValue==="Готово")return false;
    }
    return true;
  });
  host.innerHTML="";
  if(!rows.length){
    host.innerHTML='<div class="production-empty">По выбранным фильтрам ничего не найдено.</div>';
    return;
  }
  rows.forEach(item=>{
    const cls=productionClass(item);
    const progress=productionProgress(item);
    const row=document.createElement("button");
    row.className="production-row";
    row.type="button";
    row.dataset.prodId=item.id;
    row.innerHTML=`
      <span class="prod-num">#${item.num}</span>
      <span class="prod-title"><strong>${escapeHtml(item.title)}</strong><small>${progress}% готовности</small></span>
      <span class="prod-stages">${normalizeProductionStages(item).map((s,i)=>productionStageDot(s,prodStageNames[i],i)).join("")}</span>
      <span class="prod-owner">${item.creator?escapeHtml(item.creator):"—"}</span>
      <span class="prod-due ${cls==="risk"?"risk":""}">${prodDate(item.due)}</span>
      <span class="prod-state state-${cls}">${productionLabel(cls)}</span>`;
    row.addEventListener("click",()=>openProductionDetail(item.id));
    host.appendChild(row);
  });
}
function openProductionDetail(id){
  const item=productionItems.find(x=>x.id===id);
  if(!item)return;
  const cls=productionClass(item);
  const modal=document.getElementById("productionDetailModal");
  const host=document.getElementById("productionDetailContent");
  host.innerHTML=`
    <div class="modal-head">
      <div><small>MONSTER ZIP / ${item.num}</small><h2>${escapeHtml(item.title)}</h2></div>
      <button type="button" class="modal-close" id="closeProductionDetail">×</button>
    </div>
    <div class="prod-detail-meta">
      <div><span>Ответственный</span><strong>${item.creator?escapeHtml(item.creator):"Не назначен"}</strong></div>
      <div><span>Дедлайн</span><strong>${item.due?new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"long",year:"numeric"}).format(new Date(item.due+"T12:00:00")):"Не задан"}</strong></div>
      <div><span>Статус</span><strong class="detail-status state-${cls}">${productionLabel(cls)}</strong></div>
      <div><span>Хронометраж</span><strong>${item.duration||"—"}</strong></div>
    </div>
    <div class="prod-detail-pipeline">
      ${prodStageNames.map((name,i)=>{const s=normalizeProductionStages(item)[i];return '<div><span>'+String(i+1).padStart(2,"0")+'</span><strong>'+name+'</strong><small class="detail-stage '+(s==="Готово"?"stage-done":s==="В работе"?"stage-work":s==="На правках"?"stage-revision":"stage-empty")+'">'+s+'</small></div>'}).join("")}
    </div>
    <div class="prod-detail-actions">
      ${item.folder?'<a href="'+item.folder+'" target="_blank" rel="noreferrer">Открыть рабочую папку ↗</a>':""}
      ${item.finalLink?'<a href="'+item.finalLink+'" target="_blank" rel="noreferrer">Открыть Final ↗</a>':""}
      <a class="secondary-modal" href="https://docs.google.com/spreadsheets/d/1sj5Y5YBakIK51-sx0DzFD-zfItjBWwnpf8WKK-mK1Zw/edit" target="_blank" rel="noreferrer">Редактировать в источнике ↗</a>
    </div>`;
  host.querySelector("#closeProductionDetail")?.addEventListener("click",()=>modal.close());
  modal.showModal();
}
["prodSearch","prodCreatorFilter","prodStatusFilter"].forEach(id=>{
  document.getElementById(id)?.addEventListener(id==="prodSearch"?"input":"change",renderProductionRows);
});
document.querySelectorAll("[data-prod-stage]").forEach((btn,i)=>{
  btn.addEventListener("click",()=>{
    const was=btn.classList.contains("active");
    document.querySelectorAll("[data-prod-stage]").forEach(x=>x.classList.remove("active"));
    prodStageFilter=was?null:i;
    if(!was)btn.classList.add("active");
    renderProductionRows();
  });
});
document.querySelectorAll("[data-prod-open]").forEach(btn=>btn.addEventListener("click",()=>openProductionDetail(btn.dataset.prodOpen)));
renderProductionRows();

// Live Monster Zip production sync from Google Sheets.
const PROD_SHEET_ID="1sj5Y5YBakIK51-sx0DzFD-zfItjBWwnpf8WKK-mK1Zw";
const PROD_SHEET_NAME="Zip монстр ";
const PROD_SYNC_MS=60000;

function setProductionSyncState(state,label){
  const el=document.getElementById("productionSyncState");
  if(!el)return;
  el.className="production-sync-state sync-"+state;
  el.textContent=label;
}

function parseGvizResponse(raw){
  const start=raw.indexOf("{");
  const end=raw.lastIndexOf("}");
  if(start<0||end<0)throw new Error("Invalid Google Sheets response");
  return JSON.parse(raw.slice(start,end+1));
}

function gvizCell(row,index){
  const cell=row&&row.c?row.c[index]:null;
  if(!cell)return "";
  if(cell.f!==undefined&&cell.f!==null)return cell.f;
  return cell.v!==undefined&&cell.v!==null?cell.v:"";
}

function sheetDateToISO(value){
  if(!value)return "";
  const s=String(value).trim();
  let m=s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if(m)return m[1]+"-"+String(Number(m[2])+1).padStart(2,"0")+"-"+m[3].padStart(2,"0");
  m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  const d=new Date(s);
  return isNaN(d)?"":d.toISOString().slice(0,10);
}

function mapZipRowsFromGviz(table){
  const rows=(table&&table.rows)||[];
  return rows.map((row,idx)=>{
    const title=String(gvizCell(row,4)||"").trim();
    if(!title)return null;
    const publication=String(gvizCell(row,18)||"").trim()||"Не опубликовано";
    return {
      id:"live-"+(idx+1),
      num:String(gvizCell(row,2)||"").trim(),
      title,
      kind:String(gvizCell(row,2)||"").trim()?"episode":"task",
      creator:String(gvizCell(row,8)||"").trim(),
      due:sheetDateToISO(gvizCell(row,9)),
      folder:String(gvizCell(row,3)||"").trim(),
      finalLink:String(gvizCell(row,16)||"").trim(),
      duration:String(gvizCell(row,20)||"").trim(),
      stages:[
        String(gvizCell(row,7)||"").trim()||"Не применимо",
        String(gvizCell(row,10)||"").trim()||"Не начато",
        String(gvizCell(row,11)||"").trim()||"Не начато",
        String(gvizCell(row,12)||"").trim()||"Не начато",
        String(gvizCell(row,13)||"").trim()||"Не начато",
        String(gvizCell(row,14)||"").trim()||"Не начато",
        String(gvizCell(row,15)||"").trim()||"Не начато",
        publication
      ]
    };
  }).filter(Boolean);
}

function updateProductionStageCounts(){
  const episodes=productionItems.filter(isProductionEpisode);
  document.querySelectorAll("[data-prod-stage]").forEach((btn,index)=>{
    const values=episodes.map(item=>normalizeProductionStages(item)[index]);
    let applicable;
    if(index===0){
      // Сценарий считаем по всем реальным роликам.
      applicable=values;
    }else{
      // Остальные этапы только по роликам, которые реально вошли в production (есть сценарий + дедлайн).
      applicable=values.filter(v=>v!=="Не применимо");
    }
    const ready=applicable.filter(v=>v==="Готово" || (index===7 && v==="Опубликовано")).length;
    const counter=btn.querySelector("strong");
    if(counter)counter.textContent=ready+"/"+applicable.length;
  });
}

function updateProductionKpisFromLive(){
  const episodes=productionItems.filter(isProductionEpisode);
  const total=episodes.length;
  const finals=episodes.filter(x=>normalizeProductionStages(x)[6]==="Готово").length;
  const published=episodes.filter(x=>["Опубликовано","Готово"].includes(normalizeProductionStages(x)[7])).length;
  const values={total,final:finals,remaining:Math.max(0,total-finals),published};
  Object.entries(values).forEach(([key,value])=>{
    const el=document.querySelector("[data-prod-kpi=\""+key+"\"]");
    if(el)el.textContent=String(value);
  });
}

function applyLiveProductionTable(table){
  const live=mapZipRowsFromGviz(table);
  if(!live.length)throw new Error("No production rows");
  productionItems.splice(0,productionItems.length,...live);

  // Everything below must be recalculated from the live sheet.
  renderProductionRows();
  renderProductionExtraTasks();
  renderProductionDeadlines();
  updateProductionKpisFromLive();
  updateProductionStageCounts();

  setProductionSyncState("ok","Live · "+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}));
}

function syncProductionFromSheet(){
  setProductionSyncState("loading","Синхронизация…");
  const callback="onvisualProdSync_"+Date.now();
  const script=document.createElement("script");
  const timer=setTimeout(()=>{
    delete window[callback];
    script.remove();
    setProductionSyncState("fallback","Последние сохранённые данные");
  },12000);

  window[callback]=(payload)=>{
    clearTimeout(timer);
    try{
      if(!payload||!payload.table)throw new Error("Invalid Google Sheets payload");
      applyLiveProductionTable(payload.table);
    }catch(error){
      console.warn("Monster Zip live sync unavailable",error);
      setProductionSyncState("fallback","Последние сохранённые данные");
    }finally{
      delete window[callback];
      script.remove();
    }
  };

  script.onerror=()=>{
    clearTimeout(timer);
    delete window[callback];
    script.remove();
    setProductionSyncState("fallback","Последние сохранённые данные");
  };

  script.src="https://docs.google.com/spreadsheets/d/"+PROD_SHEET_ID+
    "/gviz/tq?tqx=responseHandler:"+callback+
    "&sheet="+encodeURIComponent(PROD_SHEET_NAME)+
    "&headers=1&_="+Date.now();
  document.head.appendChild(script);
}

syncProductionFromSheet();
setInterval(syncProductionFromSheet,PROD_SYNC_MS);


// ==========================================
// ONVISUAL SALES CRM
// Research DB + contacts + touches + follow-ups
// ==========================================
const SALES_COMPANIES_KEY="onvisualSalesCompaniesV2";
const SALES_CONTACTS_KEY="onvisualSalesContactsV2";
const SALES_TOUCHES_KEY="onvisualSalesTouchesV2";
const SALES_SOURCE_SHEET_ID="1_MAbTWCWxirEF_5gBAnbCjh-kIo92D_beZZFp9X1hIY";
const SALES_SOURCE_SHEET="Контакты компаний ";
let salesCompanies=readStore(SALES_COMPANIES_KEY);
let salesContacts=readStore(SALES_CONTACTS_KEY);
let salesTouches=readStore(SALES_TOUCHES_KEY);
let editingSalesCompanyId=null;
let editingSalesContactId=null;

const salesStatusMeta={
  new:{label:"Новый",stage:"lead"},
  researched:{label:"Исследован",stage:"lead"},
  contacts:{label:"Контакты найдены",stage:"contact"},
  ready:{label:"Готов к касанию",stage:"contact"},
  contacted:{label:"1 касание",stage:"outreach"},
  followup:{label:"Follow-up",stage:"outreach"},
  reply:{label:"Ответ",stage:"reply"},
  dialog:{label:"Диалог",stage:"reply"},
  meeting:{label:"Встреча",stage:"meeting"},
  brief:{label:"Бриф",stage:"meeting"},
  proposal:{label:"КП",stage:"proposal"},
  won:{label:"WON",stage:"won"},
  lost:{label:"LOST",stage:"lost"}
};
const salesPipelineStages=[
  {key:"lead",label:"Новые"},
  {key:"contact",label:"Контакты"},
  {key:"outreach",label:"Касание"},
  {key:"reply",label:"Ответ / диалог"},
  {key:"meeting",label:"Встреча / бриф"},
  {key:"proposal",label:"КП"},
  {key:"won",label:"WON"}
];

function salesNorm(value){return String(value||"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ")}
function salesDateLabel(value){
  if(!value)return "—";
  const d=new Date(value+"T12:00:00");
  if(isNaN(d))return value;
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short"}).format(d);
}
function salesTodayIso(){return new Date().toISOString().slice(0,10)}
function salesCompanyById(id){return salesCompanies.find(c=>c.id===id)}
function salesContactById(id){return salesContacts.find(c=>c.id===id)}
function salesContactsForCompany(id){return salesContacts.filter(c=>c.companyId===id)}
function salesContactIsReady(p){return Boolean(p&&p.name&&p.role&&p.sourceUrl&&(p.email||p.phone||p.profile||p.social))}
function salesCompanyReadyContacts(id){return salesContactsForCompany(id).filter(salesContactIsReady)}
function salesCompanyCompleteness(c){let n=0;if(c.website)n++;if(c.instagram||c.social)n++;if(c.signal)n++;if((Number(c.score)||0)>=12)n++;if(salesCompanyReadyContacts(c.id).length)n++;return n}
function salesLink(url,label){if(!url)return "";const safe=escapeHtml(url);return '<a class="sales-company-link" href="'+safe+'" target="_blank" rel="noreferrer">'+label+' ↗</a>'}
function salesLatestTouch(companyId){return salesTouches.filter(t=>t.companyId===companyId).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0]}
function salesStatusLabel(status){return salesStatusMeta[status]?.label||status||"Новый"}
function saveSales(){
  writeStore(SALES_COMPANIES_KEY,salesCompanies);
  writeStore(SALES_CONTACTS_KEY,salesContacts);
  writeStore(SALES_TOUCHES_KEY,salesTouches);
}
function extractFirstUrl(value){
  const m=String(value||"").match(/https?:\/\/[^\s)\]}>,;]+/i);
  return m?m[0]:"";
}
function splitContactField(value){
  const s=String(value||"").trim();
  if(!s)return {name:"",role:""};
  const separators=[" — "," – "," - "," / "," | "];
  for(const sep of separators){
    if(s.includes(sep)){
      const [a,...rest]=s.split(sep);
      return {name:a.trim(),role:rest.join(sep).trim()};
    }
  }
  return {name:s,role:""};
}
function guessRoleGroup(role){
  const r=salesNorm(role);
  if(/creative|креатив|art director|арт.директор/.test(r))return "creative";
  if(/brand|бренд/.test(r))return "brand";
  if(/production|producer|продюсер|продакш/.test(r))return "production";
  if(/marketing|маркет|cmo|digital|smm|content/.test(r))return "marketing";
  return "other";
}
function nextStatusFromTouch(result){
  return ({reply:"reply",meeting:"meeting",brief:"brief",proposal:"proposal",sent:"contacted",no_reply:"followup"})[result]||null;
}

function renderSales(){
  if(!document.querySelector('[data-pane="salesstudio"]'))return;
  renderSalesKpis();
  renderSalesDashboard();
  renderSalesCompanies();
  renderSalesContacts();
  renderSalesPipeline();
  renderSalesTouches();
  renderSalesFollowups();
  refreshSalesCompanySelects();
}
function renderSalesKpis(){
  const active=salesCompanies.filter(c=>c.status!=="lost");
  const replies=active.filter(c=>["reply","dialog"].includes(c.status)).length;
  const meetings=active.filter(c=>["meeting","brief","proposal"].includes(c.status)).length;
  const won=active.filter(c=>c.status==="won").length;
  const today=salesTodayIso();
  const actions=active.filter(c=>c.nextDate && c.nextDate<=today).length;
  const values={salesKpiCompanies:active.length,salesKpiContacts:salesContacts.length,salesKpiActions:actions,salesKpiReplies:replies,salesKpiMeetings:meetings,salesKpiWon:won};
  Object.entries(values).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=String(val)});
  const badge=document.getElementById("salesActionBadge");if(badge)badge.textContent=String(actions);
  const summary=document.getElementById("salesTodaySummary");
  if(summary)summary.textContent=actions?("Сегодня / просрочено: "+actions+" действий"):"Сегодня действий нет";
}
function renderSalesDashboard(){
  const actionHost=document.getElementById("salesActionList");
  const priorityHost=document.getElementById("salesPriorityCompanies");
  const recentHost=document.getElementById("salesRecentTouches");
  const funnelHost=document.getElementById("salesMiniFunnel");
  if(!actionHost)return;
  const today=salesTodayIso();
  const actions=salesCompanies.filter(c=>c.status!=="lost"&&c.status!=="won"&&c.nextDate&&c.nextDate<=today).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  actionHost.innerHTML=actions.length?"":'<div class="sales-empty">На сегодня обязательных действий нет.</div>';
  actions.slice(0,8).forEach(c=>{
    const row=document.createElement("article");row.className="sales-action-card";
    const overdue=c.nextDate<today;
    row.innerHTML='<div><strong>'+escapeHtml(c.name)+'</strong><small>'+escapeHtml(c.nextAction||"Следующее действие не указано")+' · '+salesStatusLabel(c.status)+'</small></div><div class="due '+(!overdue?"today":"")+'">'+(overdue?"Просрочено · ":"Сегодня · ")+salesDateLabel(c.nextDate)+'</div>';
    row.addEventListener("click",()=>openSalesCompany(c.id));actionHost.appendChild(row);
  });
  const priority=[...salesCompanies].filter(c=>c.status!=="lost").sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).slice(0,7);
  priorityHost.innerHTML=priority.length?"":'<div class="sales-empty">После синхронизации здесь появятся приоритетные компании.</div>';
  priority.forEach(c=>{
    const row=document.createElement("article");row.className="sales-company-row";
    row.innerHTML='<div><strong>'+escapeHtml(c.name)+'</strong><small>'+escapeHtml((c.signal||"Нет сигнала").slice(0,110))+'</small></div><span class="sales-status-pill '+c.status+'">'+salesStatusLabel(c.status)+'</span><span class="sales-score '+((Number(c.score)||0)>=16?"hot":"")+'">'+(c.score||"—")+'/20</span>';
    row.addEventListener("click",()=>openSalesCompany(c.id));priorityHost.appendChild(row);
  });
  const recent=[...salesTouches].sort((a,b)=>((b.date||"")+" "+(b.createdAt||"")).localeCompare((a.date||"")+" "+(a.createdAt||""))).slice(0,7);
  recentHost.innerHTML=recent.length?"":'<div class="sales-empty">Касания ещё не зафиксированы.</div>';
  recent.forEach(t=>{
    const c=salesCompanyById(t.companyId),p=salesContactById(t.contactId);
    const row=document.createElement("article");row.className="sales-touch-row";
    row.innerHTML='<div><strong>'+escapeHtml(c?.name||"Компания")+'</strong><small>'+escapeHtml(t.channel||"Касание")+(p?" · "+escapeHtml(p.name):"")+' · '+salesDateLabel(t.date)+'</small></div>';
    recentHost.appendChild(row);
  });
  funnelHost.innerHTML="";
  const max=Math.max(1,...salesPipelineStages.map(s=>salesCompanies.filter(c=>salesStatusMeta[c.status]?.stage===s.key).length));
  salesPipelineStages.forEach(s=>{
    const count=salesCompanies.filter(c=>salesStatusMeta[c.status]?.stage===s.key).length;
    const row=document.createElement("div");row.className="sales-mini-stage";
    row.innerHTML='<span>'+s.label+'</span><strong>'+count+'</strong><div class="sales-mini-bar"><i style="width:'+Math.round(count/max*100)+'%"></i></div>';
    funnelHost.appendChild(row);
  });
}
function renderSalesCompanies(){
  const host=document.getElementById("salesCompaniesBody");if(!host)return;
  const q=salesNorm(document.getElementById("salesCompanySearch")?.value);
  const status=document.getElementById("salesCompanyStatusFilter")?.value||"all";
  const priority=document.getElementById("salesCompanyPriorityFilter")?.value||"all";
  const rows=salesCompanies.filter(c=>{
    if(q&&!salesNorm([c.name,c.segment,c.signal,c.offer,c.website,c.instagram,c.social].join(" ")).includes(q))return false;
    if(status!=="all"&&c.status!==status)return false;
    const score=Number(c.score)||0;
    if(priority==="hot"&&score<16)return false;
    if(priority==="qualified"&&(score<12||score>=16))return false;
    return true;
  }).sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
  host.innerHTML="";
  if(!rows.length){host.innerHTML='<tr><td colspan="8"><div class="sales-empty">Компании не найдены.</div></td></tr>';return}
  rows.forEach(c=>{
    const contacts=salesContactsForCompany(c.id);
    const tr=document.createElement("tr");
    const readyContacts=salesCompanyReadyContacts(c.id);
    const completeness=salesCompanyCompleteness(c);
    tr.innerHTML='<td><div class="company-name">'+escapeHtml(c.name)+'</div><small>'+escapeHtml(c.segment||"")+'</small><div class="sales-completeness '+(completeness>=5?"ready":"")+'">'+completeness+'/5 заполнено</div></td>'+
      '<td><span class="sales-score '+((Number(c.score)||0)>=16?"hot":"")+'">'+(c.score||"—")+'/20</span></td>'+
      '<td><div class="sales-company-links">'+salesLink(c.website,"Сайт")+salesLink(c.instagram,"Instagram")+salesLink(c.social,"Social")+'</div></td>'+
      '<td class="signal-copy">'+escapeHtml(c.signal||"—")+'</td>'+
      '<td>'+contacts.length+' всего · <b>'+readyContacts.length+' готово к связи</b>'+(contacts.length?'<small>'+escapeHtml(contacts.slice(0,3).map(x=>x.name).join(", "))+'</small>':"")+'</td>'+
      '<td><select class="sales-status-select">'+Object.entries(salesStatusMeta).map(([key,val])=>'<option value="'+key+'" '+(c.status===key?"selected":"")+'>'+val.label+'</option>').join("")+'</select></td>'+
      '<td><b>'+escapeHtml(c.nextAction||"—")+'</b><small>'+salesDateLabel(c.nextDate)+'</small></td>'+
      '<td><div class="sales-row-actions"><button class="sales-icon-btn edit-company" title="Редактировать">✎</button><button class="sales-icon-btn add-contact-company" title="Добавить сотрудника">＋👤</button><button class="sales-icon-btn add-touch" title="Касание">↗</button></div></td>';
    tr.querySelector(".sales-status-select").addEventListener("change",e=>{c.status=e.target.value;saveSales();renderSales()});
    tr.querySelector(".edit-company").addEventListener("click",()=>openSalesCompany(c.id));
    tr.querySelector(".add-contact-company").addEventListener("click",()=>openSalesContact(null,c.id));
    tr.querySelector(".add-touch").addEventListener("click",()=>openSalesTouch(c.id));
    host.appendChild(tr);
  });
}
function renderSalesContacts(){
  const host=document.getElementById("salesContactsGrid");if(!host)return;
  const q=salesNorm(document.getElementById("salesContactSearch")?.value);
  const roleFilter=document.getElementById("salesContactRoleFilter")?.value||"all";
  const rows=salesContacts.filter(p=>{
    const c=salesCompanyById(p.companyId);
    if(q&&!salesNorm([p.name,p.role,c?.name,p.email,p.social].join(" ")).includes(q))return false;
    if(roleFilter!=="all"&&p.roleGroup!==roleFilter)return false;
    return true;
  }).sort((a,b)=>(salesCompanyById(a.companyId)?.name||"").localeCompare(salesCompanyById(b.companyId)?.name||"","ru"));
  host.innerHTML="";
  if(!rows.length){host.innerHTML='<div class="sales-empty">Конкретных контактов пока нет. Добавь их вручную или синхронизируй research database.</div>';return}
  rows.forEach(p=>{
    const c=salesCompanyById(p.companyId);
    const card=document.createElement("article");card.className="sales-contact-card";
    const initials=p.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
    card.innerHTML='<div class="sales-contact-top"><div class="sales-contact-avatar">'+escapeHtml(initials||"?")+'</div><button class="sales-icon-btn edit-contact">✎</button></div>'+
      '<h4>'+escapeHtml(p.name)+'</h4><div class="role">'+escapeHtml(p.role||"Должность не указана")+'</div><div class="company">'+escapeHtml(c?.name||"—")+'</div>'+
      '<div class="sales-contact-badges"><span class="'+(salesContactIsReady(p)?"contact-ready":"contact-missing")+'">'+(salesContactIsReady(p)?"Готов к связи":"Нужно дополнить")+'</span><span>'+escapeHtml(p.priority==="primary"?"Основной ЛПР":p.priority==="influencer"?"Influencer":"Резерв")+'</span>'+(p.preferredChannel?'<span>'+escapeHtml(p.preferredChannel)+'</span>':"")+'</div>'+
      '<p>'+escapeHtml(p.reason||"")+'</p><div class="sales-contact-links">'+
      (p.email?'<a href="mailto:'+escapeHtml(p.email)+'">Email</a>':"")+
      (p.profile?'<a href="'+escapeHtml(p.profile)+'" target="_blank" rel="noreferrer">Профиль ↗</a>':"")+
      (p.sourceUrl?'<a href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noreferrer">Источник ↗</a>':"")+
      (p.social&&/^https?:\/\//.test(p.social)?'<a href="'+escapeHtml(p.social)+'" target="_blank" rel="noreferrer">Social ↗</a>':p.social?'<button type="button" title="'+escapeHtml(p.social)+'">Social</button>':"")+
      '<button type="button" class="contact-touch">+ касание</button></div>';
    card.querySelector(".edit-contact").addEventListener("click",()=>openSalesContact(p.id));
    card.querySelector(".contact-touch").addEventListener("click",()=>openSalesTouch(p.companyId,p.id));
    host.appendChild(card);
  });
}
function renderSalesPipeline(){
  const host=document.getElementById("salesPipelineBoard");if(!host)return;
  host.innerHTML="";
  salesPipelineStages.forEach(stage=>{
    const companies=salesCompanies.filter(c=>salesStatusMeta[c.status]?.stage===stage.key);
    const col=document.createElement("div");col.className="sales-pipeline-column";
    col.innerHTML='<div class="sales-pipeline-column-head">'+stage.label+' <span>'+companies.length+'</span></div><div class="sales-pipeline-cards"></div>';
    const list=col.querySelector(".sales-pipeline-cards");
    companies.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).forEach(c=>{
      const card=document.createElement("article");card.className="sales-pipeline-card";
      const next=c.nextDate?(" · "+salesDateLabel(c.nextDate)):"";
      card.innerHTML='<strong>'+escapeHtml(c.name)+'</strong><small>'+salesStatusLabel(c.status)+next+'</small><div class="pipeline-score">'+(c.score||"—")+'/20 · '+salesContactsForCompany(c.id).length+' контактов</div>';
      card.addEventListener("click",()=>openSalesCompany(c.id));list.appendChild(card);
    });
    host.appendChild(col);
  });
}
function renderSalesTouches(){
  const host=document.getElementById("salesTouchesTimeline");if(!host)return;
  const rows=[...salesTouches].sort((a,b)=>((b.date||"")+" "+(b.createdAt||"")).localeCompare((a.date||"")+" "+(a.createdAt||"")));
  host.innerHTML="";
  if(!rows.length){host.innerHTML='<div class="sales-empty">Пока нет касаний. Фиксируй каждое письмо, DM, звонок и встречу — это история отношений с брендом.</div>';return}
  rows.forEach(t=>{
    const c=salesCompanyById(t.companyId),p=salesContactById(t.contactId);
    const row=document.createElement("article");row.className="sales-touch-entry";
    row.innerHTML='<div class="sales-touch-date">'+salesDateLabel(t.date)+'</div><div class="sales-touch-channel">'+escapeHtml((t.channel||"").slice(0,4))+'</div><div><h4>'+escapeHtml(c?.name||"Компания")+(p?" · "+escapeHtml(p.name):"")+'</h4><p>'+escapeHtml(t.note||"")+'</p>'+(t.nextAction?'<div class="next">Следующее: '+escapeHtml(t.nextAction)+(t.nextDate?" · "+salesDateLabel(t.nextDate):"")+'</div>':"")+'</div><span class="sales-status-pill">'+escapeHtml(t.result||"")+'</span>';
    host.appendChild(row);
  });
}
function renderSalesFollowups(){
  const today=salesTodayIso();
  const rows=salesCompanies.filter(c=>c.status!=="lost"&&c.status!=="won"&&c.nextDate).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
  const groups={overdue:rows.filter(c=>c.nextDate<today),today:rows.filter(c=>c.nextDate===today),upcoming:rows.filter(c=>c.nextDate>today)};
  const mapping={overdue:["salesFollowupOverdue","salesFollowupOverdueCount"],today:["salesFollowupToday","salesFollowupTodayCount"],upcoming:["salesFollowupUpcoming","salesFollowupUpcomingCount"]};
  Object.entries(groups).forEach(([key,list])=>{
    const [hostId,countId]=mapping[key],host=document.getElementById(hostId),count=document.getElementById(countId);
    if(count)count.textContent=String(list.length);if(!host)return;host.innerHTML="";
    if(!list.length){host.innerHTML='<div class="sales-empty">Пусто</div>';return}
    list.forEach(c=>{
      const card=document.createElement("article");card.className="sales-followup-card";
      card.innerHTML='<strong>'+escapeHtml(c.name)+'</strong><small>'+salesStatusLabel(c.status)+' · '+salesDateLabel(c.nextDate)+'</small><p>'+escapeHtml(c.nextAction||"Следующее действие")+'</p>';
      card.addEventListener("click",()=>openSalesCompany(c.id));host.appendChild(card);
    });
  });
}
function refreshSalesCompanySelects(){
  const options=salesCompanies.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru")).map(c=>'<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>').join("");
  ["salesContactCompanySelect","salesTouchCompanySelect"].forEach(id=>{const el=document.getElementById(id);if(el){const prev=el.value;el.innerHTML='<option value="">Выбрать…</option>'+options;if(prev)el.value=prev}});
}
function refreshTouchContacts(companyId,selected=""){
  const el=document.getElementById("salesTouchContactSelect");if(!el)return;
  const list=salesContactsForCompany(companyId);
  el.innerHTML='<option value="">Без конкретного контакта</option>'+list.map(p=>'<option value="'+p.id+'">'+escapeHtml(p.name)+(p.role?" · "+escapeHtml(p.role):"")+'</option>').join("");
  if(selected)el.value=selected;
}

function openSalesCompany(id=null){
  const modal=document.getElementById("salesCompanyModal"),form=document.getElementById("salesCompanyForm");if(!modal||!form)return;
  editingSalesCompanyId=id;form.reset();
  const c=id?salesCompanyById(id):null;
  document.getElementById("salesCompanyModalTitle").textContent=c?"Редактировать компанию":"Добавить компанию";
  if(c){["name","segment","score","website","instagram","social","status","signal","nextAction","nextDate","offer"].forEach(k=>{if(form.elements[k])form.elements[k].value=c[k]||""})}
  modal.showModal();
}
function openSalesContact(id=null,companyId=""){
  const modal=document.getElementById("salesContactModal"),form=document.getElementById("salesContactForm");if(!modal||!form)return;
  editingSalesContactId=id;form.reset();refreshSalesCompanySelects();
  const p=id?salesContactById(id):null;
  document.getElementById("salesContactModalTitle").textContent=p?"Редактировать контакт":"Добавить контакт";
  if(p){["companyId","name","role","roleGroup","email","phone","profile","social","priority","preferredChannel","sourceUrl","verified","reason"].forEach(k=>{if(form.elements[k])form.elements[k].value=p[k]||""})}
  else if(companyId)form.elements.companyId.value=companyId;
  modal.showModal();
}
function openSalesTouch(companyId="",contactId=""){
  const modal=document.getElementById("salesTouchModal"),form=document.getElementById("salesTouchForm");if(!modal||!form)return;
  form.reset();refreshSalesCompanySelects();form.elements.date.value=salesTodayIso();
  if(companyId)form.elements.companyId.value=companyId;
  refreshTouchContacts(form.elements.companyId.value,contactId);
  modal.showModal();
}

document.getElementById("salesCompanyForm")?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);
  const payload={name:String(fd.get("name")||"").trim(),segment:String(fd.get("segment")||"").trim(),score:Number(fd.get("score"))||0,website:String(fd.get("website")||"").trim(),instagram:String(fd.get("instagram")||"").trim(),social:String(fd.get("social")||"").trim(),status:fd.get("status")||"new",signal:String(fd.get("signal")||"").trim(),nextAction:String(fd.get("nextAction")||"").trim(),nextDate:fd.get("nextDate")||"",offer:String(fd.get("offer")||"").trim()};
  if(editingSalesCompanyId){const c=salesCompanyById(editingSalesCompanyId);if(c)Object.assign(c,payload)}
  else salesCompanies.unshift({id:"co-"+uid(),source:"manual",...payload,createdAt:new Date().toISOString()});
  editingSalesCompanyId=null;saveSales();document.getElementById("salesCompanyModal").close();renderSales();
});
document.getElementById("salesContactForm")?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);
  const payload={companyId:fd.get("companyId"),name:String(fd.get("name")||"").trim(),role:String(fd.get("role")||"").trim(),roleGroup:fd.get("roleGroup")||"other",email:String(fd.get("email")||"").trim(),phone:String(fd.get("phone")||"").trim(),profile:String(fd.get("profile")||"").trim(),social:String(fd.get("social")||"").trim(),priority:fd.get("priority")||"backup",preferredChannel:fd.get("preferredChannel")||"",sourceUrl:String(fd.get("sourceUrl")||"").trim(),verified:fd.get("verified")||"no",reason:String(fd.get("reason")||"").trim()};
  if(editingSalesContactId){const p=salesContactById(editingSalesContactId);if(p)Object.assign(p,payload)}
  else salesContacts.unshift({id:"ct-"+uid(),source:"manual",...payload,createdAt:new Date().toISOString()});
  const company=salesCompanyById(payload.companyId);if(company&&["new","researched"].includes(company.status))company.status="contacts";if(company&&salesContactIsReady(payload)&&["contacts","researched","new"].includes(company.status))company.status="ready";
  editingSalesContactId=null;saveSales();document.getElementById("salesContactModal").close();renderSales();
});
document.getElementById("salesTouchForm")?.addEventListener("submit",e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);
  const payload={companyId:fd.get("companyId"),contactId:fd.get("contactId")||"",channel:fd.get("channel"),date:fd.get("date"),note:String(fd.get("note")||"").trim(),result:fd.get("result"),nextAction:String(fd.get("nextAction")||"").trim(),nextDate:fd.get("nextDate")||"",createdAt:new Date().toISOString()};
  salesTouches.unshift({id:"touch-"+uid(),...payload});
  const c=salesCompanyById(payload.companyId);
  if(c){const ns=nextStatusFromTouch(payload.result);if(ns)c.status=ns;if(payload.nextAction)c.nextAction=payload.nextAction;if(payload.nextDate)c.nextDate=payload.nextDate}
  saveSales();document.getElementById("salesTouchModal").close();renderSales();
});
document.getElementById("salesTouchCompanySelect")?.addEventListener("change",e=>refreshTouchContacts(e.target.value));

document.getElementById("salesAddCompanyBtn")?.addEventListener("click",()=>openSalesCompany());
document.getElementById("salesAddContactBtn")?.addEventListener("click",()=>openSalesContact());
document.getElementById("salesAddTouchBtn")?.addEventListener("click",()=>openSalesTouch());
document.querySelectorAll("[data-sales-close]").forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.salesClose)?.close()));
["salesCompanySearch","salesContactSearch"].forEach(id=>document.getElementById(id)?.addEventListener("input",renderSales));
["salesCompanyStatusFilter","salesCompanyPriorityFilter","salesContactRoleFilter"].forEach(id=>document.getElementById(id)?.addEventListener("change",renderSales));
document.getElementById("salesSubnav")?.querySelectorAll("[data-sales-view]").forEach(btn=>btn.addEventListener("click",()=>{
  document.getElementById("salesSubnav").querySelectorAll("[data-sales-view]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll("[data-sales-pane]").forEach(p=>p.classList.toggle("active",p.dataset.salesPane===btn.dataset.salesView));
}));
document.querySelectorAll("[data-open-sales-view]").forEach(btn=>btn.addEventListener("click",()=>{
  const target=btn.dataset.openSalesView,nav=document.querySelector('#salesSubnav [data-sales-view="'+target+'"]');nav?.click();
}));

function mergeSalesResearchRows(table){
  const rows=(table?.rows||[]).map((row,idx)=>{
    const v=i=>String(gvizCell(row,i)||"").trim();
    const name=v(1);if(!name)return null;
    const personRaw=v(2),phoneOrIg=v(3),emailOrTg=v(4),direction=v(5),position=v(6),owner=v(7),comment=v(8);
    const website=v(16),companySocial=v(17),contactProfile=v(18),roleSource=v(19),contactPriority=v(20),preferredChannel=v(21);
    const scores=[11,12,13,14].map(i=>Number(String(gvizCell(row,i)||"").replace(",", "."))||0);
    const total=Number(String(gvizCell(row,15)||"").replace(",", "."))||scores.reduce((a,b)=>a+b,0);
    return {row:idx+2,name,personRaw,phoneOrIg,emailOrTg,direction,position,owner,comment,website,companySocial,contactProfile,roleSource,contactPriority,preferredChannel,scores,total};
  }).filter(Boolean);
  let companiesAdded=0,contactsAdded=0;
  rows.forEach(r=>{
    const key=salesNorm(r.name);
    let company=salesCompanies.find(c=>salesNorm(c.name)===key);
    if(!company){
      company={id:"co-sheet-"+r.row,name:r.name,segment:r.direction||"",score:r.total||0,status:r.personRaw?"contacts":"researched",website:r.website||"",instagram:(/instagram\.com/i.test(r.companySocial)?r.companySocial:""),social:r.companySocial||"",signal:r.comment||"",offer:"",nextAction:"",nextDate:"",source:"sheet",sourceRow:r.row,createdAt:new Date().toISOString()};
      salesCompanies.push(company);companiesAdded++;
    }else if(company.source==="sheet"||!company.source){
      company.score=r.total||company.score||0;
      if(r.direction)company.segment=r.direction;
      if(r.comment)company.signal=r.comment;
      if(r.website)company.website=r.website;
      if(r.companySocial){company.social=r.companySocial;if(/instagram\.com/i.test(r.companySocial))company.instagram=r.companySocial;}
      company.source="sheet";company.sourceRow=r.row;
    }
    if(r.personRaw){
      const parsed=splitContactField(r.personRaw);
      const name=parsed.name;
      const role=r.position||parsed.role;
      if(name){
        const exists=salesContacts.some(p=>p.companyId===company.id&&salesNorm(p.name)===salesNorm(name));
        if(!exists){
          const socialUrl=extractFirstUrl(r.phoneOrIg+" "+r.emailOrTg);
          const email=(r.emailOrTg.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||"";
          const profile=r.contactProfile||extractFirstUrl(r.comment)||socialUrl;
          const priority=salesNorm(r.contactPriority).includes("основ")?"primary":salesNorm(r.contactPriority).includes("влият")||salesNorm(r.contactPriority).includes("influ")?"influencer":"backup";
          salesContacts.push({id:"ct-sheet-"+r.row+"-"+uid(),companyId:company.id,name,role,roleGroup:guessRoleGroup(role),email,phone:/^[+\d\s()-]{7,}$/.test(r.phoneOrIg)?r.phoneOrIg:"",profile,social:!email?r.emailOrTg:r.phoneOrIg,priority,preferredChannel:r.preferredChannel||(email?"Email":socialUrl?"Social":""),sourceUrl:r.roleSource||profile||"",verified:(r.roleSource||profile||email)?"yes":"no",reason:"Импортировано из research database. "+(r.comment?r.comment.slice(0,240):""),source:"sheet",createdAt:new Date().toISOString()});
          contactsAdded++;
        }
      }
    }
  });
  saveSales();renderSales();
  return {companiesAdded,contactsAdded,totalRows:rows.length};
}
function syncSalesResearch(){
  const state=document.getElementById("salesSyncState");if(state)state.textContent="Research database: синхронизация…";
  const btn=document.getElementById("salesSyncBtn");if(btn)btn.disabled=true;
  const callback="onvisualSalesSync_"+Date.now(),script=document.createElement("script");
  const done=()=>{if(btn)btn.disabled=false;delete window[callback];script.remove()};
  const timer=setTimeout(()=>{if(state)state.textContent="Research database: источник временно недоступен";done()},12000);
  window[callback]=(payload)=>{
    clearTimeout(timer);
    try{
      if(!payload?.table)throw new Error("Invalid payload");
      const result=mergeSalesResearchRows(payload.table);
      if(state)state.textContent="Research database: "+result.totalRows+" строк · +"+result.companiesAdded+" компаний · +"+result.contactsAdded+" контактов · "+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    }catch(err){console.warn("Sales sync error",err);if(state)state.textContent="Research database: не удалось прочитать данные"}
    finally{done()}
  };
  script.onerror=()=>{clearTimeout(timer);if(state)state.textContent="Research database: ошибка подключения";done()};
  script.src="https://docs.google.com/spreadsheets/d/"+SALES_SOURCE_SHEET_ID+"/gviz/tq?tqx=responseHandler:"+callback+"&sheet="+encodeURIComponent(SALES_SOURCE_SHEET)+"&headers=1&_="+Date.now();
  document.head.appendChild(script);
}
document.getElementById("salesSyncBtn")?.addEventListener("click",syncSalesResearch);
renderSales();
setTimeout(syncSalesResearch,800);
