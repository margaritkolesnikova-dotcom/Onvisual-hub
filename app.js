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
// Verified Google Sheet snapshot as of 09.10.2026; fallback when live source is unavailable.
// ==========================================
const productionItems=[
  {
    "id": "sheet-001",
    "num": "1",
    "title": "Башня из кубиков",
    "creator": "Алексей",
    "due": "2026-09-19",
    "folder": "https://disk.yandex.ru/d/dPKrhMgOeoOtnQ",
    "finalLink": "https://disk.yandex.ru/i/WboK8d03x7ii1A",
    "duration": "25",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-002",
    "num": "2",
    "title": "Воздушные шары",
    "creator": "Алексей",
    "due": "2026-09-21",
    "folder": "https://disk.yandex.ru/d/z_IWMSGtCtmqhw",
    "finalLink": "https://disk.yandex.ru/i/n_ahrIT1W_yQ7A",
    "duration": "26",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-003",
    "num": "3",
    "title": "Заплатка",
    "creator": "Алексей",
    "due": "2026-09-23",
    "folder": "https://disk.yandex.ru/d/XciiwhSgDL8pOA",
    "finalLink": "https://disk.yandex.ru/i/107v94tzWeaRYQ",
    "duration": "26",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-004",
    "num": "4",
    "title": "Качели",
    "creator": "Дмитрий",
    "due": "",
    "folder": "https://disk.yandex.ru/d/Zxge1EUp5SHTHw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-005",
    "num": "5",
    "title": "Прятки",
    "creator": "Дмитрий",
    "due": "2026-09-20",
    "folder": "https://disk.yandex.ru/d/tC1__WEOs7sG9A",
    "finalLink": "https://disk.yandex.ru/i/CE55xgxbZWnDOQ",
    "duration": "25",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-006",
    "num": "6",
    "title": "Солнечный зайчик",
    "creator": "Дмитрий",
    "due": "2026-09-22",
    "folder": "https://disk.yandex.ru/d/ylBOte-1d7lkHw",
    "finalLink": "https://disk.yandex.ru/i/HC0zv1mEBi7z7w",
    "duration": "19",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-007",
    "num": "7",
    "title": "Уборка",
    "creator": "Анна",
    "due": "2026-09-18",
    "folder": "https://disk.yandex.ru/d/ZcessXq7FqRumw",
    "finalLink": "https://disk.yandex.ru/i/mKXBdEhU1qEzug",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-008",
    "num": "8",
    "title": "Подарок",
    "creator": "Анна",
    "due": "2026-09-20",
    "folder": "https://disk.yandex.ru/d/BbLJGuwaq3IaSQ",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-009",
    "num": "9",
    "title": "Пружина",
    "creator": "Алексей",
    "due": "2026-09-25",
    "folder": "https://disk.yandex.ru/d/IoIyEH3ceJSbVQ",
    "finalLink": "https://disk.yandex.ru/i/lc2ARZ6TI3V9dQ",
    "duration": "24",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-010",
    "num": "10",
    "title": "Осенний лист",
    "creator": "Алексей",
    "due": "2026-09-27",
    "folder": "https://disk.yandex.ru/d/vugopTqxhyhTXQ",
    "finalLink": "https://disk.yandex.ru/i/qRr2r2_34IeY1A",
    "duration": "25",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-011",
    "num": "11",
    "title": "Карандаш",
    "creator": "Анна",
    "due": "2026-09-25",
    "folder": "https://disk.yandex.ru/d/9lO-ZnTXEYZ8hQ",
    "finalLink": "https://disk.yandex.ru/i/kc5d-3LhiTMtLw",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-012",
    "num": "12",
    "title": "Найди звезду",
    "creator": "Алексей",
    "due": "2026-09-29",
    "folder": "https://disk.yandex.ru/d/xthQfps4Wd80nw",
    "finalLink": "https://disk.yandex.ru/i/60g3L5DhJmSQxQ",
    "duration": "24",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-013",
    "num": "13",
    "title": "Осенняя математика",
    "creator": "Дмитрий",
    "due": "2026-09-25",
    "folder": "https://disk.yandex.ru/d/z9zI5ilXb4Y_BQ",
    "finalLink": "https://disk.yandex.ru/i/Mi_T8zelq3Z7Nw",
    "duration": "24",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-014",
    "num": "14",
    "title": "Осенний опечаток",
    "creator": "Дмитрий",
    "due": "2026-09-27",
    "folder": "https://disk.yandex.ru/d/pDiHfMGBfqtTlw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-015",
    "num": "15",
    "title": "Пенная ванна",
    "creator": "Анна",
    "due": "2026-09-29",
    "folder": "https://disk.yandex.ru/d/QV1Kr27uU25aNA",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-016",
    "num": "16",
    "title": "Крепость для двоих",
    "creator": "Анна",
    "due": "2026-10-01",
    "folder": "https://disk.yandex.ru/d/AqfyBNnpdnKneg",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-017",
    "num": "17",
    "title": "Калькулятор",
    "creator": "Анна",
    "due": "2026-10-03",
    "folder": "https://disk.yandex.ru/d/z6XJTQTT6dfSeQ",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-018",
    "num": "",
    "title": "Проработка персонажей",
    "creator": "Алексей",
    "due": "2026-09-28",
    "folder": "https://disk.yandex.ru/d/lPYDQselCV0eXA",
    "finalLink": "https://disk.yandex.ru/i/dvfT0tD8U5kJNQ",
    "duration": "",
    "stages": [
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-019",
    "num": "",
    "title": "Проработка локаций",
    "creator": "Иван",
    "due": "2026-10-07",
    "folder": "https://disk.yandex.ru/d/OUCaeCRE5XWa2g",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "На правках",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-020",
    "num": "18",
    "title": "Коробка кота",
    "creator": "Алексей",
    "due": "2026-10-01",
    "folder": "https://disk.yandex.ru/d/OyQNpy8E6r3POg",
    "finalLink": "https://disk.yandex.ru/i/Mha3v17sPEKRBw",
    "duration": "23",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-021",
    "num": "19",
    "title": "Чистим зубы",
    "creator": "Алексей",
    "due": "2026-10-03",
    "folder": "https://disk.yandex.ru/d/ZabPGH-2UsHZ1Q",
    "finalLink": "https://disk.yandex.ru/i/3QNgBWi-FZgYuA",
    "duration": "21",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-022",
    "num": "20",
    "title": "Домино",
    "creator": "Дмитрий",
    "due": "2026-10-01",
    "folder": "https://disk.yandex.ru/d/0nUYG0L3nxNE-A",
    "finalLink": "https://disk.yandex.ru/i/2e2_yBmqljwE6w",
    "duration": "21",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-023",
    "num": "21",
    "title": "Пузырчатая упаковка",
    "creator": "Дмитрий",
    "due": "2026-10-03",
    "folder": "https://disk.yandex.ru/d/6DnY1fZQlmq4Xg",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-024",
    "num": "22",
    "title": "Красная кнопка",
    "creator": "Ксения",
    "due": "2026-10-09",
    "folder": "https://disk.yandex.ru/d/QofUZAanAhmkSw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-025",
    "num": "23",
    "title": "Мыльные пузыри",
    "creator": "Анна",
    "due": "2026-10-07",
    "folder": "https://disk.yandex.ru/d/ktzb06JP3KhQVQ",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-026",
    "num": "24",
    "title": "Последний кусок",
    "creator": "Дмитрий",
    "due": "2026-10-07",
    "folder": "https://disk.yandex.ru/d/14xQYSl16A-vVQ",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-027",
    "num": "25",
    "title": "Зеркало",
    "creator": "Алексей",
    "due": "2026-10-07",
    "folder": "https://disk.yandex.ru/d/UkQjT4LMLHeq2w",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-028",
    "num": "26",
    "title": "Мороженое",
    "creator": "Дмитрий",
    "due": "2026-10-09",
    "folder": "https://disk.yandex.ru/d/Id-ei7Y24PmtFw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "Готово",
      "В работе",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-029",
    "num": "27",
    "title": "Пол-это лава",
    "creator": "Алексей",
    "due": "2026-10-09",
    "folder": "https://disk.yandex.ru/d/FllpLD-VfQeySw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-030",
    "num": "28",
    "title": "Торт",
    "creator": "Анна",
    "due": "2026-10-09",
    "folder": "https://disk.yandex.ru/d/S0HI0X0Nk_9zvg",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-031",
    "num": "29",
    "title": "Боулинг",
    "creator": "Дмитрий",
    "due": "2026-10-11",
    "folder": "https://disk.yandex.ru/d/FVWd8M1hLGFDiw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  },
  {
    "id": "sheet-032",
    "num": "30",
    "title": "Игра Замри",
    "creator": "Алексей",
    "due": "2026-10-11",
    "folder": "https://disk.yandex.ru/d/RYJUtjzKt-b3Iw",
    "finalLink": "",
    "duration": "",
    "stages": [
      "Готово",
      "Готово",
      "В работе",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не начато",
      "Не опубликовано"
    ]
  }
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
renderProductionExtraTasks();
renderProductionDeadlines();

// Live Monster Zip production sync from Google Sheets.
const PROD_SHEET_ID="1sj5Y5YBakIK51-sx0DzFD-zfItjBWwnpf8WKK-mK1Zw";
const PROD_SHEET_NAME="Zip монстр ";
const PROD_SYNC_MS=60000;
const PROD_SNAPSHOT_DATE="09.10.2026";

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
    setProductionSyncState("fallback","Снимок от "+PROD_SNAPSHOT_DATE+" · Live недоступен");
  },12000);

  window[callback]=(payload)=>{
    clearTimeout(timer);
    try{
      if(!payload||!payload.table)throw new Error("Invalid Google Sheets payload");
      applyLiveProductionTable(payload.table);
    }catch(error){
      console.warn("Monster Zip live sync unavailable",error);
      setProductionSyncState("fallback","Снимок от "+PROD_SNAPSHOT_DATE+" · Live недоступен");
    }finally{
      delete window[callback];
      script.remove();
    }
  };

  script.onerror=()=>{
    clearTimeout(timer);
    delete window[callback];
    script.remove();
    setProductionSyncState("fallback","Снимок от "+PROD_SNAPSHOT_DATE+" · Live недоступен");
  };

  script.src="https://docs.google.com/spreadsheets/d/"+PROD_SHEET_ID+
    "/gviz/tq?tqx=responseHandler:"+callback+
    "&sheet="+encodeURIComponent(PROD_SHEET_NAME)+
    "&headers=1&_="+Date.now();
  document.head.appendChild(script);
}

