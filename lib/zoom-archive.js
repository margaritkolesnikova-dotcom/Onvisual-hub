import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put, head, issueSignedToken, presignUrl } from '@vercel/blob';

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
  // Index is mutable and updated by multiple workers; bypass Blob's >=60s CDN cache.
  // @vercel/blob v2.6+ supports useCache:false for private reads.
  let obj=await get(INDEX_PATH,{...blobOptions,useCache:false});
  if(!obj)return {records:[],etag:null};
  // Avoid mixing ETags from CDN/metadata views while a previous write propagates.
  // Conditional put() below retries when the storage version actually differs.
  const parsed=await json(obj);
  return {records:Array.isArray(parsed.meetings)?parsed.meetings:[],etag:obj.blob.etag};
}
async function mutate(fn){
  for(let attempt=0;attempt<9;attempt++){
    const {records,etag}=await readIndex();
    const working=records.map(v=>({...v}));
    const output=await fn(working);
    if(!output.changed)return {meetings:working,result:output.result,changed:false};
    const jsonData=JSON.stringify({version:1,updatedAt:new Date().toISOString(),meetings:working});
    try{
      await put(INDEX_PATH,jsonData,{
        ...blobOptions,contentType:'application/json',addRandomSuffix:false,
        // Fallback only after two optimistic retries; a CDN-visible ETag may
        // temporarily lag behind the origin on this low-volume team archive.
        ...(etag?(attempt<2?{allowOverwrite:true,ifMatch:etag}:{allowOverwrite:true}):{allowOverwrite:attempt>0}),
        cacheControlMaxAge:60,
      });
      return {meetings:working,result:output.result,changed:true};
    }catch(err){
      if(!/precondition|already exists|conflict|412|409/i.test(String(err?.message||err)))throw err;
      if(attempt<8)await new Promise(resolve=>setTimeout(resolve,180+attempt*120));
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
      if(working.some(m=>matchesDeletedMeeting(m,entry.uuid,entry.title,entry.startTime)))continue;
      if(await isPermanentlyDeleted(entry.uuid))continue;
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
// One-time migration of older local Zoom recordings into the shared private archive.
// A local recording is never mistaken for a new Zoom cloud recording.
export async function ensureLocalMeeting(details){
  const uuid=String(details.uuid||'');
  if(await isPermanentlyDeleted(uuid))throw new Error('Встреча была удалена из хаба и не будет восстановлена');
  const project=projectName(details.project);
  if(!/^LOCAL[A-Z0-9]{10,35}$/.test(uuid)||!project)throw new Error('Invalid local meeting identifier');
  const date=String(details.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid meeting date');
  const title=clean(details.title)||'Локальная запись Zoom';
  const startTime=String(details.startTime||'');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startTime))throw new Error('Invalid start time');
  return mutate(async working=>{
    let item=working.find(m=>m.uuid===uuid);
    if(item){
      if(item.deletedAt)throw new Error('Удалённую из хаба встречу нельзя импортировать повторно');
      if(item.source==='local'&&item.project!==project){item.project=project;return {changed:true,result:item}}
      return {changed:false,result:item};
    }
    item={
      uuid,zoomId:'',title,startTime,date,duration:Number(details.duration||0),
      source:'local',project,hasVideo:false,videoUrl:'',hasTranscript:false,
      transcriptStored:false,files:[],firstSeen:new Date().toISOString()
    };
    working.push(item);
    working.sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime)));
    return {changed:true,result:item};
  });
}

