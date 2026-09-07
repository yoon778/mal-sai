import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAI, naturalizeReply } from '../lib/ai.js';
import { newGame, readMessages, sendTurn, startGame, waitForReply } from '../lib/game.js';
import { assessRealismRun, summarizeRealism } from '../lib/realism.js';

const replies = {
  'after-date': ['어제 영화 이야기 재미있었어요.', '오늘 일은 좀 어때요?', '늦게까지 바쁘군요. 저는 저녁 먹고 쉬고 있어요.', '주말에 시간 되면 영화 같이 볼래요?', '천천히 보고 편할 때 알려주세요.'],
  'new-contact': ['추천해 준 책 오늘 주문했어요.', '저는 소설도 자주 읽어요. 어떤 책 좋아하세요?', '동네 서점 이야기 들으니 궁금하네요.', '주말에 구경하러 가볼까 해요.', '읽어보고 다음 모임 때 감상도 나눠요.'],
  restart: ['이번 주 마감은 잘 끝났어요?', '많이 바빴겠네요. 저는 오늘 조금 여유로웠어요.', '답장 부담은 갖지 않아도 돼요.', '토요일부터 쉰다고 했죠. 뭐 하고 싶어요?', '푹 쉬고 재미있는 일 생기면 이야기해요.'],
  'second-date': ['저는 일요일 오후가 여유로워요.', '전에 이야기한 카페 같이 가볼래요?', '오후 3시는 어때요?', '창가 자리가 있으면 좋겠네요 ㅎㅎ', '그럼 가까워지면 한 번 더 확인해요.'],
  cancelled: ['괜찮아요. 몸이 먼저죠.', '저도 아쉽지만 무리하지 않았으면 해요.', '오늘은 푹 쉬어요.', '회복하면 그때 편하게 연락 주세요.', '카페는 다음에 가면 되니까 부담 갖지 마요.'],
};
const profiles = [
  { gender: 'female', speech: 'honorific', initiative: 'calm', humor: 'plain' },
  { gender: 'male', speech: 'casual', initiative: 'active', humor: 'light' },
];
const plans = Object.entries(replies).flatMap(([scenarioId, messages]) => profiles.map(profile => ({ scenarioId, messages, ...profile })));
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex < 0 ? plans.length : Number(args[limitIndex + 1]);
if (!Number.isInteger(limit) || limit < 1 || limit > plans.length) {
  console.error(`--limit은 1~${plans.length} 정수여야 함`);
  process.exit(1);
}
if (process.env.AI_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) {
  console.error('현실감 평가에는 .env의 AI_ENABLED=true와 OPENAI_API_KEY가 필요함');
  process.exit(1);
}

const directory = fileURLToPath(new URL('../.data/', import.meta.url));
const usagePath = join(directory, 'usage.jsonl');
const usageStart = (() => {
  try { return readFileSync(usagePath, 'utf8').split('\n').filter(Boolean).length; }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
})();
const ai = createAI({ directory });
const results = [];
for (const plan of plans.slice(0, limit)) {
  const game = newGame(plan, ai.mode);
  try {
    startGame(game);
    if (game.messages.some(message => message.role === 'partner' && message.readAt === null)) readMessages(game, 0);
    const partnerTurns = [];
    for (const text of plan.messages) {
      await sendTurn(game, { messages: [naturalizeReply(text, game.profile.speech)], delayMinutes: 0 }, ai);
      while (game.pendingReply) waitForReply(game, 120);
      partnerTurns.push({ turn: game.turn, messages: game.messages.filter(message => message.role === 'partner' && message.turn === game.turn).map(message => message.text) });
      readMessages(game, 0);
    }
    const result = assessRealismRun({ scenarioId: plan.scenarioId, partnerName: game.profile.name, partnerTurns, profile: game.profile });
    results.push({ ...result, gameId: game.id, transcript: game.messages.filter(message => !message.background).map(({ role, text, turn }) => ({ role, text, turn })) });
    console.log(`${result.issues.length ? '확인 필요' : '완료'} ${plan.scenarioId}/${plan.initiative}/${plan.humor} · 문제 ${result.issues.length}개`);
  } catch (error) {
    console.error(`오류 ${plan.scenarioId}/${plan.initiative} · ${error.message}`);
    results.push({ scenarioId: plan.scenarioId, profile: plan, issues: [{ type: 'request', text: error.message }], endings: [] });
    break;
  }
}
const summary = summarizeRealism(results, limit);
let usage = [];
try { usage = readFileSync(usagePath, 'utf8').split('\n').filter(Boolean).slice(usageStart).map(line => JSON.parse(line)); } catch { /* Report remains useful without usage. */ }
summary.usage = {
  requests: usage.length,
  inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
  outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
  estimatedUsd: usage.reduce((sum, item) => sum + item.estimatedUsd, 0),
};
mkdirSync(directory, { recursive: true });
const outputPath = join(directory, `realism-${new Date().toISOString().replaceAll(':', '-')}.json`);
writeFileSync(outputPath, JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2));
console.log(`결과 ${summary.pass ? '통과' : '확인 필요'} · 역할 혼동 ${summary.roleConfusions} · 사실 모순 ${summary.factContradictions} · 말투 문제 ${summary.styleIssues} · 분절 문제 ${summary.segmentationIssues} · 평균 말풍선 ${summary.averageBubblesPerTurn.toFixed(2)}개 · 복수 말풍선 ${(summary.multiBubbleRate * 100).toFixed(1)}% · 동일 마무리 ${(summary.repetitionRate * 100).toFixed(1)}% · $${summary.usage.estimatedUsd.toFixed(6)}`);
console.log(`결과 저장 · ${outputPath}`);
if (!summary.pass) process.exitCode = 2;
