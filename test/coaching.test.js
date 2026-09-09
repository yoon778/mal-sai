import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coachingWindows, coachingIssues } from '../lib/coaching.js';
import { newGame, normalizeEvaluation, finishGame } from '../lib/game.js';
import { createAI, demoAI } from '../lib/ai.js';
import { rubric } from '../lib/scenarios.js';

function fixture() {
  const game = newGame({ scenarioId: 'second-date', speech: 'casual' }, 'live');
  Object.assign(game, { stage: 'chat', turn: 1, minute: 5, messages: [
    { id: 'before', role: 'partner', text: '토요일은 약속 있고 일요일 오후는 괜찮아', turn: 0, minute: 0, readAt: 0 },
    { id: 'own', role: 'user', text: '그러면 토요일 저녁에 볼까?', turn: 1, minute: 1, readAt: 1 },
    { id: 'own-2', role: 'user', text: '그 카페에서', turn: 1, minute: 1, readAt: 1 },
    { id: 'after', role: 'partner', text: '토요일은 안 돼', turn: 1, minute: 2, readAt: 2 },
  ] });
  return game;
}
function moment(overrides = {}) {
  return { messageId: 'own', kind: 'improvement', reason: '상대가 토요일에는 약속이 있다고 했어요', change: '상대가 가능한 일요일 오후로 제안하면 일정 조율이 쉬워져요', alternative: '그러면 일요일 오후에 그 카페에서 볼까?', nextStep: '상대가 동의하면 시간을 함께 정해 보세요', contextMessageIds: ['before'], ...overrides };
}
function evaluation(moments = [moment()]) {
  return { coachingVersion: 2, summary: '상대의 가능한 일정부터 확인해요', outcome: '다음 약속을 조율하는 중이에요', criteria: rubric.map(r => ({ id: r.id, score: null, evidenceIds: [], reason: '관찰한 답장이 적어요' })), strengths: [], improvements: [], moments };
}

test('coaching windows group all user bubbles and exclude later or unread context', () => {
  const game = fixture();
  game.messages.splice(1, 0, { id: 'unread', role: 'partner', text: '추가 정보', turn: 0, minute: 0, readAt: null }, { id: 'late-read', role: 'partner', text: '뒤늦게 읽은 정보', turn: 0, minute: 0, readAt: 3 });
  for (const window of coachingWindows(game)) {
    assert.deepEqual(window.knownBefore.map(m => m.id), ['before']);
    assert.deepEqual(window.currentReply.map(m => m.id), ['own', 'own-2']);
  }
});

test('good replies need no rewrite and only one coaching card per turn is retained', () => {
  const good = moment({ kind: 'strength', change: '', alternative: null });
  const result = normalizeEvaluation(evaluation([good, { ...good, messageId: 'own-2' }]), fixture());
  assert.equal(result.moments.length, 1);
  assert.equal(result.moments[0].alternative, null);
  assert.equal(result.coachingVersion, 2);
  assert.throws(() => normalizeEvaluation(evaluation([{ ...good, alternative: '살짝 바꾼 말' }]), fixture()), /맥락과 개선 예시/);
});

test('rewrites require a different action and prior context, while small meaningful edits stay valid', () => {
  const game = fixture();
  assert.equal(normalizeEvaluation(evaluation(), game).moments[0].alternative, moment().alternative);
  for (const invalid of [moment({ change: '' }), moment({ contextMessageIds: ['after'] }), moment({ alternative: '그러면토요일저녁에볼까?그카페에서' }), moment({ alternative: '그러면 토요일 저녁에 볼까?\n그 카페에서' })]) {
    assert.ok(coachingIssues([invalid], game).length);
    assert.throws(() => normalizeEvaluation(evaluation([invalid]), game), /맥락과 개선 예시/);
  }
  const legacy = evaluation([moment({ kind: 'strength', alternative: '다른 말투' })]);
  delete legacy.coachingVersion;
  assert.equal(normalizeEvaluation(legacy, game).coachingVersion, 1);
  game.messages.find(m => m.id === 'own').text = '오늘은 푹 쉬어';
  game.messages.find(m => m.id === 'own-2').text = '근데 답장은 언제 해줄 거야?';
  assert.deepEqual(coachingIssues([moment({ alternative: '오늘은 푹 쉬어', change: '추가 말풍선의 답장 재촉을 빼고 마무리해요' })], game), []);
  const spellingGame = newGame({ scenarioId: 'cancelled' }, 'live');
  spellingGame.messages = [{ id: 'own', role: 'user', text: '빨리 낳아', turn: 1, minute: 1 }];
  assert.ok(coachingIssues([moment({ alternative: '빨리 나아', contextMessageIds: ['own'] })], spellingGame).length);
});

test('invalid coaching gets one bounded repair and never publishes a second invalid result', async () => {
  for (const repairSucceeds of [true, false]) {
    const requests = [];
    const ai = createAI({ enabled: true, key: 'test', directory: mkdtempSync(join(tmpdir(), 'sai-coaching-')), fetcher: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const raw = evaluation([moment({ contextMessageIds: requests.length === 2 && repairSucceeds ? ['before'] : ['after'] })]);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }) };
    } });
    const raw = await ai.evaluate(fixture());
    assert.equal(requests.length, 2);
    const data = JSON.parse(requests[1].messages[1].content);
    assert.ok(data.repairInstructions.length);
    assert.deepEqual(data.coachingWindows[0].knownBefore.map(m => m.id), ['before']);
    assert.deepEqual(requests[0].response_format.json_schema.schema.properties.moments.items.properties.alternative.type, ['string', 'null']);
    assert.equal(requests[0].response_format.json_schema.schema.properties.moments.maxItems, 1);
    assert.deepEqual(requests[0].response_format.json_schema.schema.properties.moments.items.properties.messageId.enum, ['own']);
    if (repairSucceeds) assert.equal(normalizeEvaluation(raw, fixture()).coachingVersion, 2);
    else assert.throws(() => normalizeEvaluation(raw, fixture()), /맥락과 개선 예시/);
  }
});

test('refresh is limited to finished games and preserves the old result on failure', async () => {
  const game = fixture();
  await assert.rejects(finishGame(game, demoAI, { refresh: true }), /마친 대화/);
  await finishGame(game, demoAI, { early: true });
  game.drill = { answer: '기존 복습 답장' };
  const before = structuredClone(game);
  await assert.rejects(finishGame(game, { evaluate: async () => evaluation([moment({ change: '' })]) }, { refresh: true }));
  assert.deepEqual(game, before);
  await finishGame(game, { evaluate: async () => evaluation() }, { refresh: true });
  assert.equal(game.result.coachingVersion, 2);
  assert.deepEqual(game.messages, before.messages);
  assert.deepEqual(game.drill, before.drill);
  assert.equal(game.finishedEarly, true);
  await finishGame(game, { evaluate: async () => { throw new Error('cached finish must not evaluate again'); } });
});
