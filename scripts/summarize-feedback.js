import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Store } from '../lib/store.js';

const file = new URL('../.data/feedback.jsonl', import.meta.url);
const participantFlag = process.argv.indexOf('--participants');
const participantCount = participantFlag >= 0 ? Number(process.argv[participantFlag + 1]) : null;

if (participantCount !== null && (!Number.isInteger(participantCount) || participantCount < 1)) {
  throw new Error('--participants 뒤에 1 이상의 정수가 필요해요.');
}

let raw;
let savedRows;
const directory = process.env.DATA_DIRECTORY ?? fileURLToPath(new URL('../.data/', import.meta.url));
if (existsSync(join(directory, 'practice.sqlite'))) {
  const store = new Store({ directory, key: process.env.STORAGE_KEY });
  try { savedRows = store.db.prepare("SELECT data FROM records WHERE kind='feedback'").all().map(row => store.decode(row.data)); }
  finally { store.close(); }
}
try {
  raw = savedRows ? '' : await readFile(file, 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('저장된 사용자 피드백이 없어요. 테스트를 마친 뒤 결과 화면에서 제출해 주세요.');
    process.exit(0);
  }
  throw error;
}

const rows = savedRows ?? raw.split('\n').filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch { throw new Error(`feedback.jsonl ${index + 1}번째 줄을 읽을 수 없어요.`); }
});
const average = key => rows.length ? (rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2) : '-';
const scenarios = Object.entries(rows.reduce((counts, row) => ({ ...counts, [row.scenarioId]: (counts[row.scenarioId] ?? 0) + 1 }), {}));
const blocked = rows.filter(row => row.blocked).length;

console.log(`응답 ${rows.length}건${participantCount ? ` / 참여자 ${participantCount}명 · 제출률 ${Math.round(rows.length / participantCount * 100)}%` : ''}`);
console.log(`현실감 ${average('realism')} / 5`);
console.log(`피드백 유용성 ${average('helpfulness')} / 5`);
console.log(`재시도 의향 ${average('retryIntent')} / 5`);
console.log(`진행 막힘 ${blocked}건 (${rows.length ? Math.round(blocked / rows.length * 100) : 0}%)`);
console.log(`상황별 ${scenarios.map(([id, count]) => `${id} ${count}건`).join(' · ') || '-'}`);
const notes = rows.map(row => row.note).filter(Boolean);
if (notes.length) console.log(`\n의견\n${notes.map((note, index) => `${index + 1}. ${note}`).join('\n')}`);
