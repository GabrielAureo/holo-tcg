# Holo Studio

Holo Studio is an experimental holographic trading-card composer for the web.

It lets you browse character artwork, place it in a collectible-card layout, apply interactive holographic effects, separate the subject from the background locally in the browser, and style the background and subject independently.

> This is a personal/experimental project. Artwork displayed by the app belongs to its respective artists and source sites.

## Features

- Search Danbooru artwork by tags with autocomplete.
- Position and scale artwork inside the card.
- Full-body and in-frame art treatments.
- Multiple holographic effect recipes.
- Separate background and subject holo effects.
- Local subject separation with IMG.LY background removal.
- Mask controls for threshold, feather, and expand/contract.
- Multiple card backs.
- Interactive tilt, glare, and card flipping.
- Shareable card state through URL query parameters.
- Web Workers for image-processing work.

## Repository structure

```text
.
├── apps/
│   └── studio/                 # React/Vite card editor + Node API server
│       ├── src/
│       ├── test/
│       ├── index.html
│       ├── package.json
│       ├── server.mjs
│       └── vite.config.ts
│
├── packages/
│   ├── card-schema/            # Serializable CardDefinition contract
│   │   └── src/index.ts
│   └── card-renderer/          # Reusable React card renderer
│       ├── assets/
│       │   ├── card-backs/
│       │   └── holo/
│       └── src/
│
├── package.json                # npm workspace entry point
├── Dockerfile
└── README.md
```

## Architecture

The application is split around one central contract: `CardDefinition`.

```text
Studio controls
      ↓
CardDefinition
      ↓
CardRenderer
      ↓
Rendered card
```

### `@holo/card-schema`

Owns the serializable representation of a card.

The schema contains persistent visual state such as:

- artwork URL and display name;
- artwork x/y position and scale;
- full-body or in-frame mode;
- subject-separation state;
- mask threshold, feather, and expand values;
- background holo;
- subject holo;
- card back.

Runtime-only values such as generated `blob:` URLs are intentionally not serialized.

### `@holo/card-renderer`

Owns card rendering and card-specific runtime behavior.

The renderer contains:

- the `CardRenderer` React component;
- card markup and visual layers;
- holographic CSS recipes;
- holographic texture maps;
- card-back assets;
- tilt, glare, and flip behavior;
- subject-separation worker;
- mask-refinement worker;
- generated foreground-blob lifecycle.

The holo maps are committed directly under:

```text
packages/card-renderer/assets/holo
```

They are bundled from package-relative CSS URLs. Development and production no longer download texture maps from an external CDN.

Basic usage:

```tsx
import { CardRenderer } from '@holo/card-renderer';

<CardRenderer
  card={cardDefinition}
  resolveArtworkUrl={(url) => `/api/image?url=${encodeURIComponent(url)}`}
/>
```

`resolveArtworkUrl` is an environment adapter. The serialized card keeps the original artwork URL while the Studio can route artwork through its local image proxy.

### `@holo/studio`

The Studio is the editor application.

It owns:

- artwork search and tag autocomplete;
- editor controls;
- the current `CardDefinition` state;
- shareable query-param serialization/deserialization;
- Danbooru integration;
- the local Node API/image proxy.

The Studio does not own the card DOM or card rendering effects. Its controls update `CardDefinition` and pass it to `CardRenderer`.

## Tech stack

- React
- TypeScript
- Vite
- Node.js 20+
- npm workspaces
- Web Workers
- IMG.LY background removal
- Danbooru API

## Getting started

Requirements:

- Node.js 20 or newer
- npm

Clone and install dependencies:

```bash
git clone https://github.com/GabrielAureo/holo-tcg.git
cd holo-tcg
npm install
```

Start the Studio from the repository root:

```bash
npm run dev
```

Then open:

```text
http://localhost:4173
```

The first subject-separation run may need to download IMG.LY model assets and can take longer than subsequent runs.

## Useful commands

Run these from the repository root:

```bash
# Development server
npm run dev

# Build the Studio
npm run build

# Run the production build
npm start

# Run Studio tests
npm test
```

The application listens on port `4173` by default. Override it with:

```bash
PORT=3000 npm run dev
```

## Danbooru integration

Provider-specific behavior stays in the Studio rather than the renderer.

The Node server exposes:

```text
GET /api/health
GET /api/posts
GET /api/tags
GET /api/image
```

### Search

```text
GET /api/posts?q=hololive&page=1
```

The server translates the request to Danbooru's posts API.

### Tag autocomplete

```text
GET /api/tags?q=tanya
```

The server proxies Danbooru's autocomplete endpoint and returns a simplified response.

### Images

```text
GET /api/image?url=...
```

The image proxy is restricted to HTTPS URLs from `donmai.us` and its subdomains. It exists so browser-side processing can access the image bytes without cross-origin restrictions getting in the way.

## Subject separation

Subject separation is initiated by serialized card state and executed by the renderer.

```text
original artwork URL
      ↓
resolveArtworkUrl
      ↓
renderer subject worker
      ↓
IMG.LY background removal
      ↓
renderer mask-refinement worker
      ↓
foreground Blob URL
      ↓
rendered subject layer
```

Generated Blob URLs remain runtime-only and are cleaned up by the renderer.

## Shareable card URLs

The Studio serializes reproducible card state into URL query parameters.

Shared state includes visual configuration such as artwork, placement, holo settings, subject-separation settings, mask values, and card back. Generated foreground blobs are not stored in the URL; the receiving renderer recreates the subject locally from the original artwork.

## Codespaces

The project works in GitHub Codespaces with the same root-level commands:

```bash
npm install
npm run dev
```

Expose port `4173` from the Codespaces **Ports** tab.

To verify the forwarded URL reaches the Studio server, open:

```text
https://<codespace>-4173.app.github.dev/api/health
```

Expected response:

```json
{"ok":true}
```

## Production hosting

The Studio requires its Node server for provider APIs and the image proxy, so plain GitHub Pages is not enough for the current architecture.

Create a production bundle with:

```bash
npm run build
npm start
```

## Contributing

For anything larger than a tiny fix, create a branch and open a pull request instead of pushing directly to `main`.

```bash
git checkout main
git pull
git checkout -b your-feature-name
npm install

# make changes
npm test
npm run build

git add .
git commit -m "Describe your change"
git push -u origin your-feature-name
```

When changing visual effects, screenshots or short recordings in the PR are especially useful. When changing subject separation or masks, test with several kinds of artwork, especially detailed hair, transparency, bright/dark backgrounds, and subjects touching image edges.

## Third-party assets

The holographic effect recipes and texture maps are adapted from Simey de Klerk's MIT-licensed Pokémon card holo-effect project. See `THIRD_PARTY_NOTICES.md` for attribution details.

Artwork returned by Danbooru remains the property of its original artists and licensors.
