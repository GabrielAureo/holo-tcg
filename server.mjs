import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const allowedImageHosts = new Set(['cdn.donmai.us', 'donmai.us']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

export function isAllowedImageUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && allowedImageHosts.has(url.hostname); } catch { return false; }
}
function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) { res.writeHead(status, { 'Content-Type': type, ...headers }); res.end(body); }

async function handler(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/posts') {
    const query = requestUrl.searchParams.get('q')?.slice(0, 160) || 'hololive';
    const page = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get('page')) || 1));
    const upstream = new URL('https://danbooru.donmai.us/posts.json');
    upstream.search = new URLSearchParams({ tags: `${query} rating:g`, page: String(page), limit: '24', only: 'id,tag_string_character,tag_string_artist,large_file_url,file_url,preview_file_url,image_width,image_height' });
    try { const response = await fetch(upstream, { headers: { 'User-Agent': 'HoloStudio/1.0 (personal art tool)' } }); if (!response.ok) throw new Error(`Danbooru returned ${response.status}`); return send(res, 200, await response.text(), 'application/json'); }
    catch (error) { return send(res, 502, JSON.stringify({ error: error.message }), 'application/json'); }
  }
  if (requestUrl.pathname === '/api/image') {
    const source = requestUrl.searchParams.get('url') || '';
    if (!isAllowedImageUrl(source)) return send(res, 400, 'Unsupported image URL.');
    try { const response = await fetch(source); if (!response.ok) throw new Error(`Image host returned ${response.status}`); return send(res, 200, Buffer.from(await response.arrayBuffer()), response.headers.get('content-type') || 'image/jpeg', { 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'same-origin' }); }
    catch (error) { return send(res, 502, error.message); }
  }
  let pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const base = process.env.NODE_ENV === 'production' ? resolve(root, 'dist') : root;
  let filename = resolve(base, `.${pathname}`);
  if (!filename.startsWith(`${base}${sep}`)) return send(res, 403, 'Forbidden.');
  try { if (!(await stat(filename)).isFile()) throw new Error(); const content = await readFile(filename); return send(res, 200, content, types[extname(filename)] || 'application/octet-stream'); }
  catch { try { return send(res, 200, await readFile(resolve(base, 'index.html')), types['.html']); } catch { return send(res, 404, 'Not found.'); } }
}
export const server = createServer(handler);
if (process.env.NODE_ENV !== 'test') server.listen(port, () => console.log(`Holo Studio listening on http://localhost:${port}`));
