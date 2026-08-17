# Holo Studio

An interactive holographic trading-card composer. Browse general-rated Danbooru posts, choose full-body or framed treatment, move and scale the art, and use [IMG.LY background removal](https://github.com/imgly/background-removal-js) to isolate the subject locally in the browser.

## Run locally

Requires Node.js 20 or newer.

```bash
npm run dev
```

Open `http://localhost:4173`. The dependency-free Node server serves the app and proxies imageboard requests. For a production-style local run, use `npm run build && NODE_ENV=production npm start`. The first background-removal run downloads a sizeable model and can take a minute.

## Codespaces / public hosting

This app needs its small Node server to proxy remote images (browser AI processing requires CORS-safe image bytes) and to apply Basic Auth. **GitHub Pages cannot securely provide either server-side proxying or Basic Auth**, so it is not a suitable public host for this build.

In GitHub Codespaces:

1. Build with `npm run build`.
2. Create secrets named `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` (use a long random password).
3. Run `npm start`.
4. In the **Ports** tab, expose port `4173`. If you make it public, the app's own Basic Auth remains in front of every route.

For any container host, build the included `Dockerfile`, expose port `4173`, and set those same environment variables. The server permits unprotected local use when the variables are absent, but they should always be set on a public deployment.

## Content and privacy

Searches add Danbooru's `rating:g` tag. Artwork remains owned by its artists and source site. IMG.LY processing runs client-side; selected image data is not uploaded to an additional background-removal service. Review IMG.LY's package and model licenses before commercial deployment.
