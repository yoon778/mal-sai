const stage = document.querySelector('#stage');
const concepts = {
  a: { name: '필요한 버튼을, 찾는 자리에서', note: '차분한 블루 · 선명한 도구 모음 · 익숙한 앱 구조', points: ['초기화는 상단 오른쪽에 고정', '힌트와 주제는 입력창 바로 위에', '대화와 상황을 나란히 확인'] },
  b: { name: '말사이다운 재미, 더 분명한 다음 행동', note: '기존 B안 발전 · 따뜻한 코랄 · 한눈에 읽히는 미션', points: ['상단의 독립된 초기화 버튼', '두 개의 큰 도움 버튼과 넉넉한 전송 버튼', '진행 단계와 복기를 하나의 퀘스트로'] },
  c: { name: '대화는 넓게, 도움은 가까이', note: '차분한 세이지 · 메신저 중심 · 접을 수 있는 상황 설명', points: ['메신저 헤더에서 바로 초기화', '하단 도구 모음으로 도움을 빠르게', '대화 옆 복기로 흐름을 놓치지 않게'] },
};
let design = Object.hasOwn(concepts, location.hash.slice(1)) ? location.hash.slice(1) : 'b';
let screen = 'chat', draft = '', sent = '', help = '', delay = '바로', scene = 0;
let toastTimer;
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paths = {
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
  topic: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
  arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2Z"/>',
  shuffle: '<path d="m17 3 4 4-4 4M3 7h3l12 10h3M17 13l4 4-4 4M3 17h3L18 7h3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const control = (action, label, glyph, classes = '', attrs = '') => `<button type="button" data-action="${action}" class="${classes}" ${attrs}>${glyph ? icon(glyph) : ''}${label}</button>`;
const sceneTitle = () => scene ? '오랜만에 먼저 연락하기' : '소개팅 다음 날';
const partnerText = () => scene ? '와 진짜 오랜만이다 ㅋㅋ\n요즘 어떻게 지내?' : '주말에 보려고 ㅋㅋ\n넌 주말에 뭐 해?';
function topbar() {
  return `<header class="app-header"><a href="/" class="wordmark"><span class="sai-mark" aria-hidden="true"><i></i><i></i></span>말사이</a><span class="app-caption">${design === 'b' ? '조금 서툴러도 괜찮아' : '나만의 대화 감각을 찾는 연습'}</span>${control('reset', '초기화', 'reset', 'reset-button')}</header>`;
}
function steps() {
  return `<ol class="steps" aria-label="연습 진행"><li class="done"><span>✓</span>상황 읽기</li><li class="${screen === 'chat' ? 'current' : 'done'}" ${screen === 'chat' ? 'aria-current="step"' : ''}><span>${screen === 'chat' ? '02' : '✓'}</span>대화하기</li><li class="${screen === 'review' ? 'current' : ''}" ${screen === 'review' ? 'aria-current="step"' : ''}><span>03</span>돌아보기</li></ol>`;
}
function mission() {
  return `<section class="mission"><div class="section-label"><span>이번 상황</span><span class="scene-number">${scene ? '02' : '01'} / 13</span></div><h2>${sceneTitle()}</h2><p>${scene ? '어제 우연히 떠오른 사람에게 먼저 연락했어요' : '어제 영화 얘기로 두 시간이 훌쩍<br>오늘은 서윤이 먼저 연락했어요'}</p><div class="tags"><span>알아가는 사이</span><span>편한 반말</span></div><div class="mission-goal"><span>${icon('topic')}오늘 연습할 것</span><strong>질문에 답하고<br>내 이야기 한 조각 더하기</strong></div>${design === 'b' ? '<div class="speech-art" aria-hidden="true"><span>안녕!</span><span>웅 ㅋㅋ</span><i>✳</i></div>' : ''}<div class="progress-heading"><span>나의 답장</span><b>${sent ? 4 : 3}<small> / 5</small></b></div><div class="progress" role="progressbar" aria-label="예시 답장 진행" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${sent ? 4 : 3}">${[1,2,3,4,5].map(n => `<i class="${n <= (sent ? 4 : 3) ? 'filled' : ''}"></i>`).join('')}</div><p class="mission-foot">잘하려고 애쓰지 않아도 괜찮아요<br>여기는 다시 말해볼 수 있는 곳이니까</p>${control('shuffle', '다른 상황 보기', 'shuffle', 'outline full')}</section>`;
}
function helpButtons() {
  return `<div class="help-buttons">${control('hint', '<span>막막할 땐 <b>힌트 보기</b></span>', 'hint', 'help-button', `aria-expanded="${help === 'hint'}" aria-controls="help-content"`)}${control('topic', '<span>말이 끊기면 <b>주제 찾기</b></span>', 'topic', 'help-button', `aria-expanded="${help === 'topic'}" aria-controls="help-content"`)}</div>`;
}
function helpContent() {
  const hint = scene ? '요즘 자주 하는 일 하나를 말해보세요 상대의 근황도 자연스럽게 물어볼 수 있어요' : '주말 계획을 먼저 짧게 답해보세요 영화에 대한 내 생각 하나를 더해도 좋아요';
  const topic = scene ? '최근 즐겨 하는 취미나 새로 가본 장소처럼 가볍게 나눌 수 있는 소재가 좋아요' : '영화에서 주말 취향으로 이어가 보세요 집에서 쉬는 편인지, 밖에 나가는 편인지도 좋은 소재예요';
  return `<div class="help-content" id="help-content" ${help ? '' : 'hidden'}>${help ? `<span class="eyebrow">${help === 'hint' ? '힌트 · 예시' : '대화의 실마리 · 예시'}</span><p>${help === 'hint' ? hint : topic}</p>` : ''}</div>`;
}
function messages(review = false) {
  return `<div class="thread-messages" role="log" aria-label="예시 대화"><p class="day">오늘 · 오후 7:12</p><div class="message"><span>${scene && !review ? '진짜 오랜만이다' : '어제 말한 영화 예고편 봤어'}</span></div><div class="message"><span>${scene && !review ? '지난번에 같이 갔던 카페 지나가다가 생각났어 ㅋㅋ' : '생각보다 재밌어 보이던데 ㅋㅋ'}</span><small>오후 7:12</small></div><div class="message me"><span>${scene && !review ? '나도 가끔 그 카페 생각나 ㅋㅋ' : '그치 나도 보고 궁금해졌어'}</span><small>오후 7:13 · 읽음</small></div><div class="message"><span>${escape(review ? '주말에 보려고 ㅋㅋ\n넌 주말에 뭐 해?' : partnerText())}</span><small>오후 7:14</small></div>${review ? '<div class="message me"><span>무슨 영화 좋아해?</span><small>복기용 고정 예시</small></div>' : sent ? `<div class="message me"><span>${escape(sent)}</span><small>${escape(delay)} 전송 · 시안 예시</small></div>` : ''}</div>`;
}
function thread() {
  return `<section class="thread" aria-label="메신저 시안"><div class="thread-top"><span class="avatar" aria-hidden="true">서</span><div><strong>서윤</strong><small>편한 반말 · 가상 연습 상대</small></div><span class="virtual-clock">${icon('clock')}19:14</span></div>${design === 'c' ? `<details class="inline-scene"><summary>${sceneTitle()} <span>상황 보기</span></summary><p>상대의 질문에 답하고 내 이야기를 더해 보세요</p>${control('shuffle', '다른 상황 보기', 'shuffle', 'outline')}</details>` : ''}${messages()}<div class="thread-bottom">${design !== 'c' ? helpButtons() : ''}${helpContent()}${sent ? `<div class="sent-note">${icon('check')}예시 답장을 보냈어요</div><button type="button" class="solid full" data-screen="review">복기 화면 살펴보기 ${icon('arrow')}</button>` : `<form id="sample-form"><label class="sr-only" for="sample-input">예시 답장 작성</label><textarea id="sample-input" maxlength="400" rows="2" placeholder="내 말투로 편하게 답해보세요">${escape(draft)}</textarea><div class="composer-bottom"><div class="composer-extras">${control('emoji', '☺', '', 'emoji-button', 'aria-label="웃는 이모티콘 넣기"')}<label class="delay">${icon('clock')}<span class="sr-only">답장 시점</span><select id="sample-delay">${['바로','5분 뒤','30분 뒤','2시간 뒤'].map(v => `<option ${delay === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div><button class="solid send" type="submit">보내기 ${icon('arrow')}</button></div></form>`}${design === 'c' ? helpButtons() : ''}<div class="composer-caption"><span>Enter 전송 · Shift+Enter 줄바꿈</span>${control('finish', '여기서 마무리', '', 'finish-button')}</div></div></section>`;
}
function coaching() {
  return `<article class="coaching"><div class="section-label"><span>다시 볼 장면 01</span><span class="soft-tag">답하고 이어가기</span></div><h2>질문을 받았다면,<br>내 이야기부터 한 조각</h2><div class="quote-pair"><small>상대가 물었어요</small><blockquote>넌 주말에 뭐 해?</blockquote><small>내 답장 · 고정된 복기 예시</small><blockquote class="my-quote">무슨 영화 좋아해?</blockquote></div><p>영화라는 소재는 이어졌지만, 주말 계획을 묻는 질문에는 답이 없었어요</p><div class="alternative"><span class="eyebrow">이렇게 표현할 수도 있어요</span><blockquote>아직 계획 없어 ㅋㅋ<br>너는 토요일에 보려고?</blockquote><small>실제로 주말 계획이 없을 때 쓸 수 있는 예시예요</small></div>${control('retry', '이 장면부터 다시 답하기', 'reset', 'solid full')}<p class="review-disclaimer">시안용 고정 피드백이에요 방금 작성한 답장을 평가한 결과가 아니에요</p></article>`;
}
function render() {
  document.body.dataset.design = design;
  document.querySelector('#design-title').textContent = concepts[design].name;
  document.querySelector('#design-note').textContent = concepts[design].note;
  document.querySelectorAll('[data-design]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.design === design)));
  document.querySelectorAll('.screen-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.screen === screen)));
  const lead = `<div class="quest-lead"><div><span class="eyebrow">${screen === 'chat' ? '오늘의 대화 퀘스트' : '오늘의 대화, 다시 보기'}</span><h2>${screen === 'chat' ? '다음 말이 궁금한<br>사이가 되어볼까?' : '다음 한마디는,<br>조금 더 편하게'}</h2></div><div class="quest-stamp"><span>오늘의 목표</span><strong>나다운 표현<br>한 가지 발견</strong><span>최대 5번의 답장</span></div></div>`;
  stage.innerHTML = `<div class="concept concept-${design}">${topbar()}${design === 'b' ? lead : ''}${steps()}${screen === 'chat' ? `<div class="practice-layout">${design !== 'c' ? mission() : ''}${thread()}${design === 'c' ? '<aside class="focus-note"><span class="eyebrow">지금은 대화에 집중</span><h2>정답보다,<br>나다운 한마디</h2><p>막막해지면 입력창 아래<br>힌트와 주제 찾기를 눌러보세요</p><div class="focus-line" aria-hidden="true">“</div><small>실제 연습에서는 대화 후<br>잘한 점과 바꿔볼 점을 만나요</small></aside>' : ''}</div>` : `<div class="review-layout">${design === 'c' ? `<section class="review-transcript"><h2>${icon('book')}대화 다시 읽기</h2>${messages(true)}</section>` : `<aside class="review-intro"><div class="completion-mark" aria-hidden="true">${icon('check')}</div><span class="eyebrow">대화 한 판 완료</span><h2>한 번 해봤으니,<br>한 번 더 편해질 거예요</h2><p>오늘 얻은 힌트 하나를<br>다음 답장에서 써먹어봐요</p><span class="soft-tag">내 이야기도 조금</span></aside>`}${coaching()}</div>`}</div>`;
  document.querySelector('#rationale').innerHTML = concepts[design].points.map((p,i) => `<div><span>0${i+1}</span><p>${escape(p)}</p></div>`).join('');
  if (sent && screen === 'chat') { const log = stage.querySelector('.thread-messages'); log.scrollTop = log.scrollHeight; }
}
function notify(message) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#sample-status'); toast.textContent = message; toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function focusAction(action) { stage.querySelector(`[data-action="${action}"]`)?.focus({ preventScroll: true }); }
document.addEventListener('click', event => {
  const b = event.target.closest('button'); if (!b) return;
  if (b.dataset.design) { design = b.dataset.design; history.replaceState(null, '', `#${design}`); render(); return; }
  if (b.dataset.screen) { const inside = stage.contains(b); screen = b.dataset.screen; render(); if (inside) { const h = stage.querySelector('h2'); h.tabIndex = -1; h.focus({ preventScroll: true }); } return; }
  const action = b.dataset.action;
  if (action === 'reset') { const dialog = document.querySelector('#reset-dialog'); dialog.returnValue = ''; dialog.showModal(); return; }
  if (action === 'hint' || action === 'topic') { help = help === action ? '' : action; render(); focusAction(action); }
  if (action === 'emoji') { draft = (draft + '🙂').slice(0,400); const input = document.querySelector('#sample-input'); input.value = draft; input.focus(); }
  if (action === 'shuffle') { scene = 1 - scene; help = ''; sent = ''; draft = ''; render(); if (design === 'c') stage.querySelector('.inline-scene').open = true; focusAction('shuffle'); notify('다른 상황의 예시로 바뀌었어요'); }
  if (action === 'retry') { screen = 'chat'; scene = 0; sent = ''; draft = ''; help = ''; render(); document.querySelector('#sample-input').focus({ preventScroll: true }); }
  if (action === 'finish') { screen = 'review'; render(); const h = stage.querySelector('.coaching h2'); h.tabIndex = -1; h.focus({ preventScroll: true }); }
});
document.querySelector('#reset-dialog').addEventListener('close', event => {
  if (event.target.returnValue !== 'reset') return;
  screen = 'chat'; draft = ''; sent = ''; help = ''; scene = 0; delay = '바로'; render(); focusAction('reset'); notify('예시 대화를 초기화했어요');
});
document.addEventListener('input', e => { if (e.target.id === 'sample-input') draft = e.target.value; });
document.addEventListener('change', e => { if (e.target.id === 'sample-delay') delay = e.target.value; });
document.addEventListener('keydown', e => { if (e.target.id === 'sample-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); } });
document.addEventListener('submit', e => {
  if (e.target.id !== 'sample-form') return;
  e.preventDefault(); if (!draft.trim()) { document.querySelector('#sample-input').focus(); notify('보낼 답장을 적어주세요'); return; }
  sent = draft.trim(); draft = ''; render(); stage.querySelector('.thread [data-screen="review"]').focus({ preventScroll: true }); notify('예시 전송 완료 · 실제 AI 호출 없음');
});
window.addEventListener('hashchange', () => { design = Object.hasOwn(concepts, location.hash.slice(1)) ? location.hash.slice(1) : 'b'; render(); });
render();
