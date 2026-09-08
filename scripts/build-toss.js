import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { directoryHash } from './artifact-integrity.js';

for (const args of [['node_modules/vite/bin/vite.js', 'build', '--mode', 'toss'], ['node_modules/@apps-in-toss/cli/dist/index.js', 'build']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
const build = JSON.parse(readFileSync('dist/build-info.json', 'utf8'));
const artifact = `${build.appName}.ait`;
writeFileSync(`${artifact}.manifest.json`, JSON.stringify({ ...build, webSha256: directoryHash('dist'), sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex') }));
