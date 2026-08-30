import { createArtwork, defineArtworkProvider } from "../artwork-provider.mjs";
import { fetchJson } from "../http.mjs";

export function normalizeDanbooruQuery(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return "hololive rating:g";
  return /(?:^|\s)rating:(?:g|s|q|e|general|sensitive|questionable|explicit)(?:\s|$)/i.test(
    normalized,
  )
    ? normalized
    : `${normalized} rating:g`;
}

export function createDanbooruProvider({ fetchImpl = fetch } = {}) {
  return defineArtworkProvider({
    id: "danbooru",
    label: "Danbooru",
    async search({ query, page, limit }) {
      const url = new URL("https://danbooru.donmai.us/posts.json");
      url.search = new URLSearchParams({
        tags: normalizeDanbooruQuery(query),
        page: String(page),
        limit: String(limit),
      });

      const posts = await fetchJson(url, { fetchImpl, provider: "Danbooru" });
      return posts
        .map((post) => createArtwork("danbooru", {
          id: post.id,
          character: post.tag_string_character,
          artist: post.tag_string_artist,
          width: post.image_width,
          height: post.image_height,
          previewUrl: post.preview_file_url,
          largeUrl: post.large_file_url,
          fileUrl: post.file_url,
          sourceUrl: post.id ? `https://danbooru.donmai.us/posts/${post.id}` : undefined,
        }))
        .filter((post) => post.preview_file_url && post.file_url);
    },
    async suggestTags(query) {
      const url = new URL("https://danbooru.donmai.us/autocomplete.json");
      url.search = new URLSearchParams({
        "search[query]": String(query || "").slice(0, 80).trim(),
        "search[type]": "tag_query",
        limit: "10",
      });

      const results = await fetchJson(url, {
        fetchImpl,
        provider: "Danbooru autocomplete",
      });
      return results
        .map((item) => ({
          name: item.value || item.label || item.name || "",
          label: item.label || item.value || item.name || "",
          category: item.category ?? null,
          post_count: item.post_count ?? null,
        }))
        .filter((item) => item.name);
    },
  });
}

export const danbooruProvider = createDanbooruProvider();
