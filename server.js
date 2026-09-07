import http from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createAI } from './lib/ai.js';
import { scenarios } from './lib/scenarios.js';
import { newGame, publicGame, startGame, readMessages, sendTurn, waitForReply, getHint, getTopicHelp, finishGame, retryTurn, GameError } from './lib/game.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
assets.set('/designs', ['designs.html', 'text/html']);
assets.set('/designs.js', ['designs.js', 'text/javascript']);
assets.set('/designs.css', ['designs.css', 'text/css']);

export function createServer({ ai = createAI({ directory: join(root, '.data') }), dataDirectory = join(root, '.data') } = {}) {
  const games = new Map();
  const feedbackGames = new Set();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      // Local prototype. Reject foreign origins/hosts, including DNS rebinding.
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new GameError('허용되지 않은 호스트예요.', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new GameError('같은 사이트에서만 요청할 수 있어요.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('외부 사이트 요청은 허용하지 않아요.', 403);
      const path = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        const body = await readFile(join(root, 'public', file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body); return;
      }
      if (req.method === 'GET' && path === '/api/config') { json({ mode: ai.mode, scenarios: scenarios.map(({ id, title }) => ({ id, title })) }); return; }
      for (const [id, game] of games) if (!game.busy && Date.now() - game.createdAt > 6 * 3600_000) games.delete(id);
      const match = path.match(/^\/api\/games\/([a-f\d-]{36})(?:\/(start|read|send|wait|hint|topic|finish|retry))?$/);
      if (req.method === 'GET' && match && !match[2]) {
        const game = games.get(match[1]);
        if (!game) throw new GameError('대화가 만료되었어요. 새로 시작해 주세요.', 404);
        json(publicGame(game)); return;
      }
      if (req.method !== 'POST' || path !== '/api/games' && path !== '/api/feedback' && !(match && match[2])) throw new GameError('페이지를 찾을 수 없어요.', 404);
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
      if (path === '/api/games') {
        if (games.size >= 100) throw new GameError('열린 대화가 너무 많아요. 서버를 다시 시작해 주세요.', 429);
        const game = newGame(input, ai.mode); games.set(game.id, game); json(publicGame(game), 201); return;
      }
      if (path === '/api/feedback') {
        const game = games.get(input.gameId);
        if (!game || game.stage !== 'finished') throw new GameError('대화를 마친 뒤 평가를 남겨주세요.');
        if (feedbackGames.has(game.id)) throw new GameError('이미 평가를 남긴 연습이에요.', 409);
        const ratings = ['realism', 'helpfulness', 'retryIntent'];
        if (ratings.some(key => !Number.isInteger(input[key]) || input[key] < 1 || input[key] > 5) || typeof input.blocked !== 'boolean' || typeof input.note !== 'string' || input.note.length > 500) throw new GameError('평가 항목을 확인해 주세요.');
        const entry = { at: new Date().toISOString(), gameId: game.id, scenarioId: game.scenario.id, mode: game.mode, realism: input.realism, helpfulness: input.helpfulness, retryIntent: input.retryIntent, blocked: input.blocked, note: input.note.trim() };
        await mkdir(dataDirectory, { recursive: true });
        await appendFile(join(dataDirectory, 'feedback.jsonl'), `${JSON.stringify(entry)}\n`);
        feedbackGames.add(game.id);
        game.feedbackSubmitted = true;
        json({ saved: true }, 201); return;
      }
      const game = games.get(match[1]);
      if (!game) throw new GameError('대화가 만료되었어요. 새로 시작해 주세요.', 404);
      if (game.busy) throw new GameError('직전 요청을 처리하고 있어요.', 409);
      game.busy = true;
      try {
        switch (match[2]) {
          case 'start': startGame(game); break;
          case 'read': readMessages(game, input.delayMinutes); break;
          case 'send': await sendTurn(game, input, ai); break;
          case 'wait': waitForReply(game, input.delayMinutes); break;
          case 'hint': await getHint(game, ai); break;
          case 'topic': await getTopicHelp(game, ai); break;
          case 'finish': await finishGame(game, ai); break;
          case 'retry': retryTurn(game, input.turn); break;
        }
        json(publicGame(game));
      } finally { game.busy = false; }
    } catch (error) {
      if (!res.headersSent) json({ error: error instanceof GameError ? error.message : '서버 처리 중 문제가 생겼어요.' }, error.status ?? 500);
      else res.end();
      if (!(error instanceof GameError)) console.error(error.name, error.code ?? 'internal_error');
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, '127.0.0.1', () => console.log(`말사이 · http://localhost:${port}`));
}