// Archive deletion is a permanent tombstone, not a temporary browser-only hide.
// Keep the Zoom UUID (and linked AI Summary UUID) so future Zoom sync cannot recreate it.
function deletionPath(uuid){return 'onvisual/meetings/deleted/'+uuidKey(uuid)+'.json'}
export async function isPermanentlyDeleted(uuid){
  if(!uuid)return false;
  return !!(await head(deletionPath(uuid)).catch(err=>{
    // A storage failure must not silently cause a deleted meeting to be restored.
    if(/404|not found|does not exist/i.test(String(err?.message||'')))return null;
    throw err;
  }));
}
export async function deleteMeetingFromArchive(uuid){
  if(!uuid)return {exists:false,deleted:false};
  const {records}=await readIndex();
  const found=records.find(m=>m.uuid===uuid||m.zoomSummaryUuid===uuid);
  if(!found)return {exists:false,deleted:false};
  // An independent immutable marker survives concurrent index writes and future Zoom syncs.
  await Promise.all([found.uuid,found.zoomSummaryUuid].filter(Boolean).map(async id=>{
    await put(deletionPath(id),JSON.stringify({deletedAt:new Date().toISOString()}),{
      ...blobOptions,allowOverwrite:true,addRandomSuffix:false,
      contentType:'application/json',cacheControlMaxAge:60
    });
  }));
  const outcome=await mutate(async working=>{
    const entry=working.find(m=>m.uuid===uuid||m.zoomSummaryUuid===uuid);
    if(!entry)return {changed:false,result:{exists:false,deleted:false}};
    if(entry.deletedAt)return {changed:false,result:{exists:true,deleted:true}};
    entry.deletedAt=new Date().toISOString();
    // Keep immutable identity and matching metadata but do not expose this entry in the hub.
    return {changed:true,result:{exists:true,deleted:true}};
  });
  return outcome.result||{exists:false,deleted:false};
}
function matchesDeletedMeeting(m,uuid,title,startTime){
  if(!m.deletedAt)return false;
  if(m.uuid===uuid||m.zoomSummaryUuid===uuid)return true;
  const delta=Math.abs(Date.parse(m.startTime)-Date.parse(startTime));
  const base=s=>String(s||'').replace(/ - \d{2}:\d{2}-\d{2}:\d{2}$/,'').trim().toLocaleLowerCase('ru');
  return Number.isFinite(delta)&&delta<=20*60*1000&&base(m.title)===base(title);
}

