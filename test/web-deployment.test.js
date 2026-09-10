import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createAccess, deployment } from '../lib/access.js';
import { createServer } from '../server.js';
import { Store } from '../lib/store.js';
import { demoAI } from '../lib/ai.js';

const settings = { mode: 'web', host: 'mal-sai.test', origin: 'https://mal-sai.test', storageKey: '11'.repeat(32), proxy: 'render' };
const source = '192.0.2.1';
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

async function listen(t, options = {}) {
  const server = createServer({ ai: demoAI, access: createAccess(settings), safety: async () => {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
  t.after(close);
  async function request(path, { body, method = body === undefined ? 'GET' : 'POST', cookie, ip = source, headers = {} } = {}) {
    const defaults = { Host: settings.host, ...(ip === null ? {} : { 'CF-Connecting-IP': ip }), ...(cookie ? { Cookie: cookie } : {}) };
    if (method === 'POST') Object.assign(defaults, { Origin: settings.origin, 'Content-Type': 'application/json' });
    Object.assign(defaults, headers);
    for (const name of Object.keys(defaults)) if (defaults[name] === null) delete defaults[name];
    return await new Promise((resolve, reject) => {
      const outgoing = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: defaults }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const headers = new Headers(response.headers);
          resolve({ status: response.statusCode, headers, data: headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text });
        });
      });
      outgoing.on('error', reject);
      outgoing.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  return { request, close };
}

async function practice(request, cookie, ip = source) {
  const created = await request('/api/games', { body: { scenarioId: 'second-date' }, cookie, ip });
  assert.equal(created.status, 201);
  const path = `/api/games/${created.data.id}`;
  assert.equal((await request(`${path}/start`, { body: {}, cookie, ip })).status, 200);
  assert.equal((await request(`${path}/read`, { body: { delayMinutes: 0 }, cookie, ip })).status, 200);
  return path;
}

test('public web deployment requires HTTPS, explicit AI mode, durable storage and a known proxy', () => {
  const env = { APP_PLATFORM: 'web', RENDER: 'true', RENDER_EXTERNAL_URL: settings.origin, DATA_DIRECTORY: tmpdir(), STORAGE_KEY: settings.storageKey, AI_ENABLED: 'false' };
  assert.equal(deployment(env).proxy, 'render');
  assert.equal(deployment(env).host, settings.host);
  assert.equal(deployment({ ...env, RENDER: 'false', API_PUBLIC_ORIGIN: settings.origin, TRUSTED_PROXY_IP: '127.0.0.1' }).proxy, 'fixed');
  for (const patch of [
    { RENDER_EXTERNAL_URL: 'http://mal-sai.test' }, { RENDER_EXTERNAL_URL: `${settings.origin}/path` },
    { DATA_DIRECTORY: 'relative' }, { STORAGE_KEY: 'bad' }, { AI_ENABLED: '' }, { AI_ENABLED: 'true' },
    { RENDER: 'false', API_PUBLIC_ORIGIN: settings.origin }, { TRUSTED_PROXY_IP: '*' },
  ]) assert.throws(() => deployment({ ...env, ...patch }));
});

test('web data requires a signed cookie; bearer tokens do not authenticate or cross guest ownership', async t => {
  const { request } = await listen(t);
  assert.equal((await request('/api/history')).status, 401);
  assert.equal((await request('/api/history', { headers: { Authorization: `Bearer ${'a'.repeat(64)}` } })).status, 401);
  const first = await request('/api/session', { method: 'POST' });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, { platform: 'web' });
  const alice = cookieOf(first), bob = cookieOf(await request('/api/session', { method: 'POST' }));
  const created = await request('/api/games', { cookie: alice, body: { scenarioId: 'second-date' } });
  assert.equal(created.status, 201);
  assert.equal((await request(`/api/games/${created.data.id}`, { cookie: bob })).status, 404);
  assert.deepEqual((await request('/api/history', { cookie: bob })).data, []);
  assert.equal((await request('/api/history', { cookie: alice, headers: { Authorization: 'Bearer arbitrary' } })).data.length, 1);
  assert.equal((await request('/api/account/delete', { cookie: bob, body: {} })).status, 200);
  assert.equal((await request(`/api/games/${created.data.id}`, { cookie: alice })).status, 200);
});

test('web writes reject foreign or missing origins and fail closed when Render client IP is unavailable', async t => {
  const { request } = await listen(t);
  for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: null }, { 'Sec-Fetch-Site': 'cross-site' }, { Host: 'attacker.test' }]) {
    const result = await request('/api/session', { method: 'POST', headers });
    assert.equal(result.status, 403);
    assert.equal(result.headers.has('set-cookie'), false);
  }
  for (const ip of [null, 'not-an-ip', '192.0.2.1, 192.0.2.2']) {
    assert.equal((await request('/api/config', { ip, headers: { 'X-Real-IP': source, 'X-Forwarded-For': source } })).status, 403);
  }
  assert.equal((await request('/api/session', { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).status, 415);
});

test('fixed proxy identity trusts X-Real-IP only from the exact proxy peer', () => {
  const access = createAccess({ ...settings, proxy: 'fixed', trustedProxyIp: '127.0.0.1' });
  const req = { method: 'GET', url: '/api/config', headers: { host: settings.host, 'x-real-ip': source, 'cf-connecting-ip': '192.0.2.99', 'x-forwarded-for': '192.0.2.100' }, socket: { remoteAddress: '::ffff:127.0.0.1' } };
  const res = { setHeader() {} };
  assert.doesNotThrow(() => access.check(req, res));
  const owner = access.quotaOwner(req);
  assert.equal(access.quotaOwner({ ...req, headers: { ...req.headers, 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '198.51.100.4' } }), owner);
  assert.notEqual(access.quotaOwner({ ...req, headers: { ...req.headers, 'x-real-ip': '192.0.2.2' } }), owner);
  assert.throws(() => access.check({ ...req, socket: { remoteAddress: '192.0.2.55' } }, res), error => error.status === 403);
  assert.throws(() => access.check({ ...req, headers: { ...req.headers, 'x-real-ip': undefined } }, res), error => error.status === 403);
});

