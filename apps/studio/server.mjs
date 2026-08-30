import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import sharp from "sharp";
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
  ".txt": "text/plain; charset=utf-8",
};
const allowedImageDomains = ["donmai.us", "konachan.com", "konachan.net", "zerochan.net"];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 2048;
const DEFAULT_ARTWORK_WIDTH = 720;
const ROBOTS_TXT = "User-agent: *\nAllow: /\nDisallow: /api/\n";
const LLMS_TXT = `# Holo Studio

> Holo Studio is an experimental web app for browsing anime artwork and composing interactive holographic trading cards.

## Application

- [Open Holo Studio](/): Search artwork and compose a card.
- [Project source](https://github.com/GabrielAureo/holo-tcg): Source code and development documentation.
- [Project README](https://github.com/GabrielAureo/holo-tcg/blob/main/README.md): Features, architecture, setup, and provider details.

## Capabilities

- Search Danbooru, Konachan, and Zerochan artwork.
- Select and position artwork in standard or full-art card layouts.
- Apply interactive holographic effects, card backs, tilt, glare, and flipping.
- Remove image backgrounds locally in the browser.
- Share reproducible card state through URL parameters.

## Data and rights

Artwork belongs to its respective artists and source sites. Holo Studio is a personal experimental project and does not claim ownership of displayed artwork.
`;
let vite = null;
let criticalRendererAssets = [];

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

function boundedNumber(value, min, max, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function imageWidth(value) {
  return boundedNumber(value, 64, MAX_IMAGE_WIDTH, 0);
}

function imageQuality(value) {
  return boundedNumber(value, 45, 90, 78);
}

function imageFormat(value, accept) {
  if (value === "original" || value === "webp" || value === "avif") return value;
  return accept.includes("image/avif") ? "avif" : "webp";
}

function imageProxyUrl(source, width = DEFAULT_ARTWORK_WIDTH) {
  const params = new URLSearchParams({ url: source, width: String(width), format: "auto" });
  return `/api/image?${params}`;
}

export function injectLcpPreload(html, source) {
  if (!isAllowedImageUrl(source)) return html;
  const href = imageProxyUrl(source).replaceAll("&", "&amp;");
  const rendererScript = criticalRendererAssets.find((asset) => /^CardRenderer-.*\.js$/.test(asset));
  const rendererStyle = criticalRendererAssets.find((asset) => /^CardRenderer-.*\.css$/.test(asset));
  const rendererPreloads = [
    rendererScript && `  <link rel="modulepreload" href="/assets/${rendererScript}" />`,
    rendererStyle && `  <link rel="preload" as="style" href="/assets/${rendererStyle}" />`,
  ].filter(Boolean).join("\n");
  return html.replace(
    "</head>",
    `  <link rel="preload" as="image" href="${href}" fetchpriority="high" />${rendererPreloads ? `\n${rendererPreloads}` : ""}\n</head>`,
  );
}

async function optimizeImage(body, width, format, quality) {
  if (!width || format === "original") return { body, contentType: "" };
  let image = sharp(body, { limitInputPixels: 50_000_000 }).resize({
    width,
    withoutEnlargement: true,
  });
  if (format === "avif") {
    return {
      body: await image.avif({ quality: Math.min(quality, 65), effort: 4 }).toBuffer(),
      contentType: "image/avif",
    };
  }
  return {
    body: await image.webp({ quality, effort: 4 }).toBuffer(),
    contentType: "image/webp",
  };
}

function send(
  res,
  status,
  body,
  type = "text/plain; charset=utf-8",
  headers = {},
) {
  const contentLength = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
  res.writeHead(status, { "Content-Type": type, "Content-Length": contentLength, ...headers });
  res.end(body);
}

async function readLimitedBody(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) {
    throw new Error("Image is larger than the 20 MB limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_IMAGE_BYTES) throw new Error("Image is larger than the 20 MB limit.");
    return body;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("Image is larger than the 20 MB limit.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
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
    if (requestUrl.pathname === "/robots.txt") {
      return send(res, 200, ROBOTS_TXT, "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
    }
    if (requestUrl.pathname === "/llms.txt") {
      return send(res, 200, LLMS_TXT, "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
    }
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
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new Error(`Image host returned ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/"))
          throw new Error(
            `Image host returned non-image content (${contentType || "unknown"})`,
          );
        const width = imageWidth(requestUrl.searchParams.get("width"));
        const requestedFormat = requestUrl.searchParams.get("format") || "auto";
        const format = imageFormat(requestedFormat, req.headers.accept || "");
        const optimized = await optimizeImage(
          await readLimitedBody(response),
          width,
          format,
          imageQuality(requestUrl.searchParams.get("quality")),
        );
        return send(
          res,
          200,
          optimized.body,
          optimized.contentType || contentType,
          {
            "Cache-Control": "public, max-age=2592000, stale-while-revalidate=604800",
            "Cross-Origin-Resource-Policy": "same-origin",
            ...(requestedFormat === "auto" ? { Vary: "Accept" } : {}),
          },
        );
      } catch (error) {
        return send(res, 502, error.message);
      }
    }

    const isHtmlRequest = requestUrl.pathname === "/" || requestUrl.pathname === "/index.html";
    if (vite) {
      if (isHtmlRequest) {
        const sourceHtml = await readFile(resolve(root, "index.html"), "utf8");
        const html = await vite.transformIndexHtml(
          req.url,
          injectLcpPreload(sourceHtml, requestUrl.searchParams.get("img")),
        );
        return send(res, 200, html, types[".html"], { "Cache-Control": "no-cache" });
      }
      return vite.middlewares(req, res, () => send(res, 404, "Not found."));
    }

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
      const isHashedAsset = pathname.startsWith("/assets/");
      const extension = extname(filename);
      const body = extension === ".html"
        ? injectLcpPreload(await readFile(filename, "utf8"), requestUrl.searchParams.get("img"))
        : await readFile(filename);
      return send(
        res,
        200,
        body,
        types[extension] || "application/octet-stream",
        { "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache" },
      );
    } catch {
      try {
        return send(
          res,
          200,
          injectLcpPreload(
            await readFile(resolve(base, "index.html"), "utf8"),
            requestUrl.searchParams.get("img"),
          ),
          types[".html"],
          { "Cache-Control": "no-cache" },
        );
      } catch {
        return send(res, 404, "Not found.");
      }
    }
  };
}

if (process.env.NODE_ENV !== "development") {
  try {
    criticalRendererAssets = await readdir(resolve(root, "dist/assets"));
  } catch {
    criticalRendererAssets = [];
  }
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
