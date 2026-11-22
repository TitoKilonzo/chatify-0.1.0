/*
 * Generates the favicon, PWA icons and Apple touch icon from the brand tokens, so the artwork
 * cannot drift from the palette. The speech-bubble outline is the same lucide "message-square"
 * glyph used for the brand mark in the interface.
 *
 *   npm run icons
 *
 * Output goes to client/public and is committed; run this only when the palette or mark changes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'client', 'public');
const tokens = readFileSync(path.join(root, 'client', 'src', 'styles', 'tokens.css'), 'utf8');

function token(name) {
  const match = tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) {
    throw new Error(`token --color-${name} not found`);
  }
  return match[1];
}

const COCOA = token('cocoa');
const OAT = token('oat');
const BUBBLE =
  'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z';

/**
 * Square artwork on a 100 unit canvas. radius rounds the tile corners (0 for full-bleed icons
 * that the platform masks itself). glyph is the share of the tile the bubble occupies.
 */
function artwork({ radius, glyph }) {
  const size = 100 * glyph;
  const scale = size / 24;
  const offset = (100 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="${radius}" fill="${COCOA}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${OAT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="${BUBBLE}"/>
  </g>
</svg>
`;
}

async function png(svg, size, file) {
  const buffer = await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path.join(out, file), buffer);
  return buffer;
}

/** A single-image ICO container around a PNG, which every current browser accepts. */
function ico(pngBuffer, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuffer.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, pngBuffer]);
}

mkdirSync(out, { recursive: true });
const rounded = artwork({ radius: 22, glyph: 0.64 });
const bleed = artwork({ radius: 0, glyph: 0.64 });
// Maskable icons keep the mark inside the central 80 percent safe zone.
const maskable = artwork({ radius: 0, glyph: 0.5 });

writeFileSync(path.join(out, 'favicon.svg'), rounded);
const favicon32 = await png(rounded, 32, 'favicon-32.png');
writeFileSync(path.join(out, 'favicon.ico'), ico(favicon32, 32));
await png(rounded, 192, 'icon-192.png');
await png(rounded, 512, 'icon-512.png');
await png(maskable, 512, 'icon-maskable-512.png');
await png(bleed, 180, 'apple-touch-icon.png');
console.log('Icons written to client/public');