updateProductionKpisFromLive();
updateProductionStageCounts();
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
function salesContactIsReady(p){return Boolean(p&&p.name&&p.role&&p.sourceUrl&&(p.email||p.phone||p.profile||p.social)&&!salesNorm(p.priority).includes("неактуал"))}
function salesCompanyReadyContacts(id){return salesContactsForCompany(id).filter(salesContactIsReady)}
function salesCompanyCompleteness(c){let n=0;if(c.website)n++;if(c.instagram||c.social)n++;if(c.signal)n++;if((Number(c.score)||0)>=12)n++;if(salesCompanyReadyContacts(c.id).length)n++;return n}
function salesLink(url,label){if(!url)return "";const safe=escapeHtml(url);return '<a class="sales-company-link" href="'+safe+'" target="_blank" rel="noreferrer">'+label+' ↗</a>'}
function salesIsEmployeeProfileUrl(url){
  if(!url)return false;
  try{
    const h=new URL(url).hostname.replace(/^www\./,"").toLowerCase();
    return /(^|\.)(linkedin\.com|instagram\.com|vk\.com|t\.me|telegram\.me|setka\.ru|behance\.net|hh\.ru)$/.test(h);
  }catch{return false}
}
function salesIsNewsOrSourceUrl(url){
  if(!url)return false;
  try{
    const h=new URL(url).hostname.replace(/^www\./,"").toLowerCase();
    return /(adindex\.ru|sostav\.ru|eplus\.marketing|winners\.eplus\.marketing|retail-life\.ru|oborot\.ru|theblueprint\.ru|hse\.ru|medsi\.ru|nspk\.ru|companies\.rbc\.ru|rdt-info\.ru|rutube\.ru)/.test(h);
  }catch{return false}
}
function migrateSalesContactLinks(){
  let changed=false;
  salesContacts.forEach(p=>{
    if(p.profile && salesIsNewsOrSourceUrl(p.profile)){
      if(!p.sourceUrl)p.sourceUrl=p.profile;
      p.profile="";
      changed=true;
    }
    if(p.profile && !salesIsEmployeeProfileUrl(p.profile) && p.sourceUrl===p.profile){
      p.profile="";
      changed=true;
    }
  });
  if(changed)saveSales();
}

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
    if(q&&!salesNorm([p.name,p.role,c?.name,p.email,p.phone,p.social,p.profile].join(" ")).includes(q))return false;
    if(roleFilter!=="all"&&p.roleGroup!==roleFilter)return false;
    return true;
  }).sort((a,b)=>(salesCompanyById(a.companyId)?.name||"").localeCompare(salesCompanyById(b.companyId)?.name||"","ru"));
  host.innerHTML="";
  if(!rows.length){host.innerHTML='<div class="sales-empty">Конкретных контактов пока нет. Добавь их вручную или синхронизируй research database.</div>';return}
  rows.forEach(p=>{
    const c=salesCompanyById(p.companyId);
    const card=document.createElement("article");card.className="sales-contact-card";
    const initials=p.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
    const employeeLinks=[
      p.email?'<a class="employee-email" href="mailto:'+escapeHtml(p.email)+'">✉ '+escapeHtml(p.email)+'</a>':"",
      p.phone?'<a href="tel:'+escapeHtml(p.phone.replace(/\s+/g,""))+'">☎ '+escapeHtml(p.phone)+'</a>':"",
      (p.profile&&salesIsEmployeeProfileUrl(p.profile))?'<a href="'+escapeHtml(p.profile)+'" target="_blank" rel="noreferrer">Профиль сотрудника ↗</a>':"",
      (p.social&&/^https?:\/\//.test(p.social))?'<a href="'+escapeHtml(p.social)+'" target="_blank" rel="noreferrer">Соцсеть сотрудника ↗</a>':p.social?'<span class="sales-contact-handle">'+escapeHtml(p.social)+'</span>':""
    ].join("");
    const companyLinks=[
      c?.website?'<a href="'+escapeHtml(c.website)+'" target="_blank" rel="noreferrer">Сайт компании ↗</a>':"",
      c?.instagram?'<a href="'+escapeHtml(c.instagram)+'" target="_blank" rel="noreferrer">Instagram компании ↗</a>':"",
      (c?.social&&c.social!==c.instagram)?'<a href="'+escapeHtml(c.social)+'" target="_blank" rel="noreferrer">Соцсеть компании ↗</a>':""
    ].join("");
    card.innerHTML='<div class="sales-contact-top"><div class="sales-contact-avatar">'+escapeHtml(initials||"?")+'</div><button class="sales-icon-btn edit-contact">✎</button></div>'+
      '<h4>'+escapeHtml(p.name)+'</h4><div class="role">'+escapeHtml(p.role||"Должность не указана")+'</div><div class="company">'+escapeHtml(c?.name||"—")+'</div>'+
      '<div class="sales-contact-badges"><span class="'+(salesContactIsReady(p)?"contact-ready":"contact-missing")+'">'+(salesContactIsReady(p)?"Готов к связи":"Нужно дополнить")+'</span><span>'+escapeHtml(p.priority==="primary"?"Основной ЛПР":p.priority==="influencer"?"Influencer":p.priority==="inactive"?"Неактуален":"Резерв")+'</span>'+(p.preferredChannel?'<span>'+escapeHtml(p.preferredChannel)+'</span>':"")+'</div>'+
      '<div class="sales-contact-section"><small>КОНТАКТЫ СОТРУДНИКА</small><div class="sales-contact-links">'+(employeeLinks||'<span class="sales-contact-missing-copy">Прямой контакт пока не найден</span>')+'</div></div>'+
      '<div class="sales-contact-section company-section"><small>КОМПАНИЯ</small><div class="sales-contact-links">'+(companyLinks||'<span class="sales-contact-missing-copy">Сайт/соцсети компании нужно заполнить</span>')+'</div></div>'+
      (p.reason?'<p>'+escapeHtml(p.reason||"")+'</p>':"")+
      '<div class="sales-contact-footer">'+
      (p.sourceUrl?'<a class="sales-source-proof" href="'+escapeHtml(p.sourceUrl)+'" target="_blank" rel="noreferrer">Подтверждение должности ↗</a>':"")+
      '<button type="button" class="contact-touch">+ касание</button></div>';
    card.querySelector(".edit-contact").addEventListener("click",()=>openSalesContact(p.id));
    card.querySelector(".contact-touch").addEventListener("click",()=>openSalesTouch(p.companyId,p.id));
    host.appendChild(card);
  });
}
function renderSalesPipeline(){
  const host=document.getElementById("salesPipelineBoard");if(!host)return;
  host.innerHTML="";
  const dropStatus={lead:"new",contact:"ready",outreach:"contacted",reply:"reply",meeting:"meeting",proposal:"proposal",won:"won"};
  salesPipelineStages.forEach(stage=>{
    const companies=salesCompanies.filter(c=>salesStatusMeta[c.status]?.stage===stage.key);
    const col=document.createElement("div");col.className="sales-pipeline-column";col.dataset.stage=stage.key;
    col.innerHTML='<div class="sales-pipeline-column-head">'+stage.label+' <span>'+companies.length+'</span></div><div class="sales-pipeline-cards" data-stage="'+stage.key+'"></div>';
    const list=col.querySelector(".sales-pipeline-cards");
    list.addEventListener("dragover",e=>{e.preventDefault();col.classList.add("drag-over")});
    list.addEventListener("dragleave",e=>{if(!col.contains(e.relatedTarget))col.classList.remove("drag-over")});
    list.addEventListener("drop",e=>{
      e.preventDefault();col.classList.remove("drag-over");
      const companyId=e.dataTransfer.getData("text/onvisual-company")||e.dataTransfer.getData("text/plain");
      const company=salesCompanyById(companyId);if(!company)return;
      const newStatus=dropStatus[stage.key];if(!newStatus)return;
      company.status=newStatus;
      if(newStatus==="contacted"&&!company.nextAction)company.nextAction="Follow-up";
      saveSales();renderSales();
    });
    companies.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)).forEach(c=>{
      const card=document.createElement("article");card.className="sales-pipeline-card";card.draggable=true;card.dataset.companyId=c.id;
      const next=c.nextDate?(" · "+salesDateLabel(c.nextDate)):"";
      card.innerHTML='<div class="pipeline-drag-handle" title="Перетащить">⋮⋮</div><strong>'+escapeHtml(c.name)+'</strong><small>'+salesStatusLabel(c.status)+next+'</small><div class="pipeline-score">'+(c.score||"—")+'/20 · '+salesContactsForCompany(c.id).length+' контактов</div>';
      card.addEventListener("dragstart",e=>{card.classList.add("dragging");e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/onvisual-company",c.id);e.dataTransfer.setData("text/plain",c.id)});
      card.addEventListener("dragend",()=>{card.classList.remove("dragging");document.querySelectorAll(".sales-pipeline-column").forEach(x=>x.classList.remove("drag-over"))});
      card.addEventListener("click",e=>{if(card.classList.contains("dragging"))return;openSalesCompany(c.id)});
      list.appendChild(card);
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
          const profile=r.contactProfile||(socialUrl&&salesIsEmployeeProfileUrl(socialUrl)?socialUrl:"");
          const priority=salesNorm(r.contactPriority).includes("неактуал")?"inactive":salesNorm(r.contactPriority).includes("основ")?"primary":salesNorm(r.contactPriority).includes("влият")||salesNorm(r.contactPriority).includes("influ")?"influencer":"backup";
          salesContacts.push({id:"ct-sheet-"+r.row+"-"+uid(),companyId:company.id,name,role,roleGroup:guessRoleGroup(role),email,phone:/^[+\d\s()-]{7,}$/.test(r.phoneOrIg)?r.phoneOrIg:"",profile,social:!email?r.emailOrTg:r.phoneOrIg,priority,preferredChannel:r.preferredChannel||(email?"Email":socialUrl?"Social":""),sourceUrl:r.roleSource||extractFirstUrl(r.comment)||profile||"",verified:(r.roleSource||profile||email)?"yes":"no",reason:"Импортировано из research database. "+(r.comment?r.comment.slice(0,240):""),source:"sheet",createdAt:new Date().toISOString()});
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
migrateSalesContactLinks();
renderSales();
setTimeout(syncSalesResearch,800);


// ==========================================
// KNOWLEDGE BASE interactions
// ==========================================
const knowledgeSearch=document.getElementById('knowledgeSearch');
const knowledgeFilters=document.getElementById('knowledgeFilters');
const knowledgeItems=[...document.querySelectorAll('.knowledge-card,.knowledge-placeholder')];
let knowledgeCategory='all';

function renderKnowledge(){
  const q=(knowledgeSearch?.value||'').trim().toLowerCase();
  let visible=0;
  knowledgeItems.forEach(item=>{
    const category=item.dataset.knowledgeCategory||'';
    const hay=(item.dataset.knowledgeTitle||item.textContent||'').toLowerCase();
    const categoryOk=knowledgeCategory==='all'||category===knowledgeCategory;
    const searchOk=!q||hay.includes(q);
    const showItem=categoryOk&&searchOk;
    item.classList.toggle('is-hidden',!showItem);
    if(showItem&&!item.classList.contains('knowledge-placeholder'))visible++;
  });
  const count=document.getElementById('knowledgeCount');
  if(count)count.textContent=String(visible);
}

knowledgeSearch?.addEventListener('input',renderKnowledge);
knowledgeFilters?.querySelectorAll('[data-knowledge-filter]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    knowledgeCategory=btn.dataset.knowledgeFilter;
    knowledgeFilters.querySelectorAll('[data-knowledge-filter]').forEach(x=>x.classList.toggle('active',x===btn));
    renderKnowledge();
  });
});

document.querySelectorAll('[data-knowledge-open]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.dataset.knowledgeOpen==='chatgpt-guide'){
      document.getElementById('chatgptGuideModal')?.showModal();
    }
  });
});

