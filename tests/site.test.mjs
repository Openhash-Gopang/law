// 나비로 Navi Law 사이트 시험 — 실행: npm test   (jsdom 필요: npm install)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildDocsDb } from '../scripts/build-docs-index.mjs';

const CORE = buildDocsDb({ forms: [], issued: [], court: [] });   // 법제처 민원서식·발급 서류·법원 양식 데이터와 무관하게 화면 동작을 시험한다

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const js = read('assets/law.js');

export function load(page, search = '', hash = '', store = {}, db = CORE, pre = null) {
  const html = read(page).replace(/<script[^>]*src="https:[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://law.hondi.net/' + page + search + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, JSON.stringify(v));
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(u === 'data/docs.json' ? db : JSON.parse(read(u))) });
  w.Element.prototype.scrollIntoView = function () {};
  if (pre) pre(w);
  w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); };
  w.eval(read('assets/docs-search.js'));
  w.eval(js.replace(/^\/\*[\s\S]*?\*\//, ''));
  return dom;
}
const tick = () => new Promise((r) => setTimeout(r, 40));

test('데이터: 법무사 12분류 98종, 변호사 8분류 61종·세부 분야 46개', () => {
  const s = JSON.parse(read('data/scrivener.json')), l = JSON.parse(read('data/lawyer.json'));
  assert.equal(s.catalog.length, 12);
  assert.equal(s.catalog.reduce((n, c) => n + c.items.length, 0), 98);
  assert.equal(l.catalog.length, 8);
  assert.equal(l.catalog.reduce((n, c) => n + c.items.length, 0), 61);
  assert.equal(l.fields.length, 46);
  for (const f of l.fields) assert.ok(/^lawyer-[a-z-]+$/.test(f.id) && f.forms.length >= 5, f.id);
});

test('직역 구분 제거: 화면 어디에도 변호사/법무사 선택·표시가 없다', () => {
  for (const p of ['docs.html', 'write.html']) assert.ok(!/변호사|법무사/.test(read(p).replace(/<footer[\s\S]*?<\/footer>/, '')), p);
  const home = read('index.html').replace(/<meta[^>]*>/g, '');
  assert.ok(!/class="door|data-persona|변호사 보조|법무사 보조/.test(home));
  assert.ok(!/변호사|법무사/.test(read('assets/law.css')));
  const nav = read('index.html').match(/<nav[\s\S]*?<\/nav>/)[0];
  assert.ok(!/변호사|법무사/.test(nav));
  for (const old of ['lawyer.html', 'scrivener.html']) assert.match(read(old), /url=docs\.html/, old + ' 는 서류 목록으로 보낸다');
});

test('질문 → 엔진: 서류 DB에서 찾으면 그 서류의 엔진, 아니면 질문 내용, 모르면 변호사 엔진(어느 쪽이든 모든 서류를 쓴다)', async () => {
  const w = load('write.html').window; await tick();
  const idx = w.NaviLawDocs.createIndex(CORE), pick = (t) => w.NaviLaw.pickEngine(idx, t);
  assert.equal(pick('근저당권 말소등기 신청서 작성'), 'judicial-scrivener');
  assert.equal(pick('개인회생'), 'judicial-scrivener');
  assert.equal(pick('변호인선임서'), 'lawyer');
  assert.ok(['lawyer', 'judicial-scrivener'].includes(pick('내용증명 작성')), '두 목록에 모두 있는 서류는 어느 엔진이든 쓴다');
  assert.equal(pick('농지취득자격증명'), 'lawyer');
  assert.equal(pick('농지 경매 입찰'), 'judicial-scrivener');
  assert.equal(pick(''), 'lawyer');
});

test('홈: 입력하면 질문 그대로 작성 화면으로 간다(직역 선택 없음)', () => {
  const w = load('index.html').window; let went = ''; w.NaviLaw.go = (u) => { went = u; };
  w.document.getElementById('askInput').value = '소장 작성';
  w.document.getElementById('askForm').requestSubmit();
  assert.equal(went, 'write.html?q=' + encodeURIComponent('소장 작성'));
  assert.equal(w.document.querySelectorAll('.door').length, 0);
});

test('서류 목록: 20개 분류 159종이 한 목록, 서류마다 초안 작성 링크, 분야 12개 + 전체 보기', async () => {
  const w = load('docs.html').window; await tick();
  assert.equal(w.document.querySelectorAll('#tabs .tab').length, 20);
  assert.match(w.document.getElementById('countLine').textContent, /20개 분류, 159종/);
  assert.ok(w.document.querySelector('#listBox .item a.btn').getAttribute('href').startsWith('write.html?persona=judicial-scrivener&doc='));
  const tabs = [...w.document.querySelectorAll('#tabs .tab')]; tabs[12].click();
  assert.ok(w.document.querySelector('#listBox .item a.btn').getAttribute('href').startsWith('write.html?persona=lawyer&doc='));
  assert.equal(w.document.querySelectorAll('#fieldsBox .field').length, 12);
  w.document.getElementById('moreBtn').click();
  assert.equal(w.document.querySelectorAll('#fieldsBox .field').length, 46);
});

test('서류 목록: 분야를 고르면 그 분야 서류·기한이 나오고 모든 초안 작성 링크가 그 분야 엔진을 쓴다', async () => {
  const w = load('docs.html', '?field=lawyer-civil').window; await tick(); await tick();
  assert.ok(w.document.querySelector('#fieldDetail table a.btn').getAttribute('href').startsWith('write.html?persona=lawyer-civil&doc='));
  assert.ok(w.document.querySelector('#listBox .item a.btn').getAttribute('href').includes('persona=lawyer-civil'));
  assert.ok(w.document.querySelector('#fieldDetail details'));
  assert.match(w.document.getElementById('otherDoc').getAttribute('href'), /persona=lawyer-civil/);
});

test('작성 화면: 엔진은 숨기고 이름은 "서류 보조"로 끼운다 — 잘못된 persona는 질문으로 다시 정한다', async () => {
  let w = load('write.html', '?doc=' + encodeURIComponent('근저당권설정등기신청서')).window; await tick();
  assert.equal(w.document.getElementById('chatFrame').src, 'https://hondi.net/pages/expert-chat.html?persona=judicial-scrivener&embed=1&label=' + encodeURIComponent('서류 보조'));
  assert.equal(w.document.getElementById('h1').textContent, '서류 작성');
  w = load('write.html', '?persona=evil&q=' + encodeURIComponent('답변서 작성')).window; await tick();
  assert.match(w.document.getElementById('chatFrame').src, /persona=(lawyer|judicial-scrivener)&embed=1/);
  assert.doesNotMatch(w.document.getElementById('chatFrame').src, /evil/);
  w = load('write.html', '?persona=lawyer-civil&doc=소장').window; await tick();
  assert.match(w.document.getElementById('h1').textContent, /서류 작성 · 민사법/);
  assert.equal(w.document.getElementById('back').getAttribute('href'), 'docs.html?field=lawyer-civil');
  w = load('write.html').window; await tick();
  assert.equal(w.document.getElementById('startBox').hidden, false, '아무것도 없으면 서류를 정하는 칸이 열린다');
});

test('작성 화면: 이어쓰기는 저장된 엔진으로 돌아간다', async () => {
  const saved = { w: 6, doc: '답변서', md: '---\ndoc_type: 답변서\n---\n\n# 답변서\n', title: '답변서', at: 1, rest: '', pid: 'judicial-scrivener' };
  const w = load('write.html', '', '', { navilaw_write_last: saved }).window; await tick();
  assert.match(w.document.getElementById('chatFrame').src, /persona=judicial-scrivener&/);
  assert.match(w.document.getElementById('draft').textContent, /답변서/);
  assert.equal(w.document.querySelector('.phase.on').textContent, '2. 수정·보완');
});

const DRAFT = '[서류 보조 AI | 서류 작성 트랙 | 현재: W-6 | 서류: 근저당권말소 | 서식: 신규 | 게이트: 서류 승인 대기]\n\n~~~markdown\n---\ndoc_type: 근저당권말소등기신청서\nstatus: DRAFT\nopen_items: 2\n---\n\n# 근저당권말소등기신청서\n\n## 2. 서류 본문\n- 등기목적: 근저당권말소\n- 등기원인: [확인 필요: 해지 일자]\n~~~\n\n초안을 작성했습니다. 빈 칸 2곳.\n\n| 칸 | 들어갈 내용 | 채우는 사람 |\n|---|---|---|\n| 해지 일자 | 해지증서 일자 | 이용자 알림 |\n\n[NEXT_STEP: 빈 칸 반영]';

test('작성 화면: 자동 시작 메시지는 질문 없이 초안 우선이고, 답변에서 초안·빈 칸 표·진행 단계를 읽는다', async () => {
  const dom = load('write.html', '?persona=judicial-scrivener&doc=' + encodeURIComponent('근저당권말소등기신청서')); const w = dom.window; await tick();
  const sent = [];
  const frame = w.document.getElementById('chatFrame');
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (m, o) => sent.push([m, o]) } });
  const fire = (data, origin = 'https://hondi.net') => w.dispatchEvent(Object.assign(new w.Event('message'), { data, origin, source: frame.contentWindow }));
  fire({ type: 'expert-embed-ready' }); await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], 'https://hondi.net');
  assert.match(sent[0][0].text, /근저당권말소등기신청서/);
  assert.match(sent[0][0].text, /묻지 말고 빈 칸으로 남긴 뒤/);
  assert.doesNotMatch(sent[0][0].text, /물어봐 주세요|3개 이내/);
  fire({ type: 'expert-embed-reply', text: DRAFT }, 'https://evil.example'); await tick();
  assert.equal(w.document.getElementById('draft').querySelector('h1'), null, '다른 출처의 메시지는 무시한다');
  fire({ type: 'expert-embed-reply', text: DRAFT }); await tick();
  assert.ok(w.document.getElementById('draft').querySelector('h1'));
  assert.equal(w.document.getElementById('blanks').hidden, false);
  assert.match(w.document.getElementById('blanksBody').textContent, /해지 일자/);
  assert.doesNotMatch(w.document.getElementById('blanksBody').textContent, /NEXT_STEP|서류 작성 트랙/);
  assert.equal(w.document.querySelector('.phase.on').textContent, '2. 수정·보완');
  assert.ok(w.document.querySelector('#actions [data-act="download"]'));
  assert.ok(w.document.querySelector('#actions [data-act="next"]'));
  assert.ok(w.NaviLaw.STATUS_RE.test('[법무사 보조 AI | 서류 작성 트랙 | 현재: W-7 | 서류: x | 서식: y | 게이트: z]'), '엔진 이름이 달라도 상태 줄을 읽는다');
});

