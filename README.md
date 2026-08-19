# Holo Studio

Holo Studio is an experimental holographic trading-card composer for the web.

It lets you browse character artwork, place it in a collectible-card layout, apply interactive holographic effects, separate the subject from the background locally in the browser, and style the background and subject independently.

> This is a personal/experimental project. Artwork displayed by the app belongs to its respective artists and source sites.

## Features

- Search Danbooru artwork by tags with autocomplete.
- Position, drag, auto-fit, and scale artwork inside the card.
- Full-body and in-frame art treatments.
- Multiple holographic effect recipes and reusable effect previews.
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

Owns the serializable representation of a card: artwork URL/name, placement, scale, art mode, subject-separation state, mask settings, background holo, subject holo, and card back. Runtime-only values such as generated `blob:` URLs are intentionally not serialized.

### `@holo/card-renderer`

Owns card rendering and card-specific runtime behavior: `CardRenderer`, card markup, visual layers, holo CSS and texture maps, card backs, tilt/glare/flip, subject separation, mask refinement, generated foreground-blob lifecycle, and `HoloEffectPreview`.

Background removal and mask refinement are separate runtime stages. Changing mask settings refines the cached subject cutout; it does not rerun IMG.LY background removal. Obsolete worker jobs are terminated when renderer state changes.

The renderer exposes consumer integration at its component boundary. A consumer can style the renderer root through `className`, receive artwork load metrics, and optionally handle normalized artwork-placement updates. Consumer applications should not style renderer descendants.

```tsx
import { CardRenderer } from '@holo/card-renderer';

<CardRenderer
  className="studio-card-preview"
  card={cardDefinition}
  resolveArtworkUrl={(url) => `/api/image?url=${encodeURIComponent(url)}`}
/>
```

`resolveArtworkUrl` is an environment adapter. The serialized card keeps the original artwork URL while the Studio can route artwork through its local image proxy.

The holo maps are committed under `packages/card-renderer/assets/holo` and bundled from package-relative URLs. Development and production do not download texture maps from an external CDN.

### `@holo/studio`

The Studio owns artwork search/tag autocomplete, editor controls, `CardDefinition` state, query-param sharing, Danbooru integration, and the local Node API/image proxy. Its controls update `CardDefinition` and pass it to `CardRenderer`; it does not own card DOM or card-effect CSS.

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

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/GabrielAureo/holo-tcg.git
cd holo-tcg
npm install
npm run dev
```

Then open `http://localhost:4173`.

The first subject-separation run may need to download IMG.LY model assets and can take longer than subsequent runs.

## Useful commands

```bash
npm run dev
npm run build
npm start
npm test
```

The application listens on port `4173` by default. Override it with `PORT=3000 npm run dev`.

## Danbooru integration

Provider-specific behavior stays in the Studio rather than the renderer. The Node server exposes:

```text
GET /api/health
GET /api/posts
GET /api/tags
GET /api/image
```

The image proxy is restricted to HTTPS URLs from `donmai.us` and its subdomains so browser-side processing can access image bytes without cross-origin restrictions getting in the way.

## Subject separation

```text
original artwork URL
      ↓
resolveArtworkUrl
      ↓
renderer subject worker
      ↓
IMG.LY background removal
      ↓
cached base cutout
      ↓
renderer mask-refinement worker
      ↓
foreground Blob URL
      ↓
rendered subject layer
```

Generated Blob URLs remain runtime-only and are cleaned up by the renderer.

## Shareable card URLs

The Studio serializes reproducible card state into URL query parameters. Shared state includes artwork, placement, holo settings, subject-separation settings, mask values, and card back. Query values are validated/clamped before constructing `CardDefinition`. Generated foreground blobs are not stored in the URL; the receiving renderer recreates the subject locally from the original artwork.

## Codespaces

```bash
npm install
npm run dev
```

Expose port `4173` from the Codespaces **Ports** tab. Use `/api/health` to verify the forwarded URL reaches the Studio server; the expected response is `{"ok":true}`.

## Production hosting

The Studio requires its Node server for provider APIs and the image proxy, so plain GitHub Pages is not enough for the current architecture.

```bash
npm run build
npm start
```

## Contributing

For anything larger than a tiny fix, create a branch and open a pull request instead of pushing directly to `main`. Run `npm test` and `npm run build` before requesting review. When changing visual effects, include screenshots or recordings when useful; when changing subject separation or masks, test detailed hair, transparency, bright/dark backgrounds, and subjects touching image edges.

## Third-party assets

The holographic effect recipes and texture maps are adapted from Simey de Klerk's MIT-licensed Pokémon card holo-effect project. See `THIRD_PARTY_NOTICES.md` for attribution details.

Artwork returned by Danbooru remains the property of its original artists and licensors.
