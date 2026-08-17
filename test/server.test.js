import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageUrl, normalizeDanbooruQuery, server } from '../server.mjs';

test('only trusted HTTPS image sources are proxied', () => {
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('https://us-west-2.cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('http://cdn.donmai.us/example.jpg'), false);
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us.evil.test/example.jpg'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
});

test('rating defaults to general without overriding an explicit rating', () => {
  assert.equal(normalizeDanbooruQuery('hololive solo'), 'hololive solo rating:g');
  assert.equal(normalizeDanbooruQuery('hololive rating:explicit'), 'hololive rating:explicit');
  assert.equal(normalizeDanbooruQuery('hololive rating:e'), 'hololive rating:e');
  assert.equal(normalizeDanbooruQuery('hololive rating:sensitive'), 'hololive rating:sensitive');
});

test('health endpoint confirms requests reached the application', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
