import { chatText } from './chat-text.js';
import { transcriptForScoring } from './spelling.js';

// A rewrite can use only what the user knew before sending that turn.
export function coachingWindows(game) {
  const own = game.messages.filter(m => m.role === 'user' && !m.background);
  return own.map(message => {
    const currentReply = own.filter(m => m.turn === message.turn);
    const first = currentReply[0];
    const before = game.messages.slice(0, game.messages.indexOf(first)).filter(m => m.background || m.role === 'user' || m.readAt !== null && (!Number.isFinite(m.readAt) || m.readAt <= first.minute));
    const brief = ({ id, role, text }) => ({ id, role, text });
    return { messageId: message.id, turn: message.turn, knownBefore: before.map(brief), currentReply: currentReply.map(brief) };
  });
}

export function coachingIssues(moments, game) {
  if (!Array.isArray(moments)) return ['복기 카드 배열이 필요하다'];
  const windows = new Map(coachingWindows(game).map(w => [w.messageId, w]));
  const scoringText = new Map(transcriptForScoring(game).map(m => [m.id, m.text]));
  const issues = [];
  for (const item of moments) {
    const window = windows.get(item?.messageId);
    if (!window) { issues.push('실제 사용자 답장 ID를 선택해야 한다'); continue; }
    const known = new Set([...window.knownBefore, ...window.currentReply].map(m => m.id));
    if (!Array.isArray(item.contextMessageIds) || item.contextMessageIds.some(id => !known.has(id))) issues.push(`${item.messageId}: 답장 이후 또는 아직 읽지 않은 메시지를 근거로 사용하지 말 것`);
    if (item.kind === 'strength') {
      if (item.alternative !== null || item.change !== '') issues.push(`${item.messageId}: 좋은 답장은 고쳐 쓰지 말고 alternative=null, change=""로 유지`);
    } else if (item.kind === 'improvement') {
      if (typeof item.change !== 'string' || !item.change.trim() || item.change.length > 180) issues.push(`${item.messageId}: 바꿀 대화 행동을 구체적으로 설명할 것`);
      if (typeof item.alternative !== 'string' || !item.alternative.trim()) issues.push(`${item.messageId}: 바꿀 행동이 반영된 실제 대안이 필요하다`);
      else {
        const compact = text => chatText(text).replace(/\s+/g, '');
        const originals = [window.currentReply.map(m => m.text).join('\n'), window.currentReply.map(m => scoringText.get(m.id)).join('\n')];
        if (originals.some(text => compact(text) === compact(item.alternative))) issues.push(`${item.messageId}: 전체 답장의 원문이나 띄어쓰기·표기만 바꾼 대안은 제외할 것`);
      }
    }
  }
  return issues;
}
