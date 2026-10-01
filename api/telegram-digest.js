const SHEET_ID="1sj5Y5YBakIK51-sx0DzFD-zfItjBWwnpf8WKK-mK1Zw";
const SHEET_NAME="Zip монстр ";

function parseGviz(raw){
  const a=raw.indexOf("{"), b=raw.lastIndexOf("}");
  if(a<0||b<0) throw new Error("bad_sheet_response");
  return JSON.parse(raw.slice(a,b+1));
}
function cell(row,i){
  const c=row?.c?.[i];
  if(!c)return "";
  return c.f ?? c.v ?? "";
}
function toISO(v){
  if(!v)return "";
  const s=String(v).trim();
  let m=s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if(m)return m[1]+"-"+String(Number(m[2])+1).padStart(2,"0")+"-"+m[3].padStart(2,"0");
  m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  const d=new Date(s);
  return isNaN(d)?"":d.toISOString().slice(0,10);
}
function moscowDate(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const o={}; parts.forEach(p=>o[p.type]=p.value);
  return o.year+"-"+o.month+"-"+o.day;
}
function dateLabel(iso){
  if(!iso)return "—";
  const [y,m,d]=iso.split("-");
  return d+"."+m;
}
function daysBetween(a,b){
  const da=new Date(a+"T00:00:00Z"), db=new Date(b+"T00:00:00Z");
  return Math.round((db-da)/86400000);
}
function parseRows(table){
  return (table?.rows||[]).map((row,idx)=>{
    const num=String(cell(row,2)||"").trim();
    const title=String(cell(row,4)||"").trim();
    if(!title)return null;
    return {
      id:idx+1,
      num,
      title,
      kind:num?"episode":"task",
      scenario:String(cell(row,7)||"").trim(),
      creator:String(cell(row,8)||"").trim(),
      due:toISO(cell(row,9)),
      final:String(cell(row,15)||"").trim(),
      publication:String(cell(row,18)||"").trim()
    };
  }).filter(Boolean);
}
function lineFor(item,today){
  const diff=daysBetween(today,item.due);
  const when=diff<0?"просрочено на "+Math.abs(diff)+" дн.":diff===0?"сегодня":diff===1?"завтра":"через "+diff+" дн.";
  const extra=item.kind==="task"?" · доп. задача":"";
  return "• "+item.title+" — "+dateLabel(item.due)+" — "+(item.creator||"не назначен")+extra+" ("+when+")";
}
async function getRecipients(base){
  const r=await fetch(base+"/getUpdates?limit=100&timeout=0");
  const j=await r.json();
  if(!j.ok)throw new Error("telegram_updates_failed");
  const map=new Map();
  for(const u of j.result||[]){
    const m=u.message||u.edited_message;
    if(m?.chat?.type==="private")map.set(m.chat.id,m.chat.id);
  }
  return [...map.values()];
}
async function send(base,chatId,text){
  const r=await fetch(base+"/sendMessage",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId,text})
  });
  const j=await r.json();
  if(!j.ok)throw new Error("telegram_send_failed");
}
export default async function handler(req,res){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)return res.status(500).json({ok:false,error:"token_missing"});
  try{
    const sheetUrl="https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/gviz/tq?tqx=out:json&sheet="+encodeURIComponent(SHEET_NAME)+"&headers=1&_="+Date.now();
    const sr=await fetch(sheetUrl,{cache:"no-store"});
    if(!sr.ok)throw new Error("sheet_http_"+sr.status);
    const parsed=parseGviz(await sr.text());
    const items=parseRows(parsed.table);
    const episodes=items.filter(x=>x.kind==="episode");
    const today=moscowDate();
    const limit=new Date(today+"T00:00:00Z"); limit.setUTCDate(limit.getUTCDate()+5);
    const limitIso=limit.toISOString().slice(0,10);

    const overdue=items.filter(x=>x.due && x.due<today).sort((a,b)=>a.due.localeCompare(b.due));
    const upcoming=items.filter(x=>x.due && x.due>=today && x.due<=limitIso).sort((a,b)=>a.due.localeCompare(b.due));
    const finalReady=episodes.filter(x=>x.final==="Готово").length;
    const published=episodes.filter(x=>x.publication==="Опубликовано"||x.publication==="Готово").length;
    const scenarioReady=episodes.filter(x=>x.scenario==="Готово").length;

    const out=[];
    out.push("ONVISUAL / PRODUCTION");
    out.push(new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"long",year:"numeric"}).format(new Date()));
    out.push("");
    out.push("MONSTER ZIP");
    out.push("Ролики: "+episodes.length);
    out.push("Сценарии: "+scenarioReady+"/"+episodes.length);
    out.push("Final: "+finalReady+"/"+episodes.length);
    out.push("Опубликовано: "+published+"/"+episodes.length);
    out.push("");
    out.push("🔴 ПРОСРОЧЕННЫЕ — "+overdue.length);
    if(overdue.length) overdue.forEach(x=>out.push(lineFor(x,today))); else out.push("Нет");
    out.push("");
    out.push("🔵 БЛИЖАЙШИЕ 5 ДНЕЙ — "+upcoming.length);
    if(upcoming.length) upcoming.forEach(x=>out.push(lineFor(x,today))); else out.push("Нет");
    out.push("");
    out.push("Hub: https://onvisual-hub.vercel.app");

    const base="https://api.telegram.org/bot"+token;
    const recipients=await getRecipients(base);
    if(!recipients.length)return res.status(404).json({ok:false,error:"no_recipients"});

    const text=out.join("\n");
    for(const chatId of recipients)await send(base,chatId,text);

    return res.status(200).json({ok:true,recipients:recipients.length,episodes:episodes.length,overdue:overdue.length,upcoming:upcoming.length});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||"internal_error"});
  }
}
