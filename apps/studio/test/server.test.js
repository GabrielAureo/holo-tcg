import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { createHandler, injectLcpPreload, isAllowedImageUrl, normalizeDanbooruQuery, parseProviderIds, server } from '../server.mjs';

test('only trusted HTTPS image sources are proxied', () => {
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('https://us-west-2.cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('http://cdn.donmai.us/example.jpg'), false);
  assert.equal(isAllowedImageUrl('https://static.konachan.com/example.jpg'), true);
  assert.equal(isAllowedImageUrl('https://static.zerochan.net/example.jpg'), true);
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us.evil.test/example.jpg'), false);
  assert.equal(isAllowedImageUrl('https://zerochan.net.evil.test/example.jpg'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
});

test('shared artwork gets a safe preload URL in the HTML head', () => {
  const html = injectLcpPreload('<head></head>', 'https://cdn.donmai.us/original/example.jpg');
  assert.match(html, /rel="preload" as="image"/);
  assert.match(html, /width=720/);
  assert.equal(injectLcpPreload('<head></head>', 'https://evil.test/example.jpg'), '<head></head>');
});

test('rating defaults to general without overriding an explicit rating', () => {
  assert.equal(normalizeDanbooruQuery('hololive solo'), 'hololive solo rating:g');
  assert.equal(normalizeDanbooruQuery('hololive rating:explicit'), 'hololive rating:explicit');
  assert.equal(normalizeDanbooruQuery('hololive rating:e'), 'hololive rating:e');
  assert.equal(normalizeDanbooruQuery('hololive rating:sensitive'), 'hololive rating:sensitive');
});

test('provider selection requires at least one known provider', () => {
  assert.deepEqual(parseProviderIds('danbooru,zerochan,danbooru', ['danbooru', 'zerochan']), ['danbooru', 'zerochan']);
  assert.throws(() => parseProviderIds('', ['danbooru'], []), /at least one/i);
  assert.throws(() => parseProviderIds('unknown', ['danbooru']), /Unsupported artwork provider/);
});

test('posts endpoint injects selected providers into the artwork search', async () => {
  const calls = [];
  const localServer = createServer(createHandler({
    artworkSearch: {
      providers: [{ id: 'danbooru', label: 'Danbooru' }, { id: 'zerochan', label: 'Zerochan' }],
      search: async (criteria) => {
        calls.push(criteria);
        return { items: [], errors: [] };
      },
    },
    danbooruProvider: { suggestTags: async () => [] },
  }));
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
  const { port } = localServer.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/posts?q=miku&page=2&providers=danbooru,zerochan`);

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], { query: 'miku', page: 2, limit: 24, providerIds: ['danbooru', 'zerochan'] });
  assert.deepEqual(await response.json(), { items: [], errors: [] });
  await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
});

test('crawler and agent guidance endpoints return their own text formats', async () => {
  const localServer = createServer(createHandler({
    artworkSearch: { providers: [], search: async () => ({ items: [], errors: [] }) },
    danbooruProvider: { suggestTags: async () => [] },
  }));
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
  const { port } = localServer.address();

  const robots = await fetch(`http://127.0.0.1:${port}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/api\//);

  const llms = await fetch(`http://127.0.0.1:${port}/llms.txt`);
  assert.equal(llms.status, 200);
  assert.match(await llms.text(), /^# Holo Studio/m);
  await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
});

test('image proxy emits a resized modern format when requested', async () => {
  const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ff00aa' } }).png().toBuffer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(source, { status: 200, headers: { 'content-type': 'image/png' } });
  const localServer = createServer(createHandler({
    artworkSearch: { providers: [], search: async () => ({ items: [], errors: [] }) },
    danbooruProvider: { suggestTags: async () => [] },
  }));
  try {
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    const { port } = localServer.address();
    const params = new URLSearchParams({ url: 'https://cdn.donmai.us/test.png', width: '180', format: 'webp' });
    const response = await originalFetch(`http://127.0.0.1:${port}/api/image?${params}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(metadata.width, 180);

    const originalResponse = await originalFetch(`http://127.0.0.1:${port}/api/image?url=${encodeURIComponent('https://cdn.donmai.us/test.png')}`);
    assert.equal(originalResponse.headers.get('content-type'), 'image/png');
    assert.equal((await sharp(Buffer.from(await originalResponse.arrayBuffer())).metadata()).width, 400);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve, reject) => localServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('health endpoint confirms requests reached the application', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