test('모든 HTML의 로컬 링크·스크립트가 실제 파일을 가리킨다', () => {
  for (const p of ['index.html', 'docs.html', 'write.html', '404.html', 'lawyer.html', 'scrivener.html']) {
    const h = read(p);
    for (const m of h.matchAll(/(?:href|src|url)=(?:"|\s*)\/?([A-Za-z0-9_\-/]+\.(?:html|css|js))/g)) { try { read(m[1]); } catch { assert.fail(p + ' → ' + m[1]); } }
  }
  assert.equal(read('CNAME').trim(), 'law.hondi.net');
});

const PROMO_LINES = [
  '11,000여 건의 민원 및 법원 서류를 말 한 마디로 작성합니다.',
  '법원 API를 발급받으면, 법원 등 관련 기관과 부서에 서류 제출까지 나비로가 진행합니다.',
  '금융 기관과 협력하면, 각종 수수료와 인지대 납부도 처리합니다.',
  '분쟁이 발생하면, 법원의 예상 판결문을 상당한 신뢰도로 생성하므로, 불필요한 소송 남발을 막습니다.',
];

test('배너: 홈·서류 목록에만 "나비로의 특징" 네 줄이 있고, 작성 화면에는 없다', () => {
  for (const p of ['index.html', 'docs.html']) {
    const w = load(p).window, el = w.document.getElementById('promo');
    assert.ok(el, p);
    assert.equal(el.querySelector('h2').textContent, '나비로의 특징');
    assert.deepEqual([...el.querySelectorAll('ol > li')].map((l) => l.textContent), PROMO_LINES);
    assert.match(el.querySelector('.promo-close').textContent, /다시 보지 않기/);
    assert.ok(el.querySelector('.promo-close svg'), '닫기 표시(X)');
    assert.match(el.querySelector('.promo-note').textContent, /예상 판결문은 참고용이며 법적 효력이 없습니다/);
  }
  for (const p of ['write.html', '404.html']) assert.equal(load(p).window.document.getElementById('promo'), null, p);
});

test('배너: 다시 보지 않기를 누르면 닫히고 기억하며, 기억한 브라우저에는 다시 나오지 않는다', () => {
  const w = load('index.html').window;
  w.document.getElementById('promoClose').click();
  assert.equal(w.document.getElementById('promo'), null);
  assert.equal(w.document.querySelector('.promo-wrap'), null, '빈 띠가 남지 않는다');
  assert.equal(w.localStorage.getItem('navilaw_promo_v1'), '1');
  assert.equal(load('docs.html', '', '', { navilaw_promo_v1: 1 }).window.document.getElementById('promo'), null);
  assert.equal(load('index.html', '', '', {}).window.document.getElementById('promo') !== null, true, '기억이 없으면 보인다');
});

test('배너: 접근성(제목 연결·키보드로 닫기 버튼)과 인쇄 숨김', () => {
  const w = load('index.html').window, el = w.document.getElementById('promo');
  assert.equal(el.getAttribute('aria-labelledby'), 'promoH');
  const b = w.document.getElementById('promoClose');
  assert.equal(b.tagName, 'BUTTON'); assert.ok(b.getAttribute('aria-label'));
  assert.match(read('assets/law.css'), /@media print \{ \.promo-wrap \{ display: none/);
});

// ── 발급 서류: 초안이 아니라 발급 안내로 시작한다 ──
const WITH_ISSUED = buildDocsDb({ forms: [], court: [] });   // 발급 서류 포함(법제처·법원 수집 데이터와 무관)
function hook(w) {
  const sent = [], frame = w.document.getElementById('chatFrame');
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (m, o) => sent.push([m, o]) } });
  const fire = (data, origin = 'https://hondi.net') => w.dispatchEvent(Object.assign(new w.Event('message'), { data, origin, source: frame.contentWindow }));
  return { sent, fire };
}
test('작성 화면: 발급 서류(가족관계증명서)는 발급 안내로 시작하고, 답변 전체를 안내 칸에 보여 주며 초안 단계·버튼은 없다', async () => {
  const w = load('write.html', '?persona=lawyer&doc=' + encodeURIComponent('가족관계증명서'), '', {}, WITH_ISSUED).window; await tick();
  const { sent, fire } = hook(w);
  fire({ type: 'expert-embed-ready' }); await tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0][0].text, /^「가족관계증명서」은\(는\) 작성하는 서류가 아니라 발급받아 첨부하는 서류입니다/);
  assert.match(sent[0][0].text, /정부24/); assert.doesNotMatch(sent[0][0].text, /묻지 말고 빈 칸으로 남긴 뒤/);
  assert.equal(w.document.getElementById('draftTitle').textContent, '발급 안내');
  assert.match(w.document.getElementById('startSumText').textContent, /가족관계증명서 · 발급 안내/);
  assert.equal(w.document.getElementById('phases').style.display, 'none', '초안 진행 단계는 숨긴다');
  fire({ type: 'expert-embed-reply', text: '가족관계증명서는 정부24에서 발급받습니다.\n\n- 준비물: 신분증' }, 'https://evil.example'); await tick();
  assert.doesNotMatch(w.document.getElementById('draft').textContent, /정부24에서 발급/, '다른 출처의 메시지는 무시한다');
  fire({ type: 'expert-embed-reply', text: '[서류 보조 AI | 서류 작성 트랙 | 현재: W-1 | 서류: 가족관계증명서 | 서식: - | 게이트: -]\n\n가족관계증명서는 정부24에서 발급받습니다.\n\n- 준비물: 신분증' }); await tick();
  assert.match(w.document.getElementById('draft').textContent, /정부24에서 발급받습니다/);
  assert.doesNotMatch(w.document.getElementById('draft').textContent, /서류 작성 트랙/, '상태 줄은 가린다');
  assert.equal(w.document.getElementById('blanks').hidden, true);
  assert.equal(w.document.querySelector('#actions [data-act="download"]'), null);
  assert.equal(w.document.querySelector('#actions [data-act="next"]'), null);
  assert.ok(w.document.querySelector('#actions [data-act="copy"]'));
  assert.equal(w.document.getElementById('chatH').textContent, '궁금한 점은 여기에 말씀하십시오');
});

