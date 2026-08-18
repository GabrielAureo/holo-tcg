# Holo Studio

Holo Studio is an experimental holographic trading-card composer built for the web.

It lets you browse character artwork from Danbooru, place it inside a collectible-card layout, apply interactive holographic effects, separate the subject from the background locally in the browser, and independently style the background and foreground layers.

The project is intentionally small and easy to hack on: there is no framework, database, account system, or external backend service. The frontend is plain HTML/CSS/JavaScript and the server is a small dependency-free Node.js application.

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
- Local image proxy so remote artwork can be safely consumed by browser-side processing.
- Shareable card state through URL query parameters is currently being developed.

## Tech stack

- HTML
- CSS
- Vanilla JavaScript / ES modules
- Node.js 20+
- Web Workers
- [IMG.LY background-removal-js](https://github.com/imgly/background-removal-js)
- Danbooru API

There is deliberately no frontend framework or build framework at the moment.

## Getting started

### Requirements

- Node.js 20 or newer
- npm

Clone the repository and start the development server:

```bash
git clone https://github.com/GabrielAureo/holo-tcg.git
cd holo-tcg
npm run dev
```

Then open:

```text
http://localhost:4173
```

`npm run dev` also downloads the holographic texture assets the first time they are needed. Existing assets are reused on later runs.

The first time subject separation is used, IMG.LY may also need to download its model assets, so the initial separation can take noticeably longer than subsequent runs.

## Useful commands

```bash
# Development server
npm run dev

# Fetch/cache holographic assets
npm run assets:holo

# Create the static production bundle in dist/
npm run build

# Run the production build
npm start

# Run tests
npm test
```

The application listens on port `4173` by default. You can override it with:

```bash
PORT=3000 npm run dev
```

## Project structure

```text
.
├── assets/
│   ├── card-backs/          # Card-back artwork
│   └── holo/                # Downloaded holographic textures
├── scripts/
│   ├── build.mjs            # Copies the app into dist/
│   └── fetch-holo-assets.mjs
├── src/
│   ├── main.js              # Main application state and interactions
│   ├── style.css            # Main UI/layout styles
│   ├── holo.css             # Base holographic effects
│   ├── holo-extra.css       # Additional holo recipes
│   ├── holo-picker.js       # Holo-picker UI enhancements
│   ├── flip.css             # Card flip styles
│   ├── placement-controls.js
│   ├── placement-controls.css
│   ├── layered-controls.js  # Background/subject layer controls
│   ├── layered-controls.css
│   ├── background-worker.js # Subject separation worker
│   └── mask-refine-worker.js# Subject-mask refinement worker
├── index.html
├── server.mjs               # Static server + Danbooru/image proxy API
└── package.json
```

Some feature branches may contain additional modules that have not reached `main` yet.

## Architecture

The application has two main pieces.

### Browser

Most of the application lives in the browser.

`src/main.js` creates the UI, manages the selected artwork, card state, positioning, flipping, and communication with the background-removal worker.

The browser also handles holographic rendering entirely with CSS and client-side pointer state.

Image-processing work is moved into Web Workers so expensive operations do not block the UI.

### Node server

`server.mjs` serves the frontend and exposes a few small endpoints:

```text
GET /api/health
GET /api/posts
GET /api/tags
GET /api/image
```

There is no database and the server does not persist card state.

## Danbooru integration

All Danbooru integration lives in `server.mjs`.

The frontend never calls Danbooru directly.

### Search

The browser calls:

```text
GET /api/posts?q=hololive&page=1
```

The Node server converts that into a request to Danbooru's `posts.json` endpoint.

### Tag autocomplete

The frontend calls:

```text
GET /api/tags?q=tanya
```

The server proxies Danbooru's autocomplete API and returns a simplified result to the frontend.

### Images

Remote artwork is loaded through:

```text
GET /api/image?url=...
```

The proxy is intentionally restricted to HTTPS URLs from `donmai.us` and its subdomains.

This proxy exists because subject separation needs access to the actual image bytes. Loading the artwork directly from a third-party origin would make browser-side processing much more painful because of CORS restrictions.

## Subject separation

Subject separation runs locally in the user's browser.

The basic flow is:

```text
Danbooru image
    ↓
/api/image proxy
    ↓
main.js
    ↓
background-worker.js
    ↓
IMG.LY background removal
    ↓
foreground Blob
    ↓
art-subject layer
```

The generated foreground is represented by a browser-local `blob:` URL. It is not uploaded to another image-processing service.

After separation, `layered-controls.js` allows the background and subject to use different holographic effects.

The mask can also be refined in `mask-refine-worker.js` using threshold, feather, and expand/contract values.

## Holographic effects

The visual card effects are primarily CSS-based.

The important files are:

```text
src/holo.css
src/holo-extra.css
```

Effects use gradients, blend modes, masks, background textures, filters, and CSS custom properties controlled by pointer movement.

If you are adding a new holo style, these are the first files to inspect.

## Shareable card URLs

A work-in-progress feature serializes card configuration into URL query parameters so a configured card can be shared with another user.

The goal is to persist reproducible state such as:

```text
image
card name
background holo
subject holo
card back
art mode
x/y position
scale
whether the subject was separated
mask threshold
mask feather
mask expand/contract
```

Separated foreground images themselves are not intended to be stored in the URL. Instead, a shared URL can describe that separation was enabled and the receiving browser can reproduce the separation locally from the original image.

## Contributing

Contributions are welcome.

For anything larger than a tiny fix, create a branch and open a pull request rather than pushing directly to `main`.

A simple workflow:

```bash
git checkout main
git pull
git checkout -b your-feature-name

# make changes

npm test
npm run dev

git add .
git commit -m "Describe your change"
git push -u origin your-feature-name
```

Then open a pull request against `main`.

When changing visual effects, screenshots or short recordings in the PR are especially useful.

When changing subject separation or masks, test with several types of artwork: detailed hair, transparent areas, bright backgrounds, dark backgrounds, and characters touching the edge of the image tend to expose problems quickly.

## Good places to contribute

Some areas that are relatively self-contained:

- New holographic effect recipes.
- Better card templates and card backs.
- Improved mask controls.
- Subject-separation quality improvements.
- Shareable URL/card-state improvements.
- Better mobile layout.
- Exporting cards as images or video.
- Additional artwork providers behind the existing server abstraction.
- Tests around server endpoints and state restoration.

## Development notes

### Codespaces

The app works well in GitHub Codespaces because it only needs Node.js and a forwarded port.

Run:

```bash
npm run dev
```

Then expose port `4173` from the Codespaces **Ports** tab.

Use `/api/health` to verify that the forwarded URL is reaching the Holo Studio server:

```text
https://<codespace>-4173.app.github.dev/api/health
```

Expected response:

```json
{"ok":true}
```

### Production hosting

The project needs the Node server for the Danbooru APIs and image proxy, so plain GitHub Pages is not enough for the current architecture.

Any Node/container host should work. A production build can be created with:

```bash
npm run build
npm start
```

## Privacy and content

Background removal and mask refinement happen locally in the browser.

The selected image is fetched through this project's proxy but is not sent to an additional background-removal API.

Artwork remains the property of its original artists and licensors. This repository does not grant rights to redistribute artwork returned by Danbooru.

Before using the project commercially, review the licenses and terms for IMG.LY, Danbooru, the holographic texture assets, and any artwork shown by the application.

## License

No project license has been selected yet.

If this repository is going to accept broader public contributions, adding an explicit open-source license should be one of the next steps.