export async function assignProject(uuid,project){
  if(!PROJECTS.has(project)||!uuid)return {changed:false,exists:false};
  const result=await mutate(async working=>{
    const item=working.find(m=>m.uuid===uuid);
    if(!item)return {changed:false,result:{exists:false}};
    if(item.deletedAt)return {changed:false,result:{exists:false}};
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
  try{
    await mutate(async working=>{
      const meeting=working.find(m=>m.uuid===uuid);
      if(!meeting||meeting.transcriptStored)return {changed:false};
      meeting.transcriptStored=true;meeting.hasTranscript=true;
      return {changed:true};
    });
  }catch(err){console.warn('Transcript index metadata update deferred:',String(err.message||err).slice(0,90))}
  return true;
}
export async function summaryStore(uuid,content,docUrl=''){
  if(!uuid||typeof content!=='string'||content.trim().length<10)return false;
  const filePath='onvisual/meetings/summaries/'+uuidKey(uuid)+'.md';
  await put(filePath,content,{
    ...blobOptions,allowOverwrite:true,addRandomSuffix:false,
    contentType:'text/markdown; charset=utf-8',cacheControlMaxAge:60
  });
  // Blob document is the source of truth. A cached index must never block
  // storing a finished Zoom summary file.
  try{
    await mutate(async working=>{
      const meeting=working.find(m=>m.uuid===uuid);
      if(!meeting)return {changed:false};
      const changed=!meeting.summaryStored||meeting.summaryDocUrl!==docUrl;
      meeting.summaryStored=true;
      if(docUrl)meeting.summaryDocUrl=docUrl;
      return {changed};
    });
  }catch(err){console.warn('Zoom summary index metadata update deferred:',String(err.message||err).slice(0,90))}
  return true;
}
export function videoBlobPath(uuid){
 return 'onvisual/meetings/videos/'+uuidKey(uuid)+'.mp4';
}
export async function createPrivateVideoUpload(uuid,size){
 if(!uuid||!Number.isSafeInteger(size)||size<1000||size>1200*1024*1024)
   throw new Error('Видео должно быть MP4 не более 1,2 ГБ');
 const pathname=videoBlobPath(uuid);
 const token=await issueSignedToken({
   pathname,operations:['put'],
   allowedContentTypes:['video/mp4','application/octet-stream'],
   maximumSizeInBytes:1200*1024*1024,
   validUntil:Date.now()+25*60*1000
 });
 const {presignedUrl}=await presignUrl(token,{
   pathname,access:'private',operation:'put',validUntil:Date.now()+20*60*1000
 });
 return {url:presignedUrl,expiresInSeconds:1200};
}
function validVideoPath(uuid,pathname){
 const prefix=videoBlobPath(uuid).slice(0,-4);
 return typeof pathname==='string' && pathname.length<=320 &&
   pathname.startsWith(prefix) &&
   (/^[a-z0-9/.-]+$/i).test(pathname) &&
   (pathname===prefix+'.mp4' || new RegExp('^'+prefix+'-[A-Za-z0-9]{5,80}[.]mp4'+'$').test(pathname));
}
export async function savePrivateVideoPath(uuid,pathname){
 if(!validVideoPath(uuid,pathname))throw new Error('Некорректное имя загруженного MP4');
 const blob=await head(pathname).catch(()=>null);
 if(!blob)throw new Error('Видео ещё не появилось в закрытом хранилище');
 return mutate(async records=>{
   const item=records.find(m=>m.uuid===uuid);
   if(!item)throw new Error('Встреча не найдена');
   if(item.videoPath===pathname)return {changed:false,result:{ok:true}};
   item.videoPath=pathname;item.hasVideo=true;
   return {changed:true,result:{ok:true}};
 });
}
export async function getPrivateVideoLink(uuid,pathname){
 const verifiedPath=pathname||videoBlobPath(uuid);
 if(!validVideoPath(uuid,verifiedPath))throw new Error('Запись не соответствует встрече');
 const file=await head(verifiedPath).catch(()=>null);
 if(!file)return null;
 const token=await issueSignedToken({
   pathname:verifiedPath,operations:['get'],validUntil:Date.now()+20*60*1000
 });
 const {presignedUrl}=await presignUrl(token,{
   pathname:verifiedPath,access:'private',operation:'get',
   validUntil:Date.now()+15*60*1000,useCache:false
 });
 return {url:presignedUrl,expiresInSeconds:900};
}

// Preserve cloud MP4s independently of Zoom. Existing private blobs are never overwritten;
// only a confirmed file becomes the team's archived recording. Large videos can still
// be uploaded manually through the signed browser upload flow.
const AUTO_VIDEO_LIMIT=400*1024*1024;
export async function archiveZoomVideo(meeting){
 if(!meeting||meeting.deletedAt||!meeting.uuid||meeting.source==='local'||!meeting.hasVideo)return {status:'not-applicable'};
 const uuid=meeting.uuid;
 if(await isPermanentlyDeleted(uuid))return {status:'deleted'};
 if(meeting.zoomSummaryUuid&&await isPermanentlyDeleted(meeting.zoomSummaryUuid))return {status:'deleted'};
 const pathname=meeting.videoPath||videoBlobPath(uuid);
 if(await head(pathname).catch(()=>null))return {status:'already-archived'};
 const token=await zoomToken();
 const data=await zoomGet('https://api.zoom.us/v2/meetings/'+encodedZoomUUID(uuid)+'/recordings',token);
 const files=Array.isArray(data.recording_files)?data.recording_files:[];
 const source=files.find(f=>String(f.file_type||f.file_extension||'').toUpperCase()==='MP4'&&f.status!=='processing'&&f.download_url);
 if(!source)return {status:'not-ready'};
 const size=Number(source.file_size||0);
 if(size>AUTO_VIDEO_LIMIT)return {status:'too-large',size};
 const u=new URL(source.download_url);
 if(u.protocol!=='https:'||!/(^|\.)zoom\.us$/i.test(u.hostname))throw new Error('Zoom MP4 returned an unexpected host');
 const response=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(190000)});
 if(!response.ok)throw new Error('Zoom MP4 download HTTP '+response.status);
 const length=Number(response.headers.get('content-length')||0);
 if(length>AUTO_VIDEO_LIMIT||!response.body)throw new Error('Cloud MP4 too large or empty');
 const type=response.headers.get('content-type')||'';
 if(/text\/html|application\/json/i.test(type))throw new Error('Zoom returned a page instead of MP4');
 // SDK multipart stream avoids the function 4.5 MB incoming upload limit.
 const dst=videoBlobPath(uuid);
 try{
  await put(dst,response.body,{
   ...blobOptions,contentType:'video/mp4',multipart:true,addRandomSuffix:false,
   maximumSizeInBytes:AUTO_VIDEO_LIMIT,cacheControlMaxAge:60,
  });
 }catch(err){
  if(!/already exists|conflict|409/i.test(String(err?.message||err)))throw err;
 }
 const stored=await head(dst).catch(()=>null);
 if(!stored)throw new Error('MP4 was uploaded but not yet verified');
 await mutate(async records=>{
  const item=records.find(m=>m.uuid===uuid);
  if(!item||item.deletedAt)return {changed:false};
  if(item.videoPath===dst)return {changed:false};
  item.videoPath=dst;item.hasVideo=true;item.videoArchiveAt=new Date().toISOString();
  return {changed:true};
 });
 return {status:'archived',bytes:Number(stored.size||size||0)};
}

