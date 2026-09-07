// Small opt-in paid checks using original, fictional messages only.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createAI } from '../lib/ai.js';
import { defaultCoachModel } from '../lib/models.js';
import { newGame, startGame, readMessages, sendTurn, waitForReply, waitToStart, normalizeEvaluation, finishGame } from '../lib/game.js';

if (!process.argv.includes('--live')) {
  console.log('실제 AI 점검: node --env-file-if-exists=.env scripts/check-coaching.js --live');
  process.exit(0);
}
const modelIndex = process.argv.indexOf('--coach-model');
const coachModel = modelIndex < 0 ? process.env.AI_COACH_MODEL ?? defaultCoachModel : process.argv[modelIndex + 1];
const ai = createAI({ coachModel });
assert.equal(ai.mode, 'live', '실제 AI 연결이 필요함');
const results = [];
const examples = [
  { id: 'casual-spelling', scenarioId: 'cancelled', speech: 'casual', text: '웅 무리하지말구 푹쉬어 낫고나서 얘기하자 ㅋㅋ', spelling: false, minimumRespect: 3 },
  { id: 'clear-spelling', scenarioId: 'cancelled', speech: 'honorific', text: '무리하지 마시고 쉬세요 얼른 낳으세요', spelling: true, minimumRespect: 3, minimumReciprocity: 3 },
  { id: 'repair-good', scenarioId: 'joke-repair', speech: 'honorific', text: '생각 없이 장난쳤네요 불편하게 해서 미안해요 그런 말은 안 할게요', spelling: false, minimumRespect: 3, minimumReciprocity: 3 },
  { id: 'repair-pressure', scenarioId: 'joke-repair', speech: 'honorific', text: '농담인데 왜 그렇게 예민하세요 웃고 넘기면 되잖아요', spelling: false, maximumTone: 1 },
];
for (const example of examples) {
  const game = newGame({ ...example, interest: 'open', initiative: 'calm', humor: 'plain' }, 'live');
  startGame(game); readMessages(game, 0);
  game.turn = 1;
  game.messages.push({ id: `${example.id}-user`, role: 'user', text: example.text, turn: 1, minute: 1, readAt: 1 });
  let result;
  try {
    result = normalizeEvaluation(await ai.evaluate(game), game);
    assert.equal(result.spellingNotes.length > 0, example.spelling, '표기 안내 여부');
    if (example.spelling) assert.ok(result.spellingNotes.some(item => item.original.includes('낳') && item.suggestion.includes('나')));
    if (example.minimumRespect) assert.ok(result.criteria.find(c => c.id === 'respect').score >= example.minimumRespect, '배려하는 답변 인정');
    if (example.minimumReciprocity) assert.ok(result.criteria.find(c => c.id === 'reciprocity').score >= example.minimumReciprocity, '마무리와 사과에 불필요한 확장을 요구하지 않음');
    if (example.maximumTone !== undefined) assert.ok(result.criteria.find(c => c.id === 'tone').score <= example.maximumTone, '불편함을 탓하는 말투');
    results.push({ id: example.id, pass: true, result });
    console.log(`통과 ${example.id} · ${result.score}점 · 표기 안내 ${result.spellingNotes.length}개`);
  } catch (error) {
    results.push({ id: example.id, pass: false, error: error.message, result });
    console.error(`실패 ${example.id} · ${error.message}`);
  }
}
const game = newGame({ scenarioId: 'promised-contact', speech: 'casual', interest: 'open', initiative: 'calm', humor: 'plain' }, 'live');
if (!process.argv.includes('--evaluation-only')) {
try {
  startGame(game); waitToStart(game, 1440); readMessages(game, 0);
  for (const text of ['어제 연락하기로 했는데 잠들었어 늦어서 미안 잘 들어갔어?', '응 나도 잘 들어왔어 어제 영화 얘기 재밌었어', '나는 풍경 예쁜 영화가 오래 남더라', '다음에 재밌게 본 영화 있으면 얘기해줘', '응 나중에 또 얘기하자']) {
    await sendTurn(game, { messages: [text], delayMinutes: 0 }, ai);
    while (game.pendingReply) waitForReply(game, 120);
    readMessages(game, 0);
    console.log(`선연락 후 ${game.turn}번째 답장 · ${game.messages.filter(m => m.role === 'partner' && m.turn === game.turn).map(m => m.text).join(' / ')}`);
  }
  assert.equal(game.atmosphere, 0, '연락 약속 수습 인정');
  await finishGame(game, ai);
  assert.ok(game.result.moments.length);
  assert.ok(game.result.moments.every(item => item.principle));
  results.push({ id: 'contact-full-round', pass: true, messages: game.messages.filter(m => !m.background), result: game.result });
  console.log('통과 contact-full-round · 선연락·수습·5턴·근거 있는 복기');
} catch (error) {
  results.push({ id: 'contact-full-round', pass: false, error: error.message });
  console.error(`실패 contact-full-round · ${error.message}`);
}
}
writeFileSync('.data/coaching-quality-latest.json', JSON.stringify({ at: new Date().toISOString(), coachModel, results }, null, 2));
if (results.some(item => !item.pass)) process.exitCode = 1;
