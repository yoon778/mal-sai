import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAI } from '../lib/ai.js';
import { finishGame, getHint, newGame, readMessages, sendTurn, startGame, waitForReply } from '../lib/game.js';

const plans = [
  {
    scenarioId: 'after-date', gender: 'female', initiative: 'calm', humor: 'plain',
    replies: [
      '어제 영화 이야기 재미있었어요. 말씀하신 영화도 찾아봤어요.',
      '저는 결말이 오래 남는 영화를 좋아해요. 어떤 장면을 좋아하세요?',
      '그런 장면 좋죠. 저는 음악도 오래 기억에 남더라고요 🙂',
      '일 끝나고 여유 생기면 주말에 같이 영화 보러 갈래요?',
      '급하게 정하지 않아도 괜찮아요. 편한 날 있으면 알려주세요.',
    ],
  },
  {
    scenarioId: 'second-date', gender: 'male', initiative: 'active', humor: 'light',
    replies: [
      '저는 일요일 오후가 여유로워요. 도윤님은 주말에 약속 있으세요?',
      '전에 이야기한 카페가 생각났어요. 일요일에 같이 가볼래요?',
      '오후 3시쯤은 어때요? 다른 시간이 편하면 맞출 수 있어요.',
      '좋아요. 창가 자리가 있으면 좋겠네요 ㅎㅎ',
      '그럼 일정 가까워지면 한 번 더 확인해요 🙂',
    ],
  },
  {
    scenarioId: 'cancelled', gender: 'female', initiative: 'calm', humor: 'plain',
    replies: [
      '괜찮아요. 몸이 먼저죠. 오늘은 푹 쉬세요.',
      '저도 아쉽지만 무리해서 만나는 것보다 나아요.',
      '회복하면 그때 편하게 연락 주세요.',
      '카페는 다음에 가도 되니까 부담 갖지 않아도 돼요.',
      '따뜻한 거 챙겨 드시고 얼른 나으세요 🙂',
    ],
  },
];

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex < 0 ? 3 : Number(args[limitIndex + 1]);
if (!Number.isInteger(limit) || limit < 1 || limit > plans.length) {
  console.error(`--limit은 1~${plans.length} 정수여야 함`);
  process.exit(1);
}
if (process.env.AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) {
  console.error('실제 완주에는 .env의 AI_ENABLED=true와 OPENAI_API_KEY가 필요함');
  process.exit(1);
}

const directory = fileURLToPath(new URL('../.data/', import.meta.url));
const usagePath = join(directory, 'usage.jsonl');
const readUsage = () => {
  try {
    return readFileSync(usagePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};
const usageStart = readUsage().length;
const ai = createAI({ directory });
if (ai.mode !== 'live') {
  console.error('AI가 체험 모드로 생성됨');
  process.exit(1);
}

const results = [];
for (const plan of plans.slice(0, limit)) {
  const game = newGame(plan, ai.mode);
  const timings = [];
  const timed = async (action, work) => {
    const startedAt = performance.now();
    await work();
    timings.push({ action, durationMs: Math.round(performance.now() - startedAt) });
  };
  try {
    startGame(game);
    if (game.messages.some(message => message.role === 'partner' && message.readAt === null)) readMessages(game, 0);
    await timed('hint', () => getHint(game, ai));
    for (const text of plan.replies) {
      await timed('partner_reply', () => sendTurn(game, { messages: [text], delayMinutes: 0 }, ai));
      while (game.pendingReply) waitForReply(game, 120);
      readMessages(game, 0);
    }
    await timed('evaluation', () => finishGame(game, ai));
    const usage = readUsage().slice(usageStart).filter(item => item.gameId === game.id);
    const estimatedUsd = usage.reduce((sum, item) => sum + item.estimatedUsd, 0);
    const pass = usage.length === 7;
    results.push({
      scenarioId: plan.scenarioId, gameId: game.id, pass, score: game.result.score,
      totalDurationMs: timings.reduce((sum, item) => sum + item.durationMs, 0), timings,
      usage: {
        requests: usage.length,
        inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
        outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
        estimatedUsd,
      },
      transcript: game.messages.filter(message => !message.background).map(({ role, text, turn, minute }) => ({ role, text, turn, minute })),
      result: game.result,
    });
    console.log(`${pass ? '통과' : '사용량 기록 불완전'} ${plan.scenarioId} · ${game.result.score ?? '점수 없음'}점 · ${timings.reduce((sum, item) => sum + item.durationMs, 0)}ms · $${estimatedUsd.toFixed(6)}`);
    if (!pass) break;
  } catch (error) {
    results.push({ scenarioId: plan.scenarioId, gameId: game.id, pass: false, timings, error: error.message });
    console.error(`오류 ${plan.scenarioId} · ${error.message}`);
    break;
  }
}

mkdirSync(directory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const outputPath = join(directory, `smoke-live-${timestamp}.json`);
writeFileSync(outputPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2));
console.log(`결과 저장 · ${outputPath}`);
if (results.length !== limit || results.some(result => !result.pass)) process.exitCode = 2;
