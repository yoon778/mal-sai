import { randomUUID } from 'node:crypto';
import { scenarios, rubric, makeProfile, backgroundFor, casualOpeners } from './scenarios.js';
import { chatText } from './chat-text.js';
import { principlesFor } from './coaching-principles.js';
import { spellingNotesFor } from './spelling.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function newGame(settings, mode) {
  const scenario = scenarios.find(s => s.id === settings.scenarioId) ?? scenarios[Math.floor(Math.random() * scenarios.length)];
  const profile = makeProfile(settings);
  const channel = scenario.channel ?? (scenario.firstContact ? (['kakao', 'instagram'].includes(settings.channel) ? settings.channel : Math.random() < 0.5 ? 'kakao' : 'instagram') : 'kakao');
  return {
    id: randomUUID(), scenario, profile, channel, mode, stage: 'preview', turn: 0, minute: 0,
    events: [], atmosphere: 0,
    firstContactAt: scenario.firstContact ? (scenario.promisedContact ? 780 : profile.initiative === 'active' ? 30 : 120) : null,
    messages: backgroundFor(scenario, profile), totalHints: 0, hints: [], totalTopicHelps: 0, topicHelps: [], checkpoints: [],
    result: null, comparison: null, createdAt: Date.now(), busy: false,
  };
}

export function publicGame(game) {
  return {
    id: game.id, mode: game.mode, stage: game.stage, turn: game.turn, limit: 5, minute: game.minute, startMinute: game.scenario.startMinute,
    scenario: { id: game.scenario.id, title: game.scenario.title, label: game.scenario.label, context: game.scenario.context, goal: game.scenario.goal, historyLabel: game.scenario.historyLabel ?? '이전 대화', story: game.scenario.story ?? null },
    channel: game.channel, canWaitToStart: canWaitToStart(game),
    atmosphere: game.atmosphere < 0 ? (game.mode === 'demo' ? '약속을 놓친 상황 · 체험 모드에서는 회복을 판단하지 않아요' : '연락 약속을 놓쳐 조금 어색해졌어요') : game.events?.some(event => event.kind === 'contact-repair') ? '연락 약속을 놓친 이유를 나누었어요' : '서로 알아가는 중',
    profile: { name: game.profile.name, age: game.profile.age, gender: game.profile.gender, speech: game.profile.speech, speechStyle: game.profile.speechStyle },
    messages: game.messages.map(message => ({ ...message, readAt: message.readAt > game.minute ? null : message.readAt })),
    waiting: Boolean(game.pendingReply), totalHints: game.totalHints, hint: game.hints.at(-1)?.text ?? null,
    totalTopicHelps: game.totalTopicHelps, topicHelp: game.topicHelps.at(-1)?.help ?? null,
    result: game.result, comparison: game.comparison, feedbackSubmitted: Boolean(game.feedbackSubmitted),
  };
}

function checkpoint(game) {
  return structuredClone({ minute: game.minute, messages: game.messages, hints: game.hints, topicHelps: game.topicHelps, pendingReply: game.pendingReply ?? null, events: game.events ?? [], atmosphere: game.atmosphere ?? 0 });
}

function canWaitToStart(game) {
  return game.stage === 'chat' && game.turn === 0 && game.firstContactAt !== null && game.firstContactAt !== undefined && !game.events.some(event => event.kind === 'partner-first');
}

function arriveFirstContact(game) {
  if (!canWaitToStart(game) || game.minute < game.firstContactAt) return false;
  const message = { id: randomUUID(), role: 'partner', text: chatText(game.scenario.eventText[game.profile.speech === 'casual' ? 1 : 0]), minute: game.firstContactAt, readAt: null, turn: 0 };
  game.messages.push(message);
  game.events.push({ kind: 'partner-first', minute: game.firstContactAt, messageId: message.id, missedPromise: Boolean(game.scenario.promisedContact) });
  if (game.scenario.promisedContact) game.atmosphere = -1;
  game.hints = []; game.topicHelps = [];
  return true;
}

