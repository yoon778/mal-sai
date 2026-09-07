const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
let config, game, pending = false, draft = [], inputText = '', delayMinutes = 0, hintOpen = false, topicOpen = false;
let settings = { gender: 'random', speech: 'random', interest: 'random', initiative: 'random', humor: 'random', channel: 'random', scenarioId: 'random' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (action, text, className = '', attrs = '') => `<button type="button" data-action="${action}" class="${className}" ${attrs}>${text}</button>`;
const clock = minutes => {
  const total = game.startMinute + minutes;
  const day = Math.floor(total / 1440);
  const hour = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const minute = ((total % 60) + 60) % 60;
  return `${day > 0 ? `${day}일 후 ` : ''}${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error ?? '요청을 처리하지 못했어요.'); error.status = response.status; throw error; }
  return result;
}

function showError(error) { notice.textContent = error.message; notice.hidden = false; }
function storeGame() { try { sessionStorage.setItem('sai-game', game.id); } catch { /* Storage is optional. */ } }

function select(name, label, options) {
  return `<label class="field">${label}<select name="${name}" ${pending ? 'disabled' : ''}>${options.map(([value, text]) => `<option value="${value}" ${settings[name] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
}

function bubble(message, { preview = false, review = false } = {}) {
  const own = message.role === 'user';
  const unread = !preview && !review && !own && message.readAt === null;
  if (unread) return '';
  const index = game.messages.findIndex(item => item.id === message.id);
  const sameTurn = item => item && item.role === message.role && item.turn === message.turn && Boolean(item.background) === Boolean(message.background);
  const followsSame = sameTurn(game.messages[index - 1]);
  const leadsSame = sameTurn(game.messages[index + 1]);
  const classes = ['message', own ? 'own' : 'other', followsSame ? 'continuation' : '', leadsSame ? 'continues' : ''].filter(Boolean).join(' ');
  return `<div class="${classes}" id="message-${escape(message.id)}">
    ${!own ? `<span class="small-avatar ${followsSame ? 'ghost' : ''}" aria-hidden="true">${escape(game.profile.name.slice(-1))}</span>` : ''}
    <div class="message-content">${!own && !followsSame ? `<span class="sender">${escape(game.profile.name)}</span>` : ''}<div class="bubble">${escape(message.text)}</div>
    ${!leadsSame ? `<div class="message-meta">${message.background ? escape(game.scenario.historyLabel) : clock(message.minute)}${own && !message.background ? ` · ${message.readAt === null ? '안 읽음' : `${clock(message.readAt)} 읽음`}` : ''}</div>` : ''}
    ${review && own && !message.background && !leadsSame ? button('retry', '이 답장부터 다시', 'text-button retry', `data-turn="${message.turn}"`) : ''}</div></div>`;
}

function modeNote() {
  return game.mode === 'demo' ? '<p class="mode-note">체험 모드 · 준비된 반응으로 진행하며 AI 점수는 제공하지 않아요</p>' : '<p class="mode-note">AI 연습 상대 · 입력한 대화는 응답·평가를 위해 OpenAI로 전송돼요</p>';
}

function renderPreview() {
  main.innerHTML = `<div class="preview-layout">
    <section class="intro"><p class="eyebrow">오늘의 대화 퀘스트</p><h1>다음 말이 궁금한<br>사이가 되어볼까?</h1>
      <p class="intro-copy">상황 하나, 답장 다섯 번<br>부담 없이 연습하고 나만의 대화 감각을 찾아요</p>
      <section class="quest-ticket" aria-label="이번 미션"><span>이번 미션</span><strong>${escape(game.scenario.goal)}</strong><small>5번의 답장 · 나다운 표현 찾기</small></section>
      <div class="speech-motif" aria-hidden="true"><span>안녕</span><span>ㅋㅋ</span><i>✳</i></div>
      <details class="settings"><summary>나에게 맞게 설정<span>선택 사항</span></summary><div class="settings-grid">
        ${select('gender', '대화 상대', [['random', '랜덤'], ['female', '여성'], ['male', '남성']])}
        ${select('speech', '말투', [['random', '랜덤'], ['honorific', '존댓말'], ['casual', '반말']])}
        ${select('interest', '상대의 초기 관심', [['random', '랜덤'], ['open', '알아가는 중'], ['low', '관심이 낮은 상황']])}
        ${select('initiative', '대화 적극성', [['random', '랜덤'], ['calm', '차분하게'], ['active', '적극적으로']])}
        ${select('humor', '농담 선호', [['random', '랜덤'], ['plain', '담백하게'], ['light', '가볍게 장난치기']])}
        ${select('channel', '연락처만 받은 상황의 채널', [['random', '랜덤'], ['kakao', '전화번호 · 카톡'], ['instagram', '인스타 DM']])}
        ${select('scenarioId', '연습할 상황', [['random', '랜덤 상황'], ...config.scenarios.map(s => [s.id, s.title])])}
      </div>${button('shuffle', '설정 적용해서 다시 뽑기', 'secondary wide')}</details>
      <p class="quiet adult-note">20세 이상 성인을 위한 가상의 대화 연습이에요</p>
    </section>
    <section class="scenario-preview" aria-label="대화 시작 준비"><div class="scenario-heading"><span class="eyebrow">오늘의 상황</span>${button('shuffle', '다른 상황 ↻', 'text-button')}</div>
      <div class="scenario-description"><span class="tag">${escape(game.scenario.label)}</span><h2>${escape(game.scenario.title)}</h2><p>${escape(game.scenario.context)}</p></div>
      <div class="chat-heading"><span class="avatar">${escape(game.profile.name.slice(-1))}</span><div><strong>${escape(game.profile.name)}</strong><span>${game.profile.age}세 · ${escape(game.profile.gender === 'female' ? '여성' : '남성')} · ${escape(game.profile.speechStyle)}</span></div><span class="history-tag">${escape(game.scenario.historyLabel)}</span></div>
      <p class="preview-tip">말투와 관심사를 살펴보고 이어서 대화해 보세요</p>
      ${storyPanel()}<div class="preview-messages">${game.messages.map(m => bubble(m, { preview: true })).join('')}</div>
      <div class="preview-bottom">${button('start', '대화 퀘스트 시작 <span aria-hidden="true">↗</span>', 'primary wide')}${modeNote()}</div>
    </section>
  </div>`;
}

function storyPanel() {
  return game.scenario.story ? `<aside class="story-card" aria-label="상대의 스토리"><span>오늘의 스토리 · 가상 게시물</span><p>${escape(game.scenario.story)}</p><small>스토리 속 소재로 DM을 시작해 보세요</small></aside>` : '';
}

function unreadPanel() {
  if (game.canWaitToStart) return `<div class="first-contact-panel"><strong>지금 먼저 보낼까요?</strong><p>아래에서 답장을 쓰거나 가상 시간을 넘겨보세요</p><div class="read-actions">${button('wait-start', '30분 뒤', 'secondary', 'data-delay="30"')}${button('wait-start', '2시간 뒤', 'text-button', 'data-delay="120"')}${button('wait-start', '하루 뒤', 'text-button', 'data-delay="1440"')}</div><small>작성 속도는 평가하지 않아요</small></div>`;
  if (game.waiting) return `<div class="unread-panel" role="status"><strong>아직 답장이 없어요</strong><p>상대에게도 자기 일정과 대화 속도가 있어요<br>답장 속도만으로 마음을 단정하지 말고 조금 기다려 봐요</p><div class="read-actions">${button('wait', '30분 기다리기', 'secondary', 'data-delay="30"')}${button('wait', '2시간 기다리기', 'text-button', 'data-delay="120"')}</div><p>가상 시간만 이동해요</p></div>`;
  const count = game.messages.filter(m => m.role === 'partner' && m.readAt === null).length;
  if (!count) return '';
  return `<div class="unread-panel"><span class="unread-dot"></span><strong>새 메시지 ${count}개</strong><p>지금 읽거나, 가상 시간을 넘겨 읽을 수 있어요</p><div class="read-actions">${button('read', '지금 읽기', 'secondary', 'data-delay="0"')}${button('read', '30분 뒤 읽기', 'text-button', 'data-delay="30"')}${button('read', '2시간 뒤 읽기', 'text-button', 'data-delay="120"')}</div></div>`;
}

function comparisonPanel() {
  if (!game.comparison || game.turn < game.comparison.turn) return '';
  const original = game.comparison.messages;
  const current = game.messages.filter(m => m.turn === game.comparison.turn && !m.background && (m.role === 'user' || m.readAt !== null));
  const renderSide = messages => messages.map(m => `<p><small>${m.role === 'user' ? '나' : escape(game.profile.name)}</small>${escape(m.text)}</p>`).join('');
  return `<section class="comparison"><p class="eyebrow">같은 순간, 다른 답장</p><h3>반응이 어떻게 달라졌나요?</h3><div class="comparison-grid"><div><h4>처음 대화</h4>${renderSide(original)}</div><div><h4>이번 대화</h4>${renderSide(current)}</div></div><p class="quiet">AI 반응은 같은 답장에도 달라질 수 있어요. 한 번의 차이가 정답을 뜻하지는 않아요.</p></section>`;
}

function renderChat() {
  const unread = game.waiting || game.messages.some(m => m.role === 'partner' && m.readAt === null);
  const ended = game.turn === 5;
  main.innerHTML = `<div class="play-layout"><aside class="play-sidebar">
    ${button('home', '← 새 연습', 'text-button')}<p class="eyebrow">${escape(game.scenario.label)}</p><h1>${escape(game.scenario.title)}</h1><details class="scene-details"><summary>상황 다시 보기</summary><p>${escape(game.scenario.context)}</p></details>
    <div class="goal"><span>이번 연습의 목표</span><strong>${escape(game.scenario.goal)}</strong></div>
    <div class="progress-label"><strong>나의 답장</strong><span>${game.turn} / 5</span></div><div class="progress" role="progressbar" aria-label="답장 진행" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${game.turn}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= game.turn ? 'filled' : ''}"></i>`).join('')}</div>
    <p class="quiet">말풍선을 나눠 보내도 한 번의 답장이에요.<br>가상 시간은 실제로 기다리지 않아요.</p>
    <p class="atmosphere"><span>가상 대화 분위기</span>${escape(game.atmosphere)}</p>${game.comparison ? '<div class="retry-note">다시 연습하는 중<br><small>바꾼 답장과 이전 반응을 비교해보세요</small></div>' : ''}
    ${modeNote()}</aside>
    <section class="chat-window" aria-label="메신저 대화"><div class="chat-heading"><span class="avatar">${escape(game.profile.name.slice(-1))}</span><div><strong>${escape(game.profile.name)}</strong><span>${escape(game.profile.gender === 'female' ? '여성' : '남성')} · ${escape(game.profile.speechStyle)}</span></div><span class="virtual-clock">가상 시간 <b>${clock(game.minute)}</b></span></div>
      <div class="chat-messages" id="chat-scroll" role="log" aria-label="대화 기록" aria-live="polite"><div class="history-divider">${escape(game.scenario.historyLabel)}</div>${game.messages.filter(m => m.background).map(m => bubble(m)).join('')}<div class="history-divider">연습 시작 · ${game.channel === 'instagram' ? '인스타 DM' : '카톡'}</div>${storyPanel()}${game.messages.filter(m => !m.background).map(m => bubble(m)).join('')}${!game.messages.some(m => !m.background) ? '<p class="end-note">이전 대화를 떠올리며, 먼저 한마디 건네보세요</p>' : ''}${unreadPanel()}${ended && !unread ? '<p class="end-note">다섯 번의 답장을 마쳤어요. 이제 함께 돌아볼까요?</p>' : ''}</div>
      <div class="composer-area">${ended ? button('finish', '대화 복기하기 ↗', 'primary wide', unread ? 'disabled' : '') : `
        <div class="composer-toolbar"><div class="coach-actions">${button('hint', '막막해요 · 힌트', `text-button ${hintOpen ? 'selected' : ''}`, unread ? 'disabled' : '')}${button('topic', '말이 끊겼어요 · 주제 찾기', `text-button ${topicOpen ? 'selected' : ''}`, unread ? 'disabled' : '')}</div><label class="delay-label">답장 시점<select id="reply-delay" ${unread ? 'disabled' : ''}>${[[0, '바로'], [5, '5분 뒤'], [30, '30분 뒤'], [120, '2시간 뒤']].map(([v, t]) => `<option value="${v}" ${delayMinutes === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        ${hintOpen && game.hint ? `<div class="hint"><span>이런 방향은 어때요?</span><p>${escape(game.hint)}</p><small>힌트는 감점 없이 볼 수 있어요 · ${game.totalHints}회 사용</small></div>` : ''}
        ${topicOpen && game.topicHelp ? `<div class="topic-help"><span>대화 연결 연습</span><dl><div><dt>꺼낼 주제</dt><dd>${escape(game.topicHelp.topic)}</dd></div><div><dt>이렇게 연결</dt><dd>${escape(game.topicHelp.bridge)}</dd></div><div><dt>답을 받으면</dt><dd>${escape(game.topicHelp.next)}</dd></div><div><dt>피할 방식</dt><dd>${escape(game.topicHelp.avoid)}</dd></div></dl><small>그대로 복사하기보다 내 말투로 바꿔보세요 · ${game.totalTopicHelps}회 사용</small></div>` : ''}
        <div class="draft-bubbles">${draft.map((text, i) => `<div class="draft-bubble"><span>${escape(text)}</span>${button('remove-draft', '×', 'text-button', `data-index="${i}" aria-label="작성 중인 말풍선 ${i + 1} 삭제"`)}</div>`).join('')}</div>
        <form id="composer"><label class="sr-only" for="message-input">답장 작성</label><textarea id="message-input" maxlength="400" rows="2" placeholder="${game.waiting ? '상대의 답장을 기다리는 중이에요' : unread ? '새 메시지를 먼저 읽어주세요' : '나답게, 편하게 답해보세요'}" ${unread ? 'disabled' : ''}>${escape(inputText)}</textarea><div class="composer-bottom"><div class="emoji-row" aria-label="이모티콘">${['🙂', '😂', '🥲', '👍', '☕'].map(emoji => button('emoji', emoji, 'emoji', `data-emoji="${emoji}" aria-label="${emoji} 넣기" ${unread ? 'disabled' : ''}`)).join('')}</div><div>${button('split', '+ 나눠쓰기', 'text-button', unread || draft.length >= 2 ? 'disabled' : '')}<button type="submit" class="primary send" ${unread ? 'disabled' : ''}>보내기 <span aria-hidden="true">↑</span></button></div></div></form>
        <div class="composer-help"><span>Enter 전송 · Shift+Enter 줄바꿈</span><span>말풍선당 400자</span></div>`}
      </div>
    </section></div>${comparisonPanel()}`;
  const scroll = document.querySelector('#chat-scroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function feedbackItems(items, title, kind) {
  if (!items.length) return '';
  return `<section class="feedback-block ${kind}"><p class="eyebrow">${title}</p>${items.map(item => {
    const message = game.messages.find(m => m.id === item.messageId);
    return `<article><blockquote>${escape(message.text)}</blockquote><p>${escape(item.text)}</p>${button('retry', '이 차례부터 다시 답해보기 ↗', 'text-button', `data-turn="${message.turn}"`)}</article>`;
  }).join('')}</section>`;
}

function rating(name, label) {
  return `<fieldset class="rating"><legend>${label}</legend><div>${[1, 2, 3, 4, 5].map(value => `<label><input type="radio" name="${name}" value="${value}" required><span>${value}</span></label>`).join('')}</div><small><span>전혀 아니다</span><span>매우 그렇다</span></small></fieldset>`;
}

function coachingCards(items) {
  return `<section class="coaching-cards"><h2>다시 볼 대화 ${items.length}장면</h2><p class="quiet">예시는 정답이 아니에요 · 내 말투로 바꿔 써보세요</p>${items.map((item, index) => {
    const position = game.messages.findIndex(message => message.id === item.messageId);
    const message = game.messages[position];
    let end = position - 1;
    while (end >= 0 && game.messages[end].role === 'user') end--;
    let start = end;
    while (start >= 0 && game.messages[start].role === 'partner') start--;
    const preceding = game.messages.slice(start + 1, end + 1);
    return `<article class="coaching-card ${item.kind}"><div class="coaching-heading"><span>장면 ${index + 1} · ${message.turn}번째 답장</span><b>${item.kind === 'strength' ? '잘 이어갔어요' : '이렇게 바꿔볼까요'}</b></div>
      <div class="coaching-original"><small>상대의 말</small>${preceding.length ? preceding.map(m => `<blockquote>${escape(m.text)}</blockquote>`).join('') : '<p>먼저 대화를 시작한 장면</p>'}<small>내가 보낸 답장</small><blockquote class="own-quote">${escape(message.text)}</blockquote></div>
      <p>${escape(item.reason)}</p>${item.principle ? `<details class="principle-source"><summary>${escape(item.principle.title)} · 참고 원칙</summary><p>조사 내용을 바탕으로 만든 연습 기준이에요</p><a href="${escape(item.principle.source.url)}" target="_blank" rel="noopener noreferrer">${escape(item.principle.source.title)}</a><small>${escape(item.principle.source.access)}</small></details>` : ''}<div class="coaching-alternative"><h3>그때 이렇게 답해볼 수도 있어요</h3><blockquote>${escape(item.alternative)}</blockquote></div>
      <h3>그다음에는</h3><p>${escape(item.nextStep)}</p>${button('retry', '이 장면부터 다시 답해보기 ↗', 'primary', `data-turn="${message.turn}"`)}</article>`;
  }).join('')}</section>`;
}

function feedbackPanel() {
  if (game.feedbackSubmitted) return '<section class="user-feedback feedback-done"><span aria-hidden="true">✓</span><div><p class="eyebrow">테스트 의견 저장 완료</p><p>남겨주신 평가는 제품 개선에만 사용해요</p></div></section>';
  return `<section class="user-feedback"><p class="eyebrow">1분 사용자 테스트</p><h2>이번 연습은 어땠나요?</h2><form id="feedback-form">
    <div class="ratings">${rating('realism', '상대의 답장이 실제 대화처럼 느껴졌다')}${rating('helpfulness', '복기 내용이 다음 답장에 도움이 됐다')}${rating('retryIntent', '다른 상황도 다시 연습해 보고 싶다')}</div>
    <label class="blocked"><input type="checkbox" name="blocked"> 진행 중 막혀서 혼자 넘어가기 어려운 순간이 있었다</label>
    <label class="feedback-note">한 줄 의견 <textarea name="note" maxlength="500" rows="3" placeholder="어색했던 답장이나 이해하기 어려웠던 피드백"></textarea></label>
    <div class="feedback-submit"><button type="submit" class="primary">테스트 결과 저장</button><p class="quiet">점수와 의견만 저장하며 대화 내용은 포함하지 않아요</p></div>
  </form></section>`;
}

function expressionNotes() {
  const notes = game.result.spellingNotes ?? [];
  return `<section class="expression-notes"><p class="eyebrow">표기만 잠깐 확인</p><p class="quiet">채팅식 표현·가벼운 오타는 넘어가요 · 표기 안내는 기술 점수와 별개예요</p>${notes.length ? notes.map(item => `<article><blockquote>${escape(item.original)} <span aria-hidden="true">→</span> ${escape(item.suggestion)}</blockquote><p>${escape(item.reason)}</p></article>`).join('') : `<p>${game.mode === 'demo' ? '체험 모드에서는 맞춤법을 검사하지 않아요' : '확인하는 표현 중 따로 안내할 오류는 없어요'}</p>`}<small>현재는 어이없다 표기와 아픈 상대에게 쓰는 나아·나으세요 표현만 확인해요</small></section>`;
}

function eventReview() {
  const events = game.result.events ?? [];
  if (!events.length) return '';
  return `<section class="event-review"><p class="eyebrow">대화 속 선택</p>${events.map(event => `<p>${event.kind === 'contact-repair' ? '연락 약속을 놓친 부분을 설명하며 대화를 이어갔어요' : event.missedPromise ? '연락하겠다는 약속 뒤 하루를 넘겨 상대가 먼저 안부를 물었어요' : '상대가 먼저 연락했어요 · 먼저 보낸 사람만으로 감점하지 않아요'}</p>`).join('')}<p class="quiet">약속을 놓친 사건과 그 뒤 답장하는 기술을 나누어 살펴보세요</p></section>`;
}

function renderReview() {
  const result = game.result;
  const unscored = game.mode === 'demo' ? 'AI 연결 전' : '관찰 부족';
  main.innerHTML = `<div class="review-page"><div class="review-top"><div><p class="eyebrow">대화 한 판 완료</p><h1>한 번 해봤으니,<br>한 번 더 잘해보자</h1><p>${escape(result.summary)}</p></div>${button('home', '새 상황 연습하기 ↗', 'primary')}</div>
    ${modeNote()}<div class="review-grid"><section class="score-panel"><p class="eyebrow">대화 기술</p><div class="score">${result.score ?? '—'}<span>${result.score === null ? unscored : '/ 100'}</span></div><p class="quiet">${game.mode === 'demo' ? '실제 AI를 연결하면 근거가 있는 점수를 볼 수 있어요.' : `관찰 범위 ${result.coverage}% · 짧은 대화에 대한 임시 평가예요.`}</p><div class="rubric-list">${result.criteria.map(c => `<details><summary><span>${escape(c.label)}</span><b>${c.score === null ? unscored : `${c.score} / 4`}</b></summary><p>${escape(c.reason)}</p>${c.evidenceIds.map(id => `<blockquote>${escape(game.messages.find(m => m.id === id)?.text)}</blockquote>`).join('')}</details>`).join('')}</div><p class="quiet">힌트 ${game.totalHints}회 · 감점 없음</p></section>
      <div class="feedback-column"><section class="outcome"><span class="eyebrow">이번 상황의 결과</span><h2>${escape(result.outcome)}</h2><p>상황 결과와 대화 기술은 별개예요. 약속이 잡히지 않아도 좋은 대응일 수 있어요.</p></section>
      ${eventReview()}${expressionNotes()}${result.moments?.length ? coachingCards(result.moments) : `${feedbackItems(result.strengths, '잘 이어간 부분', 'strength')}${feedbackItems(result.improvements, game.mode === 'demo' ? '스스로 돌아보기' : '다르게 해볼 부분', 'improvement')}`}
      ${game.comparison && result.score !== null && game.comparison.score !== null ? `<p class="score-comparison">이전 기술 점수 ${game.comparison.score} · 이번 ${result.score}<br><small>AI 평가의 변동이 있으므로 차이 자체를 실력 향상으로 단정하지 않아요.</small></p>` : ''}</div></div>
    ${comparisonPanel()}<details class="full-transcript"><summary>전체 대화에서 다시 시작할 답장 고르기</summary><div>${game.messages.map(m => bubble(m, { review: true })).join('')}</div></details>${feedbackPanel()}
    <p class="review-footnote">평가 기준은 연구와 사례를 참고해 설계한 초안이에요. 같은 대화도 점수가 달라질 수 있으니 숫자 하나보다 연결된 답장과 행동 제안을 살펴보세요. 사람의 매력이나 실제 상대의 속마음을 판정하지 않아요.</p></div>`;
}

function questPath() {
  const current = game.stage === 'preview' ? 0 : game.stage === 'finished' ? 2 : 1;
  return `<ol class="quest-path" aria-label="연습 진행 단계">${['상황 읽기', '대화해보기', '돌아보기'].map((label, index) => `<li class="${index === current ? 'current' : index < current ? 'done' : ''}" ${index === current ? 'aria-current="step"' : ''}><span>${index < current ? '✓' : `0${index + 1}`}</span>${label}</li>`).join('')}</ol>`;
}

function render() {
  main.dataset.stage = game.stage;
  if (game.stage === 'preview') renderPreview();
  else if (game.stage === 'finished') renderReview();
  else renderChat();
  main.insertAdjacentHTML('afterbegin', questPath());
  main.setAttribute('aria-busy', String(pending));
  if (pending) main.querySelectorAll('button, input, select, textarea, summary').forEach(el => { el.disabled = true; });
}

async function run(task, status = '처리 중…') {
  if (pending) return;
  pending = true; notice.hidden = true;
  const previousStage = game.stage;
  const focusAction = document.activeElement?.dataset.action;
  const focusDelay = document.activeElement?.dataset.delay;
  const controls = [...main.querySelectorAll('button, select, textarea')];
  const disabledBefore = controls.map(el => el.disabled);
  controls.forEach(el => { el.disabled = true; });
  main.setAttribute('aria-busy', 'true');
  const busy = document.createElement('div'); busy.className = 'busy-status'; busy.role = 'status'; busy.textContent = status; main.append(busy);
  try {
    await task(); storeGame(); pending = false; render();
    let focus;
    if (previousStage !== game.stage) {
      focus = main.querySelector('h1');
      if (focus) focus.tabIndex = -1;
    } else if (game.waiting) focus = main.querySelector('[data-action="wait"]');
    else if (focusAction === 'read') focus = document.querySelector(game.turn === 5 ? '[data-action="finish"]' : '#message-input');
    else if (focusAction === 'hint') focus = main.querySelector('[data-action="hint"]');
    else if (game.stage === 'chat' && game.messages.some(m => m.role === 'partner' && m.readAt === null)) focus = main.querySelector('[data-action="read"]');
    else if (focusAction) focus = [...main.querySelectorAll('[data-action]')].find(el => el.dataset.action === focusAction && (!focusDelay || el.dataset.delay === focusDelay));
    focus?.focus({ preventScroll: true });
  }
  catch (error) { showError(error); controls.forEach((el, i) => { el.disabled = disabledBefore[i]; }); }
  finally { pending = false; main.setAttribute('aria-busy', 'false'); busy.remove(); }
}

async function action(name, body = {}) { game = await api(`/api/games/${game.id}/${name}`, body); }

main.addEventListener('change', event => {
  if (event.target.matches('.settings select')) settings[event.target.name] = event.target.value;
  if (event.target.id === 'reply-delay') delayMinutes = Number(event.target.value);
});
main.addEventListener('input', event => { if (event.target.id === 'message-input') inputText = event.target.value; });
main.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || pending || target.disabled) return;
  const name = target.dataset.action;
  if (name === 'emoji') {
    const textarea = document.querySelector('#message-input');
    if (inputText.length + target.dataset.emoji.length <= 400) { textarea.setRangeText(target.dataset.emoji, textarea.selectionStart, textarea.selectionEnd, 'end'); inputText = textarea.value; textarea.focus(); }
    return;
  }
  if (name === 'split') {
    if (inputText.trim() && draft.length < 2) { draft.push(inputText.trim()); inputText = ''; render(); document.querySelector('#message-input').focus(); }
    return;
  }
  if (name === 'remove-draft') { draft.splice(Number(target.dataset.index), 1); render(); return; }
  if (name === 'shuffle' || name === 'home') return run(async () => {
    game = await api('/api/games', settings); draft = []; inputText = ''; delayMinutes = 0; hintOpen = false; topicOpen = false;
  }, '다음 상황 준비 중…');
  if (name === 'start') return run(() => action('start'), '대화 시작 중…');
  if (name === 'read') return run(() => action('read', { delayMinutes: Number(target.dataset.delay) }), '메시지 읽는 중…');
  if (name === 'wait') return run(() => action('wait', { delayMinutes: Number(target.dataset.delay) }), '가상 시간 이동 중…');
  if (name === 'wait-start') return run(async () => { await action('wait-start', { delayMinutes: Number(target.dataset.delay) }); hintOpen = false; topicOpen = false; }, '가상 시간 이동 중…');
  if (name === 'hint') return run(async () => { await action('hint'); hintOpen = !hintOpen; topicOpen = false; }, '대화를 이어갈 실마리 찾는 중…');
  if (name === 'topic') return run(async () => { await action('topic'); topicOpen = !topicOpen; hintOpen = false; }, '이어갈 주제를 찾는 중…');
  if (name === 'finish') return run(() => action('finish'), '다섯 번의 답장을 돌아보는 중…');
  if (name === 'retry') return run(async () => { await action('retry', { turn: Number(target.dataset.turn) }); draft = []; inputText = ''; hintOpen = false; topicOpen = false; delayMinutes = 0; }, '그 순간으로 돌아가는 중…');
});
main.addEventListener('submit', event => {
  if (event.target.id === 'feedback-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    return run(async () => {
      await api('/api/feedback', {
        gameId: game.id, realism: Number(data.get('realism')), helpfulness: Number(data.get('helpfulness')),
        retryIntent: Number(data.get('retryIntent')), blocked: data.has('blocked'), note: String(data.get('note') ?? ''),
      });
      game.feedbackSubmitted = true;
    }, '테스트 의견 저장 중…');
  }
  if (event.target.id !== 'composer') return;
  event.preventDefault();
  const messages = [...draft, ...(inputText.trim() ? [inputText.trim()] : [])];
  if (!messages.length) return;
  run(async () => {
    const previousTurn = game.turn;
    await action('send', { messages, delayMinutes });
    if (game.turn > previousTurn) { draft = []; inputText = ''; }
    hintOpen = false; topicOpen = false; delayMinutes = 0;
  }, game.mode === 'demo' ? '체험 상대의 답장 준비 중…' : `${game.profile.name}의 답장을 기다리는 중…`);
});
main.addEventListener('keydown', event => {
  if (event.target.id === 'message-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing && !pending) { event.preventDefault(); event.target.form.requestSubmit(); }
});

async function boot() {
  try {
    config = await api('/api/config');
    document.querySelector('#mode').textContent = config.mode === 'demo' ? '체험 모드' : 'AI 연결됨';
    let id;
    try { id = sessionStorage.getItem('sai-game'); } catch { /* Storage is optional. */ }
    if (id) { try { game = await api(`/api/games/${id}`); } catch (error) { if (error.status !== 404) throw error; } }
    if (!game) game = await api('/api/games', settings);
    storeGame(); render();
  } catch (error) { main.innerHTML = '<div class="loading"><h1>연결을 확인해 주세요</h1><p>서버를 실행한 뒤 페이지를 새로고침해 주세요.</p></div>'; showError(error); }
}
boot();
