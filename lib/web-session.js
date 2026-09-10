import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GameError } from './game.js';

const cookieName = '__Host-sai-session';
const lifetimeSeconds = 30 * 24 * 60 * 60;
const lifetime = lifetimeSeconds * 1000;

export function createWebSessions({ key, now = Date.now }) {
  if (typeof key !== 'string' || !/^[a-f\d]{64}$/i.test(key)) throw new Error('STORAGE_KEY must contain 64 hexadecimal characters');
  const signingKey = createHmac('sha256', Buffer.from(key, 'hex')).update('web-session-v1').digest();
  const sign = value => createHmac('sha256', signingKey).update(value).digest();

  function session(req) {
    const cookies = req.headers?.cookie;
    if (typeof cookies !== 'string' || cookies.length > 16384) return null;
    const matching = cookies.split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
    if (matching.length !== 1) return null;
    const token = matching[0].slice(cookieName.length + 1);
    const parts = /^v1\.([A-Za-z0-9_-]{43})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!parts) return null;
    const [, id, expiry, signature] = parts;
    const instant = now(), expires = Number(expiry);
    if (!Number.isSafeInteger(expires) || expires <= instant || expires > instant + lifetime) return null;
    const supplied = Buffer.from(signature, 'base64url');
    if (Buffer.from(id, 'base64url').toString('base64url') !== id || supplied.toString('base64url') !== signature) return null;
    if (!timingSafeEqual(sign(`v1.${id}.${expiry}`), supplied)) return null;
    return { id };
  }

  return {
    needsIssue(req) { return session(req) === null; },
    owner(req) {
      const current = session(req);
      if (!current) throw new GameError('사용자 연결을 다시 확인해 주세요', 401);
      return createHash('sha256').update(`web:${current.id}`).digest('hex');
    },
    issue(req, res) {
      const id = session(req)?.id ?? randomBytes(32).toString('base64url');
      const value = `v1.${id}.${now() + lifetime}`;
      const token = `${value}.${sign(value).toString('base64url')}`;
      res.setHeader('Set-Cookie', `${cookieName}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetimeSeconds}`);
      return { platform: 'web' };
    },
  };
}
