import { createArtwork, defineArtworkProvider } from "../artwork-provider.mjs";
import { fetchJson } from "../http.mjs";

function normalizeKonachanQuery(query) {
  const tags = String(query || "")
    .trim()
    .split(/\s+/)
    .filter((tag) => tag && !/^[+-]?(rating|order|mpixels):/i.test(tag));
  return [...tags, "rating:s", "mpixels:>=1", "order:mpixels"].join(" ");
}

export function createKonachanProvider({ fetchImpl = fetch } = {}) {
  return defineArtworkProvider({
    id: "konachan",
    label: "Konachan",
    async search({ query, page, limit }) {
      const url = new URL("https://konachan.com/post.json");
      url.search = new URLSearchParams({
        tags: normalizeKonachanQuery(query),
        page: String(page),
        limit: String(limit),
      });

      const posts = await fetchJson(url, { fetchImpl, provider: "Konachan" });
      return posts
        .map((post) => createArtwork("konachan", {
          id: post.id,
          character: post.tags,
          artist: post.author,
          width: post.width || post.image_width,
          height: post.height || post.image_height,
          previewUrl: post.preview_url || post.preview_file_url,
          largeUrl: post.sample_url || post.large_file_url,
          fileUrl: post.file_url,
          sourceUrl: post.id ? `https://konachan.com/post/show/${post.id}` : undefined,
        }))
        .filter((post) => post.preview_file_url && post.file_url);
    },
  });
}

export { normalizeKonachanQuery };
export const konachanProvider = createKonachanProvider();
