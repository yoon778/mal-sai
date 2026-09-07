const stage = document.querySelector('#stage');
let design = ['a', 'b', 'c'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'a';
let screen = 'chat';
let draft = '';
let sent = '';
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const notes = {
  a: 'A · 연습 노트 — 따뜻한 종이색, 여백, 장면별 복기 · 추천',
  b: 'B · 대화 퀘스트 — 선명한 코랄, 작은 미션, 다음 도전을 부르는 구성',
  c: 'C · 포커스 룸 — 어두운 배경, 넓은 대화 공간, 대화 옆에서 읽는 복기',
};
const logo = '<span class="sai-mark" aria-hidden="true">“</span> 말사이';
const meta = '<span class="meta-pill">소개팅 다음 날</span><span class="meta-pill">편한 반말</span>';
function conversation() {
  return `<div class="thread-top"><span class="avatar">서</span><div><b>서윤</b><small>어제 영화 이야기가 잘 통했던 사이</small></div><span class="dots" aria-hidden="true">···</span></div>
    <div class="thread-messages"><p class="day">오늘 · 저녁 7:12</p><div class="message them"><span>어제 말한 영화 예고편 봤어</span></div><div class="message them"><span>생각보다 재밌어 보이던데 ㅋㅋ</span><small>오후 7:12</small></div><div class="message me"><span>그치 나도 보고 궁금해졌어</span><small>오후 7:13</small></div><div class="message them"><span>주말에 보려고<br>넌 주말에 뭐 해?</span><small>오후 7:14</small></div>${screen === 'review' ? '<div class="message me"><span>무슨 영화 좋아해?</span><small>복기용 예시 답장</small></div>' : sent ? `<div class="message me"><span>${escape(sent)}</span><small>오후 7:15</small></div><p class="sample-sent" role="status">예시 전송 완료 · 복기 화면도 확인해 보세요</p>` : ''}</div>
    <div class="thread-bottom">${screen === 'review' ? '<p class="practice-progress">예시 대화 종료 · 옆의 복기에서 다시 답해볼 수 있어요</p>' : sent ? '<button class="cta wide" data-screen="review">이 대화 복기해보기 ↗</button><button class="quiet-button" data-reset>예시 다시 쓰기</button>' : `<form id="sample-form"><label class="sr-only" for="sample-input">예시 답장</label><textarea id="sample-input" rows="2" maxlength="400" placeholder="나는 이번 주말에…">${escape(draft)}</textarea><div class="input-tools"><span>내 말투로 편하게 답해보세요</span><button class="send-button" type="submit" aria-label="예시 답장 보내기">↑</button></div></form>`}<small class="practice-progress">3 / 5 차례 · 시안용 예시</small></div>`;
}
function moment() {
  return `<div class="moment-label"><span>01 / 놓친 연결고리</span><span class="tag">답하고 이어가기</span></div><h2>질문을 받았다면,<br>내 이야기부터 한 조각</h2><div class="quote-pair"><small>서윤</small><blockquote>주말에 보려고<br>넌 주말에 뭐 해?</blockquote><small>내 답장 · 복기 예시</small><blockquote class="mine">무슨 영화 좋아해?</blockquote></div><p class="reason">영화라는 소재는 이어졌지만, 주말 계획을 묻는 질문에는 답이 없었어요</p><div class="alternative"><span class="overline">다른 답장 예시</span><blockquote>아직 계획 없어 ㅋㅋ<br>너는 토요일에 보려고?</blockquote><small>실제로 주말 계획이 없을 때 쓸 수 있는 예시예요</small></div><div class="next-step"><b>그다음에는</b><p>상대가 날짜를 말하면 내 일정과 맞는지 답해보세요<br>서로 보고 싶어 하는 흐름이면 함께 보자는 제안도 가능해요</p></div><button class="cta" data-retry>이 장면부터 다시 해보기 ↗</button>`;
}
function sideMission() {
  return `<span class="overline">TODAY'S PRACTICE</span><h1>말이 통했던 어제,<br>그다음 한마디</h1><p class="intro">서로 알아가는 사이에는<br>작은 답장에도 다음 이야기가 숨어 있어요</p><div class="scenario-meta">${meta}</div><div class="mission"><span>이번에 연습할 것</span><h3>질문에 답하고<br>내 이야기 더하기</h3><p>다섯 번의 답장을 마친 뒤<br>함께 대화를 돌아봐요</p></div>`;
}
function renderA() {
  return `<div class="concept concept-a"><header class="concept-header"><a href="/" class="wordmark">${logo}</a><span>오늘의 연습 <i>/</i> 나의 대화 노트</span><span class="edition">VOL. 01</span></header>${screen === 'chat' ? `<div class="a-layout"><section class="a-intro">${sideMission()}<div class="note-bottom"><span class="pencil" aria-hidden="true">↳</span><p>잘하려고 애쓰지 않아도 괜찮아요<br>여기는 다시 말해볼 수 있는 곳이니까</p></div></section><section class="thread" aria-label="예시 대화">${conversation()}</section><aside class="margin-note"><span>01</span><p>대화의 시작은<br>기억해 주는 마음</p><div class="line-art" aria-hidden="true">“<br>”</div></aside></div>` : `<div class="a-review"><header><span class="overline">MY CONVERSATION NOTE</span><h1>다음 한마디는,<br>조금 더 편하게</h1><p>오늘은 상대의 질문을 받아주는 연습을 해볼까요</p><div class="summary-stamp">오늘의 발견 <b>내 이야기가 연결의 시작</b></div></header><article class="moment">${moment()}</article></div>`}<footer class="concept-footer"><span>조금 서툴러도, 다시 해볼 수 있는 말사이</span><span>01 — 05</span></footer></div>`;
}
function renderB() {
  return `<div class="concept concept-b"><header class="concept-header"><a href="/" class="wordmark">${logo}</a><span class="quest-label">매일 하나, 대화 자신감 +1</span><span class="level">LEVEL 01</span></header><div class="b-heading"><div><span class="overline">${screen === 'chat' ? '오늘의 대화 퀘스트' : 'QUEST REVIEW'}</span><h1>${screen === 'chat' ? '다음 말이 궁금한<br>사이가 되어볼까?' : '한 번 해봤으니,<br>한 번 더 잘해보자'}</h1></div><div class="ticket"><span>이번 미션</span><b>질문 받고<br>이야기 더하기</b><span>✦ 5번의 답장</span></div></div><div class="quest-path" aria-label="진행 예시"><span class="done">✓ 상황 읽기</span><i></i><span class="${screen === 'chat' ? 'current' : 'done'}">02 대화해보기</span><i></i><span class="${screen === 'review' ? 'current' : ''}">03 돌아보기</span></div>${screen === 'chat' ? `<div class="b-layout"><section class="quest-card"><div class="paper-tab">SCENE 01</div><h2>소개팅 다음 날</h2><p>어제는 영화 얘기로 두 시간이 훌쩍<br>오늘은 서윤이 먼저 연락했어요</p><div class="scenario-meta">${meta}</div><div class="mascot" aria-hidden="true"><div class="speech-shape one">안녕</div><div class="speech-shape two">ㅋㅋ</div><span class="spark">✳</span></div><p class="quest-tip">지금은 내 힘으로 답장하기<br>코칭은 대화를 마친 뒤에 만나요</p></section><section class="thread" aria-label="예시 대화">${conversation()}</section></div>` : `<div class="b-review"><aside class="reward"><span class="reward-star" aria-hidden="true">✷</span><span class="overline">MISSION COMPLETE</span><h2>대화 한 판 완료!</h2><p>오늘 얻은 힌트 하나를<br>다음 답장에서 써먹어봐요</p><span class="reward-badge">+ 내 이야기도 조금</span></aside><article class="moment">${moment()}</article></div>`}</div>`;
}
function renderC() {
  return `<div class="concept concept-c"><aside class="rail"><a href="/" class="wordmark">${logo}</a><span class="overline">WORKSPACE</span><button data-screen="chat" class="rail-item ${screen === 'chat' ? 'selected' : ''}">◉ 대화 연습</button><button data-screen="review" class="rail-item ${screen === 'review' ? 'selected' : ''}">▤ 오늘의 복기</button><div class="rail-bottom"><span class="room-light"></span>나만의 연습 공간</div></aside><div class="focus-main"><header class="focus-header"><span>연습실 <i>/</i> 소개팅 다음 날</span><span class="focus-tag">FOCUS MODE</span></header><div class="focus-title"><span class="overline">${screen === 'chat' ? 'CONVERSATION 001' : 'REVIEW 001'}</span><h1>${screen === 'chat' ? '지금은, 대화에만 집중' : '흐름이 바뀐 순간을 읽다'}</h1><p>상대의 말을 읽고 나다운 답장을 찾아보세요</p></div><div class="c-layout"><section class="thread" aria-label="예시 대화">${conversation()}</section><aside class="${screen === 'review' ? 'moment' : 'context-pane'}">${screen === 'review' ? moment() : `<span class="overline">CONTEXT</span><h2>대화 전 알아둘 것</h2><div class="context-item"><small>우리 사이</small><p>어제 소개팅에서 처음 만남<br>영화 이야기가 잘 통했음</p></div><div class="context-item"><small>대화 방식</small><p>서로 반말하기로 한 사이<br>편하지만 아직 알아가는 중</p></div><div class="context-item"><small>진행</small><p>상대 말 읽기 → 답장 5회 → 복기</p></div><div class="focus-reminder">지금 떠오르는 말을 써보세요<br>다시 답할 기회는 남아 있어요</div>`}</aside></div></div></div>`;
}
function render() {
  document.querySelector('#design-note').textContent = notes[design];
  document.querySelectorAll('[data-design]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.design === design)));
  document.querySelectorAll('.screen-switch [data-screen]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.screen === screen)));
  stage.innerHTML = ({ a: renderA, b: renderB, c: renderC })[design]();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.design) { design = button.dataset.design; history.replaceState(null, '', `#${design}`); }
  else if (button.dataset.screen) screen = button.dataset.screen;
  else if (button.hasAttribute('data-reset') || button.hasAttribute('data-retry')) { sent = ''; draft = ''; screen = 'chat'; }
  else return;
  const outsideStage = !stage.contains(button);
  render();
  if (!outsideStage) (document.querySelector('#sample-input') ?? stage).focus({ preventScroll: true });
});
document.addEventListener('input', event => { if (event.target.id === 'sample-input') draft = event.target.value; });
document.addEventListener('submit', event => {
  if (event.target.id !== 'sample-form') return;
  event.preventDefault();
  if (!draft.trim()) { document.querySelector('#sample-input').focus(); return; }
  sent = draft.trim(); render();
  stage.querySelector('[data-screen="review"]')?.focus({ preventScroll: true });
});
window.addEventListener('hashchange', () => { if (['a', 'b', 'c'].includes(location.hash.slice(1))) { design = location.hash.slice(1); render(); } });
render();
