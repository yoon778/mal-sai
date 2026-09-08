import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../lib/store.js';
import { createAccess, deployment } from '../lib/access.js';
import { createSafety, safeAI } from '../lib/safety.js';
import { createServer } from '../server.js';
import { demoAI } from '../lib/ai.js';
import { newGame, startGame, readMessages } from '../lib/game.js';
import { createHash } from 'node:crypto';

async function listen(t, options) {
  const server = createServer({ ai: demoAI, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, body, user = 'a'.repeat(32)) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
}

test('SQLite migration is idempotent; ciphertext and ownership survive reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sai-store-'));
  let store = new Store({ directory });
  store.save('alice', 'game', { id: 'one', messages: ['private transcript 99001'] });
  store.consume('alice', 1);
  store.close();
  assert.equal(readFileSync(join(directory, 'practice.sqlite')).includes(Buffer.from('private transcript 99001')), false);
  store = new Store({ directory });
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(store.get('alice', 'one').messages[0], 'private transcript 99001');
  assert.equal(store.get('bob', 'one'), null);
  assert.deepEqual(store.list('bob'), []);
  assert.throws(() => store.consume('alice', 1), /이용 한도/);
  store.deleteOwner('alice');
  assert.equal(store.get('alice', 'one'), null);
  assert.throws(() => store.consume('alice', 1), /이용 한도/, 'deleting records must not bypass quota');
  store.close();
});

test('wrong encryption keys and future schemas fail closed without replacing the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sai-version-'));
  const store = new Store({ directory });
  store.save('owner', 'game', { id: 'one', text: 'keep' });
  store.close();
  assert.throws(() => new Store({ directory, key: 'aa'.repeat(32) }));
  const reopened = new Store({ directory });
  assert.equal(reopened.get('owner', 'one').text, 'keep');
  reopened.close();
  const db = new DatabaseSync(join(directory, 'practice.sqlite'));
  db.exec('PRAGMA user_version=2'); db.close();
  assert.throws(() => new Store({ directory }), /Unsupported database version/);
});

test('expired records are unavailable and pruned; transactions roll back partial feedback', () => {
  const store = new Store();
  try {
    store.save('owner', 'game', { id: 'game' });
    assert.throws(() => store.transaction(() => { store.save('owner', 'feedback', { id: 'feedback' }); throw new Error('disk failure'); }));
    assert.deepEqual(store.list('owner', 'feedback'), []);
    store.db.prepare('UPDATE records SET updated=0').run();
    assert.equal(store.get('owner', 'game'), null);
    assert.deepEqual(store.list('owner'), []);
    store.prune();
    assert.equal(store.db.prepare('SELECT count(*) n FROM records').get().n, 0);
  } finally { store.close(); }
});

test('HTTP history, changes, feedback, reports and deletion are isolated per identity', async t => {
  const request = await listen(t);
  const created = await request('/api/games', { scenarioId: 'second-date' });
  const path = `/api/games/${created.data.id}`;
  const bob = 'b'.repeat(32);
  assert.equal((await request(path, undefined, '')).status, 401);
  assert.equal((await request(path, undefined, bob)).status, 404);
  assert.equal((await request(`${path}/start`, {}, bob)).status, 404);
  assert.equal((await request('/api/feedback', { gameId: created.data.id }, bob)).status, 400);
  assert.equal((await request('/api/reports', { gameId: created.data.id }, bob)).status, 404);
  assert.deepEqual((await request('/api/history', undefined, bob)).data, []);
  await request('/api/account/delete', {}, bob);
  assert.equal((await request(path)).status, 200);
  await request(`${path}/start`, {}); await request(`${path}/read`, { delayMinutes: 0 });
  const started = (await request(path)).data;
  const partner = started.messages.find(m => m.role === 'partner' && !m.background);
  assert.equal((await request('/api/reports', { gameId: started.id, messageId: partner.id, reason: 'unsafe' })).status, 201);
  assert.equal((await request('/api/history')).data.length, 1);
  await request('/api/account/delete', {});
  assert.equal((await request(path)).status, 404);
  assert.deepEqual((await request('/api/history')).data, []);
});

