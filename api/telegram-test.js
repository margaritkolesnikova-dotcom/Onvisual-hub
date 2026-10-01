export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok:false, error:"token_missing" });

  try {
    const base = "https://api.telegram.org/bot" + token;
    const updatesRes = await fetch(base + "/getUpdates?limit=50&timeout=0");
    const updates = await updatesRes.json();
    if (!updates.ok) return res.status(502).json({ ok:false, error:"updates_failed" });

    const messages = (updates.result || [])
      .map(x => x.message)
      .filter(Boolean)
      .filter(m => m.chat && m.chat.type === "private");

    const last = messages[messages.length - 1];
    if (!last) return res.status(404).json({ ok:false, error:"no_private_chat" });

    const sendRes = await fetch(base + "/sendMessage", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        chat_id:last.chat.id,
        text:"✅ ONVISUAL Production Bot подключён\n\nТестовое сообщение успешно. Дальше подключим дедлайны и Monster Zip."
      })
    });
    const sent = await sendRes.json();
    if (!sent.ok) return res.status(502).json({ ok:false, error:"send_failed" });

    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"internal_error" });
  }
}
