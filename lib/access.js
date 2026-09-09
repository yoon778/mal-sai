import https from 'node:https';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GameError } from './game.js';
import { createSecureContext } from 'node:tls';

export function deployment(env = process.env) {
  const mode = env.APP_PLATFORM ?? 'local';
  if (!['local', 'toss'].includes(mode)) throw new Error('APP_PLATFORM must be local or toss');
  if (mode === 'local') return { mode };
  const origin = new URL(env.API_PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.API_PUBLIC_ORIGIN) throw new Error('API_PUBLIC_ORIGIN must be an HTTPS origin');
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(env.TOSS_APP_NAME ?? '')) throw new Error('TOSS_APP_NAME is required');
  if (!/^[a-f\d]{64}$/i.test(env.STORAGE_KEY ?? '')) throw new Error('STORAGE_KEY is required for Toss');
  if (env.AI_ENABLED !== 'true' || !env.OPENAI_API_KEY) throw new Error('Toss requires AI_ENABLED=true and OPENAI_API_KEY');
  const cert = readFileSync(env.TOSS_CERT_PATH), key = readFileSync(env.TOSS_KEY_PATH);
  createSecureContext({ cert, key });
  return { mode, host: origin.host, origins: [origin.origin, `https://${env.TOSS_APP_NAME}.apps.tossmini.com`, `https://${env.TOSS_APP_NAME}.private-apps.tossmini.com`], cert, key };
}

export function verifyTossKey(hash, agent) {
  return new Promise((resolve, reject) => {
    const request = https.request('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/users/anon-key/verify', {
      method: 'POST', agent, headers: { 'x-anon-key': hash, 'Content-Length': '0' }, timeout: 8000,
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; if (body.length > 16000) response.destroy(new Error('Oversized verification response')); });
      response.on('error', reject);
      response.on('end', () => {
        try { const data = JSON.parse(body); resolve(response.statusCode === 200 && data.resultType === 'SUCCESS' && (data.success === true || data.success === 'true')); }
        catch { reject(new Error('Invalid verification response')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Verification timeout')));
    request.on('error', reject);
    request.end();
  });
}

export function createAccess(settings = { mode: 'local' }, verify = verifyTossKey) {
  const agent = settings.mode === 'toss' ? new https.Agent({ cert: settings.cert, key: settings.key }) : null;
  const verified = new Map();
  const inFlight = new Map();
  const failed = new Map();
  return {
    check(req, res) {
      const host = req.headers.host ?? '';
      const origin = req.headers.origin;
      if (settings.mode === 'local') {
        if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host) || origin && origin !== `http://${host}` || req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('허용되지 않은 사이트예요', 403);
      } else {
        if (host !== settings.host || origin && !settings.origins.includes(origin)) throw new GameError('허용되지 않은 사이트예요', 403);
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        }
      }
    },
    async owner(req) {
      const token = (req.headers.authorization ?? '').match(/^Bearer ([A-Za-z0-9_+/=-]{20,512})$/)?.[1];
      if (!token) throw new GameError('사용자 연결을 다시 확인해 주세요', 401);
      const owner = createHash('sha256').update(`${settings.mode}:${token}`).digest('hex');
      if (settings.mode === 'toss' && (verified.get(owner) ?? 0) < Date.now()) {
        if ((failed.get(owner) ?? 0) > Date.now()) throw new GameError('토스에서 다시 열어 주세요', 401);
        let valid;
        if (!inFlight.has(owner)) {
          if (inFlight.size >= 64) throw new GameError('사용자 확인 요청이 많아요 잠시 후 다시 시도해 주세요', 503);
          const check = Promise.resolve().then(() => verify(token, agent)).finally(() => inFlight.delete(owner));
          inFlight.set(owner, check);
        }
        try { valid = await inFlight.get(owner); } catch { throw new GameError('토스 사용자 확인이 지연되고 있어요 잠시 후 다시 시도해 주세요', 503); }
        if (!valid) {
          for (const [id, until] of failed) if (until < Date.now()) failed.delete(id);
          if (failed.size >= 1000) failed.delete(failed.keys().next().value);
          failed.set(owner, Date.now() + 5000);
          throw new GameError('토스에서 다시 열어 주세요', 401);
        }
        for (const [id, until] of verified) if (until < Date.now()) verified.delete(id);
        if (verified.size >= 10000) verified.delete(verified.keys().next().value);
        verified.set(owner, Date.now() + 60_000);
      }
      return owner;
    },
    close() { agent?.destroy(); },
  };
}
