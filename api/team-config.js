// Public configuration only: the Supabase anon key is intentionally public.
// NEVER return the SUPABASE_SERVICE_ROLE_KEY from an API route.
module.exports = function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const url=process.env.SUPABASE_URL||'';
  const anonKey=process.env.SUPABASE_ANON_KEY||'';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)||!anonKey)
    return res.status(503).json({error:'Авторизация команды ещё не настроена'});
  return res.status(200).json({url:url.replace(/\/$/,''),anonKey});
};
