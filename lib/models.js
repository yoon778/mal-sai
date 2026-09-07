// USD per 1M tokens, standard service tier, verified 2026-09-07.
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export const models = Object.freeze({
  'gpt-4.1-mini-2025-04-14': Object.freeze({ input: 0.4, cached: 0.1, output: 1.6 }),
  'gpt-4.1-2025-04-14': Object.freeze({ input: 2, cached: 0.5, output: 8 }),
  'gpt-5.4-mini-2026-03-17': Object.freeze({ input: 0.75, cached: 0.075, output: 4.5, reasoning: 'none' }),
});
export const defaultReplyModel = 'gpt-5.4-mini-2026-03-17';
export const defaultCoachModel = 'gpt-4.1-mini-2025-04-14';
export function modelRates(model) {
  if (!Object.hasOwn(models, model)) throw new Error('지원하지 않는 AI 모델 설정이에요');
  return models[model];
}
