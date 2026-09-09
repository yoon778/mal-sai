import { GameError } from './game.js';
import { chatText } from './chat-text.js';

const cards = {
  context: ['질문에 먼저 답하기', '주말에 동네 장터 이야기를 나누는 새 상황이에요', '거기 가면 뭐부터 보고 싶어요?', '거기 가면 뭐부터 보고 싶어?', '상대가 물은 것에 먼저 답하고 관련된 생각을 짧게 더하기'],
  reciprocity: ['내 이야기도 한 조각', '상대와 처음으로 음악 취향을 나누는 상황이에요', '저는 요즘 출근할 때 잔잔한 노래 들어요', '나는 요즘 출근할 때 잔잔한 노래 들어', '상대의 이야기를 받아주고 내 취향이나 생각도 나누기 질문은 필수가 아님'],
  tone: ['불편함을 받아주기', '내 농담이 다르게 전달된 새로운 상황이에요', '아까 그 말은 조금 놀리는 것처럼 들렸어요', '아까 그 말은 조금 놀리는 것처럼 들렸어', '상대가 느낀 불편함을 인정하고 의도를 짧게 설명하기'],
  clarity: ['답하기 편한 제안', '다음 주에 산책할 시간을 정하려는 상황이에요', '다음 주에는 수요일 저녁이 비어 있어요', '다음 주에는 수요일 저녁이 비어 있어', '공개된 일정에 맞춰 구체적이고 거절할 여지가 있는 제안하기'],
  respect: ['기다림도 좋은 답장', '상대가 가족 일정으로 자리를 비우는 상황이에요', '지금 가족들이랑 저녁 먹으러 가요 답장은 나중에 할게요', '지금 가족들이랑 저녁 먹으러 가 답장은 나중에 할게', '공개된 일정을 존중하고 답장을 재촉하지 않고 마무리하기'],
};

export function startDrill(game) {
  if (game.stage !== 'finished') throw new GameError('대화 복기 뒤에 복습할 수 있어요');
  if (game.drill) return;
  const criterion = game.result.criteria.filter(item => item.score !== null).sort((a, b) => a.score - b.score)[0]?.id ?? 'context';
  const [title, context, honorific, casual, focus] = cards[criterion] ?? cards.context;
  game.drill = { criterion, title, context, partner: game.profile.speech === 'casual' ? casual : honorific, focus, answer: null, feedback: null };
}

export async function submitDrill(game, answer, ai) {
  if (game.stage !== 'finished' || !game.drill) throw new GameError('복습 상황을 먼저 열어 주세요');
  if (game.drill.feedback) throw new GameError('이미 복습한 답장이에요', 409);
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 400) throw new GameError('복습 답장은 1~400자로 작성해 주세요');
  const result = await ai.reviewDrill(game, answer.trim());
  if (!result || ['evidence', 'observation', 'suggestion'].some(key => typeof result[key] !== 'string' || !result[key].trim() || result[key].length > 300) || !answer.includes(result.evidence)) throw new GameError('실제 답장에 연결된 복습 안내를 확인하지 못했어요', 502);
  game.drill = { ...game.drill, answer: answer.trim(), feedback: { ...result, suggestion: chatText(result.suggestion) } };
}
