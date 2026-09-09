import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { createAccess, deployment } from '../lib/access.js';
import { publicBuildSettings, validateOperationSettings } from '../lib/deployment-config.js';
import { createServer } from '../server.js';
import { demoAI } from '../lib/ai.js';

const settings = { mode: 'toss', host: 'api.test.example', origins: ['https://mal-sai.apps.tossmini.com'] };
const request = (id, peer = '192.0.2.1', forwarded) => ({ headers: { authorization: `Bearer ${id.padEnd(32, '_')}`, ...(forwarded ? { 'x-real-ip': forwarded } : {}) }, socket: { remoteAddress: peer } });

test('rotating invalid keys stop at source and server limits, with a bounded retry window', async t => {
  let instant = 10_000, calls = 0;
  const access = createAccess(settings, async () => { calls++; return false; }, { verificationLimit: 3, sourceVerificationLimit: 2, now: () => instant });
  t.after(() => access.close());
  for (const id of ['first', 'second']) await assert.rejects(access.owner(request(id)), error => error.status === 401);
  await assert.rejects(access.owner(request('third')), error => error.status === 429 && error.retryAfter === 50);
  await assert.rejects(access.owner(request('fourth', '192.0.2.2')), error => error.status === 401);
  await assert.rejects(access.owner(request('fifth', '192.0.2.3')), error => error.status === 429);
  assert.equal(calls, 3, 'rejected requests must not reach the upstream API');
  instant = 60_000;
  await assert.rejects(access.owner(request('sixth')), error => error.status === 401);
  assert.equal(calls, 4);
});

test('verified keys and same-key concurrent verification bypass additional upstream quota', async t => {
  let resolve, calls = 0;
  const access = createAccess(settings, () => { calls++; return new Promise(done => { resolve = done; }); }, { verificationLimit: 1 });
  t.after(() => access.close());
  const first = access.owner(request('known')), second = access.owner(request('known'));
  await Promise.resolve();
  resolve(true);
  assert.equal(await first, await second);
  assert.equal(await access.owner(request('known')), await first);
  assert.equal(calls, 1);
  await assert.rejects(access.owner(request('other')), error => error.status === 429);
});

test('failed keys are cached briefly and string truth values never authenticate', async t => {
  let instant = 10_000, calls = 0;
  const access = createAccess(settings, async () => { calls++; return 'true'; }, { now: () => instant });
  t.after(() => access.close());
  for (let i = 0; i < 2; i++) await assert.rejects(access.owner(request('bad')), error => error.status === 401);
  assert.equal(calls, 1);
  instant += 5000;
  await assert.rejects(access.owner(request('bad')), error => error.status === 401);
  assert.equal(calls, 2);
});

test('forwarded IP cannot evade limits unless supplied by the exact configured proxy', async t => {
  let calls = 0;
  const access = createAccess({ ...settings, trustedProxyIp: '127.0.0.1' }, async () => { calls++; return false; }, { verificationLimit: 10, sourceVerificationLimit: 1 });
  t.after(() => access.close());
  await assert.rejects(access.owner(request('one', '192.0.2.1', '198.51.100.1')), error => error.status === 401);
  await assert.rejects(access.owner(request('two', '192.0.2.1', '198.51.100.2')), error => error.status === 429);
  for (const [id, ip] of [['three', '198.51.100.1'], ['four', '198.51.100.2']]) {
    await assert.rejects(access.owner(request(id, '::ffff:127.0.0.1', ip)), error => error.status === 401);
  }
  await assert.rejects(access.owner(request('five', '127.0.0.1', '198.51.100.1')), error => error.status === 429);
  assert.equal(calls, 3);
});

test('Toss preflight sets transport headers only for the deployed API and bounds CORS', () => {
  const access = createAccess(settings), headers = new Map();
  try {
    access.check({ headers: { host: settings.host, origin: settings.origins[0] } }, { setHeader: (key, value) => headers.set(key, value) });
    assert.equal(headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert.equal(headers.get('Access-Control-Allow-Origin'), settings.origins[0]);
    assert.throws(() => access.check({ headers: { host: settings.host, origin: 'https://attacker.example' } }, { setHeader() {} }), error => error.status === 403);
  } finally { access.close(); }
});

test('public builds reject secret-like VITE settings, unsafe origins and app names', () => {
  const good = { VITE_API_ORIGIN: 'https://api.test.example', TOSS_APP_NAME: 'mal-sai' };
  assert.deepEqual(publicBuildSettings(good), { apiOrigin: good.VITE_API_ORIGIN, appName: good.TOSS_APP_NAME });
  const marker = 'private-test-value-never-print';
  assert.throws(() => publicBuildSettings({ ...good, VITE_OPENAI_API_KEY: marker }), error => error.message.includes('VITE_OPENAI_API_KEY') && !error.message.includes(marker));
  for (const origin of ['http://api.test.example', 'https://user:secret@api.test.example', 'https://api.test.example/path', 'https://api.test.example?key=secret', 'https://api.test.example/']) {
    assert.throws(() => publicBuildSettings({ ...good, VITE_API_ORIGIN: origin }), /HTTPS origin/);
  }
  for (const name of ['../other', 'bad.name', 'bad/name', 'bad name']) assert.throws(() => publicBuildSettings({ ...good, TOSS_APP_NAME: name }), /TOSS_APP_NAME/);
});

test('production cannot start in local identity mode or with unsafe limits and storage', () => {
  assert.throws(() => deployment({ NODE_ENV: 'production' }), /APP_PLATFORM=toss/);
  const good = { DATA_DIRECTORY: tmpdir(), TRUSTED_PROXY_IP: '127.0.0.1' };
  assert.doesNotThrow(() => validateOperationSettings(good));
  const invalid = [
    ['DATA_DIRECTORY', 'relative/data'], ['TRUSTED_PROXY_IP', undefined], ['TRUSTED_PROXY_IP', '*'], ['TRUSTED_PROXY_IP', '127.0.0.1,192.0.2.1'],
    ['AI_BUDGET_USD', '4'], ['AI_BUDGET_USD', 'NaN'], ['AI_BUDGET_USD', '0'],
    ['AI_DAILY_REQUEST_LIMIT', '-1'], ['AI_MINUTE_REQUEST_LIMIT', '1.5'], ['AI_MAX_CONCURRENT_REQUESTS', '21'],
    ['AI_REPLY_MODEL', 'unpriced-model'], ['AI_COACH_MODEL', 'unpriced-model'],
  ];
  for (const [key, value] of invalid) assert.throws(() => validateOperationSettings({ ...good, [key]: value }));
});

test('HTTP denies private files and malformed bodies without leaking internal data', async t => {
  const server = createServer({ ai: demoAI });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/.env', '/.env.toss', '/.data/storage.key', '/.data/practice.sqlite', '/%2e%2e/.env', '/lib/access.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
    const data = await response.json();
    assert.deepEqual(Object.keys(data), ['error']);
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${'test'.repeat(8)}` };
  const malformed = await fetch(base + '/api/games', { method: 'POST', headers, body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(base + '/api/games', { method: 'POST', headers, body: JSON.stringify({ value: 'x'.repeat(8100) }) });
  assert.equal(oversized.status, 413);
});
