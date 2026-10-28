import {isPersonalHeading,isNonWorkStatement,cleanWorkParagraph} from './meeting-work-filter.js';
// Deterministic, evidence-first meeting report. Never invent speakers, decisions, dates or tasks.
const clean=s=>String(s??'').replace(/\r/g,'').replace(/<[^>]+>/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*_\x60]/g,'').replace(/\s+/g,' ').trim();
const itemRe=/^\s*(?:[-*•]\s*|\d+[.)]\s+)(?:\[[ xX]\]\s*)?/;
const key={
  overview:/обзор|резюме|кратк|summary|overview|главн|итоги|recap|ключев/i,
  tasks:/следующ|действи|задач|поручени|to.do|next.steps|action.items|дальнейш/i,
  decisions:/решени|договор|утвержд|согласован|decision|agreed/i,
  open:/открыт|вопрос|не решен|не решён|неясн|risk|риски|проблем|open.question/i
};
function category(title){
  for(const [k,re] of Object.entries(key))if(re.test(title))return k;
  return 'details';
}
function sectionize(md){
  const sections=[];let current={title:'',category:'overview',items:[],level:0};sections.push(current);
  let parent='';
  for(const raw of String(md||'').replace(/\r/g,'').slice(0,160000).split('\n')){
    const line=raw.trim();if(!line || /^-{3,}$/.test(line) || /^\*{3,}$/.test(line))continue;
    const h=line.match(/^(#{1,6})\s+(.+)/);
    if(h){
      const title=clean(h[2]),level=h[1].length;
      const cat=category(title);
      if(level<=2)parent=cat;
      current={title,level,category:cat==='details'&&level>=3?parent:cat,items:[]};
      sections.push(current);
      continue;
    }
    if(/^(?:[-*]\s*)?(?:Attendees|Participants|Участники)\s*:/i.test(line))continue;
    current.items.push({text:clean(line.replace(itemRe,'')),bullet:itemRe.test(line),raw:line});
  }
  return sections.filter(s=>s.items.length||s.title);
}
function unique(items,max=100){
  const seen=new Set(),out=[];
  for(const val of items){
    const s=clean(val);const id=s.toLocaleLowerCase('ru').replace(/[.,;:]/g,'');
    if(s.length<3||seen.has(id))continue;
    seen.add(id);out.push(s);if(out.length>=max)break;
  }
  return out;
}
function toGroups(sections){
 const details=[], overview=[], decisions=[], questions=[],taskSections=[];
 for(const sec of sections){
   if(isPersonalHeading(sec.title))continue;
   sec.items=sec.items.map(item=>({...item,text:cleanWorkParagraph(item.text)})).filter(item=>item.text&&!isNonWorkStatement(item.text));
   if(!sec.items.length)continue;
   if(sec.category==='tasks'){taskSections.push(sec);continue}
   if(sec.category==='decisions'){decisions.push(...sec.items.filter(x=>x.bullet||/решили|согласовал|утвердил|договорил/i.test(x.text)).map(x=>x.text));continue}
   if(sec.category==='open'){questions.push(...sec.items.map(x=>x.text));continue}
   if(sec.category==='overview'){overview.push(...sec.items.map(x=>x.text));continue}
   if(sec.items.length){
     const title=sec.title||'Дополнительные пояснения';
     details.push({title,paragraphs:sec.items.map(x=>({text:x.text,bullet:x.bullet}))});
   }
 }
 // Extract only explicitly agreed decisions from full sentences; a suggestion is not a decision.
 for(const detail of details){
   for(const paragraph of detail.paragraphs){
     const sentences=paragraph.text.match(/[^.!?]+[.!?]?/g)||[];
     for(const sentence of sentences){
       const statement=clean(sentence);
       if(isNonWorkStatement(statement))continue;
       if(/(?:согласились|согласилась|согласился|договорились|утвердили|приняли решение|решили)/i.test(statement)
        && !/не\s+(?:договорились|согласились|решили|утвердили)/i.test(statement))decisions.push(statement);
     }
   }
 }
 if(!overview.length && details.length)overview.push(...details[0].paragraphs.slice(0,3).map(x=>x.text));
 return {overview:unique(overview,12),details,decisions:unique(decisions,24),questions:unique(questions,30),taskSections};
}
const knownNames=['Дмитрий','Рита','Николай','Александр','Алексей','Зоя','Дима','Никита','Маргарита','Максим','Олег','Андрей','Елена','Ирина'];
function normalizePerson(s){
 const raw=clean(s).replace(/^[#:\s-]+|[:\s-]+$/g,'');
 const equivalents={'маргарита':'Рита','дима':'Дмитрий','николай':'Николай','nikolai':'Николай','dmitry':'Дмитрий','margarita':'Рита','alex':'Александр'};
 const mapped=equivalents[raw.toLowerCase()];
 if(mapped)return mapped;
 if(knownNames.some(n=>n.toLowerCase()===raw.toLowerCase()))return knownNames.find(n=>n.toLowerCase()===raw.toLowerCase());
 if(/^(команда|все|общие|everyone|team)$/i.test(raw))return 'Команда';
 if(/^(multi|mult|mult vselennaya)$/i.test(raw))return 'Организатор Zoom — имя не установлено';
 return '';
}
function splitTask(txt,headingOwner){
 let text=clean(txt);let owner=normalizePerson(headingOwner);
 // Zoom often presents "Nikolai: ...", "**Рита:** ...", or "Рита — ...".
 const start=text.match(/^([А-ЯЁа-яёA-Za-z]+(?:\s+[А-ЯЁа-яёA-Za-z]+)?)\s*(?::|—|-)\s*(.+)$/);
 if(start){
   const n=normalizePerson(start[1]);
   if(n){owner=n;text=start[2]}
 }
 const end=text.match(/^(.+?)\s*(?:—|-)\s*(Николай|Дмитрий|Рита|Маргарита|Nikolai|Dmitry|Margarita)\s*$/i);
 if(end){owner=normalizePerson(end[2])||owner;text=end[1]}
 let due='';
 const date=text.match(/(?:до|к|не позднее|срок|by|deadline)\s+(?:конца\s+дня\s+)?(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{1,2}\s+(?:числа|[а-яё]+)(?:\s+20\d{2})?|понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья)/i);
 if(date)due=clean(date[0]);
 return {title:text.slice(0,620),owner:owner||'Ответственный не указан',due};
}
function tasksFrom(sections){
 const tasks=[],seen=new Set();
 for(const sec of sections){
   let headingOwner=normalizePerson(sec.title);
   for(const item of sec.items){
     let text=item.text;
     if(!text||text.length<4||isNonWorkStatement(text))continue;
     if(!item.bullet&&/^(?:\*\*)?([А-ЯЁа-яёA-Za-z]+)(?:\*\*)?\s*:$/i.test(item.raw)){
       headingOwner=normalizePerson(item.raw.replace(/[:*]/g,''))||headingOwner;
       continue;
     }
     // Introductory statements are not actionable.
     if(!item.bullet&&!headingOwner)continue;
     let task=splitTask(text,headingOwner);
     if(!task.title||task.title.length<5)continue;
     const id=task.title.toLocaleLowerCase('ru').replace(/[.,;:]/g,'');
     if(seen.has(id))continue;
     seen.add(id);tasks.push(task);
   }
 }
 return tasks.slice(0,120);
}
function transcriptPeople(src){
 const lines=String(src||'').split(/\r?\n/),names=new Set();
 for(const line of lines.slice(0,2000)){
   const m=line.trim().match(/^(Дмитрий|Рита|Николай|Маргарита|Александр|Алексей|Зоя)\s*:/i);
   if(m)names.add(normalizePerson(m[1])||m[1]);
 }
 return Array.from(names);
}
function zoomParticipants(md){
  const found=String(md||'').match(/(?:Attendees|Participants|Участники)\s*:\s*([^\n]+)/i);
  if(!found)return [];
  return found[1].split(',').map(x=>clean(x.replace(/\([^)]*\)/g,'')))
    .filter(x=>x&&!/^(?:MULT VSELENNAYA|MULT|Zoom Meeting)$/i.test(x)).slice(0,20);
}
function printDate(iso){
 try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return clean(iso)}
}
export function buildMeetingReport(record,summary,transcript=''){
 const grouped=toGroups(sectionize(summary)),tasks=tasksFrom(grouped.taskSections);
 const speakers=transcriptPeople(transcript);
 const zoomAttendees=zoomParticipants(summary);
 const groups=new Map();
 for(const t of tasks){
   if(!groups.has(t.owner))groups.set(t.owner,[]);
   groups.get(t.owner).push(t);
 }
 const issues=grouped.questions;
 // A 1st-level agenda may be summarized without subheadings; don't silently discard.
 const details=grouped.details.length?grouped.details:[{title:'Содержание обсуждения',paragraphs:grouped.overview.map(x=>({text:x,bullet:false}))}];
 const hasTranscript=transcript.trim().length>100;
 return {
   title:record.title||'Созвон Zoom',project:record.project||'На распределение',
   date:record.date||'',when:printDate(record.startTime),
   overview:grouped.overview.filter(x=>!isNonWorkStatement(x)).slice(0,9),
   details:details.slice(0,45).map(d=>({...d,paragraphs:d.paragraphs.slice(0,100)})),
   decisions:grouped.decisions.filter(x=>!isNonWorkStatement(x)),
   tasks,taskGroups:Array.from(groups.entries()).map(([person,items])=>({person,items})),
   openQuestions:issues,
   speakers,zoomAttendees,hasTranscript,hasSummary:!!summary,
   hasVideo:!!(record.videoPath||record.videoUrl||record.hasVideo),
   uuid:record.uuid,
   evidence:'Итог составлен по оригинальному резюме Zoom'+(hasTranscript?' и проверен на наличие подписанных реплик в расшифровке.':' (дословная расшифровка отсутствует).'),
   disclaimer:'Сроки и ответственные приводятся только там, где они указаны в исходных материалах. Предложения не считаются утверждёнными решениями.',
 };
}
