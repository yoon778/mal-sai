import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../lib/store.js';
import { createServer } from '../server.js';
import { demoAI } from '../lib/ai.js';

async function client(t, options = {}) {
  const server = createServer({ ai: { ...demoAI, mode: 'live' }, safety: async () => {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return async (path, body, user = 'usage-user-000000000000000000') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), retryAfter: response.headers.get('Retry-After') };
  };
}
async function ready(request, user) {
  const created = await request('/api/games', { scenarioId: 'second-date', interest: 'open', initiative: 'calm' }, user);
  const path = `/api/games/${created.data.id}`;
  await request(`${path}/start`, {}, user);
  await request(`${path}/read`, { delayMinutes: 0 }, user);
  return path;
}

test('minute and daily quotas are atomic, persistent and survive deletion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sai-limits-'));
  let store = new Store({ directory });
  const now = Date.parse(`${new Date().toISOString().slice(0, 10)}T01:00:00Z`);
  store.consumeAI('alice', 2, 1, now);
  assert.throws(() => store.consumeAI('alice', 2, 1, now + 2000), error => error.status === 429 && error.retryAfter === 58);
  assert.equal(store.db.prepare('SELECT count FROM quotas WHERE owner=?').get('alice').count, 1, 'minute rejection must roll back daily count');
  store.close(); store = new Store({ directory });
  try {
    assert.throws(() => store.consumeAI('alice', 2, 1, now + 3000), /너무 잦아요/);
    store.deleteOwner('alice');
    assert.throws(() => store.consumeAI('alice', 2, 1, now + 4000), /너무 잦아요/);
    store.consumeAI('alice', 2, 1, now + 60000);
    assert.throws(() => store.consumeAI('alice', 2, 1, now + 120000), /오전 9시/);
    store.consumeAI('bob', 2, 1, now);
    store.consumeAI('alice', 2, 1, now + 86400_000);
  } finally { store.close(); }
});

test('reloads and scenario shuffles never call AI or consume quota; cached hints are free', async t => {
  const store = new Store(); let calls = 0;
  const request = await client(t, { store, dailyLimit: 1, minuteLimit: 1, ai: { ...demoAI, mode: 'live', hint: async game => { calls++; return demoAI.hint(game); } } });
  const created = await request('/api/games', {}), path = `/api/games/${created.data.id}`;
  for (let n = 0; n < 12; n++) {
    assert.equal((await request(path)).status, 200);
    assert.equal((await request('/api/config')).status, 200);
    assert.equal((await request(`${path}/shuffle`, { scenarioId: 'second-date' })).status, 200);
  }
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM quotas').get().n, 0);
  await request(`${path}/start`, {}); await request(`${path}/read`, { delayMinutes: 0 });
  assert.equal((await request(`${path}/hint`, {})).status, 200);
  assert.equal((await request(`${path}/hint`, {})).status, 200);
  assert.equal(calls, 1);
  const blocked = await request(`${path}/topic`, {});
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) > 0);
  assert.equal((await request(path)).status, 200, 'saved records remain available at the cap');
});

test('latest evaluation is reused even for fresh request IDs and exhausted quota', async t => {
  let evaluations = 0;
  const request = await client(t, { dailyLimit: 2, ai: { ...demoAI, mode: 'live', evaluate: async game => {
    evaluations++;
    const result = await demoAI.evaluate(game), own = game.messages.find(m => m.role === 'user' && !m.background);
    return { ...result, coachingVersion: 2, moments: [{ messageId: own.id, kind: 'strength', reason: '상대의 일정부터 존중했어요', nextStep: '같이 시간을 맞춰 보세요', alternative: null, change: '', contextMessageIds: [] }] };
  } } });
  const path = await ready(request);
  await request(`${path}/send`, { messages: ['일요일에 그 카페 가볼래'], delayMinutes: 0 });
  await request(`${path}/read`, { delayMinutes: 0 });
  const finished = await request(`${path}/finish`, { early: true });
  assert.equal(finished.status, 200);
  for (let n = 0; n < 5; n++) {
    const refreshed = await request(`${path}/reevaluate`, { requestId: randomUUID() });
    assert.equal(refreshed.status, 200);
    assert.deepEqual(refreshed.data.result, finished.data.result);
  }
  assert.equal(evaluations, 1);
});

test('server-wide concurrency blocks another identity before consuming its quota and releases slots', async t => {
  let entered = 0, release, allEntered;
  const holding = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { allEntered = resolve; });
  const request = await client(t, { dailyLimit: 1, maxConcurrentAI: 3, ai: { ...demoAI, mode: 'live', hint: async game => { if (++entered === 3) allEntered(); await holding; return demoAI.hint(game); } } });
  const users = Array.from({ length: 4 }, (_, i) => `concurrent-user-${i}-0000000000000000`);
  const paths = [];
  for (const user of users) paths.push(await ready(request, user));
  const pending = paths.slice(0, 3).map((path, i) => request(`${path}/hint`, {}, users[i]));
  try {
    await started;
    const blocked = await request(`${paths[3]}/hint`, {}, users[3]);
    assert.equal(blocked.status, 429); assert.equal(blocked.retryAfter, '5');
  } finally { release(); }
  assert.ok((await Promise.all(pending)).every(result => result.status === 200));
  assert.equal((await request(`${paths[3]}/hint`, {}, users[3])).status, 200);
});

test('failed safety checks release the AI slot but still consume daily quota', async t => {
  let checks = 0;
  const request = await client(t, { dailyLimit: 2, maxConcurrentAI: 1, safety: async () => { if (++checks === 1) throw Object.assign(new Error('test safety failure'), { status: 503 }); } });
  const path = await ready(request);
  assert.equal((await request(`${path}/hint`, {})).status, 503);
  assert.equal((await request(`${path}/hint`, {})).status, 200);
  assert.equal((await request(`${path}/topic`, {})).status, 429);
});