test('작성 화면: 작성하는 서류와 문장 속 서류명은 그대로 초안으로 시작한다', async () => {
  let w = load('write.html', '?persona=judicial-scrivener&doc=' + encodeURIComponent('근저당권말소등기신청서'), '', {}, WITH_ISSUED).window; await tick();
  let h = hook(w); h.fire({ type: 'expert-embed-ready' }); await tick();
  assert.match(h.sent[0][0].text, /묻지 말고 빈 칸으로 남긴 뒤/); assert.equal(w.document.getElementById('draftTitle').textContent, '초안');
  assert.notEqual(w.document.getElementById('phases').style.display, 'none');
  w = load('write.html', '?persona=lawyer&q=' + encodeURIComponent('가족관계증명서를 붙인 소장 작성'), '', {}, WITH_ISSUED).window; await tick();
  h = hook(w); h.fire({ type: 'expert-embed-ready' }); await tick();
  assert.match(h.sent[0][0].text, /초안을 작성해 주세요/); assert.doesNotMatch(h.sent[0][0].text, /발급받아 첨부하는 서류/);
});

test('작성 화면: 발급을 묻는 문장(주민등록등본 떼는 법)은 초안이 아니라 발급 안내로 시작하고, 서류명이 든 초안 요청은 그대로 초안이다', async () => {
  let w = load('write.html', '?q=' + encodeURIComponent('주민등록등본 떼는 법'), '', {}, WITH_ISSUED).window; await tick();
  let h = hook(w); h.fire({ type: 'expert-embed-ready' }); await tick();
  assert.match(h.sent[0][0].text, /^「주민등록등본」은\(는\) 작성하는 서류가 아니라 발급받아 첨부하는 서류입니다/);
  assert.match(h.sent[0][0].text, /사용자의 원래 요청: 「주민등록등본 떼는 법」/);
  assert.equal(w.document.getElementById('draftTitle').textContent, '발급 안내');
  w = load('write.html', '?q=' + encodeURIComponent('주민등록등본을 첨부하는 위임장 초안 써줘'), '', {}, WITH_ISSUED).window; await tick();
  h = hook(w); h.fire({ type: 'expert-embed-ready' }); await tick();
  assert.match(h.sent[0][0].text, /초안을 작성해 주세요/); assert.equal(w.document.getElementById('draftTitle').textContent, '초안');
});

