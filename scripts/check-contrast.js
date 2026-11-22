/*
 * Verifies WCAG 2.1 contrast for every foreground/background pair the design actually uses.
 * Reads the palette from client/src/styles/tokens.css so the check cannot drift from the tokens.
 * Text pairs need 4.5:1 (AA). Non-text pairs (focus rings, indicators) need 3:1.
 * Exits with status 1 when any pair fails.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(here, '..', 'client', 'src', 'styles', 'tokens.css');
const css = readFileSync(tokensPath, 'utf8');

const palette = {};
for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  palette[match[1]] = match[2];
}

const TEXT = 4.5;
const NON_TEXT = 3;

// [description, foreground, background, minimum ratio]
const pairs = [
  ['Primary text on Oat', 'cocoa', 'oat', TEXT],
  ['Primary text on Oat Light', 'cocoa', 'oat-light', TEXT],
  ['Primary text on Oat Dark (hover states)', 'cocoa', 'oat-dark', TEXT],
  ['Muted text on Oat', 'cocoa-soft', 'oat', TEXT],
  ['Muted text on Oat Light', 'cocoa-soft', 'oat-light', TEXT],
  ['Oat text on Cocoa (rail, outgoing bubbles)', 'oat', 'cocoa', TEXT],
  ['Oat text on Cocoa Dark (hover, active)', 'oat', 'cocoa-dark', TEXT],
  ['Oat Light text on Cocoa', 'oat-light', 'cocoa', TEXT],
  ['Muted Oat Dark text on Cocoa', 'oat-dark', 'cocoa', TEXT],
  ['Muted Oat Dark text on Cocoa Dark', 'oat-dark', 'cocoa-dark', TEXT],
  ['Oat Light text on Cherry (badge, send)', 'oat-light', 'cherry', TEXT],
  ['Oat Light text on Cherry Dark (hover)', 'oat-light', 'cherry-dark', TEXT],
  ['Oat text on Cherry', 'oat', 'cherry', TEXT],
  ['Focus ring (Cocoa) on Oat', 'cocoa', 'oat', NON_TEXT],
  ['Focus ring (Cocoa) on Oat Light', 'cocoa', 'oat-light', NON_TEXT],
  ['Focus ring (Oat) on Cocoa', 'oat', 'cocoa', NON_TEXT],
  ['Focus ring (Cherry) on Oat', 'cherry', 'oat', NON_TEXT],
  ['Focus ring (Cherry) on Oat Light', 'cherry', 'oat-light', NON_TEXT],
  ['Presence dot (Cherry) on Oat Dark avatar', 'cherry', 'oat-dark', NON_TEXT],
];

function channel(value) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

let failures = 0;
const lines = [];

for (const [description, fg, bg, minimum] of pairs) {
  if (!palette[fg] || !palette[bg]) {
    lines.push(`MISSING  ${description}: token "${palette[fg] ? bg : fg}" not found in tokens.css`);
    failures += 1;
    continue;
  }
  const value = ratio(palette[fg], palette[bg]);
  const ok = value >= minimum;
  if (!ok) {
    failures += 1;
  }
  lines.push(
    `${ok ? 'PASS' : 'FAIL'}     ${value.toFixed(2).padStart(5)}:1 (min ${minimum})  ${description}`,
  );
}

process.stdout.write(`${lines.join('\n')}\n`);
if (failures > 0) {
  process.stdout.write(`\n${failures} pair(s) failed.\n`);
  process.exit(1);
}
process.stdout.write(`\nAll ${pairs.length} pairs pass.\n`);
