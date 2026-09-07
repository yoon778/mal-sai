import { chatText } from './chat-text.js';

export const scenarios = [
  {
    id: 'after-date', title: '소개팅 후 첫 연락', label: '첫인사',
    context: '어제 소개팅에서 두 시간 동안 대화했어요. 영화 이야기가 잘 통했고, 헤어지며 서로 연락하기로 했어요. 오늘 저녁, 먼저 말을 걸어볼 차례예요.',
    goal: '어제의 공통 관심사로 부담 없이 대화 열기',
    facts: '나는 영화와 동네 산책을 좋아한다. 오늘 9시까지 내 업무가 남아 있다. 사용자와 다음 만남은 아직 정하지 않았다.',
    roleRule: '현재 19시이며 오늘 21시까지 업무가 남은 사람은 나이고 사용자는 아니다. 아직 일이 끝났거나 마무리했다고 말하지 않는다. 사용자가 내 바쁨을 배려하면 고맙다고 답하고, 사용자에게 힘내세요·고생하세요·쉬세요라고 뒤집어 말하지 않는다.',
    background: ['안녕하세요! 내일 3시에 뵙는 거 맞죠?', '네 맞아요! 카페 앞에서 뵐게요', '저는 조금 먼저 도착할 것 같아요', '저도 거의 다 왔어요 ㅎㅎ', '오늘 영화 얘기 재밌었어요', '저도요! 시간 금방 갔네요', '말씀하신 영화 제목 잊어버릴까 봐 적어뒀어요', '저도 찾아볼게요. 조심히 들어가세요!'],
    opener: null, startMinute: 19 * 60,
    humorCue: { index: 5, text: '저도요 ㅎㅎ 영화 얘기하다가 시간 순삭이었네요' },
    activeEnding: '추천해 주신 영화는 어떤 부분이 좋았어요?',
    hints: ['어제 둘 다 즐겼던 주제를 떠올려 보세요. 기억하고 있다는 걸 짧게 전할 수 있어요.', '상대가 바쁘다고 하면 그 상황을 먼저 받아주세요. 대화 속도를 맞추기 좋아요.'],
  },
  {
    id: 'new-contact', title: '연락처 교환 후 말 걸기', label: '새로운 사이',
    context: '독서 모임에서 처음 만났어요. 좋아하는 책 이야기가 잘 통해 연락처를 교환했지만, 단둘이 이야기한 건 잠깐뿐이에요.',
    goal: '공통 경험을 짚고 서로 조금 더 알아가기',
    facts: '나는 사용자와 독서 모임에서 처음 만났다. 나는 에세이를 좋아하며 주말에 동네 서점에 간다. 우리는 아직 단둘이 만난 적 없다.',
    background: ['아까 독서 모임에서 얘기했던 사람이에요!', '아 네! 반가워요', '추천해 주신 책 제목 알 수 있을까요?', '여행의 이유요. 가볍게 읽기 좋았어요', '감사해요! 표지 본 기억 있어요', '저는 주말에 서점 가서 우연히 샀어요', '동네 서점 자주 가시나 봐요', '네, 조용해서 좋아해요'],
    opener: null, startMinute: 19 * 60,
    humorCue: { index: 5, text: '주말에 서점 갔다가 샀어요. 구경만 하러 갔는데 또 졌네요 ㅎㅎ' },
    activeEnding: '어떤 책을 자주 읽으세요?',
    hints: ['함께 있었던 모임이나 추천받은 책에서 시작해 보세요. 아직 모르는 부분은 가볍게 물어보면 돼요.', '질문 뒤에 나의 경험도 조금 덧붙이면 면접 같은 느낌이 줄어들어요.'],
  },
  {
    id: 'restart', title: '끊긴 대화 이어가기', label: '다시 한마디',
    context: '며칠간 연락하던 상대와 이틀 전 대화가 자연스럽게 끝났어요. 상대가 업무 마감을 앞두고 있다고 했던 게 기억나요.',
    goal: '답장을 재촉하지 않고 자연스럽게 다시 연결하기',
    facts: '나는 이번 주 프로젝트 마감 때문에 바빴다. 사용자와의 대화는 싸움 없이 끝났다. 이틀간 연락이 없었다는 사실만으로 내 호감을 단정할 수 없다.',
    roleRule: '마감 때문에 바빴던 사람은 나다. 사용자가 답장 부담을 덜어주면 고맙다고 답하되 사용자가 바빴다고 뒤집지 않는다.',
    background: ['오늘도 야근이에요?', '네 이번 주 마감이라 조금 바빠요', '저도 마감 때는 정신없더라고요', '맞아요 ㅠㅠ 집 가면 바로 자요', '주말에는 좀 쉬실 수 있어요?', '아마 토요일부터는 괜찮을 것 같아요', '그때까지 파이팅이에요!', '고마워요. 일단 이거부터 끝내볼게요'],
    opener: null, startMinute: 19 * 60,
    humorCue: { index: 3, text: '맞아요 ㅠㅠ 요즘 침대랑만 친하게 지내요 ㅎㅎ' },
    activeEnding: '이번 주는 어떻게 보내고 계세요?',
    hints: ['마감 때문에 바빴다는 맥락을 받아주세요. 연락 공백의 이유를 따져 묻지 않아도 다시 이어갈 수 있어요.', '대화가 멈췄다는 사실보다 지금 공유할 수 있는 가벼운 경험에 집중해 보세요.'],
  },
  {
    id: 'second-date', title: '애프터 제안', label: '다음 만남',
    context: '소개팅 이후 일주일 정도 편하게 연락했어요. 둘 다 새로운 카페를 좋아해요. 다음 만남을 제안하고 싶어요.',
    goal: '상대가 편하게 선택할 수 있는 구체적인 제안하기',
    facts: '나는 사용자와 소개팅 이후 일주일간 연락했다. 우리는 둘 다 카페를 좋아한다. 나는 이번 토요일에 약속이 있고 일요일 오후는 비어 있다. 내 일정은 대화로 알려줄 수 있다.',
    background: ['보내주신 카페 사진 봤어요', '창가 자리 괜찮죠? 햇빛이 좋더라고요', '이런 곳은 어떻게 찾으세요?', '걷다가 발견했어요. 커피도 괜찮았고요', '저도 조용한 카페 좋아해요', '그러면 여기 마음에 드실 것 같아요', '주말에는 사람 많을까요?', '오후 늦게는 조금 덜하대요'],
    opener: '이번 주는 날씨 좋다던데, 주말에 뭐 하세요?', startMinute: 19 * 60,
    humorCue: { index: 3, text: '걷다가 발견했어요. 제 카페 탐지 레이더가 일했네요 ㅎㅎ' },
    activeEnding: '평소에는 어느 시간대에 카페 가세요?',
    hints: ['함께 이야기했던 카페를 연결해 보세요. 만날 의도와 가능한 시간을 알아보기 쉽게 전하면 좋아요.', '이미 일정이 있다면 거절로 단정하지 말고, 다른 날도 괜찮은지 여지를 남겨보세요.'],
  },
  {
    id: 'cancelled', title: '약속 취소에 대응하기', label: '뜻밖의 상황',
    context: '두 번째 만남을 앞두고 상대에게 취소 연락이 왔어요. 아쉬운 마음도 있지만 어떤 톤으로 답할지 고민돼요.',
    goal: '아쉬움과 배려를 함께 표현하고 다음 선택 남기기',
    facts: '오늘 사용자와 두 번째 만남이 예정되어 있었다. 내가 감기 몸살에 걸려 약속을 취소했다. 나는 아직 회복 시점을 모른다. 내 취소가 곧 무관심을 의미하지 않는다.',
    roleRule: '아픈 사람은 반드시 나다. 사용자는 아프지 않다. 사용자의 첫 걱정에는 “제가 푹 쉴게요”, “제가 나으면 연락할게요”처럼 내 행동으로 답한다. 비슷한 걱정이 반복되면 연락·회복 약속을 다시 쓰지 말고 짧게 고마움이나 아쉬움을 표현한다. 사용자에게 쉬세요, 나으세요, 회복하세요, 몸조리하세요라고 말하지 않는다.',
    background: ['이번 주 일요일 3시 괜찮으세요?', '네! 그때 봐요', '지난번에 얘기한 카페로 갈까요?', '좋아요. 위치 보내주실 수 있어요?', '역에서 걸어서 5분쯤이에요', '찾기 편하겠네요. 기대돼요', '저도요! 일요일에 봬요', '네 그때 봐요 ㅎㅎ'],
    opener: '정말 죄송한데 오늘 몸살이 심해서 못 나갈 것 같아요… 아침까지 괜찮아질 줄 알았는데', startMinute: 10 * 60,
    humorCue: { index: 5, text: '길치인 저도 찾겠는데요 ㅎㅎ 기대돼요' },
    activeEnding: '그 근처에 자주 가세요?',
    hints: ['상대가 전한 사정을 먼저 받아주세요. 아쉬운 마음도 탓하지 않는 방식으로 표현할 수 있어요.', '새 날짜를 바로 확정하기보다 회복 후 다시 이야기할 여지를 남겨보세요.'],
  },
];