test('작성 화면: 직접 입력한 서류명이 발급 서류와 같아도 발급 안내로 시작하고, 이어쓰기는 발급 안내 상태로 돌아간다', async () => {
  let w = load('write.html', '?persona=lawyer', '', {}, WITH_ISSUED).window; await tick();
  const h = hook(w);
  w.document.getElementById('fDoc').value = '주민등록등본';
  w.document.getElementById('startForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  h.fire({ type: 'expert-embed-ready' }); await tick();
  assert.match(h.sent[0][0].text, /^「주민등록등본」은\(는\) 작성하는 서류가 아니라/);
  const saved = { w: 1, doc: '주민등록등본', md: '', title: '', at: 1, rest: '정부24에서 발급받습니다.', pid: 'lawyer', kind: 'issued' };
  w = load('write.html', '', '', { navilaw_write_last: saved }, WITH_ISSUED).window; await tick();
  assert.equal(w.document.getElementById('draftTitle').textContent, '발급 안내');
  assert.match(w.document.getElementById('draft').textContent, /정부24에서 발급받습니다/);
});

test('작성 화면: 내부 처리용 앞머리 표(doc_type·status…)는 화면·내려받기·복사에 없고, 순서는 서식 → 남은 빈 칸 → 내려받기이다', async () => {
  const w = load('write.html', '?persona=judicial-scrivener&doc=' + encodeURIComponent('근저당권말소등기신청서')).window; await tick();
  const { fire } = hook(w); fire({ type: 'expert-embed-ready' }); await tick();
  fire({ type: 'expert-embed-reply', text: DRAFT }); await tick();
  const d = w.document, draft = d.getElementById('draft');
  assert.ok(draft.querySelector('h1'), '서식 본문은 그대로 보인다');
  assert.equal(draft.querySelector('table.meta'), null);
  assert.doesNotMatch(draft.textContent, /doc_type|status|DRAFT|open_items|generated_by/);
  assert.equal(d.getElementById('draftTitle').textContent, '근저당권말소등기신청서', '제목은 앞머리에서 읽되 표로는 보이지 않는다');
  const FOLLOWING = w.Node.DOCUMENT_POSITION_FOLLOWING;
  assert.ok(draft.compareDocumentPosition(d.getElementById('blanks')) & FOLLOWING, '초안 다음에 빈 칸');
  assert.ok(d.getElementById('blanks').compareDocumentPosition(d.getElementById('actions')) & FOLLOWING, '빈 칸 다음에 내려받기 버튼');
  let copied = '', blob = null;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: (t) => { copied = t; return Promise.resolve(); } }, configurable: true });
  w.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
  d.querySelector('#actions [data-act="copy"]').click(); await tick();
  assert.match(copied, /^# 근저당권말소등기신청서/); assert.doesNotMatch(copied, /doc_type|^---/m, '복사에도 앞머리를 넣지 않는다');
  d.querySelector('#actions [data-act="download"]').click();
  const html = await new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });
  assert.match(html, /<h1>근저당권말소등기신청서<\/h1>/); assert.doesNotMatch(html, /doc_type|class="meta"|DRAFT/);
  assert.match(html, /<title>근저당권말소등기신청서<\/title>/);
});

