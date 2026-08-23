/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   search: (criteria: { query: string, page: number, limit: number }) => Promise<Artwork[]>;
 * }} ArtworkProvider
 *
 * @typedef {{
 *   id: string;
 *   provider: string;
 *   tag_string_character: string;
 *   tag_string_artist: string;
 *   image_width: number;
 *   image_height: number;
 *   preview_file_url: string;
 *   large_file_url: string;
 *   file_url: string;
 *   source_url?: string;
 * }} Artwork
 */

export function defineArtworkProvider({ id, label, search, ...capabilities }) {
  if (!id || !label || typeof search !== "function") {
    throw new TypeError("An artwork provider needs an id, label, and search function.");
  }

  return Object.freeze({ id, label, search, ...capabilities });
}

export function createArtwork(provider, {
  id,
  character = "",
  artist = "",
  width = 0,
  height = 0,
  previewUrl = "",
  largeUrl = "",
  fileUrl = "",
  sourceUrl,
}) {
  const preview = previewUrl || largeUrl || fileUrl;
  const large = largeUrl || fileUrl || preview;
  const file = fileUrl || large || preview;

  return {
    id: `${provider}:${id}`,
    provider,
    tag_string_character: character || "",
    tag_string_artist: artist || "",
    image_width: Number(width) || 0,
    image_height: Number(height) || 0,
    preview_file_url: preview,
    large_file_url: large,
    file_url: file,
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
  };
}
