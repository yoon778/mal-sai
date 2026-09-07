// Conservative product scope: two unambiguous patterns, no general spellchecker.
// Expand only with contextual counterexamples, especially quotations and childbirth.
export function spellingNotesFor(game) {
  const notes = [];
  for (const message of game.messages.filter(m => m.role === 'user' && !m.background)) {
    if (/["“”「」]|맞춤법|표현|라고|라는/.test(message.text)) continue;
    for (const match of message.text.matchAll(/어의(?=\s*없)/g)) {
      notes.push({ messageId: message.id, start: match.index, original: match[0], suggestion: '어이', reason: '어처구니없다는 뜻에는 어이없다를 써요' });
    }
    if (game.scenario.id !== 'cancelled' || /아기|아이|출산|임신|출생/.test(message.text)) continue;
    for (const match of message.text.matchAll(/낳(?:아요|아|으세요)(?![가-힣])/g)) {
      notes.push({ messageId: message.id, start: match.index, original: match[0], suggestion: match[0].replace('낳', '나'), reason: '병이 회복된다는 뜻은 낫다예요 · 나아, 나아요, 나으세요처럼 써요' });
    }
  }
  return notes;
}

export function transcriptForScoring(game) {
  const notes = spellingNotesFor(game);
  return game.messages.map(message => ({ ...message, text: notes.filter(note => note.messageId === message.id).sort((a, b) => b.start - a.start)
    .reduce((text, note) => text.slice(0, note.start) + note.suggestion + text.slice(note.start + note.original.length), message.text) }));
}