document.querySelectorAll('.knowledge-modal [data-close]').forEach(btn=>{
  btn.addEventListener('click',()=>document.getElementById(btn.dataset.close)?.close());
});

document.querySelectorAll('.knowledge-modal').forEach(modal=>{
  modal.addEventListener('click',e=>{
    if(e.target===modal)modal.close();
  });
});


// ==========================================
// ROADMAP / SPRINT workspace
// ==========================================
const ROADMAP_STORE='onvisualRoadmapV1';
const roadmapRead=()=>{try{return JSON.parse(localStorage.getItem(ROADMAP_STORE)||'[]')}catch{return[]}};
const roadmapWrite=(data)=>localStorage.setItem(ROADMAP_STORE,JSON.stringify(data));

const roadmapSeed=[
  {
    id:'rm-studio-custdev-design',
    title:'Разработка КастДев для позиционирования',
    scope:'ONVISUAL',owner:'Николай',start:'2026-10-19',due:'2026-10-23',
    status:'progress',progress:0,dependency:'',note:'Октябрь: аналитика, смыслы и выбор вектора.',
    subtasks:[]
  },
  {
    id:'rm-studio-custdev-lpr',
    title:'Проведение КастДевов с ЛПР',
    scope:'ONVISUAL',owner:'Николай',start:'2026-10-19',due:'2026-10-23',
    status:'progress',progress:0,dependency:'Разработка КастДев для позиционирования',note:'Получить фактуру от лиц, принимающих решения.',
    subtasks:[]
  },
  {
    id:'rm-mv-custdev-groups',
    title:'Разработка КастДев-опросников для фокус-групп детей и родителей',
    scope:'Мультвселенная',owner:'Николай',start:'2026-10-19',due:'2026-10-23',
    status:'progress',progress:0,dependency:'',note:'Мультвселенная / Monster Zip. Николай отвечает за сам опрос, Маргарита — за систему реализации и обработку.',
    subtasks:[
      {title:'Подготовить опрос для фокус-групп детей и родителей',owner:'Николай',due:'2026-10-23',status:'progress',done:false,note:'Содержание и логика самого опроса.',resource:''},
      {title:'Собрать систему проведения, таблицу ответов и механику обработки',owner:'Колесникова Маргарита',due:'2026-10-23',status:'todo',done:false,note:'Техническая реализация: форма, таблица, сбор и обработка результатов.',resource:''}
    ]
  },
  {
    id:'rm-mv-audience-audit',
    title:'Аудит аудитории и источников показов',
    scope:'Мультвселенная',owner:'Николай',start:'2026-10-19',due:'2026-10-23',
    status:'progress',progress:0,dependency:'',note:'Понять текущую аудиторию и откуда приходят показы.',
    subtasks:[]
  },
  {
    id:'rm-studio-transcripts',
    title:'Расшифровка интервью',
    scope:'ONVISUAL',owner:'Николай',start:'2026-10-26',due:'2026-10-30',
    status:'planned',progress:0,dependency:'Проведение КастДевов с ЛПР',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-needs-map',
    title:'Карта потребностей клиентов',
    scope:'ONVISUAL',owner:'Николай',start:'2026-10-26',due:'2026-10-30',
    status:'planned',progress:0,dependency:'Расшифровка интервью',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-product-positioning',
    title:'Формулировка гипотезы продукта и гипотез позиционирования Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-10-26',due:'2026-10-30',
    status:'planned',progress:0,dependency:'Карта потребностей клиентов',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-brand-core',
    title:'Утверждение ядра бренд-платформы',
    scope:'Мультвселенная',owner:'Николай',start:'2026-10-26',due:'2026-10-30',
    status:'planned',progress:0,dependency:'Аудит аудитории и источников показов',note:'Monster Zip.',
    subtasks:[]
  },
  {
    id:'rm-mv-channels',
    title:'Выбор площадок для продвижения',
    scope:'Мультвселенная',owner:'Николай',start:'2026-10-26',due:'2026-10-30',
    status:'planned',progress:0,dependency:'Аудит аудитории и источников показов',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-brand-architecture-start',
    title:'Начало создания бренд-архитектуры Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-02',due:'2026-11-06',
    status:'planned',progress:0,dependency:'Формулировка гипотезы продукта и гипотез позиционирования Студии',note:'',
    subtasks:[
      {title:'Tone of voice',done:false},
      {title:'Ценности',done:false},
      {title:'УТП',done:false},
      {title:'Офферы',done:false}
    ]
  },
  {
    id:'rm-studio-product-matrix',
    title:'Формирование продуктовой матрицы',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-02',due:'2026-11-06',
    status:'planned',progress:0,dependency:'Гипотеза продукта и позиционирование',note:'Продукты с ценами.',
    subtasks:[]
  },
  {
    id:'rm-mv-zip-bible',
    title:'Создание «Библии Зипов»',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-02',due:'2026-11-06',
    status:'planned',progress:0,dependency:'Утверждение ядра бренд-платформы',note:'',
    subtasks:[
      {title:'Правила мира',done:false},
      {title:'Матрица персонажей',done:false},
      {title:'Story engine',done:false}
    ]
  },
  {
    id:'rm-mv-content-plan',
    title:'Разработка контент-плана для соцсетей совместно с SMM',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-02',due:'2026-11-06',
    status:'planned',progress:0,dependency:'Выбор площадок для продвижения',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-brand-architecture-final',
    title:'Финал бренд-архитектуры Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-09',due:'2026-11-13',
    status:'planned',progress:0,dependency:'Начало создания бренд-архитектуры Студии',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-site-structure',
    title:'Написание структуры сайта Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-09',due:'2026-11-13',
    status:'planned',progress:0,dependency:'Финал бренд-архитектуры Студии',note:'ТЗ на дизайн / верстку.',
    subtasks:[]
  },
  {
    id:'rm-studio-presentation-script',
    title:'Написание сценария для презентации компании',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-09',due:'2026-11-13',
    status:'planned',progress:0,dependency:'Финал бренд-архитектуры Студии',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-site-structure',
    title:'Написание структуры сайта Зипов',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-09',due:'2026-11-13',
    status:'planned',progress:0,dependency:'Создание «Библии Зипов»',note:'ТЗ на дизайн.',
    subtasks:[]
  },
  {
    id:'rm-mv-horizontal-plan',
    title:'План первых 5–7 горизонтальных серий',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-09',due:'2026-11-13',
    status:'planned',progress:0,dependency:'Создание «Библии Зипов»',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-cases-pack',
    title:'Упаковка кейсов Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-16',due:'2026-11-20',
    status:'planned',progress:0,dependency:'Финал бренд-архитектуры Студии',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-cp-outreach',
    title:'Создание единого шаблона КП и пакета холодных писем',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-16',due:'2026-11-20',
    status:'planned',progress:0,dependency:'Упаковка кейсов Студии',note:'',
    subtasks:[
      {title:'Единый шаблон КП',done:false},
      {title:'Пакет холодных писем',done:false}
    ]
  },
  {
    id:'rm-mv-merch-concepts',
    title:'Генерация 10 товарных концепций',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-16',due:'2026-11-20',
    status:'planned',progress:0,dependency:'Создание «Библии Зипов»',note:'Мерч Зипов и креативные описания.',
    subtasks:[]
  },
  {
    id:'rm-studio-smm-strategy',
    title:'Разработка стратегии SMM Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-23',due:'2026-11-27',
    status:'planned',progress:0,dependency:'Финал бренд-архитектуры Студии',note:'',
    subtasks:[
      {title:'Рубрики',done:false},
      {title:'Правила',done:false}
    ]
  },
  {
    id:'rm-studio-audience-offers',
    title:'Разработка предложений под нужные ЦА',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-23',due:'2026-11-27',
    status:'planned',progress:0,dependency:'Формирование продуктовой матрицы',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-commercial-pack',
    title:'Написание коммерческого пакета Зипов',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-23',due:'2026-11-27',
    status:'planned',progress:0,dependency:'Создание «Библии Зипов»',note:'Презентация Зипов для инвесторов / партнёров / кинотеатров.',
    subtasks:[
      {title:'Версия для инвесторов',done:false},
      {title:'Версия для партнёров',done:false},
      {title:'Версия для кинотеатров',done:false}
    ]
  },
  {
    id:'rm-studio-packaging-acceptance',
    title:'Приёмка упаковки Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-11-30',due:'2026-12-04',
    status:'planned',progress:0,dependency:'Сайт, материалы и SMM-упаковка готовы',note:'Проверить сайт, PDF и соцсети на соответствие бренду.',
    subtasks:[
      {title:'Проверить сайт',done:false},
      {title:'Проверить PDF',done:false},
      {title:'Проверить соцсети',done:false}
    ]
  },
  {
    id:'rm-mv-site-acceptance',
    title:'Приёмка сайта Зипов',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-30',due:'2026-12-04',
    status:'planned',progress:0,dependency:'Структура сайта Зипов и дизайн реализованы',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-commercial-handoff',
    title:'Передача коммерческого пакета Диме и Рите для партнёрств',
    scope:'Мультвселенная',owner:'Николай',start:'2026-11-30',due:'2026-12-04',
    status:'planned',progress:0,dependency:'Написание коммерческого пакета Зипов',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-sales-refusals',
    title:'Разбор отказов от продаж',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-07',due:'2026-12-11',
    status:'planned',progress:0,dependency:'Запущены продажи и накоплена обратная связь',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-product-corrections',
    title:'Внесение правок в продукт, цены и кейсы',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-07',due:'2026-12-11',
    status:'planned',progress:0,dependency:'Разбор отказов от продаж',note:'',
    subtasks:[
      {title:'Правки продукта',done:false},
      {title:'Правки цен',done:false},
      {title:'Правки кейсов',done:false}
    ]
  },
  {
    id:'rm-mv-preorders-analysis',
    title:'Анализ первых предзаказов мерча',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-07',due:'2026-12-11',
    status:'planned',progress:0,dependency:'Запущены товарные концепции / предзаказы',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-production-concepts',
    title:'Разработка креативных концепций для производства',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-07',due:'2026-12-11',
    status:'planned',progress:0,dependency:'Анализ первых предзаказов мерча',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-offer-correction',
    title:'Корректировка офферов, если каналы не дают отклик',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-14',due:'2026-12-18',
    status:'planned',progress:0,dependency:'Результаты продаж и каналов',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-roadmap-2027',
    title:'Road-map развития Зипов на 2027 год',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-14',due:'2026-12-18',
    status:'planned',progress:0,dependency:'Результаты квартала',note:'',
    subtasks:[
      {title:'Новые серии',done:false},
      {title:'Мерч',done:false},
      {title:'Партнёрства',done:false}
    ]
  },
  {
    id:'rm-studio-brand-audit',
    title:'Аудит бренда Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-21',due:'2026-12-25',
    status:'planned',progress:0,dependency:'Упаковка и материалы внедрены',note:'Проверить консистентность всех материалов.',
    subtasks:[]
  },
  {
    id:'rm-mv-quarter-presentation',
    title:'Итоговая презентация по Зипам',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-21',due:'2026-12-25',
    status:'planned',progress:0,dependency:'Собраны результаты квартала',note:'Результаты за квартал.',
    subtasks:[]
  },
  {
    id:'rm-studio-final-report',
    title:'Итоговый отчёт по бренд-архитектуре Студии',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-28',due:'2026-12-30',
    status:'planned',progress:0,dependency:'Аудит бренда Студии',note:'',
    subtasks:[]
  },
  {
    id:'rm-studio-january-plan',
    title:'План Студии на январь',
    scope:'ONVISUAL',owner:'Николай',start:'2026-12-28',due:'2026-12-30',
    status:'planned',progress:0,dependency:'Итоговый отчёт по бренд-архитектуре Студии',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-final-report',
    title:'Итоговый отчёт по Зипам',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-28',due:'2026-12-30',
    status:'planned',progress:0,dependency:'Итоговая презентация по Зипам',note:'',
    subtasks:[]
  },
  {
    id:'rm-mv-plan-2027',
    title:'План по Зипам на 2027 год',
    scope:'Мультвселенная',owner:'Николай',start:'2026-12-28',due:'2026-12-30',
    status:'planned',progress:0,dependency:'Итоговый отчёт по Зипам',note:'',
    subtasks:[]
  }
];

