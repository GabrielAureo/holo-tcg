import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

export function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'donmai.us' || url.hostname.endsWith('.donmai.us'));
  } catch {
    return false;
  }
}

export function normalizeDanbooruQuery(query) {
  const normalized = String(query || '').trim();
  if (!normalized) return 'hololive rating:g';
  return /(?:^|\s)rating:(?:g|s|q|e|general|sensitive|questionable|explicit)(?:\s|$)/i.test(normalized)
    ? normalized
    : `${normalized} rating:g`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) { res.writeHead(status, { 'Content-Type': type, ...headers }); res.end(body); }

async function fetchDanbooru(url) {
  return fetch(url, { headers: { 'User-Agent': 'HoloStudio/1.0 (personal art tool)', Accept: 'application/json' } });
}

async function handler(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  }
  if (requestUrl.pathname === '/api/posts') {
    const query = requestUrl.searchParams.get('q')?.slice(0, 160).trim() || 'hololive';
    const page = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get('page')) || 1));
    const upstream = new URL('https://danbooru.donmai.us/posts.json');
    upstream.search = new URLSearchParams({ tags: normalizeDanbooruQuery(query), page: String(page), limit: '24' });
    try {
      const response = await fetchDanbooru(upstream);
      if (!response.ok) throw new Error(`Danbooru returned ${response.status}`);
      const posts = await response.json();
      const normalized = posts.map((post) => ({
        id: post.id,
        tag_string_character: post.tag_string_character,
        tag_string_artist: post.tag_string_artist,
        image_width: post.image_width,
        image_height: post.image_height,
        preview_file_url: post.preview_file_url || post.large_file_url || post.file_url || '',
        large_file_url: post.large_file_url || post.file_url || post.preview_file_url || '',
        file_url: post.file_url || post.large_file_url || post.preview_file_url || '',
      })).filter((post) => post.preview_file_url && post.file_url);
      return send(res, 200, JSON.stringify(normalized), 'application/json');
    } catch (error) {
      return send(res, 502, JSON.stringify({ error: error.message }), 'application/json');
    }
  }
  if (requestUrl.pathname === '/api/tags') {
    const query = requestUrl.searchParams.get('q')?.slice(0, 80).trim() || '';
    if (!query) return send(res, 200, '[]', 'application/json');
    const upstream = new URL('https://danbooru.donmai.us/autocomplete.json');
    upstream.search = new URLSearchParams({ 'search[query]': query, 'search[type]': 'tag_query', limit: '10' });
    try {
      const response = await fetchDanbooru(upstream);
      if (!response.ok) throw new Error(`Danbooru autocomplete returned ${response.status}`);
      const results = await response.json();
      const tags = results.map((item) => ({
        name: item.value || item.label || item.name || '',
        label: item.label || item.value || item.name || '',
        category: item.category ?? null,
        post_count: item.post_count ?? null,
      })).filter((item) => item.name);
      return send(res, 200, JSON.stringify(tags), 'application/json');
    } catch (error) {
      return send(res, 502, JSON.stringify({ error: error.message }), 'application/json');
    }
  }
  if (requestUrl.pathname === '/api/image') {
    const source = requestUrl.searchParams.get('url') || '';
    if (!isAllowedImageUrl(source)) return send(res, 400, 'Unsupported image URL.');
    try {
      const response = await fetch(source, { headers: { 'User-Agent': 'HoloStudio/1.0 (personal art tool)', Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' } });
      if (!response.ok) throw new Error(`Image host returned ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Image host returned non-image content (${contentType || 'unknown'})`);
      return send(res, 200, Buffer.from(await response.arrayBuffer()), contentType, { 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'same-origin' });
    } catch (error) {
      return send(res, 502, error.message);
    }
  }
  const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const base = process.env.NODE_ENV === 'production' ? resolve(root, 'dist') : root;
  const baseWithSep = base.endsWith(sep) ? base : `${base}${sep}`;
  const filename = resolve(base, `.${pathname}`);
  if (filename !== base && !filename.startsWith(baseWithSep)) return send(res, 404, 'Not found.');
  try {
    if (!(await stat(filename)).isFile()) throw new Error();
    const content = await readFile(filename);
    return send(res, 200, content, types[extname(filename)] || 'application/octet-stream');
  } catch {
    try { return send(res, 200, await readFile(resolve(base, 'index.html')), types['.html']); }
    catch { return send(res, 404, 'Not found.'); }
  }
}
export const server = createServer(handler);
if (process.env.NODE_ENV !== 'test') server.listen(port, '0.0.0.0', () => console.log(`Holo Studio listening on http://0.0.0.0:${port}`));
