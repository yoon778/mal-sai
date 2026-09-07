import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoAI } from '../lib/ai.js';
import { practiceScenarios } from '../lib/practice-scenarios.js';
import { spellingNotesFor, transcriptForScoring } from '../lib/spelling.js';
import { newGame, startGame, publicGame, waitToStart, readMessages, sendTurn, waitForReply, finishGame, retryTurn, normalizeEvaluation } from '../lib/game.js';

const readAll = game => {
  while (game.pendingReply) waitForReply(game, 120);
  if (game.messages.some(m => m.role === 'partner' && m.readAt === null)) readMessages(game, 0);
};
const immediate = { reply: async () => ({ messages: ['응 알겠어'], readAfterMinutes: 0, replyAfterReadMinutes: 0 }) };

test('first contact interrupts delayed send without spending a turn or calling AI', async () => {
  const game = newGame({ scenarioId: 'first-contact', initiative: 'active', channel: 'instagram' }, 'demo');
  startGame(game);
  assert.equal(publicGame(game).canWaitToStart, true);
  await sendTurn(game, { messages: ['아까 이야기 재밌었어요'], delayMinutes: 30 }, { reply: () => assert.fail('no paid call before reading new contact') });
  assert.equal(game.turn, 0);
  assert.equal(game.events.length, 1);
  assert.equal(game.atmosphere, 0);
  assert.equal(game.messages.filter(m => !m.background && m.role === 'user').length, 0);
  assert.equal(publicGame(game).channel, 'instagram');
  assert.equal(publicGame(game).canWaitToStart, false);
  assert.equal('firstContactAt' in publicGame(game), false);
  assert.throws(() => waitToStart(game, 30));
  await assert.rejects(sendTurn(game, { messages: ['네'], delayMinutes: 0 }, immediate), /먼저 읽어/);
  readAll(game);
  await sendTurn(game, { messages: ['아까 이야기 재밌었어요'], delayMinutes: 0 }, immediate);
  assert.equal(game.turn, 1);
  assert.equal(game.events.length, 1);
});

test('idle time is explicit, invalid input is atomic, and immediate contact cancels idle events', async () => {
  const game = newGame({ scenarioId: 'first-contact', initiative: 'calm' }, 'demo');
  startGame(game);
  const before = structuredClone(game);
  assert.throws(() => waitToStart(game, -1));
  assert.deepEqual(game, before);
  waitToStart(game, 30);
  assert.equal(game.events.length, 0);
  await sendTurn(game, { messages: ['잘 들어갔어요?'], delayMinutes: 0 }, immediate);
  assert.equal(game.events.length, 0);
  assert.equal(publicGame(game).canWaitToStart, false);
});

test('missed promise atmosphere can recover and replay restores the same incoming message', async () => {
  const game = newGame({ scenarioId: 'promised-contact', gender: 'male', speech: 'casual', interest: 'open' }, 'demo');
  startGame(game);
  waitToStart(game, 1440);
  assert.equal(game.minute, 1440);
  assert.equal(game.messages.at(-1).minute, 780);
  assert.equal(game.events[0].missedPromise, true);
  assert.equal(game.atmosphere, -1);
  assert.doesNotMatch(game.messages.at(-1).text, /요/);
  readAll(game);
  const beforeFailure = structuredClone(game);
  await assert.rejects(sendTurn(game, { messages: ['연락 늦어서 미안'], delayMinutes: 0 }, { reply: async () => { throw new Error('network failure'); } }));
  assert.deepEqual(game, beforeFailure);
  await sendTurn(game, { messages: ['연락하기로 했는데 늦었네 미안해'], delayMinutes: 0 }, { reply: async () => ({ ...await immediate.reply(), contactRepair: true }) });
  assert.equal(game.atmosphere, 0);
  assert.equal(game.events.length, 2);
  for (let turn = 2; turn <= 5; turn++) { readAll(game); await sendTurn(game, { messages: ['응 알겠어'], delayMinutes: 0 }, immediate); }
  readAll(game); await finishGame(game, demoAI);
  assert.equal(game.result.events.length, 2);
  assert.equal(game.result.score, null);
  retryTurn(game, 1);
  assert.equal(game.turn, 0);
  assert.equal(game.minute, 1440);
  assert.equal(game.messages.at(-1).minute, 780);
  assert.equal(game.atmosphere, -1);
  assert.equal(game.events.length, 1);
  assert.equal(game.messages.at(-1).readAt, 1440);
  assert.equal(publicGame(game).canWaitToStart, false);
});