let roadmapItems=roadmapRead();
if(!Array.isArray(roadmapItems))roadmapItems=[];
const roadmapExistingIds=new Set(roadmapItems.map(x=>x.id));
roadmapSeed.forEach(seed=>{
  if(!roadmapExistingIds.has(seed.id))roadmapItems.push(seed);
});

// Migration: all seeded global ROADMAP tasks are owned by Nikolai.
// User-created custom processes keep the owner explicitly chosen by the user.
const roadmapSeedIds=new Set(roadmapSeed.map(x=>x.id));
roadmapItems.forEach(item=>{
  if(roadmapSeedIds.has(item.id))item.owner='Николай';
});

// Migration: assign the real owners for the Multiverse focus-group custdev task,
// even for users who already have an older copy saved in localStorage.
const custdevGroupTask=roadmapItems.find(x=>x.id==='rm-mv-custdev-groups');
if(custdevGroupTask){
  custdevGroupTask.owner='Николай';
  custdevGroupTask.note='Мультвселенная / Monster Zip. Николай отвечает за сам опрос, Маргарита — за систему реализации и обработку.';
  const wanted=[
    {title:'Подготовить опрос для фокус-групп детей и родителей',owner:'Николай',due:'2026-10-23',status:'progress',done:false,note:'Содержание и логика самого опроса.',resource:''},
    {title:'Собрать систему проведения, таблицу ответов и механику обработки',owner:'Колесникова Маргарита',due:'2026-10-23',status:'todo',done:false,note:'Техническая реализация: форма, таблица, сбор и обработка результатов.',resource:''}
  ];
  custdevGroupTask.subtasks=custdevGroupTask.subtasks||[];
  wanted.forEach(w=>{
    const existing=custdevGroupTask.subtasks.find(s=>String(s.title||'').trim()===w.title);
    if(existing)Object.assign(existing,{owner:w.owner,due:existing.due||w.due,note:existing.note||w.note,resource:existing.resource||''});
    else custdevGroupTask.subtasks.push(w);
  });
}
roadmapItems.forEach(item=>{
  if(item.owner==='Маргарита Колесникова')item.owner='Колесникова Маргарита';
  (item.subtasks||[]).forEach(sub=>{
    if(sub.owner==='Маргарита Колесникова')sub.owner='Колесникова Маргарита';
  });
});
roadmapWrite(roadmapItems);

let roadmapView='timeline';
let roadmapProject='ONVISUAL';
let editingRoadmapId=null;
let roadmapSubtaskParentId=null;
let editingRoadmapSubtaskIndex=null;

const roadmapModal=document.getElementById('roadmapModal');
const roadmapForm=document.getElementById('roadmapForm');
const addRoadmapBtn=document.getElementById('addRoadmapBtn');
const deleteRoadmapBtn=document.getElementById('deleteRoadmapBtn');

const rmStatusLabel={planned:'План',progress:'В работе',risk:'Риск',blocked:'Риск',done:'Закрыто',rolled:'Перенос'};