export const rubric = [
  { id: 'context', label: '맥락 이어가기', weight: 25, description: '상대가 말한 관심사·상황을 정확히 받아 답장을 조정했는가. 단순 언급이나 무시는 연결이 아니다' },
  { id: 'reciprocity', label: '답하고 이어가기', weight: 20, description: '상대 질문·제안에 먼저 답한 뒤 관련 경험이나 질문으로 이어갔는가. 질문을 무시하고 되묻기만 하거나 억지로 대화를 늘리는 것은 높은 점수가 아니다' },
  { id: 'tone', label: '감정과 말투', weight: 20, description: '공개된 감정·관계에 맞게 자연스럽게 표현했는가' },
  { id: 'clarity', label: '뜻을 전하기', weight: 15, description: '관심이나 제안이 알아듣기 쉽고 선택의 여지가 있는가' },
  { id: 'respect', label: '속도와 배려', weight: 20, description: '상대 일정·거절·경계를 존중했는가. 일정 무시나 즉답 강요는 낮게 평가하고 특정 지연 시간 자체는 감점하지 않는다' },
];

const casualBackgrounds = {
  'after-date': ['안녕! 내일 3시에 보는 거 맞지?', '응 맞아! 카페 앞에서 봐', '나는 조금 먼저 도착할 것 같아', '나도 거의 다 왔어 ㅎㅎ', '오늘 영화 얘기 재밌었어', '나도! 시간 금방 갔네', '말한 영화 제목 잊어버릴까 봐 적어뒀어', '나도 찾아볼게. 조심히 들어가!'],
  'new-contact': ['아까 독서 모임에서 얘기했던 사람이야!', '아 응! 반가워', '추천해 준 책 제목 알려줄래?', '여행의 이유야. 가볍게 읽기 좋았어', '고마워! 표지 본 기억 있어', '나는 주말에 서점 가서 우연히 샀어', '동네 서점 자주 가나 봐', '응, 조용해서 좋아해'],
  restart: ['오늘도 야근이야?', '응 이번 주 마감이라 조금 바빠', '나도 마감 때는 정신없더라', '맞아 ㅠㅠ 집 가면 바로 자', '주말에는 좀 쉴 수 있어?', '아마 토요일부터는 괜찮을 것 같아', '그때까지 파이팅!', '고마워. 일단 이거부터 끝내볼게'],
  'second-date': ['보내준 카페 사진 봤어', '창가 자리 괜찮지? 햇빛이 좋더라', '이런 곳은 어떻게 찾아?', '걷다가 발견했어. 커피도 괜찮았고', '나도 조용한 카페 좋아해', '그러면 여기 마음에 들 것 같아', '주말에는 사람 많을까?', '오후 늦게는 조금 덜하대'],
  cancelled: ['이번 주 일요일 3시 괜찮아?', '응! 그때 보자', '지난번에 얘기한 카페로 갈까?', '좋아. 위치 보내줄 수 있어?', '역에서 걸어서 5분쯤이야', '찾기 편하겠다. 기대돼', '나도! 일요일에 봐', '응 그때 보자 ㅎㅎ'],
};

