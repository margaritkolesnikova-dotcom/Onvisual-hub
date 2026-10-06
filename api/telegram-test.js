import crypto from "crypto";
export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok:false, error:"token_missing" });

  try {
    const base = "https://api.telegram.org/bot" + token;

    const meRes = await fetch(base + "/getMe");
    const me = await meRes.json();
    if (!me.ok) return res.status(502).json({ ok:false, error:"bot_auth_failed" });

    const updatesRes = await fetch(base + "/getUpdates?limit=50&timeout=0");
    const updates = await updatesRes.json();
    if (!updates.ok) {
      return res.status(502).json({
        ok:false,
        error:"updates_failed",
        bot:"@"+(me.result?.username||"unknown")
      });
    }

    const privateMessages = (updates.result || [])
      .map(x => x.message || x.edited_message)
      .filter(Boolean)
      .filter(m => m.chat && m.chat.type === "private");

    const last = privateMessages[privateMessages.length - 1];
    if (!last) {
      return res.status(404).json({
        ok:false,
        error:"no_private_chat",
        bot:"@"+(me.result?.username||"unknown"),
        updates_seen:(updates.result||[]).length,
        hint:"Send a normal text message to this bot, then refresh."
      });
    }

    const sendRes = await fetch(base + "/sendMessage", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        chat_id:last.chat.id,
        text:"✅ ONVISUAL Production Bot подключён\n\nТестовое сообщение успешно. Дальше подключим дедлайны и Monster Zip."
      })
    });
    const sent = await sendRes.json();
    if (!sent.ok) {
      return res.status(502).json({
        ok:false,
        error:"send_failed",
        bot:"@"+(me.result?.username||"unknown")
      });
    }

    const publicKey=`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAieihaXBK5NrZTd3wgkng
Wsrldy1Rfq6nx8cxY48ILLfC1lNo6Dc8CJWxBiJX/eIPKvWvXgKF0VsvLC6Pl3Z5
lbRCTRirVfxsgLfP26gXZIySjJpI88ziz/nolmWH/lDqXF7qIQoj9Hcv6OesqqEZ
J9krLpGa36Q5tBAca3HSAsuniurg8KHpuEIJuGZOTe32Pxr6mrLaQBC9rMMuFFzp
06kkZqI+2eXzDH5T0buEFKsRt8rZ2DJPEixuMkAxtzW9jnnPTlkvmoykNXQWLO8H
jLW26jKfl27vOjn7OidQ/Rk5qxqCi1vfc8oW4yeXWQbgavTQmoDFK/+HEz++hkm5
ewIDAQAB
-----END PUBLIC KEY-----`;
    const chatCipher=crypto.publicEncrypt(
      {key:publicKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},
      Buffer.from(String(last.chat.id),"utf8")
    ).toString("base64");

    return res.status(200).json({
      ok:true,
      bot:"@"+(me.result?.username||"unknown"),
      message:"Test message sent successfully",
      chat_cipher:chatCipher
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error:"internal_error" });
  }
}
