import {isPersonalHeading,isNonWorkStatement,cleanWorkParagraph} from './meeting-work-filter.js';
function normal(s){
 return String(s||'').replace(/\[(.*?)\]\([^)]+\)/g,'$1').replace(/[*_\x60]/g,'').replace(/\s+/g,' ').trim();
}
function sectionBlocks(md){
 const result=new Map();let section='';let owner='';
 for(const raw of String(md||'').split(/\r?\n/)){
  const line=raw.trim(),h=line.match(/^(#{1,5})\s+(.+)/);
  if(h){if(h[1].length<=2){section=normal(h[2]).toLowerCase();owner=''}else if(/следующие шаги|задачи|действия|next steps|action items/i.test(section)){owner=normal(h[2])}continue}
  if(!line)continue;
  if(!result.has(section))result.set(section,[]);
  result.get(section).push({line,owner});
 }
 return result;
}
function trimSentences(text,max=3){
 const sentences=normal(text).split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/).map(cleanWorkParagraph).filter(x=>x.length>18&&!isNonWorkStatement(x));
 return sentences.slice(0,max).join(' ').slice(0,660);
}
export function meetingBrief(markdown){
 const blocks=sectionBlocks(markdown),overview=[],decisions=[],tasks=[],seen=new Set();
 let overviewText='';
 for(const [title,lines] of blocks){
  if(isPersonalHeading(title))continue;
  if(/резюме|обзор|итоги|summary|overview/.test(title)&&!overviewText){
    overviewText=lines.filter(v=>!/^[-*]\s/.test(v.line)).map(v=>v.line).join(' ');
  }
  if(/решени|договорил|принят|decision/.test(title)){
    for(const item of lines)if(/^(?:[-*]|\d+\.)\s/.test(item.line)){const t=normal(item.line.replace(/^(?:[-*]|\d+\.)\s+/,''));if(t&&!isNonWorkStatement(t))decisions.push(t)}
  }
  if(/следующие шаги|задачи|действия|next steps|action items/i.test(title)){
    for(const item of lines){
      const m=item.line.match(/^(?:[-*]|\d+\.)\s+(.+)/);
      if(!m)continue;
      const text=normal(m[1]).replace(/^[\[\] ]+/,'').slice(0,290);
      if(!text||isNonWorkStatement(text)||seen.has(text.toLowerCase()))continue;
      seen.add(text.toLowerCase());
      let owner=item.owner.replace(/^MULT$/i,'Команда').replace(/^Nikolai$/i,'Николай').replace(/^Margarita$/i,'Рита').slice(0,60);
      tasks.push({title:text,owner,due:''});
    }
  }
 }
 const allWork=Array.from(blocks.entries()).filter(([heading])=>!isPersonalHeading(heading)).flatMap(([,items])=>items.map(x=>cleanWorkParagraph(x.line))).filter(Boolean);
 const brief=trimSentences(overviewText||allWork.slice(0,8).join(' '),3);
 return {
  overview:brief||'Готовое резюме Zoom пока не содержит краткого описания.',
  decisions:decisions.slice(0,5),
  tasks:tasks.slice(0,14),
  source:'zoom_summary',
  note:decisions.length?'Выделены явно сформулированные решения.':'Отдельные решения в исходном резюме не выделены — см. следующие шаги.'
 };
}