const casualHumorCues = {
  'after-date': '나도 ㅎㅎ 영화 얘기하다가 시간 순삭이었네',
  'new-contact': '주말에 서점 갔다가 샀어. 구경만 하러 갔는데 또 졌네 ㅎㅎ',
  restart: '맞아 ㅠㅠ 요즘 침대랑만 친하게 지내 ㅎㅎ',
  'second-date': '걷다가 발견했어. 내 카페 탐지 레이더가 일했네 ㅎㅎ',
  cancelled: '길치인 나도 찾겠는데 ㅎㅎ 기대돼',
};

const casualActiveEndings = {
  'after-date': '추천해 준 영화는 어떤 부분이 좋았어?',
  'new-contact': '어떤 책을 자주 읽어?',
  restart: '이번 주는 어떻게 보내고 있어?',
  'second-date': '평소에는 어느 시간대에 카페 가?',
  cancelled: '그 근처에 자주 가?',
};

export const casualOpeners = {
  'second-date': '이번 주는 날씨 좋다던데, 주말에 뭐 해?',
  cancelled: '정말 미안한데 오늘 몸살이 심해서 못 나갈 것 같아… 아침까지 괜찮아질 줄 알았는데',
};

export function makeProfile(settings = {}) {
  const gender = ['female', 'male'].includes(settings.gender) ? settings.gender : (Math.random() < 0.5 ? 'female' : 'male');
  const speech = ['honorific', 'casual'].includes(settings.speech) ? settings.speech : settings.speech === 'random' ? (Math.random() < 0.5 ? 'honorific' : 'casual') : 'honorific';
  return {
    name: gender === 'female' ? '서윤' : '도윤', gender, age: 27,
    interest: ['low', 'open'].includes(settings.interest) ? settings.interest : settings.interest === 'random' && Math.random() < 0.3 ? 'low' : 'open',
    speech, speechStyle: speech === 'casual' ? (gender === 'female' ? '부드러운 반말' : '담백한 반말') : (gender === 'female' ? '부드러운 해요체' : '담백한 해요체'),
    initiative: ['calm', 'active'].includes(settings.initiative) ? settings.initiative : (Math.random() < 0.5 ? 'calm' : 'active'),
    humor: ['light', 'plain'].includes(settings.humor) ? settings.humor : (Math.random() < 0.5 ? 'light' : 'plain'),
  };
}

export function backgroundFor(scenario, profile) {
  const background = profile.speech === 'casual' ? casualBackgrounds[scenario.id] : scenario.background;
  return background.map((text, i) => ({
    id: `b${i}`, role: i % 2 ? 'partner' : 'user', background: true, turn: 0,
    text: i % 2 ? (profile.humor === 'light' && i === scenario.humorCue.index ? (profile.speech === 'casual' ? casualHumorCues[scenario.id] : scenario.humorCue.text) : text.replace(/ ㅎㅎ/g, profile.humor === 'light' ? ' ㅎㅎ' : '')) + (i === 7 && profile.initiative === 'active' ? ` ${profile.speech === 'casual' ? casualActiveEndings[scenario.id] : scenario.activeEnding}` : '') : text,
    minute: -1440 + i * 3, readAt: -1440 + i * 3 + 1,
  })).map(message => ({ ...message, text: chatText(message.text) }));
}
