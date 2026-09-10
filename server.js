import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createAI, demoAI } from './lib/ai.js';
import { Store } from './lib/store.js';
import { createAccess, deployment } from './lib/access.js';
import { createSafety, safeAI } from './lib/safety.js';
import { scenarios } from './lib/scenarios.js';
import { startDrill, submitDrill } from './lib/drills.js';
import { newGame, publicGame, startGame, readMessages, sendTurn, waitForReply, waitToStart, getHint, getTopicHelp, finishGame, retryTurn, GameError } from './lib/game.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
assets.set('/designs', ['designs.html', 'text/html']);
assets.set('/designs.js', ['designs.js', 'text/javascript']);
assets.set('/designs.css', ['designs.css', 'text/css']);
assets.set('/platform.js', ['platform.js', 'text/javascript']);
assets.set('/privacy', ['privacy.html', 'text/html']);

export function createServer({ ai = createAI({ directory: join(root, '.data') }), store = new Store(), access = createAccess(), safety = createSafety({ stopFile: join(root, '.data', 'ai-paused') }), dailyLimit = 30, minuteLimit = 6, maxConcurrentAI = 3 } = {}) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) throw new Error('Invalid daily AI limit');
  if (!Number.isInteger(minuteLimit) || minuteLimit < 1 || minuteLimit > 60) throw new Error('Invalid minute AI limit');
  if (!Number.isInteger(maxConcurrentAI) || maxConcurrentAI < 1 || maxConcurrentAI > 20) throw new Error('Invalid concurrent AI limit');
  let activeAI = 0;
  const locks = new Set();
  const protectedAI = ai.mode === 'live' ? safeAI(ai, safety) : ai;
  const cleanup = setInterval(() => { try { store.prune(); } catch (error) { console.error('Retention cleanup failed', error.code ?? 'storage_error'); } }, 3600_000);
  cleanup.unref();
  const ownedGame = (owner, id) => {
    if (typeof id !== 'string') throw new GameError('대화 ID를 확인해 주세요');
    const game = store.get(owner, id);
    if (!game) throw new GameError('대화를 찾을 수 없어요 새로 시작해 주세요', 404);
    return game;
  };
  const server = http.createServer(async (req, res) => {
    let lockedOwner;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        store.db.prepare('SELECT 1').get();
        json({ status: 'ok' }); return;
      }
      const host = req.headers.host ?? '';
      const path = new URL(req.url, `http://${host}`).pathname;
      access.check(req, res, path);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        const body = await readFile(join(root, 'public', file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body); return;
      }
      if (req.method === 'GET' && path === '/api/config') { json({ mode: ai.mode, platform: access.mode ?? 'local', scenarios: scenarios.map(({ id, title }) => ({ id, title })), aiLimits: { daily: dailyLimit, minute: minuteLimit } }); return; }
      if (req.method === 'POST' && path === '/api/session') {
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new GameError('JSON 요청이 필요해요', 415);
        if (req.headers['transfer-encoding'] || req.headers['content-length'] && req.headers['content-length'] !== '0') throw new GameError('빈 연결 요청이 필요해요');
        if (access.mode === 'toss') throw new GameError('허용되지 않은 요청이에요', 403);
        req.resume();
        json(access.session ? access.session(req, res) : { platform: 'local' }); return;
      }
      if (!path.startsWith('/api/')) throw new GameError('페이지를 찾을 수 없어요', 404);
      const owner = await access.owner(req);
      if (req.method === 'GET' && path === '/api/history') {
        json(store.list(owner).map(g => ({ id: g.id, title: g.scenario.title, stage: g.stage, turn: g.turn, createdAt: g.createdAt }))); return;
      }
      const match = path.match(/^\/api\/games\/([a-f\d-]{36})(?:\/(shuffle|start|read|send|wait|wait-start|hint|topic|finish|reevaluate|retry|drill|drill-answer))?$/);
      if (req.method === 'GET' && match && !match[2]) {
        const game = ownedGame(owner, match[1]);
        json(publicGame(game)); return;
      }
      if (req.method !== 'POST' || !['/api/games', '/api/feedback', '/api/reports', '/api/quality', '/api/account/delete'].includes(path) && !(match && match[2])) throw new GameError('페이지를 찾을 수 없어요.', 404);
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new GameError('JSON 요청이 필요해요.', 415);
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 8000) throw new GameError('요청이 너무 길어요.', 413);
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GameError('요청 형식이 올바르지 않아요.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameError('요청 형식이 올바르지 않아요.');
      if (locks.has(owner)) throw new GameError('직전 요청을 처리하고 있어요', 409);
      locks.add(owner); lockedOwner = owner;
      if (path === '/api/account/delete') { store.deleteOwner(owner); json({ deleted: true }); return; }
      if (path === '/api/games') {
        if (store.list(owner).length >= 100) throw new GameError('저장된 연습이 100개예요 기록을 삭제한 뒤 새로 시작해 주세요', 429);
        const game = newGame(input, ai.mode); store.save(owner, 'game', game); json(publicGame(game), 201); return;
      }
      if (path === '/api/reports') {
        const game = ownedGame(owner, input.gameId);
        const message = game.messages.find(m => m.id === input.messageId && m.role === 'partner' && m.readAt !== null);
        if (!message || !['unsafe', 'uncomfortable', 'incorrect'].includes(input.reason)) throw new GameError('신고할 답장과 이유를 확인해 주세요');
        if (store.list(owner, 'report').length >= 30) throw new GameError('신고 접수 한도에 도달했어요', 429);
        store.save(owner, 'report', { id: randomUUID(), gameId: game.id, messageId: message.id, text: message.text, reason: input.reason, at: Date.now() });
        json({ saved: true }, 201); return;
      }
      if (path === '/api/quality') {
        const game = ownedGame(owner, input.gameId);
        const message = game.messages.find(m => m.id === input.messageId && m.role === 'partner' && !m.background && m.readAt !== null);
        const evaluation = input.messageId === 'evaluation' && game.stage === 'finished';
        if (input.consent !== true || !['role', 'time', 'style', 'evaluation'].includes(input.reason) || !message && !evaluation) throw new GameError('제보할 내용과 맥락 제공 동의를 확인해 주세요');
        if (store.list(owner, 'quality').length >= 30) throw new GameError('품질 제보 접수 한도에 도달했어요', 429);
        const snapshot = publicGame(game);
        store.save(owner, 'quality', { id: randomUUID(), gameId: game.id, messageId: input.messageId, reason: input.reason, at: Date.now(), consent: true,
          version: evaluation ? game.aiVersions?.evaluate ?? null : message.aiVersion ?? null,
          snapshot: { scenario: snapshot.scenario, profile: snapshot.profile, minute: snapshot.minute,
            messages: snapshot.messages.filter(m => m.role === 'user' || m.readAt !== null), result: evaluation ? snapshot.result : null } });
        json({ saved: true }, 201); return;
      }
      if (path === '/api/feedback') {
        if (typeof input.gameId !== 'string') throw new GameError('대화 ID를 확인해 주세요');
        const game = store.get(owner, input.gameId);
        if (!game || game.stage !== 'finished') throw new GameError('대화를 마친 뒤 평가를 남겨주세요.');
        if (game.feedbackSubmitted) throw new GameError('이미 평가를 남긴 연습이에요.', 409);
        if (game.busy) throw new GameError('직전 요청을 처리하고 있어요.', 409);
        const ratings = ['realism', 'helpfulness', 'retryIntent'];
        if (ratings.some(key => !Number.isInteger(input[key]) || input[key] < 1 || input[key] > 5) || typeof input.blocked !== 'boolean' || typeof input.note !== 'string' || input.note.length > 500) throw new GameError('평가 항목을 확인해 주세요.');
        const entry = { id: randomUUID(), at: new Date().toISOString(), gameId: game.id, scenarioId: game.scenario.id, mode: game.mode, realism: input.realism, helpfulness: input.helpfulness, retryIntent: input.retryIntent, blocked: input.blocked, note: input.note.trim() };
        store.transaction(() => {
          store.save(owner, 'feedback', entry);
          game.feedbackSubmitted = true;
          store.save(owner, 'game', game);
        });
        json({ saved: true }, 201); return;
      }
      const game = ownedGame(owner, match[1]);
      const fingerprint = createHash('sha256').update(JSON.stringify({ action: match[2], input })).digest('hex');
      if (input.requestId !== undefined) {
        if (typeof input.requestId !== 'string' || !/^[a-f\d-]{36}$/.test(input.requestId)) throw new GameError('요청 ID를 확인해 주세요');
        const completed = (game.requests ?? []).find(item => item.id === input.requestId);
        if (completed) {
          if (completed.fingerprint !== fingerprint) throw new GameError('같은 요청 ID의 내용이 달라요', 409);
          json(publicGame(game)); return;
        }
      }
      if (input.expectedRevision !== undefined && input.expectedRevision !== (game.revision ?? 0)) throw new GameError('대화 진행이 변경됐어요 최신 대화를 확인해 주세요', 409);
      const revision = game.revision ?? 0, requests = game.requests ?? [];
      const baseAI = game.mode === 'demo' && ai.mode === 'live' ? demoAI : protectedAI;
      const gameAI = { ...baseAI };
      for (const method of ['reply', 'hint', 'topic', 'evaluate', 'reviewDrill']) {
        gameAI[method] = async (...args) => {
          if (game.mode === 'live') {
            if (ai.mode !== 'live') throw new GameError('AI 연결이 꺼져 있어요 연결이 복구된 뒤 이 연습을 이어갈 수 있어요', 503);
            if (activeAI >= maxConcurrentAI) throw Object.assign(new GameError('지금 AI 이용자가 많아요 잠시 후 다시 시도해 주세요', 429), { retryAfter: 5 });
            store.consumeAI(owner, dailyLimit, minuteLimit, Date.now(), access.quotaOwner?.(req));
            activeAI++;
          }
          try {
            if (game.mode === 'live') await safety(JSON.stringify(method === 'reviewDrill' ? { situation: args[0].drill, answer: args[1] } : args[0].messages.slice(-10).map(m => ({ role: m.role, text: m.text }))));
            const result = await baseAI[method](...args);
            args[0].aiVersions = { ...args[0].aiVersions, [method]: baseAI.metadata ?? null };
            return result;
          } finally { if (game.mode === 'live') activeAI--; }
        };
      }
        switch (match[2]) {
          case 'shuffle':
            if (game.stage !== 'preview') throw new GameError('시작한 대화는 다시 뽑을 수 없어요. 새 연습을 선택해 주세요.', 409);
            Object.assign(game, newGame(input, ai.mode), { id: game.id });
            break;
          case 'start': startGame(game); break;
          case 'wait-start': waitToStart(game, input.delayMinutes); break;
          case 'read': readMessages(game, input.delayMinutes); break;
          case 'send': await sendTurn(game, input, gameAI); break;
          case 'wait': waitForReply(game, input.delayMinutes); break;
          case 'hint': await getHint(game, gameAI); break;
          case 'topic': await getTopicHelp(game, gameAI); break;
          case 'finish': await finishGame(game, gameAI, { early: input.early === true }); break;
          case 'reevaluate': await finishGame(game, gameAI, { refresh: true }); break;
          case 'retry': retryTurn(game, input.turn); break;
          case 'drill': startDrill(game); break;
          case 'drill-answer': await submitDrill(game, input.answer, gameAI); break;
        }
        game.revision = revision + 1;
        game.requests = input.requestId ? [...requests, { id: input.requestId, fingerprint }].slice(-40) : requests;
        store.save(owner, 'game', game);
        json(publicGame(game));
    } catch (error) {
      if (!res.headersSent && Number.isInteger(error.retryAfter)) res.setHeader('Retry-After', String(error.retryAfter));
      if (!res.headersSent) json({ error: error instanceof GameError ? error.message : '서버 처리 중 문제가 생겼어요.' }, error.status ?? 500);
      else res.end();
      if (!(error instanceof GameError)) console.error(error.name, error.code ?? 'internal_error');
    } finally { if (lockedOwner) locks.delete(lockedOwner); }
  });
  server.on('close', () => { clearInterval(cleanup); access.close(); store.close(); });
  server.requestTimeout = 60_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3000);
  const settings = deployment();
  const directory = process.env.DATA_DIRECTORY ?? join(root, '.data');
  const server = createServer({ ai: createAI({ directory }), store: new Store({ directory, key: process.env.STORAGE_KEY }), access: createAccess(settings), safety: createSafety({ stopFile: join(directory, 'ai-paused') }), dailyLimit: Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 30), minuteLimit: Number(process.env.AI_MINUTE_REQUEST_LIMIT ?? 6), maxConcurrentAI: Number(process.env.AI_MAX_CONCURRENT_REQUESTS ?? 3) });
  server.listen(port, settings.mode === 'local' ? '127.0.0.1' : '0.0.0.0', () => console.log(`말사이 · ${settings.mode} · port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 85_000).unref();
  });
}
