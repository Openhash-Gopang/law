// 나비로 Navi Law 사이트 시험 — 실행: npm test   (jsdom 필요: npm install)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const js = read('assets/law.js');

export function load(page, search = '', hash = '', store = {}) {
  const html = read(page).replace(/<script[^>]*src="https:[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://law.hondi.net/' + page + search + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, JSON.stringify(v));
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read(u))) });
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); };
  w.eval(read('assets/docs-search.js'));
  w.eval(js.replace(/^\/\*[\s\S]*?\*\//, ''));
  return dom;
}
const tick = () => new Promise((r) => setTimeout(r, 40));

test('데이터: 법무사 12분류 98종, 변호사 4분류 19종·세부 분야 46개', () => {
  const s = JSON.parse(read('data/scrivener.json')), l = JSON.parse(read('data/lawyer.json'));
  assert.equal(s.catalog.length, 12);
  assert.equal(s.catalog.reduce((n, c) => n + c.items.length, 0), 98);
  assert.equal(l.catalog.length, 4);
  assert.equal(l.catalog.reduce((n, c) => n + c.items.length, 0), 19);
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
  const db = JSON.parse(read('data/docs.json')), idx = w.NaviLawDocs.createIndex(db), pick = (t) => w.NaviLaw.pickEngine(idx, t);
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

test('서류 목록: 16개 분류 117종이 한 목록, 서류마다 초안 작성 링크, 분야 12개 + 전체 보기', async () => {
  const w = load('docs.html').window; await tick();
  assert.equal(w.document.querySelectorAll('#tabs .tab').length, 16);
  assert.match(w.document.getElementById('countLine').textContent, /16개 분류, 117종/);
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
