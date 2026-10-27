import PdfPrinter from 'pdfmake';
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const fontData=require('pdfmake/build/vfs_fonts.js');
const vfs=fontData.pdfMake?.vfs||fontData;
const font=(name)=>{
  const data=vfs[name];
  if(typeof data!=='string')throw new Error('Встроенный шрифт PDF недоступен: '+name);
  return Buffer.from(data,'base64');
};

function clean(value){
  return String(value??'').replace(/\r/g,'').replace(/<[^>]*>/g,'').replace(/\[(.*?)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/[*_\x60]/g,'').trim();
}
function mdSections(source){
  const lines=String(source||'').slice(0,250000).split('\n');
  const out=[];let group=[];
  function flush(){
    if(!group.length)return;
    const text=clean(group.join(' '));
    if(text)out.push({text,style:'body',margin:[0,0,0,9]});
    group=[];
  }
  for(const line of lines){
    const x=line.trim();
    if(!x){flush();continue}
    const match=x.match(/^#{1,5}\s+(.+)$/);
    if(match){flush();out.push({text:clean(match[1]),style:x.startsWith('# ')?'heading':'subheading',margin:[0,8,0,7]});continue}
    const item=x.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if(item){flush();out.push({text:'•  '+clean(item[1]),style:'body',margin:[10,0,0,5]});continue}
    group.push(x);
  }
  flush();
  return out.length?out:[{text:'Документ пуст.',style:'body'}];
}
export async function renderMeetingPDF({date,title,project},source,label='Резюме Zoom'){
  const fonts={Roboto:{
    normal:font('Roboto-Regular.ttf'),bold:font('Roboto-Medium.ttf'),
    italics:font('Roboto-Italic.ttf'),bolditalics:font('Roboto-MediumItalic.ttf')
  }};
  const printer=new PdfPrinter(fonts);
  const parts=mdSections(source);
  const doc={
    pageSize:'A4',pageMargins:[51,65,51,55],
    defaultStyle:{font:'Roboto',fontSize:10.5,lineHeight:1.32,color:'#263142'},
    info:{title:label+' — '+(title||'ONVISUAL'),author:'ONVISUAL Hub',subject:label},
    header:()=>({margin:[51,27,51,0],columns:[
      {text:'ONVISUAL  /  ВСТРЕЧИ',font:'Roboto',fontSize:8.5,bold:true,color:'#67519c'},
      {text:date||'',alignment:'right',fontSize:8,color:'#8990a5'}]}),
    footer:(current,count)=>({margin:[51,0,51,20],columns:[
      {text:'Внутренний архив встреч · оригинальные данные Zoom',fontSize:7,color:'#8b95a4'},
      {text:current+' / '+count,alignment:'right',fontSize:7,color:'#8b95a4'}]}),
    content:[
      {text:label,fontSize:19,bold:true,color:'#231e3b',margin:[0,0,0,5]},
      {text:clean(title)||'Встреча',fontSize:12,bold:true,color:'#4d4665',margin:[0,0,0,8]},
      {text:clean(project||'На распределение')+'  ·  '+clean(date||''),fontSize:9,color:'#74738a',margin:[0,0,0,16]},
      {canvas:[{type:'line',x1:0,y1:0,x2:493,y2:0,lineWidth:1,lineColor:'#ded7ec'}],margin:[0,0,0,14]},
      ...parts
    ],
    styles:{
      heading:{fontSize:14,bold:true,color:'#392c60'},
      subheading:{fontSize:11.5,bold:true,color:'#44375c'},
      body:{fontSize:10.5}
    }
  };
  return await new Promise((resolve,reject)=>{
    const pdfDoc=printer.createPdfKitDocument(doc),chunks=[];
    let size=0;
    pdfDoc.on('data',x=>{size+=x.length;if(size>12e6){pdfDoc.destroy(new Error('PDF слишком большой'));return}chunks.push(x)});
    pdfDoc.on('end',()=>resolve(Buffer.concat(chunks)));
    pdfDoc.on('error',reject);
    pdfDoc.end();
  });
}


// The main deliverable for each meeting: a readable, evidence-based working brief.
// Zoom's untouched original summary stays available as a separate source document.
import {buildMeetingReport} from './meeting-report.js';
function reportParagraph(text){
 return {text:clean(text),fontSize:10.2,lineHeight:1.36,color:'#25293e',margin:[0,0,0,7]};
}
function reportBullet(text){
 return {columns:[{text:'•',width:13,bold:true,color:'#7551bb'},{text:clean(text),fontSize:10.1,color:'#263044',lineHeight:1.34}],margin:[0,0,0,7]};
}
function sectionHeading(number,name,subtitle=''){
 return {
  unbreakable:true,margin:[0,17,0,11],
  stack:[
   {columns:[{text:String(number).padStart(2,'0'),color:'#9876d0',fontSize:12,bold:true,width:37},{text:name.toUpperCase(),color:'#292145',fontSize:14,bold:true}]},
   ...(subtitle?[{text:subtitle,margin:[37,4,0,0],fontSize:9,color:'#818195'}]:[])
  ]
 };
}
function emptyState(txt){
 return {text:txt,color:'#828093',italics:true,fontSize:10,margin:[0,0,0,10]};
}
function webLink(name,url,note){
 return {margin:[0,2,0,11],stack:[
  {text:name,fontSize:10.6,bold:true,color:'#563891',link:url,decoration:'underline'},
  {text:note,fontSize:8.5,color:'#74748c',margin:[0,3,0,0]}
 ]};
}
export async function renderMainMeetingReport(meeting,summary,transcript){
 const report=buildMeetingReport(meeting,summary,transcript||'');
 const endpoint='https://onvisual-hub.vercel.app/api/meeting-archive?action=download&uuid='+encodeURIComponent(report.uuid||'');
 const content=[];
 const push=x=>content.push(x);
 push({columns:[
  {text:'ONVISUAL  /  MEETING INTELLIGENCE',fontSize:9,color:'#62468c',bold:true},
  {text:'ВНУТРЕННИЙ ДОКУМЕНТ',fontSize:8.5,color:'#8b879b',alignment:'right'}
 ],margin:[0,0,0,13]});
 push({text:'ИТОГИ ВСТРЕЧИ',fontSize:28,bold:true,color:'#261e40',margin:[0,0,0,6]});
 push({text:clean(report.title),fontSize:14.2,color:'#4e4070',margin:[0,0,0,10]});
 push({columns:[
  {width:'*',stack:[{text:'ПРОЕКТ',fontSize:8,color:'#858397',bold:true},{text:report.project,fontSize:11,bold:true,color:'#453468',margin:[0,4,0,0]}]},
  {width:'*',stack:[{text:'ДАТА И ВРЕМЯ',fontSize:8,color:'#858397',bold:true},{text:report.when,fontSize:10.2,color:'#353449',margin:[0,4,0,0]}]}
 ],margin:[0,0,0,14]});
 if(report.speakers.length)push({text:'Участники, определённые в расшифровке: '+report.speakers.join(', '),fontSize:9.3,color:'#55516b',margin:[0,0,0,9]});
 else push({text:'Список присутствовавших: не подтверждён исходными файлами',fontSize:9.2,color:'#79798c',italics:true,margin:[0,0,0,9]});
 push({canvas:[{type:'line',x1:0,y1:0,x2:490,y2:0,lineColor:'#a48bce',lineWidth:1.7}],margin:[0,0,0,12]});
 push({text:'КАК ЧИТАТЬ ЭТОТ ДОКУМЕНТ',fontSize:9,bold:true,color:'#675282',margin:[0,0,0,5]});
 push({text:'Сначала — главные выводы и содержание объяснений. Затем — согласованные решения, персональные задачи, открытые вопросы и следующие шаги. Формулировки сверяются с исходным резюме Zoom, неподтверждённые данные не додумываются.',fontSize:9.3,color:'#696276',lineHeight:1.32,margin:[0,0,0,12]});

 push(sectionHeading(1,'Главное за встречу','Быстрая выжимка для всех участников'));
 if(report.overview.length)for(const x of report.overview.slice(0,9))push(reportBullet(x));
 else push(emptyState('Содержание встречи пока не удалось кратко выделить из исходных материалов.'));

 push(sectionHeading(2,'Что объясняли и обсуждали','Темы, пояснения, примеры и договорённости по ходу разговора'));
 if(report.details.length){
  for(const topic of report.details){
   push({text:clean(topic.title)||'Обсуждение',fontSize:11.7,bold:true,color:'#4b386f',margin:[0,11,0,6],keepWithNext:true});
   for(const item of topic.paragraphs){
    if(item.bullet)push(reportBullet(item.text));
    else push(reportParagraph(item.text));
   }
  }
 }else push(emptyState('Подробные тематические разделы отсутствуют в резюме Zoom. См. полную расшифровку и видео, если они доступны.'));

 push(sectionHeading(3,'Что решили и согласовали','Подтверждённые решения — отдельно от обсуждавшихся идей'));
 if(report.decisions.length)for(const x of report.decisions)push(reportBullet(x));
 else push(emptyState('В исходном резюме решения не выделены как утверждённые. Не следует считать предложения окончательными договорённостями.'));

 push(sectionHeading(4,'Задачи по участникам','Что сделать, кто отвечает и какие сроки названы'));
 if(report.taskGroups.length){
  for(const group of report.taskGroups){
   push({text:group.person,fontSize:12.5,bold:true,color:'#4e367b',margin:[0,13,0,7],keepWithNext:true});
   group.items.forEach((task,idx)=>{
    const stack=[
     {text:(idx+1)+'.  '+clean(task.title),bold:true,fontSize:10.2,color:'#252638',lineHeight:1.3},
     {text:'Ответственный: '+group.person+'   |   Срок: '+(task.due||'не указан'),fontSize:8.7,color:'#706780',margin:[0,5,0,0]}
    ];
    push({stack,margin:[0,0,0,8],fillColor:idx%2===0?'#f7f5fa':'#fff',border:[false,false,false,false]});
   });
  }
 }else push(emptyState('Конкретные задачи в резюме Zoom не выделены. Ничего не назначено автоматически.'));

 push(sectionHeading(5,'Открытые вопросы','Что ещё требует уточнения или согласования'));
 if(report.openQuestions.length)for(const x of report.openQuestions)push(reportBullet(x));
 else push(emptyState('Отдельные открытые вопросы в исходных материалах не перечислены.'));

 push(sectionHeading(6,'Следующие шаги','Что проверяем и выполняем до следующей встречи'));
 if(report.tasks.length){
  for(const x of report.tasks.slice(0,8))push(reportBullet((x.owner!=='Ответственный не указан'?x.owner+': ':'')+x.title+(x.due?' ('+x.due+')':'')));
  if(report.tasks.length>8)push(reportParagraph('Остальные '+(report.tasks.length-8)+' задач(и) указаны полностью в разделе 4.'));
 }else push(emptyState('Следующие шаги не сформулированы в резюме Zoom.'));
 push(reportParagraph('Дата следующей встречи: в исходных материалах не подтверждена.'));

 push(sectionHeading(7,'Материалы встречи','Оригиналы хранятся в защищённом архиве ONVISUAL'));
 push(webLink('Оригинальное резюме Zoom — PDF',endpoint+'&kind=summary_pdf','Исходный документ Zoom без редакторского сокращения.'));
 if(report.hasTranscript)push(webLink('Полная расшифровка — TXT/VTT',endpoint+'&kind=transcript','Дословная запись речи. Доступна участникам с доступом к хабу.'));
 else push(emptyState('Полный файл расшифровки не получен или отсутствует в Zoom.'));
 push(webLink('Видео и карточка встречи','https://onvisual-hub.vercel.app/#meetings',report.hasVideo?'Видеозапись открывается в карточке встречи с учётом прав доступа.':'Видеозапись отсутствует или ещё не подтверждена.'));
 push({text:report.evidence,fontSize:8.4,color:'#858095',margin:[0,15,0,5]});
 push({text:report.disclaimer,fontSize:8.4,italics:true,color:'#858095'});

 const fonts={Roboto:{
  normal:font('Roboto-Regular.ttf'),bold:font('Roboto-Medium.ttf'),
  italics:font('Roboto-Italic.ttf'),bolditalics:font('Roboto-MediumItalic.ttf')
 }};
 const printer=new PdfPrinter(fonts);
 const doc={
  pageSize:'A4',pageMargins:[52,59,52,57],
  info:{title:'Итоги встречи — '+report.title,author:'ONVISUAL Hub',subject:'Протокол и задачи'},
  defaultStyle:{font:'Roboto',color:'#25283c',fontSize:10},
  header:()=>({margin:[52,25,52,0],columns:[
   {text:'ONVISUAL  /  МАТЕРИАЛЫ ВСТРЕЧ',color:'#8a79a8',fontSize:7.5,bold:true},
   {text:report.date,alignment:'right',color:'#8a79a8',fontSize:7.5}]}),
  footer:(p,total)=>({margin:[52,0,52,25],columns:[
   {text:'По материалам Zoom · внутренний документ',fontSize:7.3,color:'#9e96ad'},
   {text:p+' / '+total,alignment:'right',fontSize:7.3,color:'#9e96ad'}]}),
  content
 };
 return new Promise((resolve,reject)=>{
  const pdf=printer.createPdfKitDocument(doc),chunks=[];let length=0;
  pdf.on('data',buf=>{length+=buf.length;if(length>16e6)pdf.destroy(new Error('PDF слишком большой'));else chunks.push(buf)});
  pdf.on('error',reject);
  pdf.on('end',()=>resolve(Buffer.concat(chunks)));
  pdf.end();
 });
}
