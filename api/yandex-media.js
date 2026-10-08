const ALLOWED_HOSTS = new Set(['disk.yandex.ru', 'yadi.sk']);

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_\-]+/g, ' ')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function yandexJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ONVISUAL-YandexMedia-Bridge/1.0' }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Yandex API returned non-JSON response (${response.status})`);
  }
  if (!response.ok) throw new Error(data?.message || data?.description || `Yandex API error ${response.status}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const folder = Array.isArray(req.query.folder) ? req.query.folder[0] : req.query.folder;
  const file = Array.isArray(req.query.file) ? req.query.file[0] : req.query.file;

  if (!folder || !file) return res.status(400).send('folder and file are required');

  let parsed;
  try { parsed = new URL(folder); } catch { return res.status(400).send('Invalid folder URL'); }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return res.status(400).send('Only public Yandex Disk links are allowed');

  try {
    const metaUrl = new URL('https://cloud-api.yandex.net/v1/disk/public/resources');
    metaUrl.searchParams.set('public_key', folder);
    metaUrl.searchParams.set('limit', '1000');
    metaUrl.searchParams.set('fields', '_embedded.items.name,_embedded.items.type,_embedded.items.path,_embedded.items.mime_type');

    const meta = await yandexJson(metaUrl.toString());
    const items = meta?._embedded?.items || [];
    const wanted = normalize(file);

    const files = items.filter(i => i.type === 'file');
    const match =
      files.find(i => normalize(i.name) === wanted) ||
      files.find(i => normalize(i.name).includes(wanted)) ||
      files.find(i => wanted.includes(normalize(i.name)));

    if (!match) return res.status(404).send('File not found');

    const downloadUrl = new URL('https://cloud-api.yandex.net/v1/disk/public/resources/download');
    downloadUrl.searchParams.set('public_key', folder);
    downloadUrl.searchParams.set('path', match.path || `/${match.name}`);

    const download = await yandexJson(downloadUrl.toString());
    if (!download?.href) throw new Error('No download URL returned by Yandex');

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, download.href);
  } catch (error) {
    return res.status(502).send(error?.message || String(error));
  }
}