test('contact repair is not disclosed before a delayed reply arrives', async () => {
  const game = newGame({ scenarioId: 'promised-contact' }, 'live'); startGame(game); waitToStart(game, 1440); readAll(game);
  await sendTurn(game, { messages: ['연락하기로 했는데 늦어서 미안해요'], delayMinutes: 0 }, { reply: async () => ({ messages: ['네 괜찮아요'], contactRepair: true, readAfterMinutes: 120, replyAfterReadMinutes: 120 }) });
  assert.equal(game.atmosphere, -1);
  assert.equal(game.events.length, 1);
  assert.equal(publicGame(game).waiting, true);
  assert.equal('pendingReply' in publicGame(game), false);
  waitForReply(game, 120);
  assert.equal(game.atmosphere, -1);
  waitForReply(game, 120);
  assert.equal(game.atmosphere, 0);
  assert.equal(game.events.length, 2);
});

test('meeting delay respects time already advanced by the user', async () => {
  for (const delayMinutes of [0, 120]) {
    const game = newGame({ scenarioId: 'busy-break', interest: 'open', initiative: 'active' }, 'demo'); startGame(game); readAll(game);
    await sendTurn(game, { messages: ['회의 끝나고 봐요'], delayMinutes }, demoAI);
    readAll(game);
    assert.ok(game.minute >= 120 && game.minute <= 121);
    assert.match(game.messages.at(-1).text, /회의가 이제 끝났/);
  }
});

test('spelling notes require exact practice text and cannot change skill score', async () => {
  const game = newGame({ scenarioId: 'cancelled' }, 'demo'); startGame(game); readAll(game);
  await sendTurn(game, { messages: ['푹 쉬고 빨리 낳아요'], delayMinutes: 0 }, immediate);
  const own = game.messages.find(m => m.role === 'user' && !m.background);
  const raw = await demoAI.evaluate(game);
  raw.criteria = raw.criteria.map(c => ({ ...c, score: 3, evidenceIds: [own.id] }));
  const score = normalizeEvaluation(raw, game).score;
  raw.spellingNotes = [{ messageId: own.id, original: '낳아요', suggestion: '나아요', reason: '병이 회복된다는 뜻에는 나아요를 써요' }];
  assert.equal(normalizeEvaluation(raw, game).score, score);
  assert.equal(normalizeEvaluation(raw, game).spellingNotes.length, 1);
  for (const change of [{ messageId: 'b0' }, { original: '머해' }, { suggestion: '낳아요' }, { reason: '' }]) {
    assert.throws(() => normalizeEvaluation({ ...raw, spellingNotes: [{ ...raw.spellingNotes[0], ...change }] }, game), /표기 안내/);
  }
  raw.moments = [{ messageId: own.id, kind: 'strength', principleId: 'invented', reason: '상대 사정을 받았어요', alternative: '잘 쉬어요', nextStep: '나중에 안부를 물어보세요' }];
  assert.throws(() => normalizeEvaluation(raw, game), /복기 원칙/);
});

test('all added situations work in both speech modes through finish and retry', async () => {
  for (const scenario of practiceScenarios) for (const speech of ['honorific', 'casual']) {
    const game = newGame({ scenarioId: scenario.id, speech, interest: 'open', initiative: 'calm', humor: 'plain' }, 'demo');
    assert.equal(game.messages.length, 8);
    assert.ok(game.messages.every(m => m.text && !m.text.includes('undefined')));
    startGame(game); readAll(game);
    const help = await demoAI.topic(game);
    assert.ok(help.topic && help.bridge && help.next);
    for (let turn = 1; turn <= 5; turn++) {
      await sendTurn(game, { messages: [speech === 'casual' ? '응 무슨 말인지 알겠어' : '네 무슨 말인지 알겠어요'], delayMinutes: 0 }, demoAI);
      readAll(game);
    }
    await finishGame(game, demoAI);
    assert.equal(game.stage, 'finished', `${scenario.id}/${speech}`);
    assert.equal(game.result.score, null);
    retryTurn(game, 2);
    assert.equal(game.turn, 1);
  }
});

test('scoring corrects only clear spelling and preserves chat style, birth and quoted language', () => {
  const game = newGame({ scenarioId: 'cancelled' }, 'live');
  const phrases = ['웅 무리하지말구 푹쉬어 낫고나서 얘기하자 ㅋㅋ', '얼른 낳으세요', '어의없네', '친구가 내일 아기 낳아요', '낳아요라는 표현이 틀렸어', '자연스럽게 대화해요'];
  game.messages = phrases.map((text, i) => ({ id: `s${i}`, role: 'user', text }));
  const notes = spellingNotesFor(game);
  assert.equal(notes.length, 2);
  const scoring = transcriptForScoring(game);
  assert.equal(scoring[0].text, phrases[0]);
  assert.equal(scoring[1].text, '얼른 나으세요');
  assert.equal(scoring[2].text, '어이없네');
  assert.deepEqual(scoring.slice(3).map(m => m.text), phrases.slice(3));
  assert.deepEqual(game.messages.map(m => m.text), phrases);
  game.messages = [{ id: 'span', role: 'user', text: '어의가 나오는 사극이 어의없네 그 단어의 뜻도 어의없어' }];
  assert.equal(transcriptForScoring(game)[0].text, '어의가 나오는 사극이 어이없네 그 단어의 뜻도 어이없어');
});
