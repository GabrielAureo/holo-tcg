import { access, mkdir, writeFile } from 'node:fs/promises';

const assets = {
  'galaxy.png': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/galaxy.png',
  'vmaxbg.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/vmaxbg.webp',
  'ancient.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/ancient.webp',
  'trainerbg.jpg': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/trainerbg.jpg',
  'rainbow2.jpg': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/rainbow2.jpg',
  'illusion.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/illusion.webp',
  'illusion2.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/illusion2.webp',
  'stylish.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/stylish.webp',
  'metal.webp': 'https://res.cloudinary.com/simey/image/upload/Dev/PokemonCards/metal.webp',
};

async function exists(path) { try { await access(path); return true; } catch { return false; } }

await mkdir('public/assets/holo', { recursive: true });
for (const [name, url] of Object.entries(assets)) {
  const path = `public/assets/holo/${name}`;
  if (await exists(path)) { console.log(`Using cached ${name}`); continue; }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${name}: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  console.log(`Fetched ${name}`);
}
