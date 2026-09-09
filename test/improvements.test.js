import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server.js';
import { demoAI, createAI } from '../lib/ai.js';
import { newGame, startGame, readMessages, sendTurn, finishGame, retryTurn } from '../lib/game.js';
import { startDrill, submitDrill } from '../lib/drills.js';
import { createSafety } from '../lib/safety.js';
import { createAccess } from '../lib/access.js';
import { assessRealismRun } from '../lib/realism.js';
import { reliabilityPass } from '../lib/reliability.js';
import { scenarios } from '../lib/scenarios.js';
import { clockContext, partnerFacts } from '../lib/conversation-context.js';
import { replyExampleFor } from '../lib/coaching-principles.js';

async function client(t, options = {}) {
  const server = createServer({ ai: demoAI, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (path, body, user = 'audit-user-000000000000000000') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
}

async function ready(request) {
  const { data: game } = await request('/api/games', { scenarioId: 'second-date', interest: 'open', speech: 'casual' });
  const path = `/api/games/${game.id}`;
  await request(`${path}/start`, {});
  await request(`${path}/read`, { delayMinutes: 0 });
  return path;
}

test('completed operation replay is harmless and stale revisions cannot consume another turn', async t => {
  let calls = 0;
  const request = await client(t, { ai: { ...demoAI, reply: async game => { calls++; return demoAI.reply(game); } } });
  const path = await ready(request);
  const before = (await request(path)).data;
  const input = { requestId: randomUUID(), expectedRevision: before.revision, messages: ['그 카페 가보고 싶어'], delayMinutes: 0 };
  const first = await request(`${path}/send`, input);
  assert.equal(first.status, 200);
  const repeated = await request(`${path}/send`, input);
  assert.deepEqual(repeated.data, first.data); assert.equal(calls, 1);
  assert.equal((await request(`${path}/send`, { ...input, messages: ['다른 내용'] })).status, 409);
  await request(`${path}/read`, { delayMinutes: 0 });
  assert.equal((await request(`${path}/send`, input)).data.turn, 1);
  assert.equal((await request(`${path}/send`, { ...input, requestId: randomUUID() })).status, 409);
  assert.equal(calls, 1);
});

test('cached hints and invalid actions do not consume AI quota', async t => {
  let hints = 0, checks = 0;
  const request = await client(t, { ai: { ...demoAI, mode: 'live', hint: async game => { hints++; return demoAI.hint(game); } }, dailyLimit: 2, safety: async () => { checks++; } });
  const path = await ready(request);
  assert.equal((await request(`${path}/send`, { messages: [], delayMinutes: 0 })).status, 400);
  assert.equal(checks, 0);
  assert.equal((await request(`${path}/hint`, {})).status, 200);
  assert.equal((await request(`${path}/hint`, {})).status, 200);
  assert.equal(hints, 1); assert.equal(checks, 2);
  assert.equal((await request(`${path}/send`, { messages: ['일요일 오후 어때'], delayMinutes: 0 })).status, 200);
});

test('early finish observes only played turns and supports one new-context drill', async () => {
  const game = newGame({ scenarioId: 'second-date', interest: 'open' }, 'demo');
  startGame(game); readMessages(game, 0);
  await assert.rejects(finishGame(game, demoAI, { early: true }));
  await sendTurn(game, { messages: ['다음에 편할 때 이야기해요'], delayMinutes: 0 }, demoAI);
  await assert.rejects(finishGame(game, demoAI, { early: true }), /먼저 읽어/);
  readMessages(game, 0);
  await finishGame(game, demoAI, { early: true });
  assert.equal(game.finishedEarly, true); assert.equal(game.turn, 1); assert.equal(game.result.score, null);
  startDrill(game); const initial = structuredClone(game.drill); startDrill(game);
  assert.deepEqual(game.drill, initial);
  await submitDrill(game, '나는 먹거리부터 보고 싶어요', demoAI);
  assert.ok(game.drill.answer.includes(game.drill.feedback.evidence));
  await assert.rejects(submitDrill(game, '다른 답장', demoAI), /이미 복습/);
  assert.throws(() => retryTurn(game, 5));
  retryTurn(game, 1); assert.equal(game.drill, null); assert.equal(game.finishedEarly, false);
});

test('quality reports require explicit consent and the owner of the visible context', async t => {
  const request = await client(t);
  const path = await ready(request);
  await request(`${path}/send`, { messages: ['그 카페 가볼래'], delayMinutes: 0 });
  await request(`${path}/read`, { delayMinutes: 0 });
  const game = (await request(path)).data;
  const message = game.messages.find(m => m.role === 'partner' && m.turn === 1);
  const input = { gameId: game.id, messageId: message.id, reason: 'style' };
  assert.equal((await request('/api/quality', input)).status, 400);
  assert.equal((await request('/api/quality', { ...input, consent: true }, 'different-user-000000000000000')).status, 404);
  assert.equal((await request('/api/quality', { ...input, consent: true })).status, 201);
});

test('preventive discussion reaches context moderation while direct distress still gets support', async () => {
  let calls = 0;
  const check = createSafety({ key: 'test', fetcher: async () => { calls++; return { ok: true, json: async () => ({ results: [{ flagged: false, categories: {} }] }) }; } });
  await check('주말에 자살 예방 캠페인 봉사했어요'); assert.equal(calls, 1);
  await check('오늘 교육에서 죽고 싶다는 말을 들었을 때 어떻게 도울지 배웠어요'); assert.equal(calls, 2);
  await assert.rejects(check('나는 죽고 싶어요'), /안전이 먼저/); assert.equal(calls, 2);
});

test('parallel identity checks share one verification and cache short-lived failures', async () => {
  let calls = 0, release;
  const access = createAccess({ mode: 'toss' }, () => { calls++; return new Promise(resolve => { release = resolve; }); });
  const req = { headers: { authorization: 'Bearer identity-000000000000000000' } };
  try {
    const requests = Array.from({ length: 10 }, () => access.owner(req));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
    release(true); assert.equal(new Set(await Promise.all(requests)).size, 1);
  } finally { access.close(); }
  let failures = 0;
  const rejected = createAccess({ mode: 'toss' }, async () => { failures++; return false; });
  try { await assert.rejects(rejected.owner(req)); await assert.rejects(rejected.owner(req)); assert.equal(failures, 1); }
  finally { rejected.close(); }
});

test('casual speech is valid and unstable repeated scores fail reliability checks', () => {
  const report = assessRealismRun({ scenarioId: 'new-contact', partnerName: '수빈', profile: { speech: 'casual', humor: 'plain' }, partnerTurns: [{ turn: 1, messages: ['내가 그 책 읽어봤어'] }] });
  assert.equal(report.issues.some(item => item.text.includes('반말 1인칭')), false);
  const summary = { repeatCases: 6, expectedRepeats: 6, repeatRangePass: true, repeatMaxSpread: 5, genderPairs: 5, expectedGenders: 5, genderMeanDifference: 2, genderMaxDifference: 4, stressPassRate: 1, attackPassRate: 1 };
  assert.equal(reliabilityPass(summary), true);
  assert.equal(reliabilityPass({ ...summary, repeatMaxSpread: 20 }), false);
  assert.equal(reliabilityPass({ ...summary, genderMaxDifference: 15 }), false);
});

test('all 13 scenarios support both speech modes in clock and style inputs', () => {
  for (const scenario of scenarios) for (const speech of ['casual', 'honorific']) {
    const game = newGame({ scenarioId: scenario.id, speech }, 'demo');
    for (const minute of [0, 180, 1440]) {
      game.minute = minute;
      assert.equal(clockContext(game).elapsedMinutes, minute);
      assert.ok(partnerFacts(game).facts);
      assert.ok(replyExampleFor(game).partner.every(text => typeof text === 'string'));
      if (scenario.id === 'busy-break' && minute >= 120) {
        assert.match(clockContext(game).schedule, /종료 예정 시각이 지났다/);
        assert.doesNotMatch(partnerFacts(game).facts, /지금부터/);
      }
    }
  }
});

test('AI request preserves message timing and fixes legacy 19:00 instructions after 21:00', async () => {
  let body;
  const ai = createAI({ enabled: true, key: 'fake', directory: mkdtempSync(join(tmpdir(), 'sai-context-')), fetcher: async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ messages: ['이제 끝났어'], readAfterMinutes: 0, replyAfterReadMinutes: 1 }) } }] }) };
  } });
  const game = newGame({ scenarioId: 'after-date', speech: 'casual' }, 'live');
  game.minute = 180;
  game.scenario = { ...game.scenario, roleRule: '현재 19시이며 아직 일이 끝났다고 말하지 않는다' };
  await ai.reply(game);
  assert.match(body.messages[0].content, /22:00/);
  assert.doesNotMatch(body.messages[0].content, /현재 19시이며/);
  assert.ok(body.messages.slice(1).every(message => message.content.includes('sentAtMinute')));
});
