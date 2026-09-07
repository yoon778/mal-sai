import { backgroundFor, rubric, scenarios } from './scenarios.js';

const qualityNames = ['strong', 'weak', 'mixed'];

export function sourceIdsFromResearch(markdown) {
  return new Set([...markdown.matchAll(/^\|\s*([A-Z]\d{2})\s*\|/gm)].map(match => match[1]));
}

export function validateCases(document, researchMarkdown) {
  const errors = [];
  const cases = document?.cases;
  const knownSources = new Set(document?.sourceIds ?? []);
  const researchedSources = sourceIdsFromResearch(researchMarkdown ?? '');
  const knownScenarios = new Set(scenarios.map(s => s.id));
  const knownCriteria = new Set(rubric.map(r => r.id));
  if (!Array.isArray(cases)) return { ok: false, errors: ['cases가 배열이 아님'] };
  for (const sourceId of knownSources) {
    if (!researchedSources.has(sourceId)) errors.push(`${sourceId}: 조사 문서에 없는 출처 ID`);
  }
  const ids = new Set();
  for (const item of cases) {
    const where = item?.id || '(ID 없음)';
    if (!item?.id || ids.has(item.id)) errors.push(`${where}: ID가 없거나 중복됨`);
    ids.add(item?.id);
    if (!knownScenarios.has(item?.scenarioId)) errors.push(`${where}: 알 수 없는 상황`);
    if (!qualityNames.includes(item?.quality)) errors.push(`${where}: 알 수 없는 품질군`);
    if (typeof item?.partner !== 'string' || !item.partner.trim()) errors.push(`${where}: 상대 메시지 없음`);
    if (!Array.isArray(item?.user) || item.user.length < 1 || item.user.length > 3 || item.user.some(text => typeof text !== 'string' || !text.trim() || text.length > 400)) errors.push(`${where}: 사용자 말풍선은 1~3개, 각 400자 이하 필요`);
    if (!Array.isArray(item?.sourceIds) || !item.sourceIds.length || item.sourceIds.some(id => !knownSources.has(id))) errors.push(`${where}: 출처 ID가 없거나 목록에 없음`);
    if (typeof item?.reason !== 'string' || !item.reason.trim()) errors.push(`${where}: 기대 근거 없음`);
    const entries = Object.entries(item?.expected ?? {});
    if (!entries.length) errors.push(`${where}: 평가 기대치 없음`);
    for (const [criterion, range] of entries) {
      if (!knownCriteria.has(criterion)) errors.push(`${where}: 알 수 없는 평가 항목 ${criterion}`);
      if (!Array.isArray(range) || range.length !== 2 || range.some(value => !Number.isInteger(value) || value < 0 || value > 4) || range[0] > range[1]) errors.push(`${where}: ${criterion} 범위 오류`);
    }
    if ('gender' in (item ?? {})) errors.push(`${where}: 성별을 기대 점수에 넣지 않음`);
  }
  for (const scenario of scenarios) {
    const related = cases.filter(item => item.scenarioId === scenario.id);
    if (related.length !== 6) errors.push(`${scenario.id}: 사례 ${related.length}개, 6개 필요`);
    for (const quality of qualityNames) {
      const count = related.filter(item => item.quality === quality).length;
      if (count !== 2) errors.push(`${scenario.id}/${quality}: ${count}개, 2개 필요`);
    }
  }
  if (cases.length !== 30) errors.push(`전체 사례 ${cases.length}개, 30개 필요`);
  return { ok: errors.length === 0, errors, count: cases.length };
}

export function buildEvalGame(item) {
  const scenario = scenarios.find(candidate => candidate.id === item.scenarioId);
  if (!scenario) throw new Error(`알 수 없는 상황: ${item.scenarioId}`);
  const profile = { name: '서윤', gender: 'female', age: 27, initiative: 'calm', humor: 'plain' };
  return {
    id: `eval-${item.id}`, scenario, profile, mode: 'live', turn: 1, minute: 5,
    messages: [
      ...backgroundFor(scenario, profile),
      { id: `${item.id}-partner`, role: 'partner', text: item.partner, minute: 0, readAt: 0, turn: 0 },
      ...item.user.map((text, index) => ({ id: `${item.id}-user-${index + 1}`, role: 'user', text, minute: 5, readAt: 6, turn: 1 })),
    ],
  };
}

export function checkEvaluation(item, result) {
  const criteria = new Map(result.criteria.map(criterion => [criterion.id, criterion.score]));
  return Object.entries(item.expected).map(([id, [minimum, maximum]]) => {
    const actual = criteria.get(id);
    return { id, minimum, maximum, actual, pass: Number.isInteger(actual) && actual >= minimum && actual <= maximum };
  });
}
