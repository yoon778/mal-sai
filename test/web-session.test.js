import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createWebSessions } from '../lib/web-session.js';

const key = 'ab'.repeat(32);
const lifetime = 30 * 24 * 60 * 60 * 1000;
const epoch = 1_700_000_000_000;
const request = cookie => ({ headers: cookie ? { cookie } : {} });
const unauthorized = error => error.status === 401;

function issue(sessions, req = request()) {
  const headers = {};
  const body = sessions.issue(req, { setHeader(name, value) { headers[name] = value; } });
  return { body, header: headers['Set-Cookie'], cookie: headers['Set-Cookie'].split(';')[0] };
}

test('web sessions require a dedicated signing key and send a secure opaque cookie', () => {
  for (const invalid of [undefined, '', 'a'.repeat(63), 'g'.repeat(64), 123]) {
    assert.throws(() => createWebSessions({ key: invalid }), /STORAGE_KEY/);
  }
  const sessions = createWebSessions({ key, now: () => epoch });
  const { body, header, cookie } = issue(sessions);
  assert.deepEqual(body, { platform: 'web' });
  assert.match(header, /^__Host-sai-session=v1\.[A-Za-z0-9_-]{43}\.\d+\.[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  assert.equal(header.includes('Domain='), false);
  const id = cookie.split('.')[1];
  assert.equal(sessions.owner(request(cookie)), createHash('sha256').update(`web:${id}`).digest('hex'));
  assert.equal(sessions.needsIssue(request(cookie)), false);
  assert.throws(() => createWebSessions({ key: 'cd'.repeat(32), now: () => epoch }).owner(request(cookie)), unauthorized);
});

test('separate guests have separate owners and valid cookies retain identity on renewal', () => {
  let instant = epoch;
  const sessions = createWebSessions({ key, now: () => instant });
  const alice = issue(sessions), bob = issue(sessions);
  const owner = sessions.owner(request(alice.cookie));
  assert.notEqual(owner, sessions.owner(request(bob.cookie)));
  instant += 60_000;
  const renewed = issue(sessions, request(`theme=dark; ${alice.cookie}; other=value`));
  assert.notEqual(renewed.cookie, alice.cookie);
  assert.equal(sessions.owner(request(renewed.cookie)), owner);
  assert.equal(Number(renewed.cookie.split('.')[2]), instant + lifetime);
  instant = epoch + lifetime;
  assert.throws(() => sessions.owner(request(alice.cookie)), unauthorized);
  assert.equal(sessions.owner(request(renewed.cookie)), owner);
});

test('missing, malformed, tampered and duplicate cookies fail closed without bearer fallback', () => {
  const sessions = createWebSessions({ key, now: () => epoch });
  const { cookie } = issue(sessions);
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const [, id, expiry, signature] = token.split('.');
  const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const invalid = [
    '', 'other=value', `__Host-sai-session=`, `${cookie}; ${cookie}`,
    `__Host-sai-session="${token}"`, `__Host-sai-session=${token}.extra`,
    `__Host-sai-session=v2.${id}.${expiry}.${signature}`,
    `__Host-sai-session=v1.${id}.${Number(expiry) - 1}.${signature}`,
    `__Host-sai-session=v1.${id}.${expiry}.${changedSignature}`,
    `__Host-sai-session=v1.${id}.0${expiry}.${signature}`,
    `__Host-sai-session=${'a'.repeat(20_000)}`,
  ];
  for (const cookieValue of invalid) {
    const req = request(cookieValue);
    req.headers.authorization = `Bearer ${token}`;
    assert.throws(() => sessions.owner(req), unauthorized);
    assert.equal(sessions.needsIssue(req), true);
  }
  assert.throws(() => sessions.owner({ headers: { cookie: [cookie] } }), unauthorized);
  assert.equal(sessions.owner({ headers: { cookie, authorization: `Bearer ${'b'.repeat(32)}` } }), sessions.owner(request(cookie)));
});

test('expired sessions receive new identities; future or noncanonical signed cookies are rejected', () => {
  let instant = epoch;
  const sessions = createWebSessions({ key, now: () => instant });
  const original = issue(sessions), owner = sessions.owner(request(original.cookie));
  instant += lifetime;
  assert.throws(() => sessions.owner(request(original.cookie)), unauthorized);
  assert.equal(sessions.needsIssue(request(original.cookie)), true);
  const replacement = issue(sessions, request(original.cookie));
  assert.notEqual(sessions.owner(request(replacement.cookie)), owner);

  const signingKey = createHmac('sha256', Buffer.from(key, 'hex')).update('web-session-v1').digest();
  const signed = payload => `__Host-sai-session=${payload}.${createHmac('sha256', signingKey).update(payload).digest('base64url')}`;
  for (const expiry of [instant - 1, instant, instant + lifetime + 1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => sessions.owner(request(signed(`v1.${'A'.repeat(43)}.${expiry}`))), unauthorized);
  }
  assert.throws(() => sessions.owner(request(signed(`v1.${'A'.repeat(42)}B.${instant + lifetime}`))), unauthorized);
  const valid = signed(`v1.${'A'.repeat(43)}.${instant + lifetime}`);
  assert.equal(sessions.needsIssue(request(valid)), false);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = valid.at(-1), noncanonical = valid.slice(0, -1) + alphabet[alphabet.indexOf(last) + 1];
  assert.throws(() => sessions.owner(request(noncanonical)), unauthorized);
});
