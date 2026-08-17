import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageUrl, isAuthorized } from '../server.mjs';

test('only trusted HTTPS image sources are proxied', () => {
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us/original/example.jpg'), true);
  assert.equal(isAllowedImageUrl('http://cdn.donmai.us/example.jpg'), false);
  assert.equal(isAllowedImageUrl('https://cdn.donmai.us.evil.test/example.jpg'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
});

test('Basic Auth is optional locally and enforced when configured', () => {
  assert.equal(isAuthorized(undefined, undefined, undefined), true);
  assert.equal(isAuthorized(`Basic ${Buffer.from('artist:secret').toString('base64')}`, 'artist', 'secret'), true);
  assert.equal(isAuthorized(`Basic ${Buffer.from('artist:wrong').toString('base64')}`, 'artist', 'secret'), false);
  assert.equal(isAuthorized(undefined, 'artist', 'secret'), false);
});
