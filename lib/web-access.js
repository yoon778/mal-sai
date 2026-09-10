import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { GameError } from './game.js';
import { createWebSessions } from './web-session.js';

export function createWebAccess(settings, { now = Date.now } = {}) {
  const sessions = createWebSessions({ key: settings.storageKey, now });
  // One process: bounded maps reset each window; persistent AI quotas remain in SQLite.
  const traffic = { window: -1, total: 0, sources: new Map() };
  const registrations = { window: -1, total: 0, sources: new Map() };
  const source = req => {
    let ip;
    if (settings.proxy === 'render') ip = req.headers['cf-connecting-ip'];
    else if (req.socket?.remoteAddress?.replace(/^::ffff:/, '') === settings.trustedProxyIp?.replace(/^::ffff:/, '')) ip = req.headers['x-real-ip'];
    // No fallback to client-supplied forwarded headers or a shared proxy address.
    if (typeof ip !== 'string' || !isIP(ip)) throw new GameError('접속 경로를 확인해 주세요', 403);
    const normalized = isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname : ip;
    return createHmac('sha256', Buffer.from(settings.storageKey, 'hex')).update(`web-network:${normalized}`).digest('hex');
  };
  function limit(state, id, duration, perSource, total) {
    const instant = now(), window = Math.floor(instant / duration);
    if (state.window !== window) { state.window = window; state.total = 0; state.sources.clear(); }
    if (state.total >= total || (state.sources.get(id) ?? 0) >= perSource) {
      throw Object.assign(new GameError('접속 요청이 많아요 잠시 후 다시 시도해 주세요', 429), { retryAfter: Math.ceil(((window + 1) * duration - instant) / 1000) });
    }
    state.total++;
    state.sources.set(id, (state.sources.get(id) ?? 0) + 1);
  }
  return {
    mode: 'web',
    check(req, res, path = new URL(req.url, settings.origin).pathname) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      if (req.headers.host !== settings.host || req.headers.origin && req.headers.origin !== settings.origin || path.startsWith('/api/') && req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('허용되지 않은 사이트예요', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== settings.origin) throw new GameError('허용되지 않은 사이트예요', 403);
      if (path.startsWith('/api/')) limit(traffic, source(req), 60_000, 120, 1200);
    },
    session(req, res) {
      if (sessions.needsIssue(req)) limit(registrations, source(req), 3600_000, 10, 100);
      return sessions.issue(req, res);
    },
    owner: req => sessions.owner(req),
    quotaOwner: req => `network:${source(req)}`,
    close() {},
  };
}
