import { apiOrigin, authorization, initializePlatform, savedGame, rememberGame, forgetGame, closeApp } from './platform.js';
const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
let config, game, pending = false, draft = [], inputText = '', delayMinutes = 0, hintOpen = false, topicOpen = false;
let settings = { gender: 'random', speech: 'random', interest: 'random', initiative: 'random', humor: 'random', channel: 'random', scenarioId: 'random' };
let pendingOperation = null, drillText = '';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const button = (action, text, className = '', attrs = '') => `<button type="button" data-action="${action}" class="${className}" ${attrs}>${text}</button>`;
const actionIcon = name => {
  const paths = {
    hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
    topic: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    history: '<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2Z"/>',
    send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  };
  return `<svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const clock = minutes => {
  const total = game.startMinute + minutes;
  const day = Math.floor(total / 1440);
  const hour = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const minute = ((total % 60) + 60) % 60;
  return `${day > 0 ? `${day}일 후 ` : ''}${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

async function api(path, body) {
  const response = await fetch(apiOrigin + path, { signal: AbortSignal.timeout(body === undefined ? 15000 : 75000), headers: { ...authorization(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error ?? '요청을 처리하지 못했어요.'); error.status = response.status; throw error; }
  return result;
}

function showError(error) { notice.textContent = error.message; notice.hidden = false; }
async function storeGame() { try { await rememberGame(game.id); } catch { showError(new Error('이 기기에 마지막 연습을 기억하지 못했어요 기록 메뉴에서 다시 열 수 있어요')); } }

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
      <p class="intro-copy">상황 하나, 최대 다섯 번의 답장<br>부담 없이 연습하고 나만의 대화 감각을 찾아요</p>
      <section class="quest-ticket" aria-label="이번 미션"><span>이번 미션</span><strong>${escape(game.scenario.goal)}</strong><small>최대 5번의 답장 · 나다운 표현 찾기</small></section>
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
    <section class="scenario-preview" aria-label="대화 시작 준비"><div class="scenario-heading"><span class="eyebrow">오늘의 상황</span>${button('shuffle', '↻ 다른 상황 뽑기', 'secondary quick-reset')}</div>
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
    <p class="eyebrow">${escape(game.scenario.label)}</p><h1>${escape(game.scenario.title)}</h1><details class="scene-details"><summary>상황 다시 보기</summary><p>${escape(game.scenario.context)}</p></details>
    <div class="goal"><span>이번 연습의 목표</span><strong>${escape(game.scenario.goal)}</strong></div>
    <div class="progress-label"><strong>나의 답장</strong><span>${game.turn} / 5</span></div><div class="progress" role="progressbar" aria-label="답장 진행" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${game.turn}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= game.turn ? 'filled' : ''}"></i>`).join('')}</div>
    <p class="quiet">말풍선을 나눠 보내도 한 번의 답장이에요.<br>가상 시간은 실제로 기다리지 않아요.</p>
    <p class="atmosphere"><span>가상 대화 분위기</span>${escape(game.atmosphere)}</p>${game.comparison ? '<div class="retry-note">다시 연습하는 중<br><small>바꾼 답장과 이전 반응을 비교해보세요</small></div>' : ''}
    ${modeNote()}</aside>
    <section class="chat-window" aria-label="메신저 대화"><div class="chat-heading"><span class="avatar">${escape(game.profile.name.slice(-1))}</span><div><strong>${escape(game.profile.name)}</strong><span>${escape(game.profile.gender === 'female' ? '여성' : '남성')} · ${escape(game.profile.speechStyle)}</span></div><span class="virtual-clock">가상 시간 <b>${clock(game.minute)}</b></span></div>
      <div class="chat-messages" id="chat-scroll" role="log" aria-label="대화 기록" aria-live="polite"><div class="history-divider">${escape(game.scenario.historyLabel)}</div>${game.messages.filter(m => m.background).map(m => bubble(m)).join('')}<div class="history-divider">연습 시작 · ${game.channel === 'instagram' ? '인스타 DM' : '카톡'}</div>${storyPanel()}${game.messages.filter(m => !m.background).map(m => bubble(m)).join('')}${!game.messages.some(m => !m.background) ? '<p class="end-note">이전 대화를 떠올리며, 먼저 한마디 건네보세요</p>' : ''}${unreadPanel()}${ended && !unread ? '<p class="end-note">다섯 번의 답장을 마쳤어요. 이제 함께 돌아볼까요?</p>' : ''}</div>
      <div class="composer-area">${ended ? button('finish', '대화 복기하기 ↗', 'primary wide', unread ? 'disabled' : '') : `
        <div class="composer-toolbar"><div class="coach-actions">${button('hint', `${actionIcon('hint')}<span><small>막막할 땐</small><strong>힌트 보기</strong></span>`, `coach-card ${hintOpen ? 'selected' : ''}`, `aria-expanded="${hintOpen}" aria-controls="hint-panel" ${unread ? 'disabled' : ''}`)}${button('topic', `${actionIcon('topic')}<span><small>말이 끊기면</small><strong>주제 찾기</strong></span>`, `coach-card ${topicOpen ? 'selected' : ''}`, `aria-expanded="${topicOpen}" aria-controls="topic-panel" ${unread ? 'disabled' : ''}`)}</div><label class="delay-label">답장 시점<select id="reply-delay" ${unread ? 'disabled' : ''}>${[[0, '바로'], [5, '5분 뒤'], [30, '30분 뒤'], [120, '2시간 뒤']].map(([v, t]) => `<option value="${v}" ${delayMinutes === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        <div id="hint-panel" class="hint" ${hintOpen && game.hint ? '' : 'hidden'}>${hintOpen && game.hint ? `<span>이런 방향은 어때요?</span><p>${escape(game.hint)}</p><small>힌트는 감점 없이 볼 수 있어요 · ${game.totalHints}회 사용</small>` : ''}</div>
        <div id="topic-panel" class="topic-help" ${topicOpen && game.topicHelp ? '' : 'hidden'}>${topicOpen && game.topicHelp ? `<span>대화 연결 연습</span><dl><div><dt>꺼낼 주제</dt><dd>${escape(game.topicHelp.topic)}</dd></div><div><dt>이렇게 연결</dt><dd>${escape(game.topicHelp.bridge)}</dd></div><div><dt>답을 받으면</dt><dd>${escape(game.topicHelp.next)}</dd></div><div><dt>피할 방식</dt><dd>${escape(game.topicHelp.avoid)}</dd></div></dl><small>그대로 복사하기보다 내 말투로 바꿔보세요 · ${game.totalTopicHelps}회 사용</small>` : ''}</div>
        <div class="draft-bubbles">${draft.map((text, i) => `<div class="draft-bubble"><span>${escape(text)}</span>${button('remove-draft', '×', 'text-button', `data-index="${i}" aria-label="작성 중인 말풍선 ${i + 1} 삭제"`)}</div>`).join('')}</div>
        <form id="composer"><label class="sr-only" for="message-input">답장 작성</label><textarea id="message-input" maxlength="400" rows="2" placeholder="${game.waiting ? '상대의 답장을 기다리는 중이에요' : unread ? '새 메시지를 먼저 읽어주세요' : '나답게, 편하게 답해보세요'}" ${unread ? 'disabled' : ''}>${escape(inputText)}</textarea><div class="composer-bottom"><div class="emoji-row" aria-label="이모티콘">${['🙂', '😂', '🥲', '👍', '☕'].map(emoji => button('emoji', emoji, 'emoji', `data-emoji="${emoji}" aria-label="${emoji} 넣기" ${unread ? 'disabled' : ''}`)).join('')}</div><div>${button('split', '+ 나눠쓰기', 'text-button', unread || draft.length >= 2 ? 'disabled' : '')}<button type="submit" class="primary send" ${unread ? 'disabled' : ''}>보내기 ${actionIcon('send')}</button></div></div></form>
        <div class="composer-help"><span>Enter 전송 · Shift+Enter 줄바꿈</span><span>말풍선당 400자</span></div>${game.turn > 0 && !unread ? button('finish-early', '여기서 잘 마무리하기', 'text-button') : ''}`}
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
  if (game.stage === 'finished') {
    if (game.finishedEarly) main.insertAdjacentHTML('afterbegin', `<p class="mode-note">${game.turn}번 답장 후 마무리했어요 · 짧은 대화에서 관찰한 내용만 복기해요</p>`);
    main.insertAdjacentHTML('beforeend', drillPanel());
  }
  main.insertAdjacentHTML('afterbegin', questPath());
  main.insertAdjacentHTML('afterbegin', `<nav class="practice-tools" aria-label="기록과 도움말"><div class="practice-links">${button('history', `${actionIcon('history')}연습 기록`, 'history-shortcut')}<details class="practice-menu"><summary>도움말${game.stage !== 'preview' ? ' · 제보' : ''}</summary><div>${button('privacy', '데이터 안내', 'text-button')}${game.stage !== 'preview' ? button('report', '답장 신고', 'text-button') : ''}${game.turn > 0 ? button('quality', '어색한 답장 제보', 'text-button') : ''}</div></details></div>${game.stage === 'chat' ? button('home', `${actionIcon('reset')}새 연습`, 'secondary quick-reset', 'title="현재 연습은 기록에 남고, 새 상황으로 시작해요"') : ''}</nav>`);
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
    await task(); await storeGame(); pending = false; render();
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
  catch (error) {
    if (error.stateChanged) { pending = false; render(); }
    else controls.forEach((el, i) => { el.disabled = disabledBefore[i]; });
    showError(error);
  }
  finally { pending = false; main.setAttribute('aria-busy', 'false'); busy.remove(); }
}

async function action(name, body = {}) {
  const gameId = game.id, revision = game.revision ?? 0;
  const key = JSON.stringify({ gameId, name, body });
  if (pendingOperation?.key !== key) pendingOperation = { key, input: { ...body, expectedRevision: revision, requestId: crypto.randomUUID() } };
  const operation = pendingOperation;
  try { game = await api(`/api/games/${gameId}/${name}`, operation.input); pendingOperation = null; }
  catch (error) {
    try {
      const current = await api(`/api/games/${gameId}`);
      if (current.completedRequestIds?.includes(operation.input.requestId)) { game = current; pendingOperation = null; return; }
      if (current.revision !== revision) { game = current; error.stateChanged = true; pendingOperation = null; }
    } catch { /* Keep the same operation ID while the outcome is uncertain. */ }
    if (error.status && error.status < 500 && error.status !== 409) pendingOperation = null;
    throw error;
  }
}

main.addEventListener('change', event => {
  if (event.target.matches('.settings select')) settings[event.target.name] = event.target.value;
  if (event.target.id === 'reply-delay') delayMinutes = Number(event.target.value);
});
main.addEventListener('input', event => { if (event.target.id === 'message-input') inputText = event.target.value; if (event.target.id === 'drill-input') drillText = event.target.value; });
main.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || pending || target.disabled) return;
  const name = target.dataset.action;
  if (name === 'reconnect') return boot();
  if (name === 'history') return showHistory();
  if (name === 'privacy') return showPrivacy();
  if (name === 'report') return showReport();
  if (name === 'quality') return showQualityReport();
  if (name === 'drill') return run(() => action('drill'), '복습 상황 준비 중…');
  if (name === 'finish-early') {
    const element = dialog('여기서 마무리할까요?', '<p>관찰된 답장만 복기해요 짧게 끝냈다는 이유만으로 감점하지 않아요</p><button id="confirm-finish" class="primary">마무리하고 복기하기</button>');
    element.querySelector('#confirm-finish').onclick = () => { element.close(); run(() => action('finish', { early: true }), '대화를 돌아보는 중…'); };
    return;
  }
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
    if (name === 'shuffle' && game.stage === 'preview') {
      try { await action('shuffle', settings); }
      catch (error) {
        if (error.status !== 404) throw error;
        game = await api('/api/games', settings);
      }
    } else game = await api('/api/games', settings);
    draft = []; inputText = ''; drillText = ''; delayMinutes = 0; hintOpen = false; topicOpen = false; pendingOperation = null;
  }, '다음 상황 준비 중…');
  if (name === 'start') return run(() => action('start'), '대화 시작 중…');
  if (name === 'read') return run(() => action('read', { delayMinutes: Number(target.dataset.delay) }), '메시지 읽는 중…');
  if (name === 'wait') return run(() => action('wait', { delayMinutes: Number(target.dataset.delay) }), '가상 시간 이동 중…');
  if (name === 'wait-start') return run(async () => { await action('wait-start', { delayMinutes: Number(target.dataset.delay) }); hintOpen = false; topicOpen = false; }, '가상 시간 이동 중…');
  if (name === 'hint') {
    if (hintOpen || game.hint) { hintOpen = !hintOpen; topicOpen = false; render(); return; }
    return run(async () => { await action('hint'); hintOpen = true; topicOpen = false; }, '대화를 이어갈 실마리 찾는 중…');
  }
  if (name === 'topic') {
    if (topicOpen || game.topicHelp) { topicOpen = !topicOpen; hintOpen = false; render(); return; }
    return run(async () => { await action('topic'); topicOpen = true; hintOpen = false; }, '이어갈 주제를 찾는 중…');
  }
  if (name === 'finish') return run(() => action('finish'), '다섯 번의 답장을 돌아보는 중…');
  if (name === 'retry') return run(async () => { await action('retry', { turn: Number(target.dataset.turn) }); draft = []; inputText = ''; hintOpen = false; topicOpen = false; delayMinutes = 0; }, '그 순간으로 돌아가는 중…');
});
main.addEventListener('submit', event => {
  if (event.target.id === 'drill-form') {
    event.preventDefault();
    return run(async () => { await action('drill-answer', { answer: drillText }); drillText = ''; }, '복습 답장을 돌아보는 중…');
  }
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
  if (pending) return;
  pending = true;
  notice.hidden = true;
  main.setAttribute('aria-busy', 'true');
  main.innerHTML = '<div class="loading">대화 준비 중…</div>';
  try {
    await initializePlatform(() => {
      const openDialog = document.querySelector('dialog[open]');
      if (openDialog) return openDialog.close();
      if (pending) return;
      if (!game || game.stage === 'preview') closeApp().catch(showError);
      else {
        const element = dialog('연습을 잠시 나갈까요?', '<p>보낸 대화는 내 연습 기록에서 다시 열 수 있어요 작성 중인 답장은 사라져요</p><button class="primary" id="return-home">처음으로</button>');
        element.querySelector('#return-home').onclick = async () => {
          element.close();
          await run(async () => { game = await api('/api/games', settings); draft = []; inputText = ''; hintOpen = false; topicOpen = false; });
        };
      }
    });
    config = await api('/api/config');
    document.querySelector('#mode').textContent = config.mode === 'demo' ? '체험 모드' : 'AI 연결됨';
    let id;
    try { id = await savedGame(); } catch { /* History remains available from the server. */ }
    if (id) { try { game = await api(`/api/games/${id}`); } catch (error) { if (error.status !== 404) throw error; game = null; } }
    if (!game) {
      const history = await api('/api/history');
      if (history.length) game = await api(`/api/games/${history[0].id}`);
    }
    if (!game) game = await api('/api/games', settings);
    await storeGame(); pending = false; render();
  } catch (error) {
    main.innerHTML = `<div class="loading"><h1>연결을 확인해 주세요</h1><p>잠시 연결하지 못했어요. 다시 시도해 주세요.</p>${button('reconnect', '다시 연결하기', 'primary')}</div>`;
    showError(error);
  } finally { pending = false; main.setAttribute('aria-busy', 'false'); }
}
function dialog(title, content) {
  document.querySelector('dialog')?.remove();
  const element = document.createElement('dialog');
  element.className = 'account-dialog';
  element.setAttribute('aria-labelledby', 'dialog-title');
  element.innerHTML = `<h2 id="dialog-title">${title}</h2>${content}<form method="dialog"><button class="secondary">닫기</button></form>`;
  document.body.append(element); element.showModal();
  return element;
}
async function showHistory() {
  if (pending) return;
  pending = true;
  try {
    const records = await api('/api/history');
    const element = dialog('내 연습 기록', `<p>최근 30일 기록 · 최대 100개</p><div class="history-list">${records.map(item => `<button class="secondary" data-game="${escape(item.id)}">${escape(item.title)}<small>${new Date(item.createdAt).toLocaleDateString('ko-KR')} · ${item.stage === 'finished' ? '복기 완료' : `${item.turn}/5 답장`}</small></button>`).join('') || '<p>저장된 연습이 없어요</p>'}</div><button class="text-button" id="delete-records">전체 기록 삭제</button>`);
    element.addEventListener('click', async event => {
      const id = event.target.closest('[data-game]')?.dataset.game;
      if (id) { element.close(); await run(async () => { game = await api(`/api/games/${id}`); draft = []; inputText = ''; drillText = ''; delayMinutes = 0; hintOpen = false; topicOpen = false; pendingOperation = null; }); }
      if (event.target.id === 'delete-records') {
        element.close();
        const confirmation = dialog('기록을 모두 삭제할까요?', '<p>대화·평가·의견·신고가 삭제되며 되돌릴 수 없어요 이용 횟수는 초기화되지 않아요</p><button class="primary" id="confirm-delete">전체 삭제</button>');
        confirmation.querySelector('#confirm-delete').onclick = async () => {
          if (pending) return;
          pending = true;
          confirmation.querySelector('#confirm-delete').disabled = true;
          try { await api('/api/account/delete', {}); await forgetGame(); game = null; draft = []; inputText = ''; confirmation.close(); pending = false; await boot(); }
          catch (error) { showError(error); confirmation.querySelector('#confirm-delete').disabled = false; }
          finally { pending = false; }
        };
      }
    });
  } catch (error) { showError(error); }
  finally { pending = false; }
}
function drillPanel() {
  const drill = game.drill;
  if (!drill) return `<section class="transfer-practice"><p class="eyebrow">한 문장 복습</p><h2>다른 상황에서도 써볼까요?</h2><p>방금 돌아본 대화 기술 하나를 새로운 상황에 적용해 봐요</p>${button('drill', '새 상황으로 한 문장 복습', 'primary')}</section>`;
  return `<section class="transfer-practice"><p class="eyebrow">한 문장 복습 · 점수 없는 연습</p><h2>${escape(drill.title)}</h2><p>${escape(drill.context)}</p><blockquote>${escape(drill.partner)}</blockquote><p class="quiet">목표: ${escape(drill.focus)}</p>${drill.feedback ? `<div class="drill-feedback"><h3>내 답장</h3><blockquote>${escape(drill.answer)}</blockquote><p>${escape(drill.feedback.observation)}</p><h3>${game.mode === 'demo' ? '직접 확인해 보기' : '이렇게 표현할 수도 있어요'}</h3><p>${escape(drill.feedback.suggestion)}</p></div>` : `<form id="drill-form"><label for="drill-input">나라면 이렇게 답할래요</label><textarea id="drill-input" maxlength="400" rows="3" required>${escape(drillText)}</textarea><button class="primary">복습 답장 확인</button></form>`}</section>`;
}
function showQualityReport() {
  const messages = game.messages.filter(m => m.role === 'partner' && !m.background && m.readAt !== null);
  const element = dialog('어떤 점이 어색했나요?', `<form id="quality-form"><label>제보할 내용<select name="messageId" required>${game.stage === 'finished' ? '<option value="evaluation">이번 대화의 평가</option>' : ''}${messages.map(m => `<option value="${escape(m.id)}">${escape(m.text.slice(0, 60))}</option>`).join('')}</select></label><label>이유<select name="reason"><option value="style">말투가 부자연스러워요</option><option value="role">누구의 이야기인지 혼동했어요</option><option value="time">시간이나 일정이 맞지 않아요</option><option value="evaluation">평가를 납득하기 어려워요</option></select></label><label class="quality-consent"><input type="checkbox" name="consent" required>이 연습에서 공개된 대화·상황과 선택한 평가를 품질 검토용으로 제공하는 데 동의해요</label><p class="quiet">모델·프롬프트 버전과 함께 암호화해 30일간 보관해요 기록 전체 삭제 시 함께 삭제돼요 자동 모델 학습에는 사용하지 않아요</p><button class="primary" ${messages.length || game.stage === 'finished' ? '' : 'disabled'}>품질 제보 보내기</button></form>`);
  const gameId = game.id;
  element.querySelector('#quality-form').onsubmit = async event => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.target), submit = event.target.querySelector('button');
    pending = true; submit.disabled = true;
    try { await api('/api/quality', { gameId, messageId: data.get('messageId'), reason: data.get('reason'), consent: data.has('consent') }); element.close(); notice.textContent = '품질 제보가 접수됐어요'; notice.hidden = false; }
    catch (error) { showError(error); submit.disabled = false; }
    finally { pending = false; }
  };
}
function showPrivacy() {
  dialog('대화와 기록 안내', '<p>입력한 대화와 연습 맥락은 OpenAI로 전송되어 답장·평가·복습·안전 확인에 사용돼요 실제 사람의 개인정보는 입력하지 마세요</p><p>서버에는 대화·진행 상황·평가·의견·신고와 별도로 동의한 품질 제보의 대화 맥락을 암호화해 30일간 저장해요 내 연습 기록에서 전체 삭제할 수 있어요 이용 횟수는 최대 3일간 유지돼요</p><p>현재 출시 준비 단계예요 운영자 정보와 정식 개인정보 처리방침 확정 후 공개돼요</p>');
}
function showReport() {
  const messages = game.messages.filter(m => m.role === 'partner' && !m.background && m.readAt !== null);
  const element = dialog('답장 신고', `<p>선택한 AI 답장과 신고 이유만 암호화해 저장해요</p><form id="report-form"><label>신고할 답장<select name="messageId" required>${messages.map(m => `<option value="${escape(m.id)}">${escape(m.text.slice(0, 60))}</option>`).join('')}</select></label><label>이유<select name="reason"><option value="unsafe">위험하거나 부적절한 내용</option><option value="uncomfortable">불쾌한 표현</option><option value="incorrect">잘못된 안내</option></select></label><button class="primary" ${messages.length ? '' : 'disabled'}>신고 접수</button></form>`);
  element.querySelector('#report-form').onsubmit = async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    const submit = event.target.querySelector('button'); submit.disabled = true;
    const data = new FormData(event.target);
    try { await api('/api/reports', { gameId: game.id, messageId: data.get('messageId'), reason: data.get('reason') }); element.close(); notice.textContent = '신고가 접수됐어요'; notice.hidden = false; }
    catch (error) { showError(error); submit.disabled = false; }
    finally { pending = false; }
  };
}
boot();
