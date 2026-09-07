import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAI } from '../lib/ai.js';
import { normalizeEvaluation } from '../lib/game.js';
import { buildEvalGame, checkEvaluation, validateCases } from '../lib/eval.js';

const document = JSON.parse(readFileSync(new URL('../eval/cases.json', import.meta.url), 'utf8'));
const research = readFileSync(new URL('../research/ai-conversation-rubric.md', import.meta.url), 'utf8');
const validation = validateCases(document, research);
if (!validation.ok) {
  console.error(validation.errors.join('\n'));
  process.exit(1);
}

const args = process.argv.slice(2);
const live = args.includes('--live');
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
if (!live) {
  console.log(`평가 사례 검증 완료: ${validation.count}개 · 상황 5개 · 품질군별 2개`);
  process.exit(0);
}

if (process.env.AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) {
  console.error('실제 평가에는 .env의 AI_ENABLED=true와 OPENAI_API_KEY가 필요함');
  process.exit(1);
}

const caseId = valueAfter('--case');
const rawLimit = valueAfter('--limit');
const limit = rawLimit === undefined ? 3 : Number(rawLimit);
if (!Number.isInteger(limit) || limit < 1 || limit > 30) {
  console.error('--limit은 1~30 정수여야 함');
  process.exit(1);
}
let selected = caseId ? document.cases.filter(item => item.id === caseId) : document.cases.slice(0, limit);
if (!selected.length) {
  console.error(`사례를 찾을 수 없음: ${caseId}`);
  process.exit(1);
}

const directory = fileURLToPath(new URL('../.data/', import.meta.url));
const ai = createAI({ directory });
if (ai.mode !== 'live') {
  console.error('AI가 체험 모드로 생성됨');
  process.exit(1);
}

const output = [];
for (const item of selected) {
  const game = buildEvalGame(item);
  const startedAt = Date.now();
  try {
    const result = normalizeEvaluation(await ai.evaluate(game), game);
    const checks = checkEvaluation(item, result);
    output.push({ caseId: item.id, quality: item.quality, score: result.score, durationMs: Date.now() - startedAt, pass: checks.every(check => check.pass), checks, result });
    console.log(`${checks.every(check => check.pass) ? '통과' : '불일치'} ${item.id} · ${result.score ?? '점수 없음'}점 · ${Date.now() - startedAt}ms`);
  } catch (error) {
    output.push({ caseId: item.id, quality: item.quality, durationMs: Date.now() - startedAt, pass: false, error: error.message });
    console.error(`오류 ${item.id} · ${error.message}`);
  }
}

mkdirSync(directory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const path = join(directory, `eval-${timestamp}.json`);
const passed = output.filter(item => item.pass).length;
let pairs = 0;
let inversions = 0;
for (const scenarioId of new Set(selected.map(item => item.scenarioId))) {
  const strong = output.filter(item => item.caseId.startsWith(`${scenarioId}-strong-`) && Number.isFinite(item.score));
  const weak = output.filter(item => item.caseId.startsWith(`${scenarioId}-weak-`) && Number.isFinite(item.score));
  for (const strongCase of strong) for (const weakCase of weak) {
    pairs++;
    if (strongCase.score < weakCase.score) inversions++;
  }
}
const summary = { passed, total: output.length, passRate: output.length ? passed / output.length : 0, pairs, inversions, inversionRate: pairs ? inversions / pairs : null };
writeFileSync(path, JSON.stringify({ createdAt: new Date().toISOString(), model: 'gpt-4.1-mini-2025-04-14', summary, cases: output }, null, 2));
console.log(`결과: ${passed}/${output.length} 기대 범위 충족 · 강약 역전 ${pairs ? `${inversions}/${pairs}` : '측정 안 함'} · ${path}`);
if (passed !== output.length) process.exitCode = 2;
