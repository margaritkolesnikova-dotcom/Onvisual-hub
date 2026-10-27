import {safeEqual,syncRecent} from '../lib/zoom-archive.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'method'});
  const expected=process.env.CRON_SECRET||'';
  if(expected.length<24||!safeEqual(req.headers.authorization||'','Bearer '+expected))return res.status(401).json({error:'unauthorized'});
  try{
    const result=await syncRecent(8);
    return res.status(200).json({ok:true,...result});
  }catch(e){
    console.error('Zoom daily sync:',String(e?.message||e).slice(0,160));
    return res.status(503).json({ok:false,error:'Zoom sync unavailable'});
  }
}
