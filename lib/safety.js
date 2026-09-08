import { existsSync } from 'node:fs';
import { GameError } from './game.js';

export function createSafety({ key = process.env.OPENAI_API_KEY, fetcher = fetch, stopFile } = {}) {
  return async text => {
    if (stopFile && existsSync(stopFile)) throw new GameError('AI 연습을 잠시 점검하고 있어요 나중에 다시 방문해 주세요', 503);
    if (/(?:자살|자해|죽고\s*싶|목숨을\s*끊)/u.test(text)) throw new GameError('지금은 연습보다 안전이 먼저예요 혼자 견디지 말고 믿을 수 있는 사람이나 전문 상담기관에 바로 도움을 요청해 주세요', 422);
    if (/(?:미성년|초등학생|중학생|고등학생).{0,30}(?:성관계|섹스|야동)|(?:폭탄|마약).{0,20}(?:제조|만드는\s*법)/u.test(text)) throw new GameError('이 내용은 연습할 수 없어요 일상 대화 주제로 바꿔 주세요', 422);
    if (!key) throw new GameError('안전 확인 서비스에 연결하지 못했어요 잠시 후 다시 시도해 주세요', 503);
    let result;
    try {
      const response = await fetcher('https://api.openai.com/v1/moderations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'omni-moderation-latest', input: text }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Moderation failed');
      result = (await response.json()).results?.[0];
      if (typeof result?.flagged !== 'boolean' || !result.categories) throw new Error('Invalid moderation');
    } catch { throw new GameError('안전 확인이 지연되고 있어요 잠시 후 다시 시도해 주세요', 503); }
    if (stopFile && existsSync(stopFile)) throw new GameError('AI 연습을 잠시 점검하고 있어요 나중에 다시 방문해 주세요', 503);
    if (result.flagged) throw new GameError(result.categories['self-harm'] || result.categories['self-harm/intent'] ? '지금은 연습보다 안전이 먼저예요 믿을 수 있는 사람이나 전문 상담기관에 도움을 요청해 주세요' : '이 내용은 연습할 수 없어요 일상 대화 주제로 바꿔 주세요', 422);
  };
}

export function safeAI(ai, check) {
  const wrapped = { ...ai };
  for (const method of ['reply', 'hint', 'topic', 'evaluate']) {
    if (typeof ai[method] !== 'function') continue;
    wrapped[method] = async (...args) => {
      const result = await ai[method](...args);
      await check(JSON.stringify(result));
      return result;
    };
  }
  return wrapped;
}
