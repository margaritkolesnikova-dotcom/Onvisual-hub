(()=>{'use strict';
const $=id=>document.getElementById(id);
const roleLabels={admin:'Администратор',producer:'Линейный продюсер',creative:'Креативный продюсер',editor:'Монтажёр',creator:'Креатор',smm:'SMM / Контент',viewer:'Наблюдатель'};
const sectionLabels={tasks:'Мои задачи',calendar:'Календарь',files:'Материалы',production:'Продакшен',creative:'Креатив',social:'Публикации',team:'Команда и доступ'};
const descriptions={tasks:'Задачи, сроки, статусы и обратная связь',calendar:'Дедлайны только по доступным задачам',files:'Рабочие файлы и результаты по доступным задачам',production:'Назначенные задачи монтажа и генерации',creative:'Назначенные креативные задачи',social:'Назначенные задачи по публикациям',team:'Сотрудники, права доступа и приглашения'};
const statuses={new:'Новая',progress:'В работе',review:'На проверке',done:'Готово'};
const taskCategories={production:['Монтаж','Генерация'],creative:['Креатив'],social:['Публикация']};
const allSections=['tasks','calendar','files','production','creative','social','team'];
const defaults={producer:['tasks','calendar','files','production','creative'],creative:['tasks','calendar','files','creative','production'],editor:['tasks','calendar','files','production'],creator:['tasks','calendar','files','production'],smm:['tasks','calendar','files','social'],viewer:['tasks','calendar','files']};
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(String(s||''));return u.protocol==='https:'?u.href:'';}catch{return ''}};
const prettyDate=d=>d?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00')):'Без срока';
const dateClass=d=>d&&new Date(d+'T23:59:59').getTime()<Date.now()?'priority':'';
const isAdmin=()=>current?.role==='admin';
let db,session,current=null,tasks=[],members=[],activity=[],activeSection='tasks';
function notice(message,error=false){const n=$('notice');n.textContent=message;n.className='notice'+(error?' error':'');n.classList.remove('hidden');}
function clearNotice(){$('notice').classList.add('hidden')}
function loginMessage(s){$('loginMessage').textContent=s}
function showLogin(){$('setup').classList.add('hidden');$('app').classList.add('hidden');$('login').classList.remove('hidden');}
function showSetup(msg){$('login').classList.add('hidden');$('app').classList.add('hidden');$('setup').classList.remove('hidden');$('setup').querySelector('p').textContent=msg;}
function setLoading(on){document.body.style.cursor=on?'progress':'';}
async function initialize(){
  try{
    const c=await fetch('/api/team-config',{cache:'no-store'});
    const info=await c.json();
    if(!c.ok||!info.url||!info.anonKey)throw Error(info.error||'Система пока не настроена');
    if(!window.supabase?.createClient)throw Error('Не удалось загрузить модуль авторизации. Проверьте подключение к сети.');
    db=window.supabase.createClient(info.url,info.anonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    const initial=await db.auth.getSession();
    if(initial.data?.session)await openSession(initial.data.session);else showLogin();
    db.auth.onAuthStateChange((evt,next)=>{
      if(evt==='SIGNED_OUT'){session=null;current=null;showLogin();}
      if(evt==='SIGNED_IN'&&next&&next.user.id!==current?.id){
        setTimeout(()=>openSession(next),0);
      }
    });
  }catch(e){showSetup('Кабинеты сотрудников пока не подключены: '+e.message);}
}
async function openSession(value){
  session=value;
  if(!value?.user){showLogin();return}
  const {data,error}=await db.from('hub_profiles').select('id,email,display_name,role,sections,active')
    .eq('id',value.user.id).single();
  if(error||!data||!data.active){
    showLogin();loginMessage('Для этой почты пока не выдан доступ. Обратитесь к администратору.');
    await db.auth.signOut();return;
  }
  current=data;
  $('setup').classList.add('hidden');$('login').classList.add('hidden');$('app').classList.remove('hidden');
  $('userBadge').innerHTML='<strong>'+escapeHtml(data.display_name)+'</strong><small>'+escapeHtml(roleLabels[data.role]||data.role)+'</small>';
  $('adminHubLink').classList.toggle('hidden',!isAdmin());
  await refresh();
  navigate('tasks');
}
async function refresh(){
  if(!current)return;
  const [taskResult,peopleResult,activityResult]=await Promise.all([
    db.from('hub_tasks').select('*').order('due_at',{ascending:true,nullsFirst:false}),
    isAdmin()?db.from('hub_profiles').select('id,email,display_name,role,sections,active').order('display_name'):
      Promise.resolve({data:[current]}),
    db.from('hub_task_activity').select('id,task_id,actor_id,message,created_at')
      .order('created_at',{ascending:false}).limit(500)
  ]);
  if(taskResult.error){notice('Не удалось загрузить задачи: '+taskResult.error.message,true);return}
  tasks=taskResult.data||[];
  members=peopleResult.data||[];
  activity=activityResult.data||[];
  if(peopleResult.error)notice('Не удалось получить сотрудников: '+peopleResult.error.message,true);
  draw();
}
function sections(){
  const configured=new Set(Array.isArray(current.sections)?current.sections:[]);
  if(isAdmin())return allSections;
  return allSections.filter(k=>k!=='team'&&configured.has(k));
}
function drawNav(){
  const s=sections();if(!s.includes(activeSection))activeSection='tasks';
  $('sectionNav').innerHTML=s.map((x,i)=>'<button class="nav-item '+(x===activeSection?'active':'')+
    '" data-section="'+x+'">'+escapeHtml(sectionLabels[x])+'<span class="nav-num">'+
    String(i+1).padStart(2,'0')+'</span></button>').join('');
}
function navigate(key){
  if(!sections().includes(key))return;
  activeSection=key;draw();
}
function filteredTasks(){
  if(taskCategories[activeSection])
    return tasks.filter(t=>taskCategories[activeSection].includes(t.category));
  return tasks;
}
function draw(){
  if(!current)return;
  drawNav();
  $('sectionTitle').textContent=sectionLabels[activeSection]||'Мои задачи';
  $('sectionEyebrow').textContent=isAdmin()?'CONTROL CENTER / ADMIN':'PERSONAL WORKSPACE';
  $('sectionDescription').textContent=descriptions[activeSection]||'';
  $('newTaskBtn').classList.toggle('hidden',!(isAdmin()&&activeSection==='tasks'));
  $('teamView').classList.toggle('hidden',activeSection!=='team');
  $('taskGrid').classList.toggle('hidden',!['tasks','production','creative','social'].includes(activeSection));
  $('cardsView').classList.toggle('hidden',!['calendar','files'].includes(activeSection));
  const selected=filteredTasks();
  $('stats').innerHTML=[
    ['Назначено',selected.length],['Новые',selected.filter(t=>t.status==='new').length],
    ['В работе',selected.filter(t=>t.status==='progress').length],
    ['На проверке',selected.filter(t=>t.status==='review').length]
  ].map(([name,count])=>'<div class="stat"><small>'+name+'</small><strong>'+count+'</strong></div>').join('');
  if(['tasks','production','creative','social'].includes(activeSection))drawBoard(selected);
  if(['calendar','files'].includes(activeSection))drawCards(selected);
  if(activeSection==='team'&&isAdmin())drawMembers();
}
function staffName(id){return members.find(m=>m.id===id)?.display_name||(id===current.id?current.display_name:'Сотрудник')}
function drawBoard(items){
  $('taskGrid').innerHTML=Object.keys(statuses).map(status=>{
    const filtered=items.filter(t=>t.status===status);
    const cards=filtered.map(t=>{
      const recent=activity.find(a=>a.task_id===t.id);
      const doc=safeUrl(t.reference_url),out=safeUrl(t.result_url);
      return '<article class="task-card" data-id="'+t.id+'">'+
        '<span class="tag">'+escapeHtml(t.scope)+' / '+escapeHtml(t.category)+'</span>'+
        (t.priority==='high'?'<span class="tag priority"> · СРОЧНО</span>':'')+
        '<h4>'+escapeHtml(t.title)+'</h4>'+
        (t.details?'<p>'+escapeHtml(t.details)+'</p>':'')+
        '<small>Исполнитель: '+escapeHtml(staffName(t.assigned_to))+'</small><p class="'+dateClass(t.due_at)+'"><small>Срок: '+escapeHtml(prettyDate(t.due_at))+'</small></p>'+
        (doc?'<p><a class="card-link" href="'+escapeHtml(doc)+'" target="_blank" rel="noopener noreferrer">↗ ТЗ / материалы</a></p>':'')+
        (out?'<p><a class="card-link" href="'+escapeHtml(out)+'" target="_blank" rel="noopener noreferrer">↗ Сданный результат</a></p>':'')+
        '<div class="task-fields"><label>Статус <select data-field="status">'+
          Object.entries(statuses).map(([k,v])=>'<option value="'+k+'"'+(status===k?' selected':'')+'>'+v+'</option>').join('')+
        '</select></label><label>Ссылка на результат<input data-field="result" type="url" maxlength="1000" placeholder="https://…" value="'+escapeHtml(t.result_url||'')+'"></label>'+
        '<label>Комментарий<input data-field="comment" maxlength="2000" placeholder="Что сделано / вопрос"></label>'+
        '<div class="task-actions"><button class="secondary task-save" data-id="'+t.id+'">Сохранить</button>'+
        (isAdmin()?'<button class="ghost task-edit" data-id="'+t.id+'">Изменить</button>':'')+'</div></div>'+
        (recent?'<p class="task-note">Последнее: '+escapeHtml(recent.message)+'</p>':'')+
        '</article>';
    }).join('');
    return '<div class="column"><div class="column-head"><h3>'+statuses[status]+'</h3><span class="counter">'+filtered.length+'</span></div>'+
      (cards||'<p class="empty">Нет задач</p>')+'</div>';
  }).join('');
}
function drawCards(items){
  if(activeSection==='calendar'){
    items=items.filter(t=>t.due_at).sort((a,b)=>a.due_at.localeCompare(b.due_at));
    $('cardsView').innerHTML=items.map(t=>'<article class="item-card"><span class="tag">'+escapeHtml(prettyDate(t.due_at))+'</span><h3>'+escapeHtml(t.title)+'</h3><p>'+escapeHtml(staffName(t.assigned_to))+' · '+escapeHtml(statuses[t.status])+'</p></article>').join('')||'<p class="empty">Нет задач со сроком</p>';
  }else{
    const files=items.filter(t=>safeUrl(t.reference_url)||safeUrl(t.result_url));
    $('cardsView').innerHTML=files.map(t=>'<article class="item-card"><span class="tag">'+escapeHtml(t.category)+'</span><h3>'+escapeHtml(t.title)+'</h3>'+
      (safeUrl(t.reference_url)?'<p><a href="'+escapeHtml(safeUrl(t.reference_url))+'" target="_blank" rel="noopener noreferrer">Материалы / ТЗ ↗</a></p>':'')+
      (safeUrl(t.result_url)?'<p><a href="'+escapeHtml(safeUrl(t.result_url))+'" target="_blank" rel="noopener noreferrer">Результат ↗</a></p>':'')+'</article>').join('')||'<p class="empty">Нет прикреплённых материалов</p>';
  }
}
function checkboxes(sections,context){
  return ['tasks','calendar','files','production','creative','social'].map(s=>
   '<label><input type="checkbox" data-permission="'+s+'" '+(sections.includes(s)?'checked ':'')+
   (['tasks','calendar','files'].includes(s)?'disabled ':'')+
   (context?'data-member="'+context+'"':'')+'>'+escapeHtml(sectionLabels[s])+'</label>').join('');
}
function drawMembers(){
  $('memberList').innerHTML=members.map(m=>{
    const personal=m.id===current.id;
    const editRole=Object.entries(roleLabels).map(([k,v])=>'<option value="'+k+'"'+(m.role===k?' selected':'')+'>'+escapeHtml(v)+'</option>').join('');
    return '<div class="member" data-member-id="'+m.id+'"><strong>'+escapeHtml(m.display_name)+'</strong><small>'+
      escapeHtml(m.email)+(personal?' · вы':'')+'</small>'+
      '<div class="member-controls"><select data-role '+(personal?'disabled':'')+'>'+editRole+'</select>'+
      '<label><input type="checkbox" data-active '+(m.active?'checked':'')+' '+(personal?'disabled':'')+'> Активен</label></div>'+
      '<div class="checklist">'+checkboxes(m.sections||[],m.id)+'</div>'+
      (personal?'':'<button class="secondary member-save" data-id="'+m.id+'">Сохранить права</button>')+'</div>';
  }).join('')||'<p class="empty">Нет сотрудников</p>';
}
function invitePreset(){
  const role=$('inviteRole').value;
  $('inviteSections').innerHTML=checkboxes(defaults[role]||defaults.viewer,'');
}
function openTask(id){
  if(!isAdmin())return;
  const t=tasks.find(x=>x.id===id);
  const f=$('taskForm');f.reset();
  f.elements.namedItem('id').value=t?.id||'';
  $('assignee').innerHTML=members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+escapeHtml(m.display_name)+' — '+escapeHtml(roleLabels[m.role])+'</option>').join('');
  if(t){
    for(const field of ['title','details','assigned_to','scope','category','priority','status','due_at','reference_url']){
      const el=f.elements.namedItem(field);if(el)el.value=t[field]||'';
    }
    $('taskDialogTitle').textContent='Изменить задачу';
  }else{$('taskDialogTitle').textContent='Новая задача';}
  $('taskDialog').showModal();
}
async function saveTask(e){
  e.preventDefault();if(!isAdmin())return;
  const f=e.currentTarget,d=new FormData(f);const id=d.get('id');
  const url=String(d.get('reference_url')||'').trim();
  if(url&&!safeUrl(url)){notice('Ссылка на ТЗ должна начинаться с https://',true);return;}
  const fields={title:String(d.get('title')||'').trim(),details:String(d.get('details')||''),
    assigned_to:d.get('assigned_to'),scope:d.get('scope'),category:d.get('category'),
    priority:d.get('priority'),status:d.get('status'),due_at:d.get('due_at')||null,reference_url:url||null};
  if(!fields.title||!fields.assigned_to){notice('Заполните задачу и исполнителя',true);return}
  setLoading(true);
  const response=id?
    await db.from('hub_tasks').update(fields).eq('id',id):
    await db.from('hub_tasks').insert({...fields,created_by:current.id});
  setLoading(false);
  if(response.error){notice('Не удалось сохранить задачу: '+response.error.message,true);return}
  $('taskDialog').close();notice('Задача сохранена');await refresh();
}
async function saveProgress(card){
  const id=card.dataset.id,t=tasks.find(x=>x.id===id);
  if(!t)return;
  const status=card.querySelector('[data-field="status"]').value;
  const url=card.querySelector('[data-field="result"]').value.trim();
  const comment=card.querySelector('[data-field="comment"]').value.trim();
  if(url&&!safeUrl(url)){notice('Для результата нужна ссылка https://',true);return}
  setLoading(true);
  const result=await db.rpc('hub_update_own_task',{
    p_task_id:id,p_status:status,p_result_url:url||null
  });
  if(result.error){setLoading(false);notice('Не удалось изменить задачу: '+result.error.message,true);return}
  if(comment){
    const saved=await db.from('hub_task_activity').insert({task_id:id,actor_id:current.id,message:comment});
    if(saved.error){notice('Статус сохранён, но комментарий не записался: '+saved.error.message,true)}
  }
  setLoading(false);notice('Изменения сохранены');await refresh();
}
async function invite(e){
  e.preventDefault();if(!isAdmin())return;
  const d=new FormData(e.currentTarget);
  const secs=[...$('inviteSections').querySelectorAll('input[data-permission]')].filter(x=>x.checked).map(x=>x.dataset.permission);
  setLoading(true);
  try{
    const r=await fetch('/api/team-invite',{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({email:d.get('email'),displayName:d.get('displayName'),role:d.get('role'),sections:secs})
    });
    const x=await r.json();if(!r.ok)throw Error(x.error||'Не удалось отправить приглашение');
    notice('Приглашение отправлено: '+x.email);
    e.currentTarget.reset();invitePreset();await refresh();
  }catch(err){notice(err.message,true)}finally{setLoading(false)}
}
async function saveMember(node){
  const id=node.dataset.memberId,role=node.querySelector('[data-role]').value;
  if(id===current.id)return;
  const active=node.querySelector('[data-active]').checked;
  const secs=[...node.querySelectorAll('[data-permission]')].filter(x=>x.checked).map(x=>x.dataset.permission);
  const res=await db.from('hub_profiles').update({role,active,sections:secs}).eq('id',id);
  if(res.error)notice('Не удалось сохранить права: '+res.error.message,true);
  else{notice('Права обновлены');await refresh()}
}
async function importOldTasks(){
  if(!isAdmin())return;
  let legacy=[];
  try{legacy=JSON.parse(localStorage.getItem('onvisualHubTasksV1')||'[]')}catch{}
  if(!Array.isArray(legacy)||!legacy.length){notice('В этом браузере нет старых задач для переноса');return}
  const existing=new Set(tasks.map(t=>t.source_key).filter(Boolean));
  const prepared=[],unmatched=[];
  for(const old of legacy){
    if(!old?.id||!old?.title||existing.has('legacy:'+old.id))continue;
    const owner=String(old.owner||'').toLowerCase().trim();
    const member=members.find(m=>owner&&[m.display_name.toLowerCase().trim(),m.email.toLowerCase().trim()].includes(owner));
    if(!member){unmatched.push(old.title);continue}
    prepared.push({source_key:'legacy:'+old.id,assigned_to:member.id,created_by:current.id,
      title:String(old.title).slice(0,220),details:String(old.note||''),
      scope:['ONVISUAL','Мультвселенная','Общее'].includes(old.scope)?old.scope:'ONVISUAL',
      category:'Общее',status:Object.keys(statuses).includes(old.status)?old.status:'new',
      due_at:/^\d{4}-\d{2}-\d{2}$/.test(old.due)?old.due:null});
  }
  if(!prepared.length){notice('Подходящих новых задач нет. Без совпадения имени исполнителя задачи не импортируются.');return}
  const answer=confirm('Перенести '+prepared.length+' задач? Пропущено: '+unmatched.length+
    '.\nПереносятся только задачи с точно совпавшим исполнителем.');
  if(!answer)return;
  const r=await db.from('hub_tasks').insert(prepared);
  if(r.error){notice('Не удалось импортировать: '+r.error.message,true);return}
  notice('Перенесено '+prepared.length+' задач. Пропущено: '+unmatched.length);
  await refresh();
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!db)return;
  loginMessage('Отправляем письмо…');
  const email=$('loginEmail').value.trim().toLowerCase();
  const r=await db.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/team.html'}});
  loginMessage(r.error?'Ошибка входа: '+r.error.message:'Если доступ выдан, проверьте почту: ссылка для входа отправлена.');
});
$('logout').addEventListener('click',()=>db?.auth.signOut());
$('sectionNav').addEventListener('click',e=>{
  const b=e.target.closest('[data-section]');if(b)navigate(b.dataset.section)
});
$('taskGrid').addEventListener('click',e=>{
  const save=e.target.closest('.task-save'),edit=e.target.closest('.task-edit');
  if(save)saveProgress(save.closest('.task-card'));
  if(edit)openTask(edit.dataset.id);
});
$('newTaskBtn').addEventListener('click',()=>openTask());
$('closeTask').addEventListener('click',()=>$('taskDialog').close());
$('cancelTask').addEventListener('click',()=>$('taskDialog').close());
$('taskForm').addEventListener('submit',saveTask);
$('inviteForm').addEventListener('submit',invite);
$('inviteRole').addEventListener('change',invitePreset);
$('memberList').addEventListener('click',e=>{const b=e.target.closest('.member-save');if(b)saveMember(b.closest('.member'))});
$('importTasks').addEventListener('click',importOldTasks);
invitePreset();initialize();
})();