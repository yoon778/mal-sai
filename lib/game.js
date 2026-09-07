import { randomUUID } from 'node:crypto';
import { scenarios, rubric, makeProfile, backgroundFor } from './scenarios.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function newGame(settings, mode) {
  const scenario = scenarios.find(s => s.id === settings.scenarioId) ?? scenarios[Math.floor(Math.random() * scenarios.length)];
  const profile = makeProfile(settings);
  return {
    id: randomUUID(), scenario, profile, mode, stage: 'preview', turn: 0, minute: 0,
    messages: backgroundFor(scenario, profile), totalHints: 0, hints: [], checkpoints: [],
    result: null, comparison: null, createdAt: Date.now(), busy: false,
  };
}

export function publicGame(game) {
  return {
    id: game.id, mode: game.mode, stage: game.stage, turn: game.turn, limit: 5, minute: game.minute, startMinute: game.scenario.startMinute,
    scenario: { id: game.scenario.id, title: game.scenario.title, label: game.scenario.label, context: game.scenario.context, goal: game.scenario.goal },
    profile: { name: game.profile.name, age: game.profile.age },
    messages: game.messages, totalHints: game.totalHints, hint: game.hints.at(-1)?.text ?? null,
    result: game.result, comparison: game.comparison, feedbackSubmitted: Boolean(game.feedbackSubmitted),
  };
}

function checkpoint(game) {
  return structuredClone({ minute: game.minute, messages: game.messages, hints: game.hints });
}

export function startGame(game) {
  if (game.stage !== 'preview') throw new GameError('이미 시작한 대화예요.');
  game.stage = 'chat';
  if (game.scenario.opener) game.messages.push({ id: randomUUID(), role: 'partner', text: game.scenario.opener, minute: 0, readAt: null, turn: 0 });
  game.checkpoints[0] = checkpoint(game);
}

function delay(value) {
  if (![0, 5, 30, 120].includes(value)) throw new GameError('지원하지 않는 지연 시간이에요.');
  return value;
}

export function readMessages(game, minutes) {
  if (game.stage !== 'chat') throw new GameError('진행 중인 대화에서 읽을 수 있어요.');
  const unread = game.messages.filter(m => m.role === 'partner' && m.readAt === null);
  if (!unread.length) throw new GameError('새로운 메시지가 없어요.');
  game.minute += delay(minutes);
  unread.forEach(m => { m.readAt = game.minute; });
}

export async function sendTurn(game, input, ai) {
  if (game.stage !== 'chat' || game.turn >= 5) throw new GameError('대화가 끝났어요. 복기를 열어보세요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('새 메시지를 먼저 읽어주세요.');
  const wait = delay(input.delayMinutes);
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 3 || input.messages.some(t => typeof t !== 'string' || !t.trim() || t.length > 400)) {
    throw new GameError('한 차례에 1~3개 말풍선, 각 400자까지 보낼 수 있어요.');
  }
  // Work on a copy: a failed paid request must not consume a turn or lose a draft.
  const next = structuredClone(game);
  next.minute += wait;
  next.turn++;
  const sent = input.messages.map(text => ({ id: randomUUID(), role: 'user', text: text.trim(), minute: next.minute, readAt: null, turn: next.turn }));
  next.messages.push(...sent);
  const reply = await ai.reply(next);
  const readAt = next.minute + reply.readAfterMinutes;
  sent.forEach(m => { m.readAt = readAt; });
  next.minute = readAt + reply.replyAfterReadMinutes;
  next.messages.push(...reply.messages.map(text => ({ id: randomUUID(), role: 'partner', text, minute: next.minute, readAt: null, turn: next.turn })));
  next.checkpoints[next.turn] = checkpoint(next);
  Object.assign(game, next);
}

export async function getHint(game, ai) {
  if (game.stage !== 'chat' || game.turn >= 5) throw new GameError('진행 중인 대화에서 힌트를 볼 수 있어요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('상대 메시지를 먼저 읽어주세요.');
  const existing = game.hints.find(h => h.turn === game.turn);
  if (existing) return existing.text;
  const text = await ai.hint(game);
  game.hints.push({ turn: game.turn, text });
  game.totalHints++;
  return text;
}

export function normalizeEvaluation(raw, game) {
  if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim() || typeof raw.outcome !== 'string' || !raw.outcome.trim() || !Array.isArray(raw.criteria)) throw new GameError('평가 형식이 올바르지 않아요. 다시 시도해 주세요.', 502);
  const own = new Map(game.messages.filter(m => m.role === 'user' && !m.background).map(m => [m.id, m]));
  const criteria = rubric.map(rule => {
    const matches = raw.criteria.filter(c => c.id === rule.id);
    if (matches.length !== 1) throw new GameError('평가 항목이 누락되었어요. 다시 시도해 주세요.', 502);
    const c = matches[0];
    if (!(c.score === null || Number.isInteger(c.score) && c.score >= 0 && c.score <= 4) || typeof c.reason !== 'string' || !c.reason.trim() || !Array.isArray(c.evidenceIds)) throw new GameError('평가 근거를 확인하지 못했어요.', 502);
    const ids = [...new Set(c.evidenceIds)];
    if (ids.some(id => !own.has(id)) || c.score !== null && ids.length === 0) throw new GameError('실제 답장에 연결되지 않은 평가예요. 다시 시도해 주세요.', 502);
    return { ...rule, score: c.score, reason: c.reason, evidenceIds: ids };
  });
  const feedback = (items) => {
    if (!Array.isArray(items) || items.length > 3) throw new GameError('피드백 형식이 올바르지 않아요.', 502);
    return items.map(item => {
      if (!own.has(item.messageId) || typeof item.text !== 'string' || !item.text.trim()) throw new GameError('피드백에 실제 답장 근거가 없어요.', 502);
      return { messageId: item.messageId, text: item.text };
    });
  };
  const observed = criteria.filter(c => c.score !== null);
  const coverage = observed.reduce((sum, c) => sum + c.weight, 0);
  return {
    summary: raw.summary, outcome: raw.outcome, criteria,
    score: coverage ? Math.round(observed.reduce((sum, c) => sum + c.score / 4 * c.weight, 0) / coverage * 100) : null,
    coverage, strengths: feedback(raw.strengths), improvements: feedback(raw.improvements),
    provisional: true, mode: game.mode,
  };
}

export async function finishGame(game, ai) {
  if (game.result) return;
  if (game.stage !== 'chat' || game.turn !== 5) throw new GameError('답장 5회를 마친 뒤 복기할 수 있어요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('마지막 메시지를 먼저 읽어주세요.');
  game.result = normalizeEvaluation(await ai.evaluate(game), game);
  game.stage = 'finished';
}

export function retryTurn(game, turn) {
  if (game.stage !== 'finished' || !Number.isInteger(turn) || turn < 1 || turn > 5) throw new GameError('복기에서 다시 시작할 답장을 골라주세요.');
  const original = game.messages.filter(m => !m.background && m.turn === turn);
  game.comparison = { turn, messages: structuredClone(original), score: game.result.score, outcome: game.result.outcome };
  const restored = structuredClone(game.checkpoints[turn - 1]);
  Object.assign(game, restored, { turn: turn - 1, stage: 'chat', result: null });
  game.checkpoints = game.checkpoints.slice(0, turn);
}
