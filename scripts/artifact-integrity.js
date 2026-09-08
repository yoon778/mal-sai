import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function directoryHash(directory) {
  const hash = createHash('sha256');
  function walk(path, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(path, entry.name), `${name}/`);
      else { hash.update(`${name}\0`); hash.update(readFileSync(join(path, entry.name))); hash.update('\0'); }
    }
  }
  walk(directory);
  return hash.digest('hex');
}