test('one network can create only ten guest sessions per hour while existing cookies keep working', async t => {
  let instant = Math.floor(Date.now() / 3600_000) * 3600_000 + 1000;
  const { request } = await listen(t, { access: createAccess(settings, undefined, { now: () => instant }) });
  let cookie;
  for (let index = 0; index < 10; index++) {
    const result = await request('/api/session', { method: 'POST' });
    assert.equal(result.status, 200);
    cookie ??= cookieOf(result);
  }
  const blocked = await request('/api/session', { method: 'POST' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.has('set-cookie'), false);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await request('/api/session', { method: 'POST', cookie })).status, 200);
  assert.equal((await request('/api/history', { cookie })).status, 200);
  assert.equal((await request('/api/session', { method: 'POST', ip: '192.0.2.2' })).status, 200);
  instant += 3600_000;
  assert.equal((await request('/api/session', { method: 'POST' })).status, 200);
});

test('network AI quota survives new cookies and server restarts while other networks remain separate', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'sai-web-quota-'));
  let calls = 0;
  const ai = { ...demoAI, mode: 'live', hint: async game => { calls++; return demoAI.hint(game); } };
  const options = () => ({ ai, store: new Store({ directory, key: settings.storageKey }), dailyLimit: 1 });
  let running = await listen(t, options());
  const alice = cookieOf(await running.request('/api/session', { method: 'POST' }));
  const alicePath = await practice(running.request, alice);
  assert.equal((await running.request(`${alicePath}/hint`, { cookie: alice, body: {} })).status, 200);
  const bob = cookieOf(await running.request('/api/session', { method: 'POST' }));
  const bobPath = await practice(running.request, bob);
  assert.equal((await running.request(`${bobPath}/hint`, { cookie: bob, body: {} })).status, 429);
  assert.equal(calls, 1);
  assert.equal((await running.request(`${bobPath}/hint`, { cookie: bob, body: {}, ip: '192.0.2.2' })).status, 200, 'network rejection must roll back the new guest quota');
  assert.equal(calls, 2);
  await running.close();
  running = await listen(t, options());
  const charlie = cookieOf(await running.request('/api/session', { method: 'POST' }));
  const charliePath = await practice(running.request, charlie);
  assert.equal((await running.request(`${charliePath}/hint`, { cookie: charlie, body: {} })).status, 429);
  assert.equal(calls, 2);
  assert.equal((await running.request(`/api/games/${alicePath.split('/').at(-1)}`, { cookie: alice })).status, 200, 'signed guest cookie and owned records must survive restart');
});

test('shared minute quota rolls back personal counters and resets without resetting the shared daily quota', () => {
  const store = new Store();
  const instant = Math.floor(Date.now() / 60_000) * 60_000 + 1000;
  try {
    store.consumeAI('alice', 2, 1, instant, 'network:one');
    assert.throws(() => store.consumeAI('bob', 2, 1, instant, 'network:one'), error => error.status === 429 && error.retryAfter === 59);
    assert.equal(store.db.prepare('SELECT count(*) n FROM quotas WHERE owner IN (?, ?)').get('bob', 'minute:bob').n, 0);
    store.consumeAI('bob', 2, 1, instant + 60_000, 'network:one');
    assert.throws(() => store.consumeAI('charlie', 2, 1, instant + 120_000, 'network:one'), error => error.status === 429);
    assert.equal(store.db.prepare('SELECT count(*) n FROM quotas WHERE owner IN (?, ?)').get('charlie', 'minute:charlie').n, 0);
    store.consumeAI('charlie', 2, 1, instant + 120_000, 'network:two');
  } finally { store.close(); }
});

test('health checks need no cookie, proxy IP or AI request', async t => {
  let calls = 0;
  const { request } = await listen(t, { ai: { ...demoAI, mode: 'live', reply: async () => { calls++; throw new Error('unexpected AI call'); } } });
  const result = await request('/healthz', { ip: null, headers: { Host: 'internal-health-check' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { status: 'ok' });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(calls, 0);
});

test('external links can open public documents while cross-site API requests stay blocked', async t => {
  const { request } = await listen(t);
  const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  for (const path of ['/', '/privacy']) assert.equal((await request(path, { headers: navigation, ip: null })).status, 200);
  assert.equal((await request('/api/config', { headers: navigation })).status, 403);
  assert.equal((await request('/api/session', { body: {}, headers: navigation })).status, 403);
  const unexpectedBody = await request('/api/session', { body: {} });
  assert.equal(unexpectedBody.status, 400);
  assert.equal(unexpectedBody.headers.has('set-cookie'), false);
});

test('normalized and absolute-form API paths share the same traffic quota', async t => {
  const { request } = await listen(t, { access: createAccess(settings, undefined, { now: () => 60_000 }) });
  for (let i = 0; i < 120; i++) assert.equal((await request('/api/config')).status, 200);
  for (const path of ['/api/config', '/x/../api/config', '//mal-sai.test/api/config', 'https://mal-sai.test/api/config']) {
    const result = await request(path);
    assert.equal(result.status, 429, path);
    assert.equal(result.headers.get('retry-after'), '60');
  }
});
