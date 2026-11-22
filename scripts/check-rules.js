/*
 * Enforces the project's content rules mechanically, so they cannot regress unnoticed:
 *  - plain ASCII only in source and docs (which also rules out emojis)
 *  - hex colour values only in client/src/styles/tokens.css
 *  - no placeholder text and no AI-related content
 *
 * Run with: npm run check:rules
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'data', '.git', 'coverage', 'meta']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT_EXT = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.css',
  '.html',
  '.md',
  '.json',
  '.sql',
  '.txt',
  '.example',
]);
// Files that legitimately define or test colours.
const HEX_ALLOWED = new Set([
  'client/src/styles/tokens.css',
  'scripts/check-contrast.js',
  'scripts/check-rules.js',
]);
const HEX_SKIP_PREFIX = ['server/test/', 'client/test/', 'e2e/'];
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const PLACEHOLDER = /lorem ipsum|dolor sit amet/i;
const AI_TERMS = /\b(openai|chatgpt|gpt-\d|llm|copilot|gemini|artificial intelligence)\b|\bAI\b/;
const SELF = 'scripts/check-rules.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) {
      continue;
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (
      TEXT_EXT.has(path.extname(name)) ||
      name.startsWith('.env') ||
      name === '.gitignore'
    ) {
      out.push(full);
    }
  }
  return out;
}

const problems = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const lines = readFileSync(file, 'utf8').split('\n');
  const hexChecked =
    !HEX_ALLOWED.has(rel) && !HEX_SKIP_PREFIX.some((prefix) => rel.startsWith(prefix));
  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(line)) {
      problems.push(`${where} non-ASCII character`);
    }
    if (rel === SELF) {
      return;
    }
    if (hexChecked && HEX.test(line) && /\.(css|jsx?|html)$/.test(rel)) {
      problems.push(`${where} hex colour outside tokens.css`);
    }
    if (PLACEHOLDER.test(line)) {
      problems.push(`${where} placeholder text`);
    }
    if (AI_TERMS.test(line)) {
      problems.push(`${where} AI-related term`);
    }
  });
}

if (problems.length > 0) {
  console.error(`${problems.length} rule violation(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  'Content rules OK: ASCII only, hex colours confined to tokens.css, no placeholders, no AI terms.',
);
