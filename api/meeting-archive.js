import {createHmac} from 'node:crypto';
import {
  isAuthorized,safeEqual,readIndex,assignProject,
  transcriptRead,transcriptStore,fetchZoomTranscript,syncRange,ensureLocalMeeting,summaryRead,fetchZoomSummary,summaryStore
} from '../lib/zoom-archive.js';

const cookieName='ov_meetings_auth';
function err(res,status,message){
  res.setHeader('Cache-Control','private, no-store');
  return res.status(status).json({error:message});
}
function sign(value){
  return createHmac('sha256',process.env.MEETINGS_SYNC_KEY||'').update(value).digest('hex');
}
function cookies(req){
  const raw=String(req.headers.cookie||'').split(';').map(v=>v.trim());
  const x=raw.find(v=>v.startsWith(cookieName+'='));
  return x?x.slice(cookieName.length+1):'';
}
function authenticated(req){
  if(isAuthorized(req))return true;
  const key=process.env.MEETINGS_SYNC_KEY||'';
  if(key.length<20)return false;
  const v=cookies(req);
  if(!/^\d{10}\.[a-f0-9]{64}$/.test(v))return false;
  const [expire,sig]=v.split('.');
  if(Number(expire)<Date.now()/1000||Number(expire)>Date.now()/1000+15*86400)return false;
  return safeEqual(sig,sign(expire));
}
function one(v){return Array.isArray(v)?v[0]:v}
function validUUID(v){return typeof v==='string'&&v.length>4&&v.length<=240&&/^[a-zA-Z0-9_+=/\-]+$/.test(v)}
async function body(req){
  if(Number(req.headers['content-length']||0)>4000)throw new Error('Слишком большой запрос');
  return typeof req.body==='string'?JSON.parse(req.body):req.body||{};
}
function login(req,res){
  if(!isAuthorized(req))return err(res,401,'Неверный ключ подключения');
  const expire=String(Math.floor(Date.now()/1000+14*86400));
  const value=expire+'.'+sign(expire);
  res.setHeader('Set-Cookie',cookieName+'='+value+'; Path=/api/meeting-archive; HttpOnly; Secure; SameSite=Strict; Max-Age=1209600');
  return res.status(200).json({connected:true});
}
function cleanView(m){
  // Do not return any secret, raw download URL, or private Blob pathname.
  return {
    uuid:m.uuid,zoomId:m.zoomId,title:m.title,
    startTime:m.startTime,date:m.date,duration:m.duration,
    project:m.project||'',
    hasVideo:!!m.hasVideo,videoUrl:m.videoUrl||'',
    hasTranscript:!!m.hasTranscript,transcriptStored:!!m.transcriptStored,
    summaryStored:!!m.summaryStored,summaryDocUrl:m.summaryDocUrl||'',
    firstSeen:m.firstSeen,source:m.source||'zoom',
  };
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const action=one(req.query.action)||'list';
  if(req.method==='POST'&&action==='login')return login(req,res);
  if(!authenticated(req))return err(res,401,'Введите ключ архива Zoom для доступа к встречам');
  try{
    if(req.method==='GET'){
      if(action==='list'){
        const {records}=await readIndex();
        return res.status(200).json({meetings:records.map(cleanView),updatedAt:new Date().toISOString()});
      }
      if(action==='download'){
        const uuid=one(req.query.uuid),kind=one(req.query.kind);
        if(!validUUID(uuid)||!['transcript','summary'].includes(kind))return err(res,400,'Неверный файл');
        const {records}=await readIndex();
        const record=records.find(m=>m.uuid===uuid);
        if(!record)return err(res,404,'Встреча не найдена');
        const content=kind==='summary'?await summaryRead(uuid):await transcriptRead(uuid);
        if(!content)return err(res,404,'Файл ещё не получен от Zoom');
        const type=kind==='summary'?'text/markdown; charset=utf-8':content.startsWith('WEBVTT')?'text/vtt; charset=utf-8':'text/plain; charset=utf-8';
        const ext=kind==='summary'?'md':content.startsWith('WEBVTT')?'vtt':'txt';
        const name=(kind==='summary'?'Zoom_Summary_':'Zoom_Transcript_')+String(record.date||'meeting').replace(/[^0-9-]/g,'')+'.'+ext;
        res.setHeader('Content-Type',type);
        res.setHeader('Content-Disposition','attachment; filename="'+name+'"');
        return res.status(200).send(content);
      }
      if(action==='summary'){
        const uuid=one(req.query.uuid);
        if(!validUUID(uuid))return err(res,400,'Неверный UUID');
        const {records}=await readIndex();
        const record=records.find(m=>m.uuid===uuid);
        if(!record)return err(res,404,'Встреча не найдена');
        const content=await summaryRead(uuid);
        if(!content&&(record.source!=='local'||record.zoomSummaryUuid)){
          try{
            const summary=await fetchZoomSummary(record.zoomSummaryUuid||uuid);
            if(summary.content){
              await summaryStore(uuid,summary.content,summary.docUrl);
              return res.status(200).json({available:true,downloadUrl:'/api/meeting-archive?action=download&kind=summary&uuid='+encodeURIComponent(uuid)});
            }
          }catch(e){return err(res,404,'Резюме Zoom пока недоступно. Проверь разрешение meeting_summary:read:admin.')}
        }
        if(!content)return err(res,404,'Готового резюме этой встречи ещё нет');
        return res.status(200).json({available:true,downloadUrl:'/api/meeting-archive?action=download&kind=summary&uuid='+encodeURIComponent(uuid)});
      }
      if(action==='transcript'){
        const uuid=one(req.query.uuid);
        if(!validUUID(uuid))return err(res,400,'Некорректный UUID Zoom');
        const {records}=await readIndex();
        const record=records.find(m=>m.uuid===uuid);
        if(!record)return err(res,404,'Встреча отсутствует в архиве');
        if(!record.hasTranscript)return err(res,404,'Zoom ещё не создал текстовую расшифровку');
        let transcript=await transcriptRead(uuid);
        if(!transcript&&record.source!=='local'){
          transcript=await fetchZoomTranscript(uuid);
          if(transcript)await transcriptStore(uuid,transcript);
        }
        if(!transcript)return err(res,404,'Расшифровка пока обрабатывается в Zoom');
        return res.status(200).json({uuid,transcript});
      }
      return err(res,400,'Неизвестный запрос');
    }
    if(req.method!=='POST')return err(res,405,'Используй GET или POST');
    if(req.headers['x-onvisual-request']!=='1')return err(res,403,'Не хватает заголовка защиты запроса');
    // Files are uploaded only by an authenticated team member; no public file URL is created.
    if(action==='upload-transcript'){
      if(Number(req.headers['content-length']||0)>1_000_000)return err(res,413,'Файл слишком большой');
      const data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!data||typeof data.transcript!=='string'||Buffer.byteLength(data.transcript,'utf8')>800_000||!data.transcript.trim())
        return err(res,400,'Приложи TXT/VTT до 800 КБ');
      const uuid=String(data.uuid||'');
      if(!/^LOCAL[A-Z0-9]{10,35}$/.test(uuid))return err(res,400,'Неверный ID локальной записи');
      await ensureLocalMeeting({
        uuid,project:String(data.project||''),date:String(data.date||''),
        title:String(data.title||''),startTime:String(data.startTime||''),duration:Number(data.duration||0)
      });
      await transcriptStore(uuid,data.transcript);
      return res.status(200).json({ok:true,uuid,fileSaved:true});
    }
    // A private migration route for existing Zoom recordings that only existed on the PC.
    // Importers must have the integration's master bearer key; a browser cookie alone cannot overwrite transcripts.
    if(action==='import-local'){
      if(!isAuthorized(req))return err(res,403,'Требуется серверный ключ архива');
      if(Number(req.headers['content-length']||0)>850000)return err(res,413,'Текст слишком большой');
      const data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!data||typeof data.transcript!=='string'||!data.transcript.trim()||Buffer.byteLength(data.transcript,'utf8')>800000)
        return err(res,400,'Нужен текст расшифровки до 800 КБ');
      const uuid=String(data.uuid||'');
      if(!/^LOCAL[A-Z0-9]{10,35}$/.test(uuid))return err(res,400,'Неверный идентификатор локальной встречи');
      await ensureLocalMeeting({
        uuid,project:String(data.project||''),date:String(data.date||''),
        title:String(data.title||''),startTime:String(data.startTime||''),duration:Number(data.duration||0)
      });
      await transcriptStore(uuid,data.transcript);
      return res.status(200).json({ok:true,uuid,transcriptStored:true});
    }
    const data=await body(req);
    if(action==='assign'){
      const uuid=String(data.uuid||''),project=String(data.project||'');
      if(!validUUID(uuid)||!['ONVISUAL','Мультвселенная'].includes(project))return err(res,400,'Укажи проект и UUID встречи');
      const result=await assignProject(uuid,project);
      if(!result.exists)return err(res,404,'Встреча не найдена в облачном архиве');
      return res.status(200).json({ok:true,project,changed:result.changed});
    }
    if(action==='sync'){
      const month=String(data.month||'');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return err(res,400,'Месяц в формате YYYY-MM');
      const [year,m]=month.split('-').map(Number);
      const from=month+'-01';
      const last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
      // Do not query Zoom for dates after today, even when a future month was selected.
      const current=new Date().toISOString().slice(0,10);
      if(from>current)return err(res,400,'Нельзя синхронизировать будущие записи');
      const to=last<current?last:current;
      const outcome=await syncRange(from,to);
      const {records}=await readIndex();
      return res.status(200).json({synced:outcome,meetings:records.map(cleanView)});
    }
    return err(res,400,'Неизвестное действие');
  }catch(e){
    console.error('ONVISUAL Meeting Archive:',String(e?.message||e).slice(0,180));
    return err(res,503,'Не удалось получить или сохранить архив Zoom: '+String(e?.message||'').slice(0,160));
  }
}