test('Toss CORS allows only registered origins and invalid identities never pass verification', async () => {
  const settings = { mode: 'toss', host: 'api.test.example', origins: ['https://mal-sai.apps.tossmini.com'] };
  let count = 0;
  const access = createAccess(settings, async token => { count++; return token === 'a'.repeat(32); });
  const res = { setHeader() {} };
  try {
    access.check({ headers: { host: settings.host, origin: settings.origins[0], 'sec-fetch-site': 'cross-site' } }, res);
    assert.throws(() => access.check({ headers: { host: settings.host, origin: 'https://evil.example' } }, res), /허용/);
    assert.throws(() => access.check({ headers: { host: 'localhost:3000' } }, res), /허용/);
    const req = { headers: { authorization: `Bearer ${'a'.repeat(32)}` } };
    assert.equal(await access.owner(req), await access.owner(req));
    assert.equal(count, 1, 'successful verification cached briefly');
    await assert.rejects(access.owner({ headers: { authorization: `Bearer ${'b'.repeat(32)}` } }), /토스에서/);
    await assert.rejects(access.owner({ headers: {} }), /사용자 연결/);
  } finally { access.close(); }
  const broken = createAccess(settings, async () => { throw new Error('network'); });
  try { await assert.rejects(broken.owner({ headers: { authorization: `Bearer ${'a'.repeat(32)}` } }), error => error.status === 503); }
  finally { broken.close(); }
  assert.throws(() => deployment({ APP_PLATFORM: 'toss' }));
  assert.throws(() => deployment({ APP_PLATFORM: 'unknown' }));
});

test('safety blocks harmful input and fails closed for malformed or unavailable moderation', async () => {
  let calls = 0;
  const check = createSafety({ key: 'test', fetcher: async () => { calls++; return { ok: true, json: async () => ({ results: [{ flagged: false, categories: {} }] }) }; } });
  await assert.rejects(check('죽고 싶어요'), /안전이 먼저/);
  assert.equal(calls, 0);
  await check('오늘 카페에서 뭐 마셨어'); assert.equal(calls, 1);
  for (const output of [null, {}, { results: [{ flagged: false }] }]) {
    const malformed = createSafety({ key: 'test', fetcher: async () => ({ ok: true, json: async () => output }) });
    await assert.rejects(malformed('안녕'), error => error.status === 503);
  }
  const blocked = createSafety({ key: 'test', fetcher: async () => ({ ok: true, json: async () => ({ results: [{ flagged: true, categories: { hate: true } }] }) }) });
  await assert.rejects(blocked('unsafe'), error => error.status === 422);
  const wrapped = safeAI(demoAI, async () => { throw new Error('unsafe output'); });
  await assert.rejects(wrapped.topic({ scenario: { topic: ['a', 'b', 'c'] }, profile: {} }), /unsafe output/);
});

test('blocked AI output does not consume a turn or leak a response; per-user quota remains spent', async t => {
  let checks = 0;
  const request = await listen(t, { ai: { ...demoAI, mode: 'live' }, dailyLimit: 1, safety: async () => { if (++checks === 2) { const error = new Error('blocked'); error.status = 422; throw error; } } });
  const created = await request('/api/games', { scenarioId: 'second-date' });
  const path = `/api/games/${created.data.id}`;
  await request(`${path}/start`, {}); await request(`${path}/read`, { delayMinutes: 0 });
  const before = (await request(path)).data;
  assert.equal((await request(`${path}/send`, { messages: ['카페 좋아요'], delayMinutes: 0 })).status, 422);
  assert.deepEqual((await request(path)).data, before);
  assert.equal((await request(`${path}/send`, { messages: ['다시'], delayMinutes: 0 })).status, 429);
});

test('persisted practice modes never silently switch to paid AI or fabricated demo evaluations', async t => {
  const owner = createHash('sha256').update(`local:${'a'.repeat(32)}`).digest('hex');
  for (const [storedMode, serverMode, status] of [['demo', 'live', 200], ['live', 'demo', 503]]) {
    const store = new Store();
    const game = newGame({ scenarioId: 'second-date' }, storedMode);
    startGame(game); readMessages(game, 0); store.save(owner, 'game', game);
    const request = await listen(t, { store, ai: { ...demoAI, mode: serverMode, reply: () => { throw new Error('unexpected mode switch'); } }, safety: () => { throw new Error('unexpected moderation'); } });
    const response = await request(`/api/games/${game.id}/send`, { messages: ['카페 좋아요'], delayMinutes: 0 });
    assert.equal(response.status, status);
    assert.equal((await request(`/api/games/${game.id}`)).data.mode, storedMode);
  }
});
