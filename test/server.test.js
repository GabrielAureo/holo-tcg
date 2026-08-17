import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageUrl } from '../server.mjs';

test('only trusted HTTPS image sources are proxied', () => {
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('http://cdn.donmai.us/example.jpg'), false);
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us.evil.test/example.jpg'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
});
