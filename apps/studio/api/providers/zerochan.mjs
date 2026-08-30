import { createArtwork, defineArtworkProvider } from "../artwork-provider.mjs";
import { fetchJson } from "../http.mjs";

function normalizeZerochanQuery(query) {
  return String(query || "")
    .trim()
    .split(/\s+/)
    .filter((tag) => tag && !/^[+-]?(rating|order|score|width|height|date|user|id):/i.test(tag))
    .join(" ");
}

function encodeZerochanTags(query) {
  return encodeURIComponent(normalizeZerochanQuery(query)).replaceAll("%20", "+");
}

export function createZerochanProvider({ fetchImpl = fetch } = {}) {
  return defineArtworkProvider({
    id: "zerochan",
    label: "Zerochan",
    async search({ query, page, limit }) {
      const tags = encodeZerochanTags(query);
      const url = new URL(`https://www.zerochan.net/${tags}`);
      url.search = new URLSearchParams({
        p: String(page),
        l: String(limit),
        json: "1",
        s: "fav",
        d: "2",
      });

      const payload = await fetchJson(url, { fetchImpl, provider: "Zerochan" });
      const items = Array.isArray(payload) ? payload : payload.items || [];

      return items
        .map((item) => {
          const fileUrl = item.full || item.file || item.url || "";
          return createArtwork("zerochan", {
            id: item.id,
            character: item.primary || item.name,
            artist: item.author,
            width: item.width,
            height: item.height,
            previewUrl: item.thumbnail || item.thumb || item.preview || fileUrl,
            largeUrl: fileUrl,
            fileUrl,
            sourceUrl: item.id ? `https://www.zerochan.net/${item.id}` : undefined,
          });
        })
        .filter((post) => post.preview_file_url && post.file_url);
    },
  });
}

export { encodeZerochanTags, normalizeZerochanQuery };
export const zerochanProvider = createZerochanProvider();