export async function storedFiles(uuid,videoPath){
  const [transcript,summary,video]=await Promise.all([
    head('onvisual/meetings/transcripts/'+uuidKey(uuid)+'.vtt').catch(()=>null),
    head('onvisual/meetings/summaries/'+uuidKey(uuid)+'.md').catch(()=>null),
    head(videoPath||videoBlobPath(uuid)).catch(()=>null)
  ]);
  return {transcript:!!transcript,summary:!!summary,video:!!video};
}

export async function summaryRead(uuid){
  const blob=await get('onvisual/meetings/summaries/'+uuidKey(uuid)+'.md',{...blobOptions,useCache:false});
  if(!blob)return null;
  const content=await new Response(blob.stream).text();
  return content.length>1_500_000?content.slice(0,1_500_000):content;
}
export async function fetchZoomSummary(uuid){
  const token=await zoomToken();
  const data=await zoomGet('https://api.zoom.us/v2/meetings/'+encodedZoomUUID(uuid)+'/meeting_summary',token);
  const parts=[];
  if(typeof data.summary_content==='string'&&data.summary_content.trim())parts.push(data.summary_content);
  else{
    if(data.summary_title)parts.push('# '+String(data.summary_title));
    if(data.summary_overview)parts.push('## Обзор\n'+String(data.summary_overview));
    for(const part of data.summary_details||[]){
      if(part.summary)parts.push('## '+String(part.label||'Детали')+'\n'+String(part.summary));
    }
    if((data.next_steps||[]).length)parts.push('## Следующие шаги\n'+data.next_steps.map(x=>'- '+String(x)).join('\n'));
  }
  const u=String(data.summary_doc_url||'');
  let docUrl='';
  if(u){
    try{const x=new URL(u);if(x.protocol==='https:'&&/(^|\.)zoom\.us$/i.test(x.hostname))docUrl=u}catch{}
  }
  return {content:parts.join('\n\n').slice(0,1_400_000),docUrl};
}

