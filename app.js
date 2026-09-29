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
