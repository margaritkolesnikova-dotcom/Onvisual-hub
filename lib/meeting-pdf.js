import PdfPrinter from 'pdfmake';
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const packageRoot=path.dirname(require.resolve('pdfmake/package.json'));
const font=(weight)=>path.join(packageRoot,'fonts','Roboto',weight);

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
