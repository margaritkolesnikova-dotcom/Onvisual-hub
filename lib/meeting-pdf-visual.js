import PdfPrinter from 'pdfmake';
import {createRequire} from 'node:module';
import {buildMeetingReport} from './meeting-report.js';

const require=createRequire(import.meta.url);
const stored=require('pdfmake/build/vfs_fonts.js');
const vfs=stored.pdfMake?.vfs||stored;
const font=n=>Buffer.from(vfs[n],'base64');
const C={
  ink:'#282138',sub:'#625972',muted:'#81798C',
  violet:'#7550AA',dark:'#302548',light:'#F5F1FA',pale:'#FBF9FD',
  line:'#E8E2F0',white:'#FFFFFF',warn:'#8B5463'
};
const plain=s=>String(s??'').replace(/\s+/g,' ').replace(/[*_\x60]/g,'').trim();
function sentences(s){
  const value=plain(s);
  if(!value)return [];
  return (value.match(/[^.!?]+(?:[.!?]+|$)/g)||[value])
    .map(plain).filter(x=>x.length>=15);
}
function unique(arr){
  const seen=new Set(),out=[];
  for(const s of arr){
    const value=plain(s),id=value.toLowerCase().replace(/[.,;:!?]/g,'');
    if(!value||seen.has(id))continue;
    seen.add(id);out.push(value);
  }
  return out;
}
function label(text,size=8,color=C.muted){
  return {text:String(text).toUpperCase(),fontSize:size,bold:true,color,characterSpacing:.6};
}
function smallP(text){
  return {text:plain(text),fontSize:9.8,color:C.ink,lineHeight:1.31};
}
function card(blocks,options={}){
  return {table:{widths:['*'],body:[[{stack:blocks,fillColor:options.background||C.pale,
    margin:options.padding||[15,13,15,13]}]]},
   layout:{hLineWidth:()=>.65,vLineWidth:()=>.65,hLineColor:()=>options.border||C.line,vLineColor:()=>options.border||C.line},
   margin:options.margin||[0,0,0,10]};
}
function listPoint(num,text){
 return {columns:[
   {width:25,text:String(num).padStart(2,'0'),fontSize:9.3,bold:true,color:C.violet,margin:[0,2,0,0]},
   {width:'*',text:plain(text),fontSize:9.9,color:C.ink,lineHeight:1.33}
 ],columnGap:3,margin:[0,0,0,8]};
}
function point(text){
 return {columns:[{text:'•',width:12,color:C.violet,bold:true,fontSize:11},{text:plain(text),color:C.ink,fontSize:9.8,lineHeight:1.32,width:'*'}],
  margin:[0,0,0,6]};
}
function section(n,title,subtitle){
 return {margin:[0,19,0,9],unbreakable:true,table:{widths:[42,'*'],body:[[
   {text:String(n).padStart(2,'0'),fontSize:16,bold:true,color:C.violet,margin:[0,1,0,0]},
   {stack:[{text:title,fontSize:17,bold:true,color:C.dark},
     {text:subtitle,fontSize:9,color:C.muted,margin:[0,4,0,0]}]}
 ]]},layout:'noBorders'};
}
function notice(text){
 return card([{text:plain(text),fontSize:9.7,color:C.sub,lineHeight:1.35}],{background:C.light});
}
function topicCard(topic,index){
  const title=plain(topic.title)||'Обсуждение';
  const lines=unique(topic.paragraphs.flatMap(p=>sentences(p.text)));
  if(!lines.length)return [];
  const blocks=[{columns:[
    {text:'ТЕМА '+String(index+1).padStart(2,'0'),width:78,fontSize:8.5,bold:true,color:C.violet},
    {text:title,width:'*',bold:true,fontSize:11.3,color:C.dark}
   ],margin:[0,0,0,9]}];
  for(const line of lines)blocks.push(point(line));
  return card(blocks,{padding:[14,12,14,9],background:C.pale,margin:[0,0,0,9]});
}
function decisionsSection(report){
 if(!report.decisions.length)return notice('Отдельных утверждённых решений исходный документ не содержит. Предложения и идеи не записываем как согласованные договорённости.');
 return report.decisions.map((x,i)=>card([{
  columns:[{width:28,text:String(i+1).padStart(2,'0'),fontSize:12,bold:true,color:C.violet},
   {width:'*',text:plain(x),fontSize:10,color:C.ink,lineHeight:1.3}]
 }],{padding:[12,11,12,8],background:C.white,margin:[0,0,0,7]}));
}
function taskTable(group){
 const rows=[[{text:'№',style:'th'},{text:'ЗАДАЧА / ЧТО НУЖНО СДЕЛАТЬ',style:'th'},{text:'СРОК',style:'th'}]];
 group.items.forEach((task,i)=>{
  const bg=i%2===0?C.pale:C.white;
  rows.push([
   {text:String(i+1).padStart(2,'0'),fontSize:9,bold:true,color:C.violet,fillColor:bg,margin:[0,5,0,5]},
   {text:plain(task.title),fontSize:9.2,lineHeight:1.35,color:C.ink,fillColor:bg,margin:[0,5,1,5]},
   {text:task.due||'Не указан',fontSize:8.4,color:task.due?C.ink:C.muted,fillColor:bg,margin:[0,5,0,5]}
  ]);
 });
 return {stack:[
  {columns:[
    {width:'*',text:group.person,fontSize:12.2,bold:true,color:C.dark},
    {text:group.items.length+' '+(group.items.length===1?'задача':'задач(и)'),fontSize:9,color:C.muted,alignment:'right'}
   ],margin:[0,0,0,7]},
  {table:{headerRows:1,dontBreakRows:true,widths:[26,'*',79],body:rows},
   layout:{hLineWidth:(i)=>i===0?0:.6,vLineWidth:()=>0,
    hLineColor:()=>C.line,paddingTop:()=>5,paddingBottom:()=>5,
    paddingLeft:(i)=>i===1?8:7,paddingRight:()=>7}}
 ],margin:[0,7,0,15]};
}
function related(name,url,desc,available=true){
 return card([
   {columns:[
    {text:'↗',width:24,fontSize:14,bold:true,color:C.violet},
    {width:'*',stack:[
      {text:name,fontSize:10.4,bold:true,color:available?C.violet:C.sub,link:available?url:undefined,decoration:available?'underline':undefined},
      {text:desc,fontSize:8.7,color:C.muted,margin:[0,4,0,0]}
     ]}
   ]}
 ],{background:C.white,padding:[12,9,12,9],margin:[0,0,0,7]});
}
function pdfMeta(report){
 const attendees=report.speakers.length?report.speakers:report.zoomAttendees||[];
 return [
  {text:'ПРОЕКТ',width:56,fontSize:8,bold:true,color:C.muted},
  {text:plain(report.project||'На распределение'),width:'*',fontSize:10,bold:true,color:C.dark},
  {text:'ДАТА / ВРЕМЯ',width:78,fontSize:8,bold:true,color:C.muted},
  {text:plain(report.when),width:150,fontSize:9.4,color:C.ink}
 ];
}
export async function renderVisualMeetingReport(record,summary,transcript=''){
 const r=buildMeetingReport(record,summary,transcript||'');
 const sections=[];
 const push=x=>sections.push(x);
 const endpoint='https://onvisual-hub.vercel.app/api/meeting-archive?action=download&uuid='+encodeURIComponent(r.uuid||'');
 const haveSubstance=!!(r.overview.length||r.details.some(x=>x.paragraphs.length)||r.tasks.length);
 // Main title is an actual document cover, not a wall of explanatory prose.
 push({table:{widths:['*'],body:[[{fillColor:C.dark,margin:[20,16,20,15],stack:[
   {text:'ONVISUAL  /  ПРОТОКОЛ ВСТРЕЧИ',fontSize:8.5,bold:true,color:'#D4BDF2',characterSpacing:1.1,margin:[0,0,0,12]},
   {text:'ИТОГИ ВСТРЕЧИ',fontSize:25,bold:true,color:C.white,margin:[0,0,0,7]},
   {text:plain(r.title),fontSize:12.2,color:'#EDE4F9',margin:[0,0,0,0]}
 ]}]]},layout:'noBorders',margin:[0,0,0,12]});
 push({columns:pdfMeta(r),columnGap:5,margin:[0,1,0,10]});
 const attendee=r.speakers.length?r.speakers:(r.zoomAttendees||[]);
 push({columns:[
   {text:'УЧАСТНИКИ',width:72,fontSize:8,bold:true,color:C.muted},
   {text:attendee.length?attendee.join(', '):'Не подтверждены исходными файлами',width:'*',fontSize:9.8,color:C.sub}
  ],margin:[0,0,0,11]});
 const counts=[
  ['ТЕМЫ',String(r.details.filter(x=>x.paragraphs.length).length||r.overview.length)],
  ['ЗАДАЧИ',String(r.tasks.length)],
  ['РЕШЕНИЯ',String(r.decisions.length)]
 ];
 push({table:{widths:['*','*','*'],body:[[...counts.map(([name,value])=>({
   fillColor:C.light,margin:[11,9,11,9],stack:[label(name,7.9,C.violet),{text:value,fontSize:19,bold:true,color:C.dark,margin:[0,4,0,0]}]
 }))]]},layout:{hLineWidth:()=>0,vLineWidth:(i)=>i===0||i===3?0:2,vLineColor:()=>C.white},
 margin:[0,0,0,15]});
 if(!haveSubstance)push(notice('Недостаточно содержательных данных Zoom. Пока готов только каркас отчёта; сведения о решениях и задачах не добавлены по предположениям.'));
 // 1. Short factual scan of original summary, with individual sentences rather than one huge paragraph.
 push(section(1,'Главное за встречу','Ключевые мысли и выводы — можно прочитать за минуту'));
 let highlights=unique(r.overview.flatMap(sentences)).filter(x=>x.length>=24);
 if(highlights.length>8)highlights=highlights.slice(0,8);
 if(highlights.length){
  push(card(highlights.map((x,i)=>listPoint(i+1,x)),{background:C.light,padding:[14,13,13,7]}));
 }else push(notice('Главные тезисы не выделены в доступном резюме Zoom.'));
 // 2. Teaching/content part — true topical digest, not raw concatenated paragraphs.
 push(section(2,'Что объяснили','Разбор тем, примеров и обсуждений, с которыми нужно ознакомиться'));
 let realTopics=r.details.filter(x=>x.paragraphs.length);
 if(realTopics.length)realTopics.forEach((topic,i)=>push(topicCard(topic,i)));
 else push(notice('Подробных тематических объяснений в доступном материале нет.'));
 // 3. Agreed commitments only.
 push(section(3,'Что решили','Фиксируем только договорённости, явно указанные в Zoom'));
 for(const x of decisionsSection(r))push(x);
 // 4. Task responsibility matrix with all tasks.
 push(section(4,'Задачи по участникам','Ответственный → конкретное действие → срок'));
 if(r.taskGroups.length){
  for(const group of r.taskGroups)push(taskTable(group));
  push({text:'Если срок отсутствует — Zoom его не зафиксировал. Исполнитель не назначается по догадке.',fontSize:8.8,color:C.muted,margin:[0,0,0,8]});
 }else push(notice('Из исходного материала не удалось выделить конкретные задачи.'));
 // 5. Open issues are separate from decisions.
 push(section(5,'Открытые вопросы','Что осталось уточнить или согласовать'));
 if(r.openQuestions.length){
  for(const [i,x] of r.openQuestions.entries())push(listPoint(i+1,x));
 }else push(notice('Отдельные открытые вопросы в резюме Zoom не перечислены.'));
 // 6. Make next actions actionable without rewriting deadlines.
 push(section(6,'Следующие шаги','Что проверить и выполнить после созвона'));
 if(r.tasks.length){
  for(const [i,t] of r.tasks.slice(0,10).entries())
   push(listPoint(i+1,(t.owner!=='Ответственный не указан'?t.owner+': ':'')+t.title+(t.due?' · '+t.due:'')));
  if(r.tasks.length>10)push({text:'Остальные '+(r.tasks.length-10)+' задач(и) — в разделе 4.',fontSize:9.2,color:C.sub,margin:[0,2,0,7]});
 }else push(notice('Следующие шаги явно не указаны в резюме Zoom.'));
 // 7. Source references.
 push(section(7,'Материалы встречи','Оригинальные файлы в защищённом архиве ONVISUAL'));
 push(related('Оригинал Zoom Summary.pdf',endpoint+'&kind=summary_pdf','Исходное резюме без редакторских сокращений.'));
 push(related('Полная расшифровка TXT / VTT',endpoint+'&kind=transcript',r.hasTranscript?'Полные реплики доступны в исходном файле.':'Расшифровка пока отсутствует.',r.hasTranscript));
 push(related('Видео и карточка встречи','https://onvisual-hub.vercel.app/#meetings',r.hasVideo?'Просмотр с учётом прав доступа к архиву.':'Доступность видео не подтверждена.',true));
 push({text:r.evidence+' '+r.disclaimer,fontSize:8.3,color:C.muted,lineHeight:1.3,margin:[0,12,0,0]});
 const fonts={Roboto:{normal:font('Roboto-Regular.ttf'),bold:font('Roboto-Medium.ttf'),italics:font('Roboto-Italic.ttf'),bolditalics:font('Roboto-MediumItalic.ttf')}};
 const printer=new PdfPrinter(fonts);
 const doc={
  pageSize:'A4',pageMargins:[46,58,46,51],
  info:{title:'Итоги встречи — '+r.title,author:'ONVISUAL Hub',subject:'Понятные итоги, объяснения, решения и задачи'},
  defaultStyle:{font:'Roboto',fontSize:10,color:C.ink},
  header:()=>({columns:[
   {text:'ONVISUAL  /  ВСТРЕЧИ',fontSize:7.7,bold:true,color:C.violet},
   {text:r.date,fontSize:7.7,color:C.muted,alignment:'right'}
  ],margin:[46,27,46,0]}),
  footer:(pg,total)=>({columns:[
   {text:'Итоги созвона · по исходным материалам Zoom',fontSize:7.3,color:C.muted},
   {text:pg+' / '+total,fontSize:7.3,color:C.muted,alignment:'right'}
  ],margin:[46,0,46,25]}),
  styles:{th:{fontSize:8,bold:true,color:C.white,fillColor:C.dark,margin:[0,5,0,5]}},
  content:sections
 };
 return await new Promise((resolve,reject)=>{
  let sum=0;const buffers=[],stream=printer.createPdfKitDocument(doc);
  stream.on('data',chunk=>{sum+=chunk.length;if(sum>16000000)stream.destroy(new Error('Слишком большой PDF'));else buffers.push(chunk)});
  stream.on('end',()=>resolve(Buffer.concat(buffers)));stream.on('error',reject);stream.end();
 });
}