function rmToday(){
  const d=new Date();
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function rmDateLabel(v){
  if(!v)return '—';
  const [y,m,d]=v.split('-');
  return d+'.'+m+'.'+y.slice(2);
}
function rmDays(a,b){
  if(!a||!b)return null;
  return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
}
function rmHealth(item){
  if(item.status==='done')return 'done';
  if(item.status==='rolled')return 'rolled';
  if(item.status==='risk')return 'risk';
  if(item.status==='blocked')return 'risk';
  const today=rmToday();
  if(item.due && item.due<today)return 'overdue';
  const left=rmDays(today,item.due);
  if(left!==null && left<=3 && Number(item.progress||0)<70)return 'risk';
  return 'ontrack';
}
function rmHealthLabel(item){
  const h=rmHealth(item);
  return {done:'Закрыто',rolled:'Перенесено',blocked:'Заблокировано',overdue:'Просрочено',risk:'Риск',ontrack:'Успеваем'}[h];
}
function rmFilteredItems(){
  const owner=document.getElementById('roadmapOwnerFilter')?.value||'all';
  const showDone=document.getElementById('roadmapShowDone')?.checked??true;
  return roadmapItems.filter(item=>{
    if(item.scope!==roadmapProject)return false;
    if(owner!=='all'&&item.owner!==owner)return false;
    if(!showDone&&item.status==='done')return false;
    return true;
  });
}
function rmRefreshOwners(){
  const select=document.getElementById('roadmapOwnerFilter');
  if(!select)return;
  const current=select.value||'all';
  const owners=[...new Set(roadmapItems.filter(x=>x.scope===roadmapProject).map(x=>x.owner).filter(Boolean))].sort();
  select.innerHTML='<option value="all">Все ответственные</option>'+owners.map(o=>'<option value="'+escapeHtml(o)+'">'+escapeHtml(o)+'</option>').join('');
  if([...select.options].some(o=>o.value===current))select.value=current;
  else select.value='all';
}
function rmSummary(){
  const projectItems=roadmapItems.filter(x=>x.scope===roadmapProject);
  const active=projectItems.filter(x=>x.status!=='done');
  const risk=active.filter(x=>['risk','overdue','blocked'].includes(rmHealth(x)));
  const done=projectItems.filter(x=>x.status==='done');
  document.getElementById('roadmapActiveCount')?.replaceChildren(document.createTextNode(String(active.length)));
  document.getElementById('roadmapRiskCount')?.replaceChildren(document.createTextNode(String(risk.length)));
  document.getElementById('roadmapDoneCount')?.replaceChildren(document.createTextNode(String(done.length)));
  const next=active.filter(x=>x.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
  const focus=document.getElementById('roadmapFocusText');
  if(focus)focus.textContent=next?rmDateLabel(next.due):'—';
}
function rmSubtaskHtml(item){
  const subs=item.subtasks||[];
  if(!subs.length){
    return '<div class="rm-subtask-empty"><span>Подзадач пока нет</span><button type="button" class="rm-add-subtask" data-rm-add-subtask="'+item.id+'">＋ Добавить подзадачу</button></div>';
  }
  const done=subs.filter(x=>x.done||x.status==='done').length;
  return '<div class="rm-subtask-summary"><div><b>'+done+'/'+subs.length+'</b><span>подзадач закрыто</span></div><button type="button" class="rm-add-subtask" data-rm-add-subtask="'+item.id+'">＋ Добавить подзадачу</button></div>'+
    '<div class="rm-subtask-lines">'+subs.map((s,i)=>{
      const isDone=s.done||s.status==='done';
      const statusClass=isDone?'done':s.status==='risk'?'risk':s.status==='progress'?'progress':'todo';
      const statusLabel=isDone?'Готово':s.status==='risk'?'Риск':s.status==='progress'?'В работе':'План';
      return '<div class="rm-subtask-line '+statusClass+'">'+
        '<button type="button" class="rm-subtask-main-btn" data-rm-subtask="'+item.id+'" data-sub-index="'+i+'">'+
          '<span class="rm-subtask-title">'+escapeHtml(s.title||'Без названия')+'</span>'+
          '<span class="rm-subtask-owner">'+escapeHtml(s.owner||'Не назначен')+'</span>'+
          '<span class="rm-subtask-date">'+rmDateLabel(s.due)+'</span>'+
          '<span class="rm-subtask-status">'+statusLabel+'</span>'+
        '</button>'+
        (s.resource?'<a class="rm-subtask-resource" href="'+escapeHtml(s.resource)+'" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">↗ Файл</a>':'')+
        '<button type="button" class="rm-subtask-edit" data-rm-subtask="'+item.id+'" data-sub-index="'+i+'">✎</button>'+
      '</div>';
    }).join('')+'</div>';
}
function rmTimelineRow(item){
  const h=rmHealth(item);
  const left=item.due?rmDays(rmToday(),item.due):null;
  let timing='';
  if(item.status==='done')timing='Завершено';
  else if(left!==null&&left<0)timing='Просрочено на '+Math.abs(left)+' дн.';
  else if(left===0)timing='Дедлайн сегодня';
  else if(left===1)timing='Дедлайн завтра';
  else if(left!==null)timing='До дедлайна '+left+' дн.';

  return '<article class="roadmap-row health-'+h+'" data-rm-edit="'+item.id+'">'+
    '<div class="rm-main">'+
      '<div class="rm-scope '+(item.scope==='ONVISUAL'?'studio':item.scope==='Мультвселенная'?'mv':'shared')+'">'+escapeHtml(item.scope)+'</div>'+
      '<h3>'+escapeHtml(item.title)+'</h3>'+
      (item.dependency?'<div class="rm-dependency">↳ зависит от: <b>'+escapeHtml(item.dependency)+'</b></div>':'')+
      rmSubtaskHtml(item)+
    '</div>'+
    '<div class="rm-owner"><span>RESPONSIBLE</span><b>'+escapeHtml(item.owner||'Не назначен')+'</b></div>'+
    '<div class="rm-period"><span>'+rmDateLabel(item.start)+'</span><i>→</i><b>'+rmDateLabel(item.due)+'</b><small>'+escapeHtml(timing)+'</small></div>'+
    '<div class="rm-progress"><div><i style="width:'+Math.max(0,Math.min(100,Number(item.progress||0)))+'%"></i></div><b>'+Number(item.progress||0)+'%</b></div>'+
    '<div class="rm-health"><span class="rm-health-badge '+h+'">'+rmHealthLabel(item)+'</span><small>'+rmStatusLabel[item.status]+'</small><button type="button" class="rm-inline-edit" data-rm-edit="'+item.id+'">✎ Редактировать</button></div>'+
  '</article>';
}
function renderRoadmapTimeline(){
  const host=document.getElementById('roadmapTimeline');
  if(!host)return;
  const items=rmFilteredItems().sort((a,b)=>{
    if(a.status==='done'&&b.status!=='done')return 1;
    if(b.status==='done'&&a.status!=='done')return -1;
    return (a.due||'9999').localeCompare(b.due||'9999');
  });
  host.innerHTML=items.length?items.map(rmTimelineRow).join(''):'<div class="roadmap-empty">Нет процессов по выбранному фильтру. Добавь первый большой процесс.</div>';
}
function rmSprintCard(item){
  const resource=item.resource?'<a class="rm-resource-link" href="'+escapeHtml(item.resource)+'" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">Файл / ссылка ↗</a>':'';
  const note=item.note?'<div class="rm-card-note">'+escapeHtml(item.note)+'</div>':'';
  return '<article class="rm-sprint-card health-'+rmHealth(item)+'" draggable="true" data-rm-drag="'+item.id+'" data-rm-edit="'+item.id+'">'+
    '<div class="rm-sprint-drag" title="Перетащить в другую колонку">⋮⋮</div>'+
    '<div class="rm-sprint-top"><span>'+escapeHtml(item.scope)+'</span><b>'+rmDateLabel(item.due)+'</b></div>'+
    '<h4>'+escapeHtml(item.title)+'</h4>'+
    '<p>'+escapeHtml(item.owner||'Не назначен')+'</p>'+
    note+
    resource+
    '<div class="rm-mini-progress"><i style="width:'+Number(item.progress||0)+'%"></i></div>'+
    '<div class="rm-sprint-footer"><small>'+Number(item.progress||0)+'% · '+rmHealthLabel(item)+'</small><button type="button" class="rm-inline-edit" data-rm-edit="'+item.id+'">✎ Редактировать</button></div>'+
  '</article>';
}
function renderRoadmapSprint(){
  const items=rmFilteredItems();
  const next=items.filter(x=>x.status==='planned');
  const work=items.filter(x=>x.status==='progress'&&!['risk','overdue'].includes(rmHealth(x)));
  const blocked=items.filter(x=>x.status==='blocked'||['risk','overdue'].includes(rmHealth(x)));
  const done=items.filter(x=>x.status==='done');
  const sets=[
    ['rmNextList','rmNextCount',next],['rmWorkList','rmWorkCount',work],
    ['rmBlockedList','rmBlockedCount',blocked],['rmClosedList','rmClosedCount',done]
  ];
  sets.forEach(([listId,countId,data])=>{
    const host=document.getElementById(listId),count=document.getElementById(countId);
    if(count)count.textContent=String(data.length);
    if(host)host.innerHTML=data.length?data.map(rmSprintCard).join(''):'<div class="rm-column-empty">Пусто</div>';
  });
}
function renderRoadmapTeam(){
  const host=document.getElementById('roadmapTeamGrid');
  if(!host)return;
  const grouped={};
  roadmapItems.filter(x=>x.scope===roadmapProject && x.status!=='done').forEach(item=>{
    const owner=item.owner||'Не назначен';
    (grouped[owner]||(grouped[owner]=[])).push(item);
  });
  const entries=Object.entries(grouped).sort((a,b)=>b[1].length-a[1].length);
  host.innerHTML=entries.length?entries.map(([owner,items])=>{
    const risks=items.filter(x=>['risk','overdue','blocked'].includes(rmHealth(x))).length;
    const load=Math.min(100,items.length*25);
    return '<article class="rm-team-card">'+
      '<div class="rm-team-head"><div><small>ОТВЕТСТВЕННЫЙ</small><h3>'+escapeHtml(owner)+'</h3></div><b>'+items.length+' активн.</b></div>'+
      '<div class="rm-team-load"><span>Загрузка по активным процессам</span><div><i style="width:'+load+'%"></i></div><b>'+load+'%</b></div>'+
      (risks?'<div class="rm-team-risk">⚠ Требуют внимания: '+risks+'</div>':'<div class="rm-team-ok">✓ Критичных блокеров нет</div>')+
      '<div class="rm-team-items">'+items.slice(0,5).map(x=>'<button type="button" data-rm-edit="'+x.id+'"><span>'+escapeHtml(x.title)+'</span><b>'+rmDateLabel(x.due)+'</b></button>').join('')+'</div>'+
    '</article>';
  }).join(''):'<div class="roadmap-empty">Активных процессов пока нет.</div>';
}
function renderRoadmap(){
  rmRefreshOwners();
  rmSummary();
  renderRoadmapTimeline();
  renderRoadmapSprint();
  renderRoadmapTeam();
}
function rmSetSelectValue(control,value){
  if(!control)return;
  const v=String(value||'');
  if(control.tagName==='SELECT'){
    if(v && ![...control.options].some(o=>o.value===v)){
      const opt=document.createElement('option');
      opt.value=v; opt.textContent=v; control.appendChild(opt);
    }
    control.value=v;
    return;
  }
  control.value=v;
}
function rmRenderModalSubtasks(item){
  const host=document.getElementById('roadmapModalSubtaskList');
  const addBtn=document.getElementById('addRoadmapSubtaskFromMain');
  if(!host)return;
  const subs=item?.subtasks||[];
  if(addBtn){
    addBtn.disabled=!item;
    addBtn.dataset.parentId=item?.id||'';
  }
  if(!item){
    host.innerHTML='<div class="rm-modal-subtask-empty">Сначала сохрани основную задачу, затем добавляй отдельные подзадачи.</div>';
    return;
  }
  host.innerHTML=subs.length?subs.map((s,i)=>{
    const status=s.done||s.status==='done'?'Готово':s.status==='progress'?'В работе':s.status==='risk'?'Риск':'План';
    const cls=s.done||s.status==='done'?'done':s.status==='risk'?'risk':s.status==='progress'?'progress':'todo';
    return '<div class="rm-modal-subtask-row '+cls+'">'+
      '<button type="button" class="rm-modal-subtask-open" data-rm-subtask="'+item.id+'" data-sub-index="'+i+'">'+
        '<span class="rm-modal-subtask-main"><b>'+escapeHtml(s.title||'Без названия')+'</b>'+
        (s.note?'<small>'+escapeHtml(s.note)+'</small>':'')+'</span>'+
        '<span class="rm-modal-subtask-owner">'+escapeHtml(s.owner||'Не назначен')+'</span>'+
        '<span class="rm-modal-subtask-date">'+rmDateLabel(s.due)+'</span>'+
        '<em>'+status+'</em>'+
      '</button>'+
      (s.resource?'<a class="rm-modal-subtask-resource" href="'+escapeHtml(s.resource)+'" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">↗</a>':'')+
      '<button type="button" class="rm-modal-subtask-edit" data-rm-subtask="'+item.id+'" data-sub-index="'+i+'">✎ Редактировать</button>'+
    '</div>';
  }).join(''):'<div class="rm-modal-subtask-empty">Подзадач пока нет.</div>';
}
function openRoadmapModal(id=null){
  editingRoadmapId=id;
  const item=id?roadmapItems.find(x=>x.id===id):null;
  const form=roadmapForm;
  if(!form||!roadmapModal)return;
  form.reset();
  document.getElementById('roadmapModalTitle').textContent=item?'Редактировать процесс':'Добавить процесс';
  deleteRoadmapBtn.style.display=item?'inline-flex':'none';
  if(item){
    form.title.value=item.title||'';
    form.scope.value=item.scope||'ONVISUAL';
    rmPopulateGoalSelect(form.scope.value,item.goalId||rmInferGoalId(item));
    rmSetSelectValue(form.owner,item.owner||'Николай');
    form.start.value=item.start||'';
    form.due.value=item.due||'';
    form.status.value=item.status||'planned';
    form.progress.value=Number(item.progress||0);
    rmRenderModalSubtasks(item);
    form.dependency.value=item.dependency||'';
    form.note.value=item.note||'';
    if(form.elements.resource)form.elements.resource.value=item.resource||'';
  }else{
    form.scope.value=roadmapProject;
    if(form.owner)rmSetSelectValue(form.owner,'Николай');
    rmPopulateGoalSelect(form.scope.value,'');
    const defaultWeek=(typeof rmSelectedWeekStart!=='undefined'&&rmSelectedWeekStart)?rmSelectedWeekStart:rmMonday(rmToday());
    form.start.value=defaultWeek;
    form.progress.value=0;
    rmRenderModalSubtasks(null);
  }
  if(!roadmapModal.open)roadmapModal.showModal();
}
function parseRoadmapSubtasks(text,existing=[]){
  const byTitle=new Map((existing||[]).map(x=>[String(x.title||'').trim(),x]));
  return String(text||'').split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
    const done=/^\[x\]\s*/i.test(line);
    const title=line.replace(/^\[(x| )\]\s*/i,'');
    const prev=byTitle.get(title)||{};
    return {...prev,title,done,status:done?'done':(prev.status||'todo')};
  });
}
roadmapForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(roadmapForm);
  const data={
    title:String(fd.get('title')||'').trim(),
    scope:String(fd.get('scope')||'ONVISUAL'),
    goalId:String(fd.get('goalId')||''),
    owner:String(fd.get('owner')||'Николай').trim()||'Николай',
    start:String(fd.get('start')||''),
    due:String(fd.get('due')||''),
    status:String(fd.get('status')||'planned'),
    progress:Number(fd.get('progress')||0),
    subtasks:editingRoadmapId?(roadmapItems.find(x=>x.id===editingRoadmapId)?.subtasks||[]):[],
    dependency:String(fd.get('dependency')||'').trim(),
    note:String(fd.get('note')||'').trim(),
    resource:String(fd.get('resource')||'').trim()
  };
  if(data.status==='done')data.progress=100;
  if(editingRoadmapId){
    const i=roadmapItems.findIndex(x=>x.id===editingRoadmapId);
    if(i>=0)roadmapItems[i]={...roadmapItems[i],...data};
  }else{
    roadmapItems.push({id:'rm-'+uid(),...data});
  }
  roadmapWrite(roadmapItems);
  roadmapModal.close();
  renderRoadmap();
});
addRoadmapBtn?.addEventListener('click',()=>openRoadmapModal());
deleteRoadmapBtn?.addEventListener('click',()=>{
  if(!editingRoadmapId)return;
  if(!confirm('Удалить этот процесс из дорожной карты?'))return;
  roadmapItems=roadmapItems.filter(x=>x.id!==editingRoadmapId);
  roadmapWrite(roadmapItems);
  roadmapModal.close();
  renderRoadmap();
});
document.getElementById('roadmapOwnerFilter')?.addEventListener('change',renderRoadmap);
document.getElementById('roadmapShowDone')?.addEventListener('change',renderRoadmap);