export function waitToStart(game, minutes) {
  if (!canWaitToStart(game)) throw new GameError('첫 연락을 기다릴 수 있는 상황이 아니에요');
  if (![30, 120, 1440].includes(minutes)) throw new GameError('30분·2시간·하루 중에서 선택해 주세요');
  game.minute += minutes;
  arriveFirstContact(game);
  // The first actual reply will checkpoint the arrived contact for scene replay.
}

export function startGame(game) {
  if (game.stage !== 'preview') throw new GameError('이미 시작한 대화예요.');
  game.stage = 'chat';
  if (game.scenario.opener) game.messages.push({ id: randomUUID(), role: 'partner', text: chatText(game.profile.speech === 'casual' ? (game.scenario.casualOpener ?? casualOpeners[game.scenario.id]) : game.scenario.opener), minute: 0, readAt: null, turn: 0 });
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
  if (game.pendingReply) throw new GameError('아직 상대의 답장을 기다리는 중이에요');
  if (game.stage !== 'chat' || game.turn >= 5) throw new GameError('대화가 끝났어요. 복기를 열어보세요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('새 메시지를 먼저 읽어주세요.');
  const wait = delay(input.delayMinutes);
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 3 || input.messages.some(t => typeof t !== 'string' || !t.trim() || t.length > 400)) {
    throw new GameError('한 차례에 1~3개 말풍선, 각 400자까지 보낼 수 있어요.');
  }
  // Work on a copy: a failed paid request must not consume a turn or lose a draft.
  const next = structuredClone(game);
  next.minute += wait;
  // A first message arriving before the chosen send time interrupts the draft.
  // No user turn or paid request is consumed; the browser preserves their text.
  if (arriveFirstContact(next)) { Object.assign(game, next); return; }
  if (next.turn === 0 && next.events.some(event => event.kind === 'partner-first')) next.checkpoints[0] = checkpoint(next);
  next.turn++;
  const sent = input.messages.map(text => ({ id: randomUUID(), role: 'user', text: text.trim(), minute: next.minute, readAt: null, turn: next.turn }));
  next.messages.push(...sent);
  const reply = await ai.reply(next);
  const readAt = next.minute + reply.readAfterMinutes;
  sent.forEach(m => { m.readAt = readAt; });
  const arrivesAt = readAt + reply.replyAfterReadMinutes;
  const repairEvent = next.atmosphere < 0 && reply.contactRepair === true ? { kind: 'contact-repair', minute: arrivesAt, messageId: sent[0].id } : null;
  const messages = reply.messages.map(text => ({ id: randomUUID(), role: 'partner', text: chatText(text), minute: arrivesAt, readAt: null, turn: next.turn }));
  if (arrivesAt - next.minute >= 30) next.pendingReply = { arrivesAt, messages, repairEvent };
  else { next.minute = arrivesAt; next.messages.push(...messages); applyRepair(next, repairEvent); }
  next.checkpoints[next.turn] = checkpoint(next);
  Object.assign(game, next);
}

function applyRepair(game, event) {
  if (!event) return;
  game.atmosphere = 0;
  game.events.push(event);
}

export function waitForReply(game, minutes) {
  if (game.stage !== 'chat' || !game.pendingReply) throw new GameError('기다리는 답장이 없어요');
  if (![30, 120].includes(minutes)) throw new GameError('30분 또는 2시간씩 기다릴 수 있어요');
  game.minute = Math.min(game.minute + minutes, game.pendingReply.arrivesAt);
  if (game.minute >= game.pendingReply.arrivesAt) {
    game.messages.push(...game.pendingReply.messages);
    applyRepair(game, game.pendingReply.repairEvent);
    game.pendingReply = null;
  }
  game.checkpoints[game.turn] = checkpoint(game);
}

