import { writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAI } from '../lib/ai.js';
import { newGame, startGame } from '../lib/game.js';

// Paid, opt-in comparison. Uses the application's shared budget and synthetic text only.
if (!process.argv.includes('--live')) { console.log('유료 비교: node --env-file=.env scripts/compare-chat.js --live [model] [label]'); process.exit(0); }
const model = process.argv[3] ?? 'gpt-4.1-mini-2025-04-14';
const label = (process.argv[4] ?? model).replace(/[^a-z0-9-]/gi, '');
const cases = [
  ['cancelled', 'honorific', 'open', '푹 쉬어요 오늘은 아무것도 하지 말고 누워 있어요'],
  ['second-date', 'casual', 'open', '아 맞다 토요일 약속 있다고 했지 그럼 일요일 3시 어때?'],
  ['new-contact', 'honorific', 'low', '저도 에세이 좋아해요 요즘 읽는 책 있어요?'],
  ['after-date', 'casual', 'open', 'ㅋㅋ 나 영화 보면서 거의 졸았어'],
  ['restart', 'honorific', 'open', '마감은 잘 끝났어요? 저는 오늘 퇴근길에 붕어빵 사 왔어요'],
  ['cancelled', 'casual', 'open', '응 알겠어 푹 쉬어 답장 안 해도 돼'],
];
const ai = createAI({ replyModel: model });
if (ai.mode !== 'live') throw new Error('AI_ENABLED와 API 키 확인 필요');
const readUsage = async () => {
  try { return (await readFile('.data/usage.jsonl', 'utf8')).split('\n').filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const ids = new Set();
const startUsage = (await readUsage()).length;
const results = [];
for (const [scenarioId, speech, interest, text] of cases) {
  const game = newGame({ scenarioId, speech, interest, gender: 'female', initiative: 'calm', humor: 'light' }, 'live');
  startGame(game); game.turn = 1;
  ids.add(game.id);
  game.messages.push({ id: randomUUID(), role: 'user', text, turn: 1, minute: 0, readAt: null });
  const start = Date.now();
  try { results.push({ scenarioId, speech, interest, input: text, reply: await ai.reply(game), ms: Date.now() - start }); }
  catch (error) { results.push({ scenarioId, error: error.message, ms: Date.now() - start }); }
  console.log(JSON.stringify(results.at(-1)));
}
const usage = (await readUsage()).slice(startUsage).filter(row => ids.has(row.gameId));
await writeFile(`.data/chat-comparison-${label}.json`, JSON.stringify({ model, results, usage }, null, 2));
console.log(JSON.stringify({ label, calls: results.length, estimatedUsd: usage.reduce((sum, row) => sum + row.estimatedUsd, 0) }));