export async function transcriptRead(uuid){
  const blob=await get('onvisual/meetings/transcripts/'+uuidKey(uuid)+'.vtt',{...blobOptions,useCache:false});
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
export async function fetchZoomSummaryList(from,to){
  const token=await zoomToken(),summaries=[];
  let next='';
  for(let page=0;page<5;page++){
    const url=new URL('https://api.zoom.us/v2/meetings/meeting_summaries');
    url.searchParams.set('from',from+'T00:00:00Z');
    url.searchParams.set('to',to+'T23:59:59Z');
    url.searchParams.set('page_size','100');
    if(next)url.searchParams.set('next_page_token',next);
    const data=await zoomGet(url.toString(),token);
    summaries.push(...(data.summaries||[]));
    next=data.next_page_token||'';
    if(!next)break;
  }
  return summaries.filter(m=>m.meeting_uuid&&m.meeting_start_time);
}
export async function updateIndexFromSummaryList(summaries){
  return mutate(async working=>{
    const map=new Map(working.map((m,i)=>[m.uuid,i]));
    let changed=0;
    for(const summary of summaries){
      const uuid=clean(summary.meeting_uuid);
      if(!uuid)continue;
      const idx=map.get(uuid);
      if(working.some(m=>matchesDeletedMeeting(m,uuid,summary.meeting_topic,summary.meeting_start_time)))continue;
      if(await isPermanentlyDeleted(uuid))continue;
      if(idx!==undefined)continue;
      // Link Zoom AI summary to a previously imported local recording
      // when topic, date and start time agree; keep the original local file ID.
      const began=Date.parse(summary.meeting_start_time);
      const topic=String(summary.meeting_topic||'').trim().toLowerCase();
      const match=working.find(m=>{
        if(m.deletedAt||m.source!=='local'||m.zoomSummaryUuid||!m.startTime||!Number.isFinite(began))return false;
        const originalBase=String(m.title||'').replace(/ - \d{2}:\d{2}-\d{2}:\d{2}$/,'').trim().toLowerCase();
        return originalBase===topic&&Math.abs(Date.parse(m.startTime)-began)<=20*60*1000;
      });
      if(match){match.zoomSummaryUuid=uuid;changed++;continue}
      const entry={
        uuid,zoomId:clean(summary.meeting_id),title:clean(summary.meeting_topic)||'Созвон Zoom',
        startTime:clean(summary.meeting_start_time),
        date:String(summary.meeting_start_time).slice(0,10),
        duration:0,source:'zoom_summary',project:'',videoUrl:'',
        hasVideo:false,hasTranscript:false,transcriptStored:false,
        summaryStored:false,files:[],firstSeen:new Date().toISOString()
      };
      map.set(uuid,working.length);working.push(entry);changed++;
    }
    if(changed)working.sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime)));
    return {changed:changed>0,result:{summariesNew:changed}};
  });
}

