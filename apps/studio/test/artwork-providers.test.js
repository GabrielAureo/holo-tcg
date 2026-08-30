import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtworkSearch } from '../api/artwork-search.mjs';
import { createDanbooruProvider, normalizeDanbooruQuery } from '../api/providers/danbooru.mjs';
import { createKonachanProvider, normalizeKonachanQuery } from '../api/providers/konachan.mjs';
import { createZerochanProvider, encodeZerochanTags } from '../api/providers/zerochan.mjs';

function jsonFetch(payload, calls = []) {
  return async (url) => {
    calls.push(new URL(url));
    return { ok: true, status: 200, json: async () => payload };
  };
}

test('provider-specific query rules apply safe and high-quality defaults', () => {
  assert.equal(normalizeDanbooruQuery('hololive solo'), 'hololive solo rating:g');
  assert.equal(normalizeDanbooruQuery('hololive rating:e'), 'hololive rating:e');
  assert.equal(normalizeKonachanQuery('hololive rating:e'), 'hololive rating:s mpixels:>=1 order:mpixels');
  assert.equal(encodeZerochanTags('hololive solo'), 'hololive+solo');
  assert.equal(encodeZerochanTags('hololive rating:e'), 'hololive');
});

test('Danbooru adapter returns the common artwork shape', async () => {
  const calls = [];
  const provider = createDanbooruProvider({
    fetchImpl: jsonFetch([{
      id: 10,
      tag_string_character: 'hatsune_miku',
      tag_string_artist: 'artist_name',
      image_width: 800,
      image_height: 1200,
      preview_file_url: 'https://cdn.donmai.us/preview.jpg',
      large_file_url: 'https://cdn.donmai.us/large.jpg',
      file_url: 'https://cdn.donmai.us/file.jpg',
    }], calls),
  });

  const [artwork] = await provider.search({ query: 'hatsune_miku', page: 2, limit: 24 });

  assert.equal(calls[0].pathname, '/posts.json');
  assert.equal(calls[0].searchParams.get('tags'), 'hatsune_miku rating:g');
  assert.deepEqual(artwork, {
    id: 'danbooru:10',
    provider: 'danbooru',
    tag_string_character: 'hatsune_miku',
    tag_string_artist: 'artist_name',
    image_width: 800,
    image_height: 1200,
    preview_file_url: 'https://cdn.donmai.us/preview.jpg',
    large_file_url: 'https://cdn.donmai.us/large.jpg',
    file_url: 'https://cdn.donmai.us/file.jpg',
    source_url: 'https://danbooru.donmai.us/posts/10',
  });
});

test('Konachan adapter enforces safe results and normalizes Moebooru fields', async () => {
  const calls = [];
  const provider = createKonachanProvider({
    fetchImpl: jsonFetch([{
      id: 22,
      tags: 'hatsune_miku solo',
      author: 'artist_name',
      width: 640,
      height: 960,
      preview_url: 'https://konachan.com/preview.jpg',
      sample_url: 'https://konachan.com/sample.jpg',
      file_url: 'https://konachan.com/file.jpg',
    }], calls),
  });

  const [artwork] = await provider.search({ query: 'hatsune_miku rating:e', page: 1, limit: 24 });

  assert.equal(calls[0].searchParams.get('tags'), 'hatsune_miku rating:s mpixels:>=1 order:mpixels');
  assert.equal(artwork.id, 'konachan:22');
  assert.equal(artwork.preview_file_url, 'https://konachan.com/preview.jpg');
  assert.equal(artwork.large_file_url, 'https://konachan.com/sample.jpg');
  assert.equal(artwork.file_url, 'https://konachan.com/file.jpg');
});

test('Zerochan adapter maps JSON items and pagination', async () => {
  const calls = [];
  const provider = createZerochanProvider({
    fetchImpl: jsonFetch({ items: [{
      id: 33,
      primary: 'hatsune_miku',
      width: 700,
      height: 1000,
      thumbnail: 'https://static.zerochan.net/33.thumb.jpg',
      full: 'https://static.zerochan.net/33.full.jpg',
    }] }, calls),
  });

  const [artwork] = await provider.search({ query: 'hatsune_miku', page: 3, limit: 24 });

  assert.equal(calls[0].pathname, '/hatsune_miku');
  assert.equal(calls[0].searchParams.get('p'), '3');
  assert.equal(calls[0].searchParams.get('l'), '24');
  assert.equal(calls[0].searchParams.get('json'), '1');
  assert.equal(calls[0].searchParams.get('s'), 'fav');
  assert.equal(calls[0].searchParams.get('d'), '2');
  assert.equal(artwork.id, 'zerochan:33');
  assert.equal(artwork.tag_string_character, 'hatsune_miku');
  assert.equal(artwork.file_url, 'https://static.zerochan.net/33.full.jpg');
});

test('selected providers are searched in parallel and partial failures are retained', async () => {
  const started = [];
  const search = createArtworkSearch([
    {
      id: 'slow',
      label: 'Slow',
      search: async () => {
        started.push('slow');
        await new Promise((resolve) => setTimeout(resolve, 15));
        return [{ id: 'slow:1', provider: 'slow' }];
      },
    },
    {
      id: 'broken',
      label: 'Broken',
      search: async () => {
        started.push('broken');
        throw new Error('offline');
      },
    },
  ]);

  const result = await search.search({ query: 'tag', page: 1, limit: 24, providerIds: ['slow', 'broken'] });

  assert.deepEqual(started, ['slow', 'broken']);
  assert.deepEqual(result.items, [{ id: 'slow:1', provider: 'slow' }]);
  assert.deepEqual(result.errors, [{ provider: 'broken', label: 'Broken', error: 'offline' }]);
});

test('at least one known provider is required', async () => {
  const search = createArtworkSearch([{ id: 'one', label: 'One', search: async () => [] }]);
  await assert.rejects(() => search.search({ query: 'tag', providerIds: [] }), /at least one/i);
  await assert.rejects(() => search.search({ query: 'tag', providerIds: ['missing'] }), /Unsupported artwork provider/);
});