document.getElementById('roadmapProjectSwitch')?.querySelectorAll('[data-roadmap-project]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    roadmapProject=btn.dataset.roadmapProject;
    document.getElementById('roadmapProjectSwitch').querySelectorAll('[data-roadmap-project]').forEach(x=>x.classList.toggle('active',x===btn));
    const ownerSelect=document.getElementById('roadmapOwnerFilter');
    if(ownerSelect)ownerSelect.value='all';
    renderRoadmap();
  });
});

document.getElementById('roadmapViewSwitch')?.querySelectorAll('[data-roadmap-view]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    roadmapView=btn.dataset.roadmapView;
    document.querySelectorAll('[data-roadmap-view]').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('.roadmap-view').forEach(x=>x.classList.remove('active'));
    document.getElementById('roadmap'+roadmapView.charAt(0).toUpperCase()+roadmapView.slice(1)+'View')?.classList.add('active');
  });
});
const roadmapSubtaskModal=document.getElementById('roadmapSubtaskModal');
const roadmapSubtaskForm=document.getElementById('roadmapSubtaskForm');

function openRoadmapSubtaskModal(parentId,index=null){
  roadmapSubtaskParentId=parentId;
  editingRoadmapSubtaskIndex=Number.isInteger(index)?index:null;
  const parent=roadmapItems.find(x=>x.id===parentId);
  const sub=editingRoadmapSubtaskIndex!==null?parent?.subtasks?.[editingRoadmapSubtaskIndex]:null;
  if(!parent||!roadmapSubtaskForm||!roadmapSubtaskModal)return;

  // Only one modal may own interaction at a time.
  if(roadmapModal?.open){
    rmReturnToParentAfterSubtask=true;
    roadmapModal.close();
  }

  roadmapSubtaskForm.reset();

  // Defensive unlock: old UI iterations could leave controls disabled.
  roadmapSubtaskForm.querySelectorAll('input,select,textarea,button').forEach(el=>{
    el.disabled=false;
    el.removeAttribute('aria-disabled');
  });

  const title=document.getElementById('roadmapSubtaskModalTitle');
  const deleteBtn=document.getElementById('deleteRoadmapSubtaskBtn');
  const saveBtn=document.getElementById('saveRoadmapSubtaskBtn');

  if(title)title.textContent=sub?'Редактировать подзадачу':'Добавить подзадачу';
  if(deleteBtn){
    deleteBtn.style.display=sub?'inline-flex':'none';
    deleteBtn.disabled=!sub;
  }
  if(saveBtn)saveBtn.textContent=sub?'Сохранить изменения':'Добавить подзадачу';

  roadmapSubtaskForm.title.value=sub?.title||'';
  const ownerInput=roadmapSubtaskForm.elements.owner;
  if(ownerInput)rmSetSelectValue(ownerInput,sub?.owner||'');
  roadmapSubtaskForm.due.value=sub?.due||'';
  roadmapSubtaskForm.status.value=sub?.status||(sub?.done?'done':'todo');
  if(roadmapSubtaskForm.elements.note)roadmapSubtaskForm.elements.note.value=sub?.note||'';
  if(roadmapSubtaskForm.elements.resource)roadmapSubtaskForm.elements.resource.value=sub?.resource||'';

  roadmapSubtaskModal.dataset.scope=parent.scope||'';
  roadmapSubtaskModal.dataset.parentId=parent.id;
  if(!roadmapSubtaskModal.open)roadmapSubtaskModal.showModal();

  // Focus the task title instead of leaving focus trapped on the previous dialog.
  requestAnimationFrame(()=>roadmapSubtaskForm.elements.title?.focus());
}

function rmRecalculateParentFromSubtasks(parent){
  const subs=parent.subtasks||[];
  const done=subs.filter(x=>x.done||x.status==='done').length;
  if(subs.length)parent.progress=Math.round(done/subs.length*100);
  if(subs.length&&done===subs.length){
    parent.status='done';
    parent.progress=100;
  }else if(parent.status==='done'){
    parent.status='progress';
  }
}

roadmapSubtaskForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const parent=roadmapItems.find(x=>x.id===roadmapSubtaskParentId);
  if(!parent)return;
  const fd=new FormData(roadmapSubtaskForm);
  const status=String(fd.get('status')||'todo');
  const data={
    title:String(fd.get('title')||'').trim(),
    owner:String(fd.get('owner')||'').trim(),
    due:String(fd.get('due')||''),
    status,
    done:status==='done',
    note:String(fd.get('note')||'').trim(),
    resource:String(fd.get('resource')||'').trim()
  };

  parent.subtasks=parent.subtasks||[];
  if(editingRoadmapSubtaskIndex!==null && parent.subtasks[editingRoadmapSubtaskIndex]){
    parent.subtasks[editingRoadmapSubtaskIndex]={...parent.subtasks[editingRoadmapSubtaskIndex],...data};
  }else{
    parent.subtasks.push(data);
  }

  if(parent.status==='planned' && parent.start<=rmToday())parent.status='progress';
  rmRecalculateParentFromSubtasks(parent);
  roadmapWrite(roadmapItems);
  const returnParentId=roadmapSubtaskParentId;
  roadmapSubtaskModal.close();
  roadmapSubtaskParentId=null;
  editingRoadmapSubtaskIndex=null;
  renderRoadmap();
  if(returnParentId&&rmReturnToParentAfterSubtask){
    rmReturnToParentAfterSubtask=false;
    openRoadmapModal(returnParentId);
  }
});

document.getElementById('deleteRoadmapSubtaskBtn')?.addEventListener('click',()=>{
  const parent=roadmapItems.find(x=>x.id===roadmapSubtaskParentId);
  if(!parent||editingRoadmapSubtaskIndex===null||!parent.subtasks?.[editingRoadmapSubtaskIndex])return;
  if(!confirm('Удалить эту подзадачу?'))return;
  parent.subtasks.splice(editingRoadmapSubtaskIndex,1);
  rmRecalculateParentFromSubtasks(parent);
  roadmapWrite(roadmapItems);
  const returnParentId=roadmapSubtaskParentId;
  roadmapSubtaskModal.close();
  roadmapSubtaskParentId=null;
  editingRoadmapSubtaskIndex=null;
  renderRoadmap();
  if(returnParentId&&rmReturnToParentAfterSubtask){
    rmReturnToParentAfterSubtask=false;
    openRoadmapModal(returnParentId);
  }
});

document.getElementById('roadmap')?.addEventListener('click',e=>{
  if(e.target.closest('a'))return;
  const addSub=e.target.closest('[data-rm-add-subtask]');
  if(addSub){
    e.stopPropagation();
    openRoadmapSubtaskModal(addSub.dataset.rmAddSubtask);
    return;
  }
  const sub=e.target.closest('[data-rm-subtask]');
  if(sub){
    e.stopPropagation();
    openRoadmapSubtaskModal(sub.dataset.rmSubtask,Number(sub.dataset.subIndex));
    return;
  }
  const edit=e.target.closest('[data-rm-edit]');
  if(edit){
    e.stopPropagation();
    openRoadmapModal(edit.dataset.rmEdit);
  }
});
renderRoadmap();


// ==========================================
// ROADMAP 2-LEVEL MODEL: GLOBAL ROADMAP + WEEKLY SPRINTS
// ==========================================
var ROADMAP_CLOSED_WEEKS_STORE='onvisualRoadmapClosedWeeksV1';
var roadmapGoals=[
  {id:'studio-discovery',scope:'ONVISUAL',title:'Исследования и позиционирование',start:'2026-10-19',due:'2026-10-30',description:'Кастдевы, карта потребностей, гипотеза продукта и позиционирования.'},
  {id:'studio-brand-product',scope:'ONVISUAL',title:'Бренд-архитектура и продуктовая упаковка',start:'2026-11-02',due:'2026-11-27',description:'Бренд-архитектура, продуктовая матрица, сайт, презентация, кейсы, КП и SMM.'},
  {id:'studio-sales-validation',scope:'ONVISUAL',title:'Запуск продаж и валидация',start:'2026-11-30',due:'2026-12-18',description:'Приёмка упаковки, запуск продаж, разбор отказов и корректировка продукта и офферов.'},
  {id:'studio-close-2026',scope:'ONVISUAL',title:'Аудит и планирование следующего периода',start:'2026-12-21',due:'2026-12-30',description:'Аудит бренда, итоговый отчёт и план Студии на январь.'},

  {id:'mv-foundation',scope:'Мультвселенная',title:'Аудит аудитории и бренд-платформа',start:'2026-10-19',due:'2026-10-30',description:'Фокус-группы, аудит аудитории, ядро бренда и выбор площадок.'},
  {id:'mv-ip-system',scope:'Мультвселенная',title:'Система IP и контентная архитектура',start:'2026-11-02',due:'2026-11-13',description:'Библия Зипов, контент-план, сайт и план горизонтальных серий.'},
  {id:'mv-commercial',scope:'Мультвселенная',title:'Коммерциализация и партнёрский пакет',start:'2026-11-16',due:'2026-12-11',description:'Товарные концепции, коммерческий пакет, сайт, партнёрства, предзаказы и производство.'},
  {id:'mv-strategy-2027',scope:'Мультвселенная',title:'Roadmap 2027 и итоги квартала',start:'2026-12-14',due:'2026-12-30',description:'Roadmap развития, итоговая презентация, отчёт и план Зипов на 2027 год.'}
];