export async function fetchZoomTranscript(uuid){
  const token=await zoomToken();
  const data=await zoomGet('https://api.zoom.us/v2/meetings/'+encodedZoomUUID(uuid)+'/recordings',token);
  const files=data.recording_files||[];
  const f=files.find(v=>String(v.file_extension||'').toUpperCase()==='VTT'||v.recording_type==='audio_transcript');
  // Zoom may retain a Meeting Summary transcript even if no MP4/VTT appears in Cloud Recordings.
  // Read the separate /transcript API as a fallback for these meetings.
  let downloadUrl=f?.download_url||'';
  if(!downloadUrl){
    const endpoint='https://api.zoom.us/v2/meetings/'+encodedZoomUUID(uuid)+'/transcript';
    try{
      const record=await zoomGet(endpoint,token);
      if(record.can_download===true&&record.download_url)downloadUrl=record.download_url;
    }catch(e){
      if(/HTTP (400|403|404)/.test(String(e.message||e)))return null;
      throw e;
    }
  }
  if(!downloadUrl)return null;
  const u=new URL(downloadUrl);
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
  // Summaries include meetings that were recorded only locally, without Zoom Cloud MP4.
  // Failure to read summaries must never stop normal cloud recording ingestion.
  let summaryListed=0;
  try{
    const summaryList=await fetchZoomSummaryList(from,to);
    summaryListed=summaryList.length;
    if(summaryList.length)await updateIndexFromSummaryList(summaryList);
  }catch(err){
    const msg=String(err?.message||err);
    if(/scopes|403|124/.test(msg))console.warn('Zoom summary listing needs meeting:read:list_summaries:admin');
    else console.warn('Zoom summary listing unavailable:',msg.slice(0,110));
  }
  // Also retry AI meeting-summary transcripts when the meeting has no cloud recording.
  // Some transcript files are processed after the meeting summary is ready.
  const {records:latest}=await readIndex();
  const ready=latest.filter(m=>!m.deletedAt&&m.source!=='local'&&!m.transcriptStored&&m.date>=from&&m.date<=to);
  let transcripts=0,summaries=0;
  for(const meeting of ready.slice(0,10)){
    try{
      const vtt=await fetchZoomTranscript(meeting.uuid);
      if(vtt&&await transcriptStore(meeting.uuid,vtt))transcripts++;
    }catch(err){console.warn('Zoom transcript temporarily unavailable:',String(err.message||err).slice(0,90))}
  }
  // Zoom Meeting Summary is generated separately from the VTT/cloud-recording files.
  // Scopes must include meeting_summary:read:admin; when unavailable, do not fail record imports.
  const missing=(await readIndex()).records.filter(m=>!m.deletedAt&&(m.source!=='local'||m.zoomSummaryUuid)&&!m.summaryStored&&m.date>=from&&m.date<=to);
  for(const meeting of missing.slice(0,12)){
    try{
      const exists=await storedFiles(meeting.uuid);
      if(exists.summary)continue;
      const summary=await fetchZoomSummary(meeting.zoomSummaryUuid||meeting.uuid);
      if(summary.content&&await summaryStore(meeting.uuid,summary.content,summary.docUrl))summaries++;
    }catch(err){
      const msg=String(err?.message||err);
      if(/scopes|403|124/i.test(msg)){console.warn('Zoom summary requires additional OAuth scope');break}
      console.warn('Zoom summary not ready:',msg.slice(0,100));
    }
  }
  // Archive at most one newly available MP4 per invocation to stay within
  // the Vercel execution budget. The next sync resumes remaining videos.
  let videosArchived=0,videoPending=0;
  const latestVideo=(await readIndex()).records.filter(m=>
    !m.deletedAt&&m.source!=='local'&&m.hasVideo&&m.date>=from&&m.date<=to);
  for(const meeting of latestVideo){
    if(await isPermanentlyDeleted(meeting.uuid))continue;
    if(meeting.zoomSummaryUuid&&await isPermanentlyDeleted(meeting.zoomSummaryUuid))continue;
    if(await head(meeting.videoPath||videoBlobPath(meeting.uuid)).catch(()=>null))continue;
    try{
      const saved=await archiveZoomVideo(meeting);
      if(saved.status==='archived'){videosArchived++;break}
      if(saved.status==='too-large'||saved.status==='not-ready'){videoPending++}
    }catch(err){
      videoPending++;
      console.warn('Zoom MP4 remains in Zoom, local archive retry needed:',String(err?.message||err).slice(0,125));
    }
    // Avoid a long loop after failed uploads; cron/manual sync can retry.
    if(videoPending>=1)break;
  }
  return {discovered:items.length,summaryListed,updated:result.result?.updated||0,transcripts,summaries,videosArchived,videoPending};
}
export async function syncRecent(days=7){
  const today=new Date(),from=new Date(today);
  from.setUTCDate(today.getUTCDate()-days);
  let cursor=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),1));
  let count=0,transcripts=0,summaries=0,updated=0,videosArchived=0,videoPending=0;
  const fromString=from.toISOString().slice(0,10);
  const toString=today.toISOString().slice(0,10);
  while(cursor<=today){
    const y=cursor.getUTCFullYear(),mo=cursor.getUTCMonth();
    const monthStart=(y+'-'+String(mo+1).padStart(2,'0')+'-01');
    const monthEnd=(new Date(Date.UTC(y,mo+1,0))).toISOString().slice(0,10);
    const part=await syncRange(monthStart<fromString?fromString:monthStart,monthEnd>toString?toString:monthEnd);
    count+=part.discovered;transcripts+=part.transcripts;summaries+=part.summaries;updated+=part.updated;videosArchived+=part.videosArchived||0;videoPending+=part.videoPending||0;
    cursor=new Date(Date.UTC(y,mo+1,1));
  }
  return {discovered:count,updated,transcripts,summaries,videosArchived,videoPending};
}
