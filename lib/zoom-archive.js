import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put } from '@vercel/blob';

const INDEX_PATH='onvisual/meetings/zoom-index.json';
const PROJECTS=new Set(['ONVISUAL','Мультвселенная']);
const blobOptions={access:'private'};
export const projectName = x => PROJECTS.has(x)?x:'';
export function safeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function isAuthorized(req){
  const expected=process.env.MEETINGS_SYNC_KEY||'';
  const auth=req.headers.authorization||'';
  const supplied=auth.startsWith('Bearer ')?auth.slice(7):'';
  return expected.length>=20&&safeEqual(expected,supplied);
}
const clean=v=>String(v??'').slice(0,240);
const uuidKey=uuid=>createHash('sha256').update(uuid).digest('hex');
function dateUTC(value){return typeof value==='string'?value.slice(0,10):''}
async function json(blob){
  const result=await new Response(blob.stream).text();
  return JSON.parse(result);
}
export async function readIndex(){
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('BLOB_READ_WRITE_TOKEN отсутствует');
  const obj=await get(INDEX_PATH,blobOptions);
  if(!obj)return {records:[],etag:null};
  const parsed=await json(obj);
  return {records:Array.isArray(parsed.meetings)?parsed.meetings:[],etag:obj.blob.etag};
}
async function mutate(fn){
  for(let attempt=0;attempt<5;attempt++){
    const {records,etag}=await readIndex();
    const working=records.map(v=>({...v}));
    const output=await fn(working);
    if(!output.changed)return {meetings:working,result:output.result,changed:false};
    const jsonData=JSON.stringify({version:1,updatedAt:new Date().toISOString(),meetings:working});
    try{
      await put(INDEX_PATH,jsonData,{
        ...blobOptions,contentType:'application/json',addRandomSuffix:false,
        ...(etag?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:false}),
        cacheControlMaxAge:60,
      });
      return {meetings:working,result:output.result,changed:true};
    }catch(err){
      if(!/precondition|already exists|conflict|412|409/i.test(String(err?.message||err)))throw err;
    }
  }
  throw new Error('Конфликт сохранения данных — повтори действие.');
}
function safeFile(f){
  const type=clean(f.file_type||f.file_extension||'').toUpperCase();
  return {id:clean(f.id),type,recordingType:clean(f.recording_type)};
}
export function normalizeZoomMeeting(m){
  const files=Array.isArray(m.recording_files)?m.recording_files:[];
  const mp4=files.find(f=>String(f.file_type||f.file_extension).toUpperCase()==='MP4');
  const vtt=files.find(f=>String(f.file_extension||'').toUpperCase()==='VTT'||f.recording_type==='audio_transcript');
  if(!m.uuid||!m.start_time)return null;
  const play=String(mp4?.play_url||m.share_url||'');
  let videoUrl='';
  try{const u=new URL(play);if(u.protocol==='https:'&&/(^|\.)zoom\.us$/i.test(u.hostname))videoUrl=play}catch{}
  return {
    uuid:clean(m.uuid),zoomId:clean(m.id),title:clean(m.topic)||'Zoom Meeting',
    startTime:clean(m.start_time),date:dateUTC(m.start_time),duration:Number(m.duration||0),
    project:'',videoUrl,hasVideo:!!mp4,hasTranscript:!!vtt,
    transcriptStored:false,files:files.map(safeFile).filter(f=>f.type==='MP4'||f.type==='VTT'),
    firstSeen:new Date().toISOString(),
  };
}
export async function updateIndexFromZoom(items){
  const valid=items.map(normalizeZoomMeeting).filter(Boolean);
  return mutate(async working=>{
    const map=new Map(working.map((m,i)=>[m.uuid,i]));let count=0;
    for(const entry of valid){
      const idx=map.get(entry.uuid);
      if(idx===undefined){map.set(entry.uuid,working.length);working.push(entry);count++;continue}
      const old=working[idx];
      const props=['title','startTime','date','duration','hasVideo','hasTranscript','videoUrl','files'];
      let changed=false;
      for(const k of props){
        if(k==='videoUrl'&&!entry.videoUrl)continue;
        if((k==='hasVideo'||k==='hasTranscript')&&!entry[k])continue;
        if(JSON.stringify(old[k])!==JSON.stringify(entry[k])){old[k]=entry[k];changed=true}
      }
      if(changed)count++;
    }
    working.sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime)));
    return {changed:count>0,result:{updated:count,inserted:valid.length}};
  });
}
export async function assignProject(uuid,project){
  if(!PROJECTS.has(project)||!uuid)return {changed:false,exists:false};
  const result=await mutate(async working=>{
    const item=working.find(m=>m.uuid===uuid);
    if(!item)return {changed:false,result:{exists:false}};
    if(item.project===project)return {changed:false,result:{exists:true}};
    item.project=project;
    return {changed:true,result:{exists:true}};
  });
  return {changed:result.changed,exists:result.result?.exists===true};
}
export async function transcriptStore(uuid,content){
  if(!uuid||typeof content!=='string'||!content.length)return false;
  const filePath='onvisual/meetings/transcripts/'+uuidKey(uuid)+'.vtt';
  await put(filePath,content,{
    ...blobOptions,allowOverwrite:true,addRandomSuffix:false,
    contentType:'text/vtt; charset=utf-8',cacheControlMaxAge:60,
  });
  await mutate(async working=>{
    const meeting=working.find(m=>m.uuid===uuid);
    if(!meeting||meeting.transcriptStored)return {changed:false};
    meeting.transcriptStored=true;meeting.hasTranscript=true;
    return {changed:true};
  });
  return true;
}
export async function transcriptRead(uuid){
  const blob=await get('onvisual/meetings/transcripts/'+uuidKey(uuid)+'.vtt',blobOptions);
  if(!blob)return null;
  const text=await new Response(blob.stream).text();
  return text.length>2_500_000?text.slice(0,2_500_000):text;
}
async function zoomToken(){
  const {ZOOM_ACCOUNT_ID:a,ZOOM_CLIENT_ID:i,ZOOM_CLIENT_SECRET:s}=process.env;
  if(!a||!i||!s)throw new Error('Zoom OAuth не настроен');
  const basic=Buffer.from(i+':'+s).toString('base64');
  const r=await fetch('https://zoom.us/oauth/token?grant_type=account_credentials&account_id='+encodeURIComponent(a),{method:'POST',headers:{Authorization:'Basic '+basic}});
  if(!r.ok)throw new Error('Zoom OAuth ошибка HTTP '+r.status);
  const j=await r.json();
  if(!j.access_token)throw new Error('Zoom не выдал токен');
  return j.access_token;
}
async function zoomGet(url,token){
  const resp=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new Error('Zoom API HTTP '+resp.status+': '+String(data.message||'').slice(0,80));
  return data;
}
export async function fetchZoomRecordings(from,to){
  const host=process.env.ZOOM_HOST_EMAIL;
  if(!host)throw new Error('ZOOM_HOST_EMAIL не настроен');
  const token=await zoomToken();
  const found=[];let next='';
  for(let page=0;page<10;page++){
    const url=new URL('https://api.zoom.us/v2/users/'+encodeURIComponent(host)+'/recordings');
    url.searchParams.set('from',from);url.searchParams.set('to',to);url.searchParams.set('page_size','100');
    if(next)url.searchParams.set('next_page_token',next);
    const data=await zoomGet(url.toString(),token);
    for(const m of data.meetings||[])found.push(m);
    next=data.next_page_token||'';if(!next)break;
  }
  return found;
}
function encodedZoomUUID(uuid){
  let x=encodeURIComponent(uuid);
  if(uuid.startsWith('/')||uuid.includes('//'))x=encodeURIComponent(x);
  return x;
}
export async function fetchZoomTranscript(uuid){
  const token=await zoomToken();
  const data=await zoomGet('https://api.zoom.us/v2/meetings/'+encodedZoomUUID(uuid)+'/recordings',token);
  const files=data.recording_files||[];
  const f=files.find(v=>String(v.file_extension||'').toUpperCase()==='VTT'||v.recording_type==='audio_transcript');
  if(!f?.download_url)return null;
  const u=new URL(f.download_url);
  if(u.protocol!=='https:'||!/(^|\.)zoom\.us$/i.test(u.hostname))throw new Error('Небезопасный адрес Zoom');
  const r=await fetch(u,{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw new Error('Zoom transcript HTTP '+r.status);
  const size=Number(r.headers.get('content-length')||0);
  if(size>2_500_000)throw new Error('Расшифровка превышает 2,5 МБ');
  const reader=r.body?.getReader();if(!reader)return null;
  let total=0;const chunks=[];
  while(true){
    const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>2_500_000){await reader.cancel();throw new Error('Расшифровка превышает 2,5 МБ')}
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function syncRange(from,to){
  const items=await fetchZoomRecordings(from,to);
  const result=await updateIndexFromZoom(items);
  const snapshot=await readIndex();
  const ready=snapshot.records.filter(m=>m.hasTranscript&&!m.transcriptStored&&m.date>=from&&m.date<=to);
  let transcripts=0;
  for(const meeting of ready.slice(0,10)){
    try{
      const vtt=await fetchZoomTranscript(meeting.uuid);
      if(vtt&&await transcriptStore(meeting.uuid,vtt))transcripts++;
    }catch(err){console.warn('Zoom transcript temporarily unavailable:',String(err.message||err).slice(0,90))}
  }
  return {discovered:items.length,updated:result.result?.updated||0,transcripts};
}
export async function syncRecent(days=7){
  const today=new Date(),from=new Date(today);
  from.setUTCDate(today.getUTCDate()-days);
  let cursor=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),1));
  let count=0,transcripts=0,updated=0;
  const fromString=from.toISOString().slice(0,10);
  const toString=today.toISOString().slice(0,10);
  while(cursor<=today){
    const y=cursor.getUTCFullYear(),mo=cursor.getUTCMonth();
    const monthStart=(y+'-'+String(mo+1).padStart(2,'0')+'-01');
    const monthEnd=(new Date(Date.UTC(y,mo+1,0))).toISOString().slice(0,10);
    const part=await syncRange(monthStart<fromString?fromString:monthStart,monthEnd>toString?toString:monthEnd);
    count+=part.discovered;transcripts+=part.transcripts;updated+=part.updated;
    cursor=new Date(Date.UTC(y,mo+1,1));
  }
  return {discovered:count,updated,transcripts};
}