var rmSelectedWeekStart=rmMonday(rmToday());
var rmClosedWeeks=(()=>{try{return JSON.parse(localStorage.getItem(ROADMAP_CLOSED_WEEKS_STORE)||'[]')}catch{return[]}})();

function rmMonday(value){
  const d=new Date((value||rmToday())+'T12:00:00');
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rmShiftDate(value,days){
  if(!value)return '';
  const d=new Date(value+'T12:00:00');
  d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function rmWeekEnd(start){return rmShiftDate(start,6)}
function rmWeekKey(scope,start){return scope+'|'+start}
function rmIsWeekClosed(scope,start){return Array.isArray(rmClosedWeeks)&&rmClosedWeeks.includes(rmWeekKey(scope,start))}
function rmSaveClosedWeeks(){localStorage.setItem(ROADMAP_CLOSED_WEEKS_STORE,JSON.stringify(rmClosedWeeks))}
function rmInferGoalId(item){
  const date=item.start||item.due||'2026-10-19';
  if(item.scope==='ONVISUAL'){
    if(date<'2026-11-01')return 'studio-discovery';
    if(date<'2026-11-30')return 'studio-brand-product';
    if(date<'2026-12-21')return 'studio-sales-validation';
    return 'studio-close-2026';
  }
  if(item.scope==='Мультвселенная'){
    if(date<'2026-11-01')return 'mv-foundation';
    if(date<'2026-11-16')return 'mv-ip-system';
    if(date<'2026-12-14')return 'mv-commercial';
    return 'mv-strategy-2027';
  }
  return '';
}
function rmPopulateGoalSelect(scope,selected){
  const select=document.getElementById('roadmapGoalSelect');
  if(!select)return;
  const goals=roadmapGoals.filter(g=>g.scope===scope);
  select.innerHTML=goals.map(g=>'<option value="'+g.id+'">'+escapeHtml(g.title)+'</option>').join('');
  const target=selected||goals[0]?.id||'';
  if([...select.options].some(o=>o.value===target))select.value=target;
}
function rmNormalizeRoadmapItems(){
  let changed=false;
  roadmapItems.forEach(item=>{
    if(!item.goalId){item.goalId=rmInferGoalId(item);changed=true}
    if(!item.sprintWeek){item.sprintWeek=rmMonday(item.start||item.due||rmToday());changed=true}
  });
  if(changed)roadmapWrite(roadmapItems);
}
rmNormalizeRoadmapItems();

function rmActiveGoalItems(goalId){
  return roadmapItems.filter(x=>x.goalId===goalId&&x.status!=='rolled');
}
function rmGoalProgress(goal){
  const items=rmActiveGoalItems(goal.id);
  if(!items.length)return 0;
  return Math.round(items.reduce((sum,x)=>sum+Number(x.progress||0),0)/items.length);
}
function rmGoalHealth(goal){
  const items=rmActiveGoalItems(goal.id);
  if(items.some(x=>x.status==='blocked'))return 'blocked';
  if(items.some(x=>rmHealth(x)==='overdue'))return 'overdue';
  if(items.some(x=>rmHealth(x)==='risk'))return 'risk';
  if(items.length&&items.every(x=>x.status==='done'))return 'done';
  return 'ontrack';
}
function rmMonthSpan(goal){
  const s=new Date(goal.start+'T12:00:00'),e=new Date(goal.due+'T12:00:00');
  const start=Math.max(0,s.getMonth()-9);
  const end=Math.min(2,e.getMonth()-9);
  return {start,end,span:Math.max(1,end-start+1)};
}

// Override global Roadmap view: only macro goals through December.
function renderRoadmapTimeline(){
  const host=document.getElementById('roadmapTimeline');
  if(!host)return;
  const goals=(roadmapGoals||[]).filter(g=>g.scope===roadmapProject);
  host.innerHTML=goals.map((goal,index)=>{
    const items=rmActiveGoalItems(goal.id);
    const progress=rmGoalProgress(goal);
    const health=rmGoalHealth(goal);
    const done=items.filter(x=>x.status==='done').length;
    const active=items.filter(x=>!['done','rolled'].includes(x.status)).length;
    const span=rmMonthSpan(goal);
    const current=items.filter(x=>x.sprintWeek===rmMonday(rmToday())&&x.status!=='done').length;
    return '<article class="rm-global-card health-'+health+'">'+
      '<div class="rm-global-num">0'+(index+1)+'</div>'+
      '<div class="rm-global-main">'+
        '<small>'+rmDateLabel(goal.start)+' → '+rmDateLabel(goal.due)+'</small>'+
        '<h3>'+escapeHtml(goal.title)+'</h3>'+
        '<p>'+escapeHtml(goal.description)+'</p>'+
        '<div class="rm-global-meta"><span><b>'+items.length+'</b> действий</span><span><b>'+done+'</b> закрыто</span><span><b>'+active+'</b> активно</span><span><b>'+current+'</b> в текущем спринте</span></div>'+
      '</div>'+
      '<div class="rm-global-progress"><div><i style="width:'+progress+'%"></i></div><strong>'+progress+'%</strong><span class="rm-health-badge '+health+'">'+rmHealthLabel({status:health==='done'?'done':health==='blocked'?'blocked':'progress',due:health==='overdue'?'2000-01-01':'',progress:health==='risk'?0:100})+'</span></div>'+
      '<div class="rm-global-monthbar"><i style="grid-column:'+(span.start+1)+' / span '+span.span+'"></i></div>'+
    '</article>';
  }).join('');
}

function rmItemsForWeek(){
  const selected=rmSelectedWeekStart||rmMonday(rmToday());
  const owner=document.getElementById('roadmapOwnerFilter')?.value||'all';
  return roadmapItems.filter(item=>{
    if(item.scope!==roadmapProject)return false;
    if((item.sprintWeek||rmMonday(item.start||item.due))!==selected)return false;
    if(owner!=='all'&&item.owner!==owner)return false;
    return true;
  });
}
function rmSprintCard(item){
  const rolled=item.status==='rolled';
  const h=rolled?'rolled':rmHealth(item);
  const goal=(roadmapGoals||[]).find(g=>g.id===item.goalId);
  const subs=(item.subtasks||[]).filter(Boolean);
  const resource=item.resource
    ? '<a class="rm-card-resource" href="'+escapeHtml(item.resource)+'" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">↗ Материал / папка</a>'
    : '';
  const subRows=subs.length
    ? '<div class="rm-sprint-subtask-table">'+subs.map((s,i)=>{
        const cls=(s.done||s.status==='done')?'done':s.status==='risk'?'risk':s.status==='progress'?'progress':'todo';
        const label=(s.done||s.status==='done')?'Готово':s.status==='risk'?'Риск':s.status==='progress'?'В работе':'План';
        return '<button type="button" class="rm-sprint-subtask-row '+cls+'" data-rm-subtask="'+item.id+'" data-sub-index="'+i+'" onclick="event.stopPropagation()">'+
          '<span class="rm-sub-state"></span>'+
          '<span class="rm-sub-title"><b>'+escapeHtml(s.title||'Без названия')+'</b>'+
            (s.note?'<small>'+escapeHtml(s.note)+'</small>':'')+
          '</span>'+
          '<span class="rm-sub-owner">'+escapeHtml(s.owner||'Не назначен')+'</span>'+
          '<span class="rm-sub-due">'+rmDateLabel(s.due)+'</span>'+
          '<em>'+label+'</em>'+
          (s.resource?'<i>↗</i>':'')+
        '</button>';
      }).join('')+'</div>'
    : '<div class="rm-sprint-no-subs">Подзадач пока нет</div>';

  return '<article class="rm-sprint-card health-'+h+'" data-rm-edit="'+item.id+'" data-rm-drag="'+item.id+'" draggable="true">'+
    '<div class="rm-drag-handle" title="Перетащить по воронке">⋮⋮</div>'+
    '<div class="rm-sprint-top"><span>'+escapeHtml(goal?.title||item.scope)+'</span><b>'+rmDateLabel(item.due)+'</b></div>'+
    '<h4>'+escapeHtml(item.title)+'</h4>'+
    '<p><strong>Владелец:</strong> '+escapeHtml(item.owner||'Николай')+'</p>'+
    (item.dependency?'<div class="rm-sprint-dep">↳ '+escapeHtml(item.dependency)+'</div>':'')+
    (item.note?'<div class="rm-card-note">'+escapeHtml(item.note)+'</div>':'')+
    resource+
    '<div class="rm-sprint-subhead"><span>Подзадачи команды</span><button type="button" data-rm-add-subtask="'+item.id+'" onclick="event.stopPropagation()">＋ Добавить</button></div>'+
    subRows+
    '<div class="rm-mini-progress"><i style="width:'+Number(item.progress||0)+'%"></i></div>'+
    '<small>'+Number(item.progress||0)+'% · '+(rolled?'Перенесено в следующую неделю':rmHealthLabel(item))+'</small>'+
  '</article>';
}
function rmUpdateWeekHeader(items){
  if(!rmSelectedWeekStart)rmSelectedWeekStart=rmMonday(rmToday());
  const end=rmWeekEnd(rmSelectedWeekStart);
  const startD=new Date(rmSelectedWeekStart+'T12:00:00');
  const endD=new Date(end+'T12:00:00');
  const sameMonth=startD.getMonth()===endD.getMonth();
  const fmtDay=d=>d.toLocaleDateString('ru-RU',{day:'2-digit'});
  const fmtMonth=d=>d.toLocaleDateString('ru-RU',{month:'long'});
  const title=sameMonth
    ? fmtDay(startD)+'–'+fmtDay(endD)+' '+fmtMonth(endD)
    : fmtDay(startD)+' '+fmtMonth(startD)+' – '+fmtDay(endD)+' '+fmtMonth(endD);
  const titleEl=document.getElementById('rmWeekTitle');
  if(titleEl)titleEl.textContent=title;
  const closed=rmIsWeekClosed(roadmapProject,rmSelectedWeekStart);
  const current=rmSelectedWeekStart===rmMonday(rmToday());
  const state=document.getElementById('rmWeekState');
  if(state)state.textContent=closed?'Неделя закрыта · история сохранена':current?'Текущая рабочая неделя':'План / история спринта';
  const closeBtn=document.getElementById('rmCloseWeek');
  if(closeBtn){closeBtn.disabled=closed;closeBtn.textContent=closed?'Неделя закрыта ✓':'Закрыть неделю'}
  const done=items.filter(x=>x.status==='done').length;
  const remaining=items.filter(x=>!['done','rolled'].includes(x.status)).length;
  document.getElementById('rmWeekTotal')?.replaceChildren(document.createTextNode(String(items.filter(x=>x.status!=='rolled').length)));
  document.getElementById('rmWeekDone')?.replaceChildren(document.createTextNode(String(done)));
  document.getElementById('rmWeekRemain')?.replaceChildren(document.createTextNode(String(remaining)));
  let pace='В ТЕМПЕ';
  if(closed)pace='ЗАКРЫТА';
  else if(items.some(x=>x.status==='blocked'||rmHealth(x)==='overdue'))pace='НЕ УСПЕВАЕМ';
  else if(items.some(x=>rmHealth(x)==='risk'))pace='ЕСТЬ РИСК';
  const paceEl=document.getElementById('rmWeekHealth');
  if(paceEl)paceEl.textContent=pace;
}
function renderRoadmapSprint(){
  const items=rmItemsForWeek();
  rmUpdateWeekHeader(items);
  const plan=items.filter(x=>x.status==='planned');
  const work=items.filter(x=>x.status==='progress'&&!['risk','overdue'].includes(rmHealth(x)));
  const risk=items.filter(x=>x.status==='risk'||x.status==='blocked'||['risk','overdue'].includes(rmHealth(x)));
  const done=items.filter(x=>x.status==='done');
  const rolled=items.filter(x=>x.status==='rolled');
  const sets=[
    ['rmPlanList','rmPlanCount',plan],
    ['rmWorkList','rmWorkCount',work],
    ['rmRiskSprintList','rmRiskSprintCount',risk],
    ['rmClosedList','rmClosedCount',done],
    ['rmRolledList','rmRolledCount',rolled]
  ];
  sets.forEach(([listId,countId,data])=>{
    const host=document.getElementById(listId),count=document.getElementById(countId);
    if(count)count.textContent=String(data.length);
    if(host){
      host.innerHTML=data.length?data.map(rmSprintCard).join(''):'<div class="rm-column-empty">Пусто</div>';
      const section=host.closest('section');
      const dropMap={rmPlanList:'planned',rmWorkList:'progress',rmRiskSprintList:'risk',rmClosedList:'done',rmRolledList:'rolled'};
      if(section)section.dataset.rmDropStatus=dropMap[listId]||'';
    }
  });
}
function rmSummary(){
  const projectItems=roadmapItems.filter(x=>x.scope===roadmapProject&&x.status!=='rolled');
  const active=projectItems.filter(x=>x.status!=='done');
  const risk=active.filter(x=>['risk','overdue','blocked'].includes(rmHealth(x)));
  const done=projectItems.filter(x=>x.status==='done');
  document.getElementById('roadmapActiveCount')?.replaceChildren(document.createTextNode(String(active.length)));
  document.getElementById('roadmapRiskCount')?.replaceChildren(document.createTextNode(String(risk.length)));
  document.getElementById('roadmapDoneCount')?.replaceChildren(document.createTextNode(String(done.length)));
  const next=active.filter(x=>x.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
  const focus=document.getElementById('roadmapFocusText');
  if(focus)focus.textContent=next?rmDateLabel(next.due):'—';
}
function renderRoadmapTeam(){
  const host=document.getElementById('roadmapTeamGrid');
  if(!host)return;

  const currentWeek=rmMonday(rmToday());
  const projectItems=roadmapItems.filter(x=>
    x.scope===roadmapProject &&
    x.status!=='rolled' &&
    (x.sprintWeek||rmMonday(x.start||x.due))===currentWeek
  );

  const grouped={};
  projectItems.forEach(parent=>{
    (parent.subtasks||[]).forEach((sub,index)=>{
      if(sub.done||sub.status==='done')return;
      const owner=sub.owner||'Не назначен';
      (grouped[owner]||(grouped[owner]=[])).push({
        parentId:parent.id,
        subIndex:index,
        title:sub.title,
        due:sub.due||parent.due,
        status:sub.status||'todo',
        parentTitle:parent.title
      });
    });
  });

  const entries=Object.entries(grouped).sort((a,b)=>b[1].length-a[1].length);
  host.innerHTML=entries.length?entries.map(([owner,tasks])=>{
    const risks=tasks.filter(x=>x.status==='risk'||(x.due&&x.due<rmToday())).length;
    const load=Math.min(100,tasks.length*20);
    return '<article class="rm-team-card">'+
      '<div class="rm-team-head"><div><small>ПОДЗАДАЧИ ТЕКУЩЕГО СПРИНТА</small><h3>'+escapeHtml(owner)+'</h3></div><b>'+tasks.length+' активн.</b></div>'+
      '<div class="rm-team-load"><span>Загрузка по назначенным действиям</span><div><i style="width:'+load+'%"></i></div><b>'+load+'%</b></div>'+
      (risks?'<div class="rm-team-risk">⚠ Требуют внимания: '+risks+'</div>':'<div class="rm-team-ok">✓ Критичных рисков нет</div>')+
      '<div class="rm-team-items">'+tasks.slice(0,7).map(x=>
        '<button type="button" data-rm-subtask="'+x.parentId+'" data-sub-index="'+x.subIndex+'">'+
          '<span>'+escapeHtml(x.title)+'<small>'+escapeHtml(x.parentTitle)+'</small></span>'+
          '<b>'+rmDateLabel(x.due)+'</b>'+
        '</button>'
      ).join('')+'</div>'+
    '</article>';
  }).join(''):'<div class="roadmap-empty">На этой неделе подзадачи команде ещё не распределены.</div>';
}
function rmCloseSelectedWeek(){
  if(rmIsWeekClosed(roadmapProject,rmSelectedWeekStart))return;
  const items=roadmapItems.filter(x=>x.scope===roadmapProject&&(x.sprintWeek||rmMonday(x.start||x.due))===rmSelectedWeekStart&&x.status!=='rolled');
  const unfinished=items.filter(x=>x.status!=='done');
  const nextStart=rmShiftDate(rmSelectedWeekStart,7);
  if(!confirm('Закрыть неделю '+rmSelectedWeekStart+'?\n\nЗакрытые задачи останутся в истории. '+unfinished.length+' незакрытых задач будут перенесены в следующий спринт.'))return;
  unfinished.forEach(item=>{
    const copy={
      ...item,
      id:'rm-'+uid(),
      sprintWeek:nextStart,
      start:rmShiftDate(item.start||rmSelectedWeekStart,7),
      due:rmShiftDate(item.due||rmWeekEnd(rmSelectedWeekStart),7),
      status:(item.status==='risk'||item.status==='blocked')?'risk':(Number(item.progress||0)>0?'progress':'planned'),
      rolledFrom:item.id
    };
    item.status='rolled';
    item.rolledTo=copy.id;
    roadmapItems.push(copy);
  });
  rmClosedWeeks.push(rmWeekKey(roadmapProject,rmSelectedWeekStart));
  rmSaveClosedWeeks();
  roadmapWrite(roadmapItems);
  rmSelectedWeekStart=nextStart;
  renderRoadmap();
}

document.getElementById('rmPrevWeek')?.addEventListener('click',()=>{rmSelectedWeekStart=rmShiftDate(rmSelectedWeekStart,-7);renderRoadmap()});
document.getElementById('rmNextWeek')?.addEventListener('click',()=>{rmSelectedWeekStart=rmShiftDate(rmSelectedWeekStart,7);renderRoadmap()});
document.getElementById('rmTodayWeek')?.addEventListener('click',()=>{rmSelectedWeekStart=rmMonday(rmToday());renderRoadmap()});
document.getElementById('rmCloseWeek')?.addEventListener('click',rmCloseSelectedWeek);
document.querySelector('#roadmapForm select[name="scope"]')?.addEventListener('change',e=>rmPopulateGoalSelect(e.target.value,''));

document.getElementById('roadmapModalSubtaskList')?.addEventListener('click',e=>{
  const row=e.target.closest('[data-rm-subtask]');
  if(!row)return;
  const parentId=row.dataset.rmSubtask;
  const index=Number(row.dataset.subIndex);
  roadmapModal?.close();
  openRoadmapSubtaskModal(parentId,index);
});

document.getElementById('addRoadmapSubtaskFromMain')?.addEventListener('click',()=>{
  const id=editingRoadmapId;
  if(!id)return;
  roadmapModal?.close();
  openRoadmapSubtaskModal(id);
});

let roadmapDraggedId=null;
const roadmapRoot=document.getElementById('roadmap');
roadmapRoot?.addEventListener('dragstart',e=>{
  const card=e.target.closest('[data-rm-drag]');
  if(!card)return;
  roadmapDraggedId=card.dataset.rmDrag;
  card.classList.add('is-dragging');
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',roadmapDraggedId)}catch{}
});
roadmapRoot?.addEventListener('dragend',e=>{
  e.target.closest('[data-rm-drag]')?.classList.remove('is-dragging');
  document.querySelectorAll('[data-rm-drop-status]').forEach(x=>x.classList.remove('drag-over'));
  roadmapDraggedId=null;
});
roadmapRoot?.addEventListener('dragover',e=>{
  const col=e.target.closest('[data-rm-drop-status]');
  if(!col||!roadmapDraggedId)return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  document.querySelectorAll('[data-rm-drop-status]').forEach(x=>x.classList.toggle('drag-over',x===col));
});
roadmapRoot?.addEventListener('dragleave',e=>{
  const col=e.target.closest('[data-rm-drop-status]');
  if(col&&!col.contains(e.relatedTarget))col.classList.remove('drag-over');
});
roadmapRoot?.addEventListener('drop',e=>{
  const col=e.target.closest('[data-rm-drop-status]');
  if(!col)return;
  e.preventDefault();
  const id=roadmapDraggedId||e.dataTransfer.getData('text/plain');
  const item=roadmapItems.find(x=>x.id===id);
  const status=col.dataset.rmDropStatus;
  if(!item||!status)return;
  item.status=status;
  if(status==='done')item.progress=100;
  else if(status==='planned'&&Number(item.progress||0)===100)item.progress=0;
  if(status==='rolled'){
    item.rolledAt=rmToday();
  }
  roadmapWrite(roadmapItems);
  document.querySelectorAll('[data-rm-drop-status]').forEach(x=>x.classList.remove('drag-over'));
  renderRoadmap();
});

rmPopulateGoalSelect(roadmapProject,'');
renderRoadmap();

let rmReturnToParentAfterSubtask=false;
document.getElementById('roadmapModalSubtaskList')?.addEventListener('click',()=>{rmReturnToParentAfterSubtask=true},{capture:true});
document.getElementById('addRoadmapSubtaskFromMain')?.addEventListener('click',()=>{rmReturnToParentAfterSubtask=true},{capture:true});
document.querySelectorAll('#roadmapSubtaskModal [data-close="roadmapSubtaskModal"]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const parentId=roadmapSubtaskParentId;
    roadmapSubtaskModal?.close();
    roadmapSubtaskParentId=null;
    editingRoadmapSubtaskIndex=null;
    if(rmReturnToParentAfterSubtask&&parentId){
      rmReturnToParentAfterSubtask=false;
      openRoadmapModal(parentId);
    }
  });
});
