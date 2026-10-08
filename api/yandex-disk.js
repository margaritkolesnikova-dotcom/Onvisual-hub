const ALLOWED_HOSTS = new Set(['disk.yandex.ru', 'yadi.sk']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function yandexJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ONVISUAL-YandexDisk-Bridge/1.0' }
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Yandex API returned non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(data?.message || data?.description || `Yandex API error ${response.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const folder = Array.isArray(req.query.folder) ? req.query.folder[0] : req.query.folder;
  const file = Array.isArray(req.query.file) ? req.query.file[0] : req.query.file;
  const mode = Array.isArray(req.query.mode) ? req.query.mode[0] : req.query.mode;

  if (!folder) {
    return res.status(400).json({
      error: 'Missing folder',
      usage: '/api/yandex-disk?folder=<public_yandex_folder_url>&file=<filename>'
    });
  }

  let parsed;
  try {
    parsed = new URL(folder);
  } catch {
    return res.status(400).json({ error: 'Invalid folder URL' });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(400).json({ error: 'Only public Yandex Disk links are allowed' });
  }

  try {
    const metaUrl = new URL('https://cloud-api.yandex.net/v1/disk/public/resources');
    metaUrl.searchParams.set('public_key', folder);
    metaUrl.searchParams.set('limit', '1000');
    metaUrl.searchParams.set('fields', 'name,type,size,mime_type,modified,path,_embedded.items.name,_embedded.items.type,_embedded.items.size,_embedded.items.mime_type,_embedded.items.modified,_embedded.items.path');

    const meta = await yandexJson(metaUrl.toString());
    const items = meta?._embedded?.items || [];

    if (!file || mode === 'list') {
      return res.status(200).json({
        folder: meta?.name || null,
        count: items.length,
        files: items.map(item => ({
          name: item.name,
          type: item.type,
          size: item.size ?? null,
          mime_type: item.mime_type ?? null,
          modified: item.modified ?? null,
          path: item.path ?? null
        }))
      });
    }

    const wanted = normalize(file);
    const exact = items.find(item => normalize(item.name) === wanted);
    const partial = items.find(item => normalize(item.name).includes(wanted) || wanted.includes(normalize(item.name)));
    const match = exact || partial;

    if (!match) {
      return res.status(404).json({
        error: 'File not found',
        requested: file,
        available: items.filter(i => i.type === 'file').map(i => i.name)
      });
    }

    const downloadUrl = new URL('https://cloud-api.yandex.net/v1/disk/public/resources/download');
    downloadUrl.searchParams.set('public_key', folder);
    downloadUrl.searchParams.set('path', match.path || `/${match.name}`);

    const download = await yandexJson(downloadUrl.toString());

    return res.status(200).json({
      name: match.name,
      size: match.size ?? null,
      mime_type: match.mime_type ?? null,
      modified: match.modified ?? null,
      path: match.path ?? null,
      href: download.href,
      method: download.method || 'GET',
      expires_note: 'Yandex direct download links are temporary; request this endpoint again when needed.'
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Yandex Disk bridge failed',
      message: error?.message || String(error)
    });
  }
}