export async function getHint(game, ai) {
  if (game.pendingReply) throw new GameError('상대의 답장을 기다린 뒤 힌트를 볼 수 있어요');
  if (game.stage !== 'chat' || game.turn >= 5) throw new GameError('진행 중인 대화에서 힌트를 볼 수 있어요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('상대 메시지를 먼저 읽어주세요.');
  const existing = game.hints.find(h => h.turn === game.turn);
  if (existing) return existing.text;
  const text = await ai.hint(game);
  game.hints.push({ turn: game.turn, text });
  game.totalHints++;
  return text;
}

export async function getTopicHelp(game, ai) {
  if (game.pendingReply) throw new GameError('상대의 답장을 기다린 뒤 주제를 찾을 수 있어요');
  if (game.stage !== 'chat' || game.turn >= 5) throw new GameError('진행 중인 대화에서 주제를 찾을 수 있어요.');
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) throw new GameError('상대 메시지를 먼저 읽어주세요.');
  const existing = game.topicHelps.find(item => item.turn === game.turn);
  if (existing) return existing.help;
  const help = await ai.topic(game);
  if (!help || ['topic', 'bridge', 'next', 'avoid'].some(key => typeof help[key] !== 'string' || !help[key].trim())) throw new GameError('이어갈 주제를 찾지 못했어요.', 502);
  help.bridge = chatText(help.bridge);
  game.topicHelps.push({ turn: game.turn, help });
  game.totalTopicHelps++;
  return help;
}

export function normalizeEvaluation(raw, game) {
  if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim() || typeof raw.outcome !== 'string' || !raw.outcome.trim() || !Array.isArray(raw.criteria)) throw new GameError('평가 형식이 올바르지 않아요. 다시 시도해 주세요.', 502);
  if (raw.criteria.length !== rubric.length || raw.criteria.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new GameError('평가 항목을 확인하지 못했어요.', 502);
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
      if (!item || !own.has(item.messageId) || typeof item.text !== 'string' || !item.text.trim()) throw new GameError('피드백에 실제 답장 근거가 없어요.', 502);
      return { messageId: item.messageId, text: item.text };
    });
  };
  const observed = criteria.filter(c => c.score !== null);
  const spellingNotes = game.mode === 'demo' ? (raw.spellingNotes ?? []) : spellingNotesFor(game).slice(0, 2);
  if (!Array.isArray(spellingNotes) || spellingNotes.length > 2) throw new GameError('표기 안내 형식을 확인하지 못했어요', 502);
  const spelling = spellingNotes.map(item => {
    if (!item || !own.has(item.messageId) || ['original', 'suggestion', 'reason'].some(key => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 180)
      || !own.get(item.messageId).text.includes(item.original) || item.original === item.suggestion) throw new GameError('실제 답장에 연결된 표기 안내가 아니에요', 502);
    return { messageId: item.messageId, original: item.original, suggestion: item.suggestion, reason: item.reason };
  });
  const moments = raw.moments === undefined ? [] : raw.moments;
  if (!Array.isArray(moments) || moments.length > 3) throw new GameError('복기 카드 형식이 올바르지 않아요', 502);
  const coaching = moments.map(item => {
    if (!item || !own.has(item.messageId) || !['strength', 'improvement'].includes(item.kind)
      || ['reason', 'nextStep'].some(key => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 220)
      || typeof item.alternative !== 'string' || !chatText(item.alternative).trim() || item.alternative.length > 240) throw new GameError('실제 답장에 연결된 복기 카드를 확인하지 못했어요', 502);
    const principle = principlesFor(game).find(rule => rule.id === item.principleId);
    if (item.principleId !== undefined && !principle) throw new GameError('복기 원칙을 확인하지 못했어요', 502);
    return { messageId: item.messageId, kind: item.kind, reason: item.reason.trim(), alternative: chatText(item.alternative), nextStep: item.nextStep.trim(), ...(principle ? { principle: { title: principle.title, source: principle.source } } : {}) };
  });
  const coverage = observed.reduce((sum, c) => sum + c.weight, 0);
  return {
    summary: raw.summary, outcome: raw.outcome, criteria,
    score: coverage ? Math.round(observed.reduce((sum, c) => sum + c.score / 4 * c.weight, 0) / coverage * 100) : null,
    coverage, strengths: feedback(raw.strengths), improvements: feedback(raw.improvements), spellingNotes: spelling,
    events: (game.events ?? []).map(event => ({ ...event })),
    // Repeated analysis of one real message is redundant, not a failed game.
    moments: coaching.filter((item, index) => coaching.findIndex(other => other.messageId === item.messageId) === index), provisional: true, mode: game.mode,
  };
}

export async function finishGame(game, ai) {
  if (game.pendingReply) throw new GameError('마지막 답장을 기다린 뒤 복기할 수 있어요');
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
