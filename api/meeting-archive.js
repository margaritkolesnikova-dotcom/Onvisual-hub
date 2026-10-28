import {renderVisualMeetingReport} from '../lib/meeting-pdf-visual.js';
import {renderMeetingPDF,renderMainMeetingReport} from '../lib/meeting-pdf.js';
import {meetingBrief} from '../lib/meeting-brief.js';
import {createHmac} from 'node:crypto';
import {
  isAuthorized,safeEqual,readIndex,assignProject,
  transcriptRead,transcriptStore,fetchZoomTranscript,syncRange,ensureLocalMeeting,summaryRead,fetchZoomSummary,summaryStore,storedFiles,createPrivateVideoUpload,getPrivateVideoLink,savePrivateVideoPath,deleteMeetingFromArchive,isPermanentlyDeleted
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
async function viewWithFileStatus(m){
  const v=cleanView(m);
  const files=await storedFiles(m.uuid,m.videoPath);
  v.transcriptStored=v.transcriptStored||files.transcript;
  v.summaryStored=v.summaryStored||files.summary;
  v.privateVideoStored=files.video;
  return v;
}
async function visibleArchive(records){
  const statuses=await Promise.all(records.map(async record=>({
    record,
    deleted:!!record.deletedAt||await isPermanentlyDeleted(record.uuid)||
      (record.zoomSummaryUuid?await isPermanentlyDeleted(record.zoomSummaryUuid):false)
  })));
  const active=statuses.filter(x=>!x.deleted).map(x=>x.record);
  const deletedUuids=[...new Set(statuses.filter(x=>x.deleted)
    .flatMap(x=>[x.record.uuid,x.record.zoomSummaryUuid].filter(Boolean)))];
  return {meetings:await Promise.all(active.map(viewWithFileStatus)),deletedUuids};
}
async function visibleRecord(records,uuid){
  const record=await visibleRecord(records,uuid);
  if(!record||await isPermanentlyDeleted(uuid)||
   (record.zoomSummaryUuid&&await isPermanentlyDeleted(record.zoomSummaryUuid)))return null;
  return record;
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
        return res.status(200).json({...await visibleArchive(records),updatedAt:new Date().toISOString()});
      }
      if(action==='brief'){
        const uuid=one(req.query.uuid);
        if(!validUUID(uuid))return err(res,400,'Некорректный UUID');
        const {records}=await readIndex();
        const item=await visibleRecord(records,uuid);
        if(!item)return err(res,404,'Встреча отсутствует в архиве');
        const text=await summaryRead(uuid);
        if(!text)return err(res,404,'Готового резюме Zoom пока нет');
        return res.status(200).json(meetingBrief(text));
      }
      if(action==='video-link'){
        const uuid=one(req.query.uuid);
        if(!validUUID(uuid))return err(res,400,'Некорректный UUID');
        const {records}=await readIndex();
        const meeting=await visibleRecord(records,uuid);
        if(!meeting)return err(res,404,'Встреча не найдена');
        const privateVideo=await getPrivateVideoLink(uuid,meeting.videoPath);
        if(privateVideo)return res.status(200).json({source:'private',...privateVideo});
        // Zoom sharing rules still apply to external viewers.
        if(meeting.videoUrl&&/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//i.test(meeting.videoUrl))
          return res.status(200).json({source:'zoom',url:meeting.videoUrl});
        return err(res,404,'Видеофайл не загружен в общий архив и недоступен в облаке Zoom');
      }
      if(action==='download'){
        const uuid=one(req.query.uuid),kind=one(req.query.kind);
        if(!validUUID(uuid)||!['transcript','summary','summary_pdf','report_pdf'].includes(kind))return err(res,400,'Неверный файл');
        const {records}=await readIndex();
        const record=await visibleRecord(records,uuid);
        if(!record)return err(res,404,'Встреча не найдена');
        const content=(kind==='summary'||kind==='summary_pdf'||kind==='report_pdf')?await summaryRead(uuid):await transcriptRead(uuid);
        if(!content)return err(res,404,'Исходный материал ещё не получен от Zoom');
        if(kind==='report_pdf'){
          const transcript=await transcriptRead(uuid).catch(()=>null);
          const data=await renderVisualMeetingReport(record,content,transcript||'');
          res.setHeader('Content-Type','application/pdf');
          res.setHeader('Content-Length',String(data.length));
          const when=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(record.startTime||Date.now())).replace(/\D/g,'');
          const file='Itogi_vstrechi_'+String(record.date||'meeting').replace(/[^0-9-]/g,'')+'_'+when+'.pdf';
          res.setHeader('Content-Disposition','inline; filename="'+file+'"');
          return res.status(200).send(data);
        }
        if(kind==='summary_pdf'){
          const data=await renderMeetingPDF(record,content);
          const file='Zoom_Summary_'+String(record.date||'meeting').replace(/[^0-9-]/g,'')+'.pdf';
          res.setHeader('Content-Type','application/pdf');
          res.setHeader('Content-Length',String(data.length));
          res.setHeader('Content-Disposition','inline; filename="'+file+'"');
          return res.status(200).send(data);
        }
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
        const record=await visibleRecord(records,uuid);
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
        const record=await visibleRecord(records,uuid);
        if(!record)return err(res,404,'Встреча отсутствует в архиве');
        // A retained AI Meeting Summary transcript can exist without a Zoom MP4 recording.
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
    if(action==='video-confirm'){
      const data=await body(req);
      const uuid=String(data.uuid||'');
      if(!validUUID(uuid))return err(res,400,'Некорректная встреча');
      const stored=await savePrivateVideoPath(uuid,String(data.pathname||''));
      return res.status(200).json({ok:true,linked:stored.result?.ok===true});
    }
    if(action==='video-upload-url'){
      const requestData=await body(req);
      const uuid=String(requestData.uuid||'');
      if(!validUUID(uuid))return err(res,400,'Укажи корректную встречу');
      const {records}=await readIndex();
      if(!(await visibleRecord(records,uuid)))return err(res,404,'Встреча отсутствует в закрытом архиве');
      const result=await createPrivateVideoUpload(uuid,Number(requestData.size));
      return res.status(200).json(result);
    }
    // Files are uploaded only by an authenticated team member; no public file URL is created.
    if(action==='upload-transcript'){
      if(Number(req.headers['content-length']||0)>1_000_000)return err(res,413,'Файл слишком большой');
      const data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
      if(!data||typeof data.transcript!=='string'||Buffer.byteLength(data.transcript,'utf8')>800_000||!data.transcript.trim())
        return err(res,400,'Приложи TXT/VTT до 800 КБ');
      const uuid=String(data.uuid||'');
      if(!validUUID(uuid))return err(res,400,'Неверный ID встречи');
      if(/^LOCAL[A-Z0-9]{10,35}$/.test(uuid)){
        await ensureLocalMeeting({
          uuid,project:String(data.project||''),date:String(data.date||''),
          title:String(data.title||''),startTime:String(data.startTime||''),duration:Number(data.duration||0)
        });
      }else{
        // An old manually filed meeting may already be matched to its
        // original Zoom AI Summary UUID. Attach its full TXT to that record.
        const {records}=await readIndex();
        if(!records.some(m=>m.uuid===uuid))return err(res,404,'Встреча не найдена в закрытом архиве');
      }
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
    if(action==='delete'){
      const uuid=String(data.uuid||'');
      if(!validUUID(uuid))return err(res,400,'Некорректный идентификатор встречи');
      const outcome=await deleteMeetingFromArchive(uuid);
      if(!outcome.exists)return err(res,404,'Встреча отсутствует в архиве');
      return res.status(200).json({deleted:outcome.deleted,uuid});
    }
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
      return res.status(200).json({synced:outcome,...await visibleArchive(records)});
    }
    return err(res,400,'Неизвестное действие');
  }catch(e){
    console.error('ONVISUAL Meeting Archive:',String(e?.message||e).slice(0,180));
    return err(res,503,'Не удалось получить или сохранить архив Zoom: '+String(e?.message||'').slice(0,160));
  }
}
