// Product rules distilled from the documented research, not validated attraction laws.
const sources = {
  room: { title: '홍차 · 여자와 연락 잘하는 한 가지 방법', url: 'https://www.youtube.com/watch?v=c6WTHbi7bGs', access: '공개 자동 전사 참고' },
  flow: { title: '피기너스 · 당신이 여자 앞에서 어색해지는 이유', url: 'https://www.youtube.com/watch?v=1KROmPK4ucs', access: '공개 자동 전사 참고' },
  respect: { title: '김작가 TV·희렌최 · 대화 습관', url: 'https://www.youtube.com/watch?v=HDQ7rvIEuq4', access: '공개 자동 전사 참고' },
};

export const principles = [
  { id: 'receive', title: '앞말을 받아주기', rule: '상대의 질문·감정·구체적인 소재에 실제로 반응했는지 본다. 질문이 없으면 답변 의무도 없다.', exception: '불편한 질문을 거절하거나 경계를 세우는 답변도 인정한다.', source: sources.flow },
  { id: 'room', title: '상대가 말할 여지', rule: '맥락에 맞는 내 생각, 관련 질문, 짧은 반응 중 충분한 방식을 인정한다. 공감+내 이야기+질문 공식을 매번 요구하지 않는다.', exception: '약속 확정·마무리에는 짧은 답만으로 충분하다.', source: sources.room },
  { id: 'callback', title: '지난 이야기 연결', rule: '이미 공개된 관심사·약속·끝난 사건을 지금 상황에 맞게 이어간다.', exception: '기억력 시험이 아니다. 다른 적절한 소재도 같은 수준으로 인정한다.', source: sources.room },
  { id: 'repair', title: '오해와 불편함 수습', rule: '불편했다는 반응을 받아들이고 자기 의도를 설명한다. 농담이었다며 상대를 탓하지 않는다.', exception: '정당한 경계 표현·합의한 장난·인용을 공격으로 단정하지 않는다.', source: sources.respect },
  { id: 'space', title: '일정과 경계 존중', rule: '공개된 바쁨·거절·연락 약속에 맞춰 행동했는지 본다. 재촉·죄책감 유도·반복 강요는 실제 맥락으로 판단한다.', exception: '답장 지연·선연락 주체·성별만으로 감점하지 않는다. 공개하지 않은 기대를 못 맞혔다고 평가하지 않는다.', source: sources.respect },
];

export function principlesFor(game) {
  const id = game.scenario.id;
  const specific = ['joke-repair', 'clarify'].includes(id) ? 'repair'
    : ['promised-contact', 'cancelled', 'busy-break', 'short-reply'].includes(id) ? 'space' : 'callback';
  return principles.filter(item => ['receive', 'room', specific].includes(item.id));
}

export const expressionPolicy = `맞춤법 안내와 대화 기술 점수는 분리한다. 머해·웅·그랬엉·ㅋㅋ·축약·띄어쓰기 생략·온점 생략·사투리·가벼운 오타는 교정하거나 감점하지 않는다. 확신이 낮은 표현은 생략한다.
명확한 표기 오류는 별도 서버 검사에서 안내한다. 평가 AI는 표기 안내를 생성하지 않는다. 문법 교정은 너의 역할이 아니다.
표기 오류 자체를 tone·clarity 등 어떤 기술 점수에서도 감점하지 않는다. 날짜·시간·긍정과 부정이 모순되어 실제 의도가 불명확한 경우만 뜻 전달을 검토하되 단순 표기 안내와 중복 처벌하지 않는다.
말투 평가는 반말·애교·짧은 답·웃음의 유무가 아니라 비꼼·비하·재촉·죄책감 유도·거절 무시 같은 언어 행동의 맥락을 본다. 특정 단어만으로 감점하지 않는다.`;

// Original examples describe a different conversation, never new facts about this game.
export function relationshipStageFor(game) {
  return ['first-contact', 'promised-contact', 'after-date', 'new-contact', 'story'].includes(game.scenario.id) ? 'early' : 'ongoing';
}

export function replyExampleFor(game) {
  const casual = game.profile.speech === 'casual';
  const id = game.scenario.id;
  if (['joke-repair', 'clarify'].includes(id)) return casual
    ? { user: '그런 뜻은 아니었어 말이 좀 이상했네 미안', partner: ['응 무슨 말인지 알겠어'] }
    : { user: '그런 뜻은 아니었어요 표현이 좀 이상했네요 미안해요', partner: ['아 그런 뜻이었구나\n무슨 말인지 알겠어요'] };
  if (['busy-break', 'cancelled'].includes(id)) return casual
    ? { user: '응 다 끝나고 편할 때 봐', partner: ['응 이따 볼게'] }
    : { user: '네 끝나고 편할 때 보세요', partner: ['네 이따 볼게요'] };
  if (id === 'callback') return casual
    ? { user: '오늘 면접 어땠어?', partner: ['웅 생각보다 괜찮았어\n끝나니까 배고프더라 ㅋㅋ'] }
    : { user: '오늘 면접 어땠어요?', partner: ['생각보다 괜찮았어요\n끝나니까 배고프던데ㅋㅋ'] };
  if (relationshipStageFor(game) === 'ongoing' && game.profile.humor === 'light' && game.profile.interest !== 'low') return casual
    ? { user: '그 빵집 오늘 쉰대', partner: ['으엥\n거기 빵 먹으려고 했는데 ㅠㅠ\n다른 데 찾아봐야겠다'] }
    : { user: '그 빵집 오늘 쉰대요', partner: ['앗 하필 오늘ㅠㅠ\n거기 빵 먹으려고 했는데', '다른 데 찾아볼게요'] };
  return casual
    ? { user: '그 전시 어땠어?', partner: ['사진은 좋았어\n사람 많아서 오래 못 봤지만'] }
    : { user: '그 전시 어땠어요?', partner: ['사진은 좋았어요\n사람 많아서 오래 못 봤지만'] };
}
