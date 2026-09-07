const scenarioPatterns = {
  'after-date': [[/(기운\s*내세요|고생하세요|푹\s*쉬세요)/, '바쁜 주체를 사용자로 뒤바꿈']],
  cancelled: [
    [/아프다니\s*(걱정|놀랐)/, '아픈 주체를 사용자로 뒤바꿈'],
    [/(얼른|빨리|잘)\s*나으시/, '사용자에게 회복을 요구함'],
    [/(푹|편하게)\s*쉬세요/, '사용자에게 휴식을 권함'],
    [/몸조리\s*잘\s*하(?:세|시)|잘\s*회복하세요/, '사용자를 환자로 취급함'],
  ],
  'second-date': [
    [/토요일.{0,15}(비어|괜찮|가능)/, '토요일 약속과 모순됨'],
    [/일요일.{0,15}(약속|바쁘|어려)/, '일요일 여유와 모순됨'],
  ],
  'new-contact': [[/(우리|둘이).{0,15}(지난번|전에).{0,10}(만났|데이트)/, '단둘이 만난 적 없는 설정과 모순됨']],
  restart: [[/(싸웠|다퉜|화해)/, '다툼 없이 끝난 설정과 모순됨']],
};

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function finalSentence(messages) {
  const text = messages.at(-1) ?? '';
  const parts = text.split(/[.!?。…]+/).map(part => part.trim()).filter(Boolean);
  return (parts.at(-1) ?? text).replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '').trim();
}

export function assessRealismRun({ scenarioId, partnerName, partnerTurns, profile }) {
  const issues = [];
  const namePattern = new RegExp(`${escapeRegExp(partnerName)}\\s*(씨|님)`);
  for (const turn of partnerTurns) {
    const text = turn.messages.join(' ');
    if (namePattern.test(text)) issues.push({ turn: turn.turn, type: 'role', text: '상대가 자기 이름으로 사용자를 부름' });
    if (/(^|\s)당신(?:은|이|을|도|과|의|에게|한테|$)/.test(text)) issues.push({ turn: turn.turn, type: 'style', text: '한국어 썸 대화에서 어색한 당신 호칭' });
    if (/(^|\s)내가(?:\s|$)/.test(text)) issues.push({ turn: turn.turn, type: 'style', text: '존댓말 흐름에서 반말 1인칭 사용' });
    if (/바랍니다|고맙습니다|감사합니다|연락드리겠습니다/.test(text)) issues.push({ turn: turn.turn, type: 'style', text: '메신저 대화보다 딱딱한 문어체' });
    if (/편한\s*옷\s*입고\s*오/.test(text)) issues.push({ turn: turn.turn, type: 'style', text: '맥락 없는 옷차림 지시' });
    for (const [pattern, description] of scenarioPatterns[scenarioId] ?? []) {
      if (pattern.test(text)) issues.push({ turn: turn.turn, type: 'fact', text: description });
    }
  }
  const allText = partnerTurns.flatMap(turn => turn.messages).join(' ');
  const repeatedPhrases = [
    [/연락(?:드릴|할)게요/g, '연락 약속 반복'],
    [/회복(?:할|되)/g, '회복 표현 반복'],
    [/기대(?:돼|되|할)/g, '기대 표현 반복'],
  ];
  for (const [pattern, description] of repeatedPhrases) {
    if ((allText.match(pattern) ?? []).length > 2) issues.push({ turn: null, type: 'style', text: description });
  }
  const playfulTurns = partnerTurns.filter(turn => turn.messages.some(message => /[ㅋㅎ]|:\)|[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(message))).length;
  if (profile.humor === 'light' && (playfulTurns < 1 || playfulTurns > 3)) issues.push({ turn: null, type: 'style', text: '장난형 표현 빈도가 성향 범위를 벗어남' });
  if (profile.humor === 'plain' && playfulTurns > 1) issues.push({ turn: null, type: 'style', text: '담백형에서 장난 표현이 반복됨' });
  return {
    scenarioId, profile, issues,
    endings: partnerTurns.map(turn => finalSentence(turn.messages)).filter(Boolean),
    questionTurns: partnerTurns.filter(turn => turn.messages.some(message => message.includes('?'))).length,
    playfulTurns,
    turnCount: partnerTurns.length, bubbleCount: partnerTurns.reduce((sum, turn) => sum + turn.messages.length, 0),
  };
}

export function summarizeRealism(results, expectedRuns = 10) {
  const endings = results.flatMap(result => result.endings);
  const counts = new Map();
  for (const ending of endings) counts.set(ending, (counts.get(ending) ?? 0) + 1);
  const repeated = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const issues = results.flatMap(result => result.issues);
  const roleConfusions = issues.filter(issue => issue.type === 'role').length;
  const factContradictions = issues.filter(issue => issue.type === 'fact').length;
  const styleIssues = issues.filter(issue => issue.type === 'style').length;
  const repetitionRate = endings.length ? repeated / endings.length : 1;
  const averageRate = (field, value, countField) => {
    const selected = results.filter(result => result.profile[field] === value);
    return selected.length ? selected.reduce((sum, result) => sum + result[countField] / 5, 0) / selected.length : 0;
  };
  const activeQuestionRate = averageRate('initiative', 'active', 'questionTurns');
  const calmQuestionRate = averageRate('initiative', 'calm', 'questionTurns');
  const lightPlayfulRate = averageRate('humor', 'light', 'playfulTurns');
  const plainPlayfulRate = averageRate('humor', 'plain', 'playfulTurns');
  const personalityPass = expectedRuns < 10 || activeQuestionRate >= calmQuestionRate + 0.1 && lightPlayfulRate >= plainPlayfulRate + 0.1;
  const partnerTurns = results.reduce((sum, result) => sum + (result.turnCount ?? 0), 0);
  return {
    runs: results.length, partnerTurns, roleConfusions, factContradictions, styleIssues, repetitionRate,
    activeQuestionRate, calmQuestionRate, lightPlayfulRate, plainPlayfulRate, personalityPass,
    pass: results.length === expectedRuns && partnerTurns === expectedRuns * 5 && roleConfusions === 0 && factContradictions === 0 && styleIssues === 0 && repetitionRate < 0.3 && personalityPass,
  };
}
