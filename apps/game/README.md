# Holo Drop

First playable slice of the collection/idle game built on `@holo/card-renderer`.

## Loop

- One free card drop every 30 minutes.
- Cards have a rarity and a base gold-per-minute yield.
- Holographic variants are rarer and multiply passive gold generation by 2.5x.
- Duplicate cards are separate owned copies and their production stacks.
- Game state is stored in `localStorage`; passive income is settled from elapsed wall-clock time when the app resumes.

The current drop weights and economy values live near the top of `src/main.tsx` so they can be tuned without touching renderer code.

## Subject separation cache

Subject separation remains owned by `@holo/card-renderer`, not this app. The renderer now caches the expensive base IMG.LY separation result in IndexedDB.

The cache key includes the original artwork URL and a pipeline version. Mask refinement (`threshold`, `feather`, `expand`) still runs on top of the cached base subject, so slider combinations do not create duplicate cache entries.

The first policy is a bounded frequency/recency hybrid:

- max 80 subjects;
- max 96 MiB;
- each hit updates `lastAccessed` and `accessCount`;
- eviction favors cards that were accessed recently and repeatedly, while allowing once-popular old cards to age out.

This is intentionally a browser-side optimization, not a source of truth. Cache failures never make card rendering fail.

## Longer-term direction

For a real shared card catalog, precomputing subject masks once on the backend/CDN is preferable to making every player run segmentation. The browser cache is still useful as a fallback for newly introduced/user-provided artwork and to reduce repeated downloads/processing.

## Run

From the repository root:

```bash
npm run dev:game
```

Before merging, run:

```bash
npm run typecheck:game
npm run build:game
```
