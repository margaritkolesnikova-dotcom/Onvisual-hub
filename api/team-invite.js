// Admin-only staff invitation. Service credentials stay on Vercel server.
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!anon||!service) return res.status(503).json({error:'Сервис сотрудников не настроен'});
  const bearer=(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  if(!bearer) return res.status(401).json({error:'Войдите в систему'});
  try {
    const who=await fetch(base+'/auth/v1/user',{
      headers:{apikey:anon,authorization:'Bearer '+bearer}
    });
    if(!who.ok) return res.status(401).json({error:'Сессия недействительна'});
    const user=await who.json();
    if(!user.id) return res.status(401).json({error:'Сессия недействительна'});

    // Service-role lookup is server-side, without relying on front-end flags.
    const lookup=await fetch(base+'/rest/v1/hub_profiles?id=eq.'+
      encodeURIComponent(user.id)+'&select=role,active',{
      headers:{apikey:service,authorization:'Bearer '+service}
    });
    if(!lookup.ok) throw new Error('Не удалось проверить роль администратора');
    const found=await lookup.json();
    if(found[0]?.role!=='admin'||found[0]?.active!==true)
      return res.status(403).json({error:'Только администратор может приглашать сотрудников'});

    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const email=String(body.email||'').trim().toLowerCase();
    const displayName=String(body.displayName||'').trim();
    const role=String(body.role||'viewer');
    const allowedRoles=['producer','creative','editor','creator','smm','viewer'];
    const allowedSections=['tasks','calendar','files','production','creative','social'];
    const sections=Array.isArray(body.sections)?
      [...new Set(body.sections.filter(s=>allowedSections.includes(s)))]:[];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>250||
       !displayName||displayName.length>120||!allowedRoles.includes(role))
      return res.status(400).json({error:'Проверьте имя, email и роль'});
    for(const required of ['tasks','calendar','files']) if(!sections.includes(required)) sections.push(required);

    // Existing profiles are edited only in the admin panel, not reinvited.
    const existing=await fetch(base+'/rest/v1/hub_profiles?email=eq.'+
      encodeURIComponent(email)+'&select=id',{
      headers:{apikey:service,authorization:'Bearer '+service}
    });
    if(!existing.ok) throw new Error('Не удалось проверить сотрудника');
    if((await existing.json()).length)
      return res.status(409).json({error:'Этот сотрудник уже добавлен'});

    const origin=process.env.TEAM_APP_ORIGIN||'https://onvisual-hub.vercel.app';
    if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin))
      throw new Error('Некорректный адрес кабинета');
    const sent=await fetch(base+'/auth/v1/invite?redirect_to='+
      encodeURIComponent(origin+'/team.html'),{
      method:'POST',
      headers:{apikey:service,authorization:'Bearer '+service,
        'Content-Type':'application/json'},
      body:JSON.stringify({email,data:{display_name:displayName}})
    });
    const invited=await sent.json().catch(()=>({}));
    if(!sent.ok||!invited.id)
      return res.status(400).json({error:invited.msg||invited.message||'Приглашение не отправлено'});

    const saved=await fetch(base+'/rest/v1/hub_profiles?on_conflict=id',{
      method:'POST',
      headers:{apikey:service,authorization:'Bearer '+service,
        'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({id:invited.id,email,display_name:displayName,
        role,sections,active:true})
    });
    if(!saved.ok) {
      // Never present a partially configured invitation as successful.
      throw new Error('Письмо отправлено, но профиль не создан. Проверьте настройки базы.');
    }
    return res.status(200).json({ok:true,email});
  } catch(err) {
    console.error('team invite failed',err?.message);
    return res.status(500).json({error:err?.message||'Не удалось пригласить сотрудника'});
  }
};