// ── 서식 입력 칸 · 떠 있는 대화창 · 혼디 PDV 자동 기입 ──
const FORM = '[서류 보조 AI | 서류 작성 트랙 | 현재: W-6 | 서류: 신청서 | 서식: 신규 | 게이트: 서류 승인 대기]\n\n~~~markdown\n---\ndoc_type: 신청서\nstatus: DRAFT\n---\n\n# 신청서\n\n| 구분 | 내용 |\n|---|---|\n| 신청인 성명 | [확인 필요: 신청인 성명] |\n| 신청인 주소 | [확인 필요: 신청인 주소] |\n| 연락처 | [확인 필요: 휴대전화] |\n| 상대방 성명 | [확인 필요: 상대방 성명] |\n| 주민등록번호 | [확인 필요: 주민등록번호] |\n\n끝.\n~~~\n\n빈 칸을 알려 주세요.';
async function openForm(opts = {}) {
  const w = load('write.html', '?persona=lawyer&doc=' + encodeURIComponent('신청서') + (opts.ac ? '&gwp=1&origin=' + encodeURIComponent('https://hondi.net') : ''), '', {}, CORE, opts.pre).window; await tick();
  const h = hook(w); h.fire({ type: 'expert-embed-ready' }); await tick();
  h.fire({ type: 'expert-embed-reply', text: FORM }); await tick();
  return { w, ...h };
}
test('scanBlanks/pdvKind: 본인 인적사항만 PDV 대상, 상대방·주민번호는 제외', () => {
  const N = load('write.html').window.NaviLaw, f = N.scanBlanks(FORM.split('~~~markdown')[1]);
  assert.deepEqual(Array.from(f, (x) => x.label), ['신청인 성명', '신청인 주소', '연락처', '상대방 성명', '주민등록번호']);
  assert.deepEqual(Array.from(f, (x) => x.kind), ['name', 'address', 'phone', null, 'rrn']);
  assert.equal(f[4].sensitive, true);
  assert.equal(N.pdvKind('피고 주소', ''), null); assert.equal(N.pdvKind('부동산 소재지', '주소'), null);
});
test('작성 화면: 빈 칸은 입력 칸으로 나오고, 비서 없이 열면 시험용 의뢰인(PDV) 정보가 자동으로 들어가며, 내려받기에 반영된다', async () => {
  const { w } = await openForm(); const d = w.document;
  const inputs = d.querySelectorAll('#draft input.fld');
  assert.equal(inputs.length, 5);
  assert.doesNotMatch(d.getElementById('draft').textContent, /doc_type|\[확인 필요/);
  assert.deepEqual(Array.from(inputs, (i) => i.value), ['도영민', '제주시 한림읍 금능남로 3', '010-9662-7170', '', '641005-1******']);
  assert.equal(d.querySelectorAll('#draft .fld-badge').length, 4);
  assert.match(d.getElementById('fillSum').textContent, /5개 중 4개/);
  inputs[3].value = '김상대'; inputs[3].dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.match(d.getElementById('fillSum').textContent, /5개 중 5개/);
  let html = ''; w.Blob = class { constructor(p) { html = p.join(''); } }; w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  d.querySelector('#actions [data-act="download"]').click();
  assert.match(html, /도영민/); assert.match(html, /641005-1\*{6}/); assert.match(html, /김상대/); assert.doesNotMatch(html, /<mark>/);
  await new Promise((r) => setTimeout(r, 500));
  const s2 = JSON.parse(w.localStorage.getItem('navilaw_write_last'));
  assert.ok(Object.values(s2.vals).includes('김상대'));
  assert.ok(!Object.values(s2.vals).includes('641005-1******'), '주민등록번호는 저장하지 않는다');
});
test('작성 화면: 안내문(노란 칸)은 화면에 없고, 인사·질문만 오면 묻지 말고 바로 쓰라고 한 번 더 요청한다', async () => {
  assert.ok(!/AI가 쓴 초안입니다/.test(read('write.html').replace(/<footer[\s\S]*?<\/footer>/, '')));
  const w = load('write.html', '?persona=lawyer&doc=' + encodeURIComponent('농지취득자격증명신청서')).window; await tick();
  const { sent, fire } = hook(w); fire({ type: 'expert-embed-ready' }); await tick();
  assert.equal(sent.length, 1); assert.match(sent[0][0].text, /인사나 질문 없이 지금 바로 초안 전체를 작성/); assert.match(sent[0][0].text, /PDV에서 자동으로/);
  fire({ type: 'expert-embed-reply', text: '안녕하세요. 초안을 작성해 드릴까요?' }); await tick();
  assert.equal(sent.length, 2); assert.match(sent[1][0].text, /질문하지 말고 지금 바로/);
  assert.doesNotMatch(w.document.getElementById('blanksBody').textContent, /드릴까요/);
  fire({ type: 'expert-embed-reply', text: FORM }); await tick();
  assert.equal(sent.length, 2); assert.equal(w.document.querySelectorAll('#draft input.fld').length, 5);
});
test('작성 화면: 대화창은 떠 있는 아이콘으로 열고 닫는다', async () => {
  const { w } = await openForm(); const d = w.document, fab = d.getElementById('chatFab'), p = d.getElementById('chatPanel');
  assert.ok(!p.classList.contains('open')); assert.equal(fab.getAttribute('aria-expanded'), 'false');
  assert.equal(d.getElementById('chatDot').hidden, false, '새 초안이 오면 점으로 알린다');
  fab.click(); assert.ok(p.classList.contains('open')); assert.equal(fab.getAttribute('aria-expanded'), 'true'); assert.equal(d.getElementById('chatDot').hidden, true);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); assert.ok(!p.classList.contains('open'));
  fab.click(); d.getElementById('chatClose').click(); assert.ok(!p.classList.contains('open'));
});
test('PDV: 비서가 연 창이면 이름·연락처·주소를 요청하고, 허용된 값만 PDV 표시와 함께 채운다', async () => {
  const posts = []; let op;
  const { w } = await openForm({ ac: true, pre: (win) => { op = { closed: false, postMessage: (m, o) => posts.push([m, o]) }; Object.defineProperty(win, 'opener', { value: op }); } });
  assert.equal(posts.length, 1); const [m, o] = posts[0];
  assert.equal(o, 'https://hondi.net'); assert.equal(m.type, 'GWP_PDV_REQUEST');
  assert.deepEqual(Array.from(m.fields).sort(), ['이름', '연락처', '주소'].sort());
  assert.ok(!JSON.stringify(m).includes('주민'));
  const reply = (data, origin = 'https://hondi.net', source = op) => w.dispatchEvent(Object.assign(new w.Event('message'), { data, origin, source }));
  reply({ type: 'GWP_PDV_RESPONSE', request_id: m.request_id, approved: true, values: { 이름: '악당' } }, 'https://evil.example'); await tick();
  assert.equal(w.document.querySelectorAll('#draft input.pdv').length, 0, '다른 출처 응답은 무시');
  reply({ type: 'GWP_PDV_RESPONSE', request_id: m.request_id, approved: true, values: { 이름: '홍길동', 연락처: '010-1111-2222', 주소: { not_in_pdv: true } } }); await tick();
  const ins = w.document.querySelectorAll('#draft input.fld');
  assert.equal(ins[0].value, '홍길동'); assert.equal(ins[2].value, '010-1111-2222'); assert.equal(ins[1].value, '');
  assert.equal(w.document.querySelectorAll('#draft input.pdv').length, 2);
  assert.equal(ins[3].value, '', '상대방 칸은 채우지 않는다'); assert.equal(ins[4].value, '');
  assert.ok(w.document.querySelector('#draft .fld-badge'));
});
test('PDV: 거부하면 직접 입력 안내, 비서 없이 열면 요청도 버튼도 없다', async () => {
  const posts = []; let op;
  const a = await openForm({ ac: true, pre: (win) => { op = { closed: false, postMessage: (m) => posts.push(m) }; Object.defineProperty(win, 'opener', { value: op }); } });
  a.w.dispatchEvent(Object.assign(new a.w.Event('message'), { data: { type: 'GWP_PDV_RESPONSE', request_id: posts[0].request_id, approved: false, values: null }, origin: 'https://hondi.net', source: op })); await tick();
  assert.match(a.w.document.getElementById('pdvNote').textContent, /허용되지 않았습니다/);
  assert.equal(a.w.document.querySelector('#draft input.fld').value, '');
  const b = await openForm();
  assert.equal(b.w.document.getElementById('pdvBtn').hidden, true);
});
