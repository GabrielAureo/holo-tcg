import { createArtworkSearch } from "./artwork-search.mjs";
import { danbooruProvider } from "./providers/danbooru.mjs";
import { konachanProvider } from "./providers/konachan.mjs";
import { zerochanProvider } from "./providers/zerochan.mjs";

export const artworkProviders = [
  danbooruProvider,
  konachanProvider,
  zerochanProvider,
];

export const artworkSearch = createArtworkSearch(artworkProviders, {
  defaultProviderIds: ["danbooru"],
});

export { danbooruProvider, konachanProvider, zerochanProvider };
