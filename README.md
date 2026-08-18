# Holo Studio

Holo Studio is an experimental holographic trading-card composer built for the web.

It lets you browse character artwork from Danbooru, place it inside a collectible-card layout, apply interactive holographic effects, separate the subject from the background locally in the browser, and independently style the background and foreground layers.

The repository is organized as a monorepo so the card data model, rendering layer, and Studio can evolve independently.

> This is a personal/experimental project. Artwork displayed by the app belongs to its respective artists and source sites.

## Features

- Search Danbooru by tags with autocomplete.
- Interactive holographic card effects inspired by modern trading cards.
- Adjustable artwork position and scale.
- Full-body and in-frame artwork modes.
- Multiple card backs.
- Card flip interaction.
- Client-side subject/background separation using IMG.LY background removal.
- Independent holographic effects for the background and separated subject.
- Subject-mask refinement controls:
  - threshold
  - feather
  - expand / contract
- Web Workers for expensive image-processing work.
- Local image proxy for browser-side image processing.
- Shareable card state through URL query parameters is being developed.

## Repository structure

```text
.
├── apps/
│   └── studio/                 # The interactive card editor
│       ├── assets/
│       ├── scripts/
│       ├── src/
│       ├── test/
│       ├── index.html
│       ├── package.json
│       └── server.mjs
│
├── packages/
│   ├── card-schema/            # Serializable card definition contract
│   │   └── src/index.ts
│   └── card-renderer/          # Reusable card rendering package
│       └── src/index.ts
│
├── package.json                # npm workspace entry point
├── Dockerfile
└── README.md
```

The current Studio implementation remains in vanilla JavaScript while the rendering refactor is carried out incrementally. The monorepo boundary exists first so that the migration can happen without coupling the editor to the renderer.

## Packages

### `@holo/card-schema`

Owns the serializable representation of a card.

The long-term rule is that visual card state should be expressible as a `CardDefinition`, rather than being stored implicitly in DOM state.

The initial schema includes:

- artwork URL and display name;
- artwork position and scale;
- full-body / in-frame treatment;
- subject-separation state;
- mask settings;
- background holo;
- subject holo;
- card back.

Runtime-only values such as generated `blob:` URLs do not belong in the serialized definition.

### `@holo/card-renderer`

This package is the home for reusable card rendering.

The intended boundary is simple:

```text
CardDefinition
      ↓
Card Renderer
      ↓
Rendered card
```

The renderer should consume card data and render it. Editing controls, artwork search, and provider-specific behavior belong in the Studio instead.

The package is currently scaffolded; the existing visual implementation will be migrated into it incrementally.

### `@holo/studio`

The Studio is the editor application.

It currently contains the existing working application, including:

- Danbooru search and tag autocomplete;
- artwork selection;
- card controls;
- holo controls;
- subject separation;
- mask refinement;
- the Node proxy/server.

As the refactor progresses, the Studio should increasingly become an editor for `CardDefinition` and delegate visual output to `@holo/card-renderer`.

## Tech stack

Current implementation:

