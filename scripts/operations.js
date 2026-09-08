import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../lib/store.js';
import { fileURLToPath } from 'node:url';

const directory = process.env.DATA_DIRECTORY ?? fileURLToPath(new URL('../.data/', import.meta.url));
const command = process.argv[2];
if (command === 'pause' || command === 'resume') {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'ai-paused');
  if (command === 'pause') writeFileSync(path, 'paused\n', { flag: 'w' });
  else { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  console.log(command === 'pause' ? 'AI 신규 요청 차단' : 'AI 요청 차단 해제');
} else if (command === 'reports') {
  const store = new Store({ directory, key: process.env.STORAGE_KEY });
  try {
    const rows = store.db.prepare("SELECT data FROM records WHERE kind='report' ORDER BY updated DESC LIMIT 100").all();
    for (const row of rows) {
      const report = store.decode(row.data);
      console.log(JSON.stringify({ id: report.id, reason: report.reason, at: report.at, ...(process.argv.includes('--details') ? { text: report.text } : {}) }));
    }
    console.log(`신고 ${rows.length}건`);
  } finally { store.close(); }
} else throw new Error('Use pause, resume or reports');
