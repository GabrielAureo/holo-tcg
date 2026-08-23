import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHandler, isAllowedImageUrl, normalizeDanbooruQuery, parseProviderIds, server } from '../server.mjs';

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

test('health endpoint confirms requests reached the application', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