- HTML
- CSS
- Vanilla JavaScript / ES modules
- TypeScript for shared package contracts
- Node.js 20+
- npm workspaces
- Web Workers
- [IMG.LY background-removal-js](https://github.com/imgly/background-removal-js)
- Danbooru API

The renderer/Studio migration is designed so React and Vite can be introduced without changing the serialized card contract.

## Getting started

### Requirements

- Node.js 20 or newer
- npm

Clone the repository and install workspace dependencies:

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

The root commands delegate to the `@holo/studio` workspace, so contributors normally do not need to `cd` into `apps/studio`.

The first subject-separation run may need to download IMG.LY model assets and can take longer than subsequent runs.

## Useful commands

Run these from the repository root:

```bash
# Development server
npm run dev

# Fetch/cache holographic assets
npm run assets:holo

# Build the Studio
npm run build

# Run the production build
npm start

# Run Studio tests
npm test
```

The application listens on port `4173` by default. You can override it with:

```bash
PORT=3000 npm run dev
```

## Current Studio architecture

Most of the current application lives in `apps/studio/src`.

Important files include:

```text
apps/studio/src/main.js
apps/studio/src/holo.css
apps/studio/src/holo-extra.css
apps/studio/src/layered-controls.js
apps/studio/src/background-worker.js
apps/studio/src/mask-refine-worker.js
```

`main.js` currently owns much of the application state and UI. During the renderer refactor, visual state should move toward `CardDefinition` while DOM-specific rendering behavior moves toward `packages/card-renderer`.

## Danbooru integration

Provider-specific integration belongs to the Studio, not the renderer.

All current Danbooru server integration lives in:

```text
apps/studio/server.mjs
```

The frontend calls the local server rather than Danbooru directly.

Available endpoints:

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

The server translates the request to Danbooru's `posts.json` endpoint.

### Tag autocomplete

```text
GET /api/tags?q=tanya
```

The server proxies Danbooru's autocomplete endpoint and returns a simplified response.

### Images

```text
GET /api/image?url=...
```

The image proxy is restricted to HTTPS URLs from `donmai.us` and its subdomains.

The proxy is needed because client-side image processing requires access to the actual image bytes without cross-origin restrictions getting in the way.

## Subject separation

Subject separation happens locally in the browser.

Current flow:

```text
remote image
    ↓
/api/image proxy
    ↓
Studio
    ↓
background-worker.js
    ↓
IMG.LY background removal
    ↓
foreground Blob
```

The generated foreground uses a browser-local `blob:` URL and is not uploaded to another image-processing service.

Mask refinement runs in `mask-refine-worker.js` and supports threshold, feather, and expand/contract settings.

For serialized cards, only the fact that separation was requested and the settings needed to reproduce it should be persisted. Generated blobs are runtime state.

## Holographic effects

The current visual effects are primarily CSS-based.

The main files are:

```text
apps/studio/src/holo.css
apps/studio/src/holo-extra.css
```

Effects use gradients, blend modes, masks, textures, filters, and CSS custom properties driven by pointer movement.

These effects will move behind the renderer boundary as the refactor progresses.

## Contributing

Contributions are welcome.

For anything larger than a tiny fix, create a branch and open a pull request instead of pushing directly to `main`.

A typical workflow:

```bash
git checkout main
git pull
git checkout -b your-feature-name

npm install

# make changes

npm test
npm run dev

git add .
git commit -m "Describe your change"
git push -u origin your-feature-name
```

When changing visual effects, screenshots or short recordings in the PR are especially useful.

When changing subject separation or masks, test with several kinds of artwork. Detailed hair, transparent areas, bright or dark backgrounds, and subjects touching image edges tend to expose problems quickly.

## Codespaces

The project works in GitHub Codespaces with the same root-level commands:

```bash
npm install
npm run dev
```

Expose port `4173` from the **Ports** tab.

To verify the forwarded URL is reaching the Studio server, open:

```text
https://<codespace>-4173.app.github.dev/api/health
```

Expected response:

```json
{"ok":true}
```

## Production hosting

The Studio requires its Node server for provider APIs and the image proxy, so plain GitHub Pages is not enough for the current architecture.

A production build can be created from the repository root with:

```bash
npm run build
npm start
```

## Privacy and content

Background removal and mask refinement happen locally in the browser.

The selected image is fetched through this project's proxy but is not sent to an additional background-removal API.

Artwork remains the property of its original artists and licensors. This repository does not grant rights to redistribute artwork returned by external providers.

Before using the project commercially, review the licenses and terms for IMG.LY, Danbooru, the holographic texture assets, and any artwork shown by the application.

## License

No project license has been selected yet.

If this repository is going to accept broader public contributions, adding an explicit open-source license should be one of the next steps.
