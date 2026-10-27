import { timingSafeEqual } from 'node:crypto';

function fail(res, status, code, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({error:code, message});
}
function one(v){return Array.isArray(v)?v[0]:v}
function allow(req) {
  const secret=process.env.MEETINGS_SYNC_KEY||'';
  if(secret.length<20)return false;
  const authorization=String(req.headers.authorization||'');
  const key=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  const a=Buffer.from(secret,'utf8'),b=Buffer.from(key,'utf8');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function meetingUUID(uuid){
  if(typeof uuid!=='string'||uuid.length<5||uuid.length>250||!/^[A-Za-z0-9+/=_-]+$/.test(uuid))return null;
  // Zoom requires double-encoding when UUID begins with "/" or contains "//".
  let value=encodeURIComponent(uuid);
  if(uuid.startsWith('/')||uuid.includes('//'))value=encodeURIComponent(value);
  return value;
}
async function getZoomToken(){
  const {ZOOM_ACCOUNT_ID:account,ZOOM_CLIENT_ID:client,ZOOM_CLIENT_SECRET:secret}=process.env;
  if(!account||!client||!secret)throw Object.assign(new Error('Не настроены параметры OAuth Zoom в Vercel.'),{status:503,code:'zoom_not_configured'});
  const basic=Buffer.from(client+':'+secret).toString('base64');
  const url='https://zoom.us/oauth/token?grant_type=account_credentials&account_id='+encodeURIComponent(account);
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Basic '+basic,Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw Object.assign(new Error('Zoom не выдал токен. Проверь Activation и реквизиты в Vercel.'),{status:502,code:'zoom_token_failed'});
  return data.access_token;
}
async function zoomJson(url, token){
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error('Zoom API вернул '+r.status+': '+String(data.message||'Нет доступа к записи').slice(0,160)),{status:r.status===429?429:502,code:'zoom_api_error'});
  return data;
}
function safeRecordingFile(f){
  return {id:String(f.id||''),fileType:String(f.file_type||''),fileExtension:String(f.file_extension||''),recordingType:String(f.recording_type||'')};
}
function listing(m){
  const files=Array.isArray(m.recording_files)?m.recording_files:[];
  const video=files.find(f=>String(f.file_extension||'').toUpperCase()==='MP4'||String(f.file_type||'').toUpperCase()==='MP4');
  const transcript=files.find(f=>String(f.file_extension||'').toUpperCase()==='VTT'||String(f.recording_type||'').toLowerCase()==='audio_transcript');
  const play=video?.play_url||m.share_url||m.play_url||'';
  return {
    uuid:String(m.uuid||''),
    meetingId:String(m.id||''),
    title:String(m.topic||'Созвон Zoom').slice(0,160),
    startTime:String(m.start_time||''),
    duration:Number(m.duration||0),
    videoAvailable:!!video,
    transcriptAvailable:!!transcript,
    videoUrl:typeof play==='string'&&/^https:\/\/[^ ]+$/i.test(play)?play:'',
    files:files.filter(f=>['MP4','VTT'].includes(String(f.file_extension||'').toUpperCase())).map(safeRecordingFile)
  };
}
async function listRecordings(req,res,token){
  const host=process.env.ZOOM_HOST_EMAIL||'';
  if(!host)return fail(res,503,'zoom_host_missing','Укажи ZOOM_HOST_EMAIL в переменных Vercel.');
  const month=one(req.query.month);
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return fail(res,400,'invalid_month','Передай месяц YYYY-MM.');
  const [year,m]=month.split('-').map(Number);
  const from=month+'-01';
  const to=year+'-'+String(m).padStart(2,'0')+'-'+String(new Date(Date.UTC(year,m,0)).getUTCDate()).padStart(2,'0');
  const out=[];
  let cursor='';
  for(let page=0;page<8;page++){
    const url=new URL('https://api.zoom.us/v2/users/'+encodeURIComponent(host)+'/recordings');
    url.searchParams.set('from',from);
    url.searchParams.set('to',to);
    url.searchParams.set('page_size','100');
    if(cursor)url.searchParams.set('next_page_token',cursor);
    const data=await zoomJson(url.toString(),token);
    for(const meeting of data.meetings||[])out.push(listing(meeting));
    cursor=data.next_page_token||'';
    if(!cursor)break;
  }
  return res.status(200).json({month,count:out.length,meetings:out,hasMore:!!cursor});
}
async function transcript(req,res,token){
  const uuid=one(req.query.uuid);
  const encoded=meetingUUID(uuid);
  if(!encoded)return fail(res,400,'invalid_uuid','Некорректный идентификатор встречи.');
  const data=await zoomJson('https://api.zoom.us/v2/meetings/'+encoded+'/recordings',token);
  const files=Array.isArray(data.recording_files)?data.recording_files:[];
  const vtt=files.find(f=>String(f.file_extension||'').toUpperCase()==='VTT'||String(f.recording_type||'').toLowerCase()==='audio_transcript');
  if(!vtt?.download_url)return fail(res,404,'no_transcript','В Zoom пока нет VTT-расшифровки этой встречи.');
  // Never use an arbitrary incoming URL or Zoom response host to proxy internal network.
  let target;
  try{target=new URL(vtt.download_url)}catch{return fail(res,502,'invalid_zoom_url','Zoom вернул некорректную ссылку на файл.')}
  if(target.protocol!=='https:'||!/(^|\.)zoom\.us$/i.test(target.hostname))return fail(res,502,'unsafe_zoom_url','Ссылка на запись имеет неподдерживаемый домен.');
  const response=await fetch(target,{headers:{Authorization:'Bearer '+token},redirect:'follow'});
  if(!response.ok)return fail(res,502,'transcript_download_failed','Zoom не разрешил загрузить расшифровку ('+response.status+').');
  const max=2500000;
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>max)return fail(res,413,'transcript_too_large','Размер расшифровки превышает 2,5 МБ.');
  const reader=response.body?.getReader();
  if(!reader)return fail(res,502,'transcript_empty','Расшифровка пуста.');
  const pieces=[];let count=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    count+=value.length;
    if(count>max){await reader.cancel();return fail(res,413,'transcript_too_large','Размер расшифровки превышает 2,5 МБ.')}
    pieces.push(value);
  }
  const text=new TextDecoder('utf-8').decode(Buffer.concat(pieces.map(v=>Buffer.from(v))));
  return res.status(200).json({uuid,text});
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return fail(res,405,'method_not_allowed','Method not allowed');
  if(!process.env.MEETINGS_SYNC_KEY||process.env.MEETINGS_SYNC_KEY.length<20){
    return fail(res,503,'sync_key_missing','Сначала настрой MEETINGS_SYNC_KEY в Vercel (от 20 символов).');
  }
  if(!allow(req))return fail(res,401,'unauthorized','Неверный ключ синхронизации.');
  try{
    const token=await getZoomToken();
    const operation=one(req.query.operation)||'list';
    if(operation==='list')return await listRecordings(req,res,token);
    if(operation==='transcript')return await transcript(req,res,token);
    return fail(res,400,'invalid_operation','Неизвестная операция.');
  }catch(err){
    return fail(res,err.status||502,err.code||'zoom_error',err.message||'Сбой соединения с Zoom.');
  }
}
