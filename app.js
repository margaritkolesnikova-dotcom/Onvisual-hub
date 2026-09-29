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
          ${t.due?'<span>Срок: <b>'+formatDateRu(t.due)+'</b></span>':''}
        </div>
        <select class="task-status-select" aria-label="Статус задачи">
          <option value="new" ${t.status==='new'?'selected':''}>Новая</option>
          <option value="progress" ${t.status==='progress'?'selected':''}>В работе</option>
          <option value="review" ${t.status==='review'?'selected':''}>На проверке</option>
          <option value="done" ${t.status==='done'?'selected':''}>Готово</option>
        </select>`;
      card.querySelector('.task-delete').addEventListener('click',()=>{
        tasks=tasks.filter(x=>x.id!==t.id);writeStore(STORAGE_TASKS,tasks);renderTasks();
      });
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

addTaskBtn?.addEventListener('click',()=>taskModal.showModal());
taskForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(taskForm);
  tasks.unshift({
    id:uid(),
    title:fd.get('title').trim(),
    scope:fd.get('scope'),
    status:fd.get('status'),
    due:fd.get('due'),
    owner:fd.get('owner').trim(),
    note:fd.get('note').trim()
  });
  writeStore(STORAGE_TASKS,tasks);
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

function openEventModal(date=''){
  if(date)eventForm.elements.date.value=date;
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
    cell.addEventListener('click',()=>openEventModal(date));
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
      <div><small>${escapeHtml(ev.type)} / ${escapeHtml(ev.scope)}</small><h4>${escapeHtml(ev.title)}</h4>${ev.note?'<p>'+escapeHtml(ev.note)+'</p>':''}</div>
      <div class="calendar-event-side">${ev.owner?'<span>'+escapeHtml(ev.owner)+'</span>':''}<button class="event-delete" aria-label="Удалить событие">×</button></div>`;
    row.querySelector('.event-delete').addEventListener('click',()=>{
      events=events.filter(x=>x.id!==ev.id);writeStore(STORAGE_EVENTS,events);renderCalendar();
    });
    calendarEventList.appendChild(row);
  });
}

document.getElementById('addEventBtn')?.addEventListener('click',()=>openEventModal());
document.getElementById('prevMonthBtn')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()});
document.getElementById('nextMonthBtn')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()});

eventForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(eventForm);
  const date=fd.get('date');
  events.push({
    id:uid(),
    title:fd.get('title').trim(),
    date,
    type:fd.get('type'),
    scope:fd.get('scope'),
    owner:fd.get('owner').trim(),
    note:fd.get('note').trim()
  });
  writeStore(STORAGE_EVENTS,events);
  const dt=new Date(date+'T12:00:00');
  calendarCursor=new Date(dt.getFullYear(),dt.getMonth(),1);
  eventForm.reset();
  eventModal.close();
  renderCalendar();
});

renderCalendar();
