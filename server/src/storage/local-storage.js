import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey } from './keys.js';

export { newStorageKey } from './keys.js';

/**
 * Storage driver interface: put(key, buffer, { contentType }), get(key) -> { stream, size } | null,
 * delete(key), signedUrl(key, options) -> string | null. The local driver returns null from
 * signedUrl so the server streams the bytes itself; the R2 driver returns a short-lived URL.
 */
export function createLocalStorage({ baseDir }) {
  const root = path.resolve(baseDir);

  function resolveKey(key) {
    assertValidKey(key);
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  return {
    async put(key, buffer) {
      // contentType is only meaningful to cloud drivers.
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx', mode: 0o640 });
    },

    async get(key) {
      const target = resolveKey(key);
      try {
        const info = await stat(target);
        return {
          stream: createReadStream(target),
          size: info.size,
          // Partial read for HTTP Range requests (audio seeking). Bounds are inclusive.
          range: (start, end) => createReadStream(target, { start, end }),
        };
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },

    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },

    async copy(fromKey, toKey) {
      const source = resolveKey(fromKey);
      const target = resolveKey(toKey);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    },

    async signedUrl() {
      return null;
    },
  };
}
