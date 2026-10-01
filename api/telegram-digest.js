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
function esc(s){
  return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function lineFor(item,today,isOverdue){
  const diff=daysBetween(today,item.due);
  const when=diff<0?"просрочено на "+Math.abs(diff)+" дн.":diff===0?"сегодня":diff===1?"завтра":"через "+diff+" дн.";
  const extra=item.kind==="task"?" · <i>доп. задача</i>":"";
  const icon=isOverdue?"🔴":"🔹";
  return icon+" <b>"+esc(item.title)+"</b>\n"+
    "   📅 <b>"+dateLabel(item.due)+"</b> · 👤 "+esc(item.creator||"не назначен")+extra+"\n"+
    "   <i>"+esc(when)+"</i>";
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
    body:JSON.stringify({
      chat_id:chatId,
      text,
      parse_mode:"HTML",
      disable_web_page_preview:true
    })
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

    const dateText=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"long",year:"numeric"}).format(new Date());

    const summary=[];
    summary.push("⚡ <b>ONVISUAL / PRODUCTION</b>");
    summary.push("<i>"+esc(dateText)+"</i>");
    summary.push("");
    summary.push("🎬 <b>MONSTER ZIP</b>");
    summary.push("├ Ролики: <b>"+episodes.length+"</b>");
    summary.push("├ Сценарии: <b>"+scenarioReady+"/"+episodes.length+"</b>");
    summary.push("├ Final: <b>"+finalReady+"/"+episodes.length+"</b>");
    summary.push("├ Опубликовано: <b>"+published+"/"+episodes.length+"</b>");
    summary.push("├ Просрочено: <b>"+overdue.length+"</b>");
    summary.push("└ Ближайшие 5 дней: <b>"+upcoming.length+"</b>");
    summary.push("");
    summary.push("🔗 <a href=\"https://onvisual-hub.vercel.app\"><b>Открыть ONVISUAL HUB</b></a>");

    const overdueMessages=[];
    if(overdue.length){
      let chunk=["🔴 <b>ПРОСРОЧЕННЫЕ · "+overdue.length+"</b>"];
      overdue.forEach((item,index)=>{
        const block="\n"+lineFor(item,today,true);
        const candidate=chunk.concat([block]).join("\n");
        if(candidate.length>3500){
          overdueMessages.push(chunk.join("\n"));
          chunk=["🔴 <b>ПРОСРОЧЕННЫЕ · продолжение</b>",block];
        }else{
          chunk.push(block);
        }
      });
      if(chunk.length)overdueMessages.push(chunk.join("\n"));
    }else{
      overdueMessages.push("🔴 <b>ПРОСРОЧЕННЫЕ · 0</b>\n\n✅ Просроченных дедлайнов нет");
    }

    const upcomingMessages=[];
    if(upcoming.length){
      let chunk=["🔵 <b>БЛИЖАЙШИЕ 5 ДНЕЙ · "+upcoming.length+"</b>"];
      upcoming.forEach(item=>{
        const block="\n"+lineFor(item,today,false);
        const candidate=chunk.concat([block]).join("\n");
        if(candidate.length>3500){
          upcomingMessages.push(chunk.join("\n"));
          chunk=["🔵 <b>БЛИЖАЙШИЕ 5 ДНЕЙ · продолжение</b>",block];
        }else{
          chunk.push(block);
        }
      });
      if(chunk.length)upcomingMessages.push(chunk.join("\n"));
    }else{
      upcomingMessages.push("🔵 <b>БЛИЖАЙШИЕ 5 ДНЕЙ · 0</b>\n\n— На ближайшие 5 дней дедлайнов нет");
    }

    const base="https://api.telegram.org/bot"+token;
    const recipients=await getRecipients(base);
    if(!recipients.length)return res.status(404).json({ok:false,error:"no_recipients"});

    for(const chatId of recipients){
      await send(base,chatId,summary.join("\n"));
      for(const message of overdueMessages)await send(base,chatId,message);
      for(const message of upcomingMessages)await send(base,chatId,message);
    }

    return res.status(200).json({
      ok:true,
      recipients:recipients.length,
      episodes:episodes.length,
      overdue:overdue.length,
      upcoming:upcoming.length,
      telegram_messages:1+overdueMessages.length+upcomingMessages.length
    });
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||"internal_error"});
  }
}
