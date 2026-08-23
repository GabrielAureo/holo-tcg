import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { artworkSearch as defaultArtworkSearch, danbooruProvider as defaultDanbooruProvider } from "./api/index.mjs";
import { USER_AGENT } from "./api/http.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const allowedImageDomains = ["donmai.us", "konachan.com", "konachan.net", "zerochan.net"];
let vite = null;

export function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      allowedImageDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

export function parseProviderIds(value, availableProviderIds, fallback = ["danbooru"]) {
  if (value == null) return fallback;
  const providerIds = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!providerIds.length) throw new Error("Select at least one artwork provider.");
  const unsupported = providerIds.filter((id) => !availableProviderIds.includes(id));
  if (unsupported.length) {
    throw new Error(`Unsupported artwork provider: ${unsupported.join(", ")}`);
  }
  return providerIds;
}

function send(
  res,
  status,
  body,
  type = "text/plain; charset=utf-8",
  headers = {},
) {
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(body);
}

export function createHandler({
  artworkSearch = defaultArtworkSearch,
  danbooruProvider = defaultDanbooruProvider,
} = {}) {
  const availableProviderIds = artworkSearch.providers.map(({ id }) => id);

  return async function handler(req, res) {
    const requestUrl = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`,
    );
    if (requestUrl.pathname === "/api/health") {
      return send(res, 200, JSON.stringify({ ok: true }), "application/json");
    }

    if (requestUrl.pathname === "/api/posts") {
      const query =
        requestUrl.searchParams.get("q")?.slice(0, 160).trim() || "hololive";
      const page = Math.max(
        1,
        Math.min(1000, Number(requestUrl.searchParams.get("page")) || 1),
      );
      let providerIds;
      try {
        providerIds = parseProviderIds(
          requestUrl.searchParams.get("providers"),
          availableProviderIds,
        );
        const result = await artworkSearch.search({
          query,
          page,
          limit: 24,
          providerIds,
        });
        if (!result.items.length && result.errors.length === providerIds.length) {
          return send(
            res,
            502,
            JSON.stringify({ error: result.errors[0]?.error || "Artwork providers failed.", errors: result.errors }),
            "application/json",
          );
        }
        return send(res, 200, JSON.stringify(result), "application/json");
      } catch (error) {
        return send(
          res,
          400,
          JSON.stringify({ error: error.message }),
          "application/json",
        );
      }
    }

    if (requestUrl.pathname === "/api/tags") {
      const query = requestUrl.searchParams.get("q")?.slice(0, 80).trim() || "";
      if (!query) return send(res, 200, "[]", "application/json");
      try {
        const tags = await danbooruProvider.suggestTags(query);
        return send(res, 200, JSON.stringify(tags), "application/json");
      } catch (error) {
        return send(
          res,
          502,
          JSON.stringify({ error: error.message }),
          "application/json",
        );
      }
    }

    if (requestUrl.pathname === "/api/image") {
      const source = requestUrl.searchParams.get("url") || "";
      if (!isAllowedImageUrl(source))
        return send(res, 400, "Unsupported image URL.");
      try {
        const response = await fetch(source, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });
        if (!response.ok)
          throw new Error(`Image host returned ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/"))
          throw new Error(
            `Image host returned non-image content (${contentType || "unknown"})`,
          );
        return send(
          res,
          200,
          Buffer.from(await response.arrayBuffer()),
          contentType,
          {
            "Cache-Control": "public, max-age=86400",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        );
      } catch (error) {
        return send(res, 502, error.message);
      }
    }

    if (vite)
      return vite.middlewares(req, res, () => send(res, 404, "Not found."));

    const pathname = decodeURIComponent(
      requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname,
    );
    const base = resolve(root, "dist");
    const baseWithSep = base.endsWith(sep) ? base : `${base}${sep}`;
    const filename = resolve(base, `.${pathname}`);
    if (filename !== base && !filename.startsWith(baseWithSep))
      return send(res, 404, "Not found.");
    try {
      if (!(await stat(filename)).isFile()) throw new Error();
      return send(
        res,
        200,
        await readFile(filename),
        types[extname(filename)] || "application/octet-stream",
      );
    } catch {
      try {
        return send(
          res,
          200,
          await readFile(resolve(base, "index.html")),
          types[".html"],
        );
      } catch {
        return send(res, 404, "Not found.");
      }
    }
  };
}

if (process.env.NODE_ENV === "development") {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
}

export { normalizeDanbooruQuery } from "./api/providers/danbooru.mjs";
export const server = createServer(createHandler());
if (process.env.NODE_ENV !== "test")
  server.listen(port, "0.0.0.0", () =>
    console.log(`Holo Studio listening on http://0.0.0.0:${port}`),
  );
