// 나비로 Navi Law 사이트 시험 — 실행: node --test tests/   (jsdom 필요: npm i -D jsdom)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const js = read('assets/law.js');

function load(page, search = '', hash = '') {
  const html = read(page).replace(/<script[^>]*src="https:[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://law.hondi.net/' + page + search + hash, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read(u))) });
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); };
  w.eval(js.replace(/^\/\*[\s\S]*?\*\//, ''));
  return dom;
}
const tick = () => new Promise((r) => setTimeout(r, 30));

test('데이터: 법무사 12분류 99종, 변호사 4분류 19종·세부 분야 46개', () => {
  const s = JSON.parse(read('data/scrivener.json')), l = JSON.parse(read('data/lawyer.json'));
  assert.equal(s.catalog.length, 12);
  assert.equal(s.catalog.reduce((n, c) => n + c.items.length, 0), 99);
  assert.equal(l.catalog.length, 4);
  assert.equal(l.catalog.reduce((n, c) => n + c.items.length, 0), 19);
  assert.equal(l.fields.length, 46);
  for (const f of l.fields) assert.ok(/^lawyer-[a-z-]+$/.test(f.id) && f.forms.length >= 5, f.id);
});

test('질문 라우팅: 확실할 때만 연결하고 애매하면 문 두 개를 보여 준다', () => {
  const { route } = load('index.html').window.NaviLaw;
  assert.equal(route('근저당권 말소등기 신청서 작성'), 'scrivener');
  assert.equal(route('개인회생 신청 서류'), 'scrivener');
  assert.equal(route('내용증명 작성'), 'lawyer');
  assert.equal(route('고소장 작성'), 'lawyer');
  assert.equal(route('소장 작성'), '');
  assert.equal(route('경매 입찰 손해배상 자문'), '');
});

test('홈: 질문이 애매하면 두 문이 강조되고 입력 내용을 가져간다', () => {
  const w = load('index.html').window;
  w.document.getElementById('askInput').value = '소장 작성';
  w.document.getElementById('askForm').requestSubmit();
  assert.equal(w.document.getElementById('routeHint').hidden, false);
  const a = w.document.querySelector('.door.scr a.btn');
  assert.ok(a.getAttribute('href').startsWith('write.html?persona=judicial-scrivener&q='));
});

test('법무사 목록: 12개 탭, 첫 탭 서류에 초안 작성 링크', async () => {
  const w = load('scrivener.html').window; await tick();
  assert.equal(w.document.querySelectorAll('#tabs .tab').length, 12);
  const a = w.document.querySelector('#listBox .item a.btn');
  assert.ok(a.getAttribute('href').startsWith('write.html?persona=judicial-scrivener&doc='));
  assert.match(w.document.getElementById('countLine').textContent, /99종/);
});

test('변호사 목록: 분야 12개 + 전체 보기, 분야 선택 시 그 분야 서류가 연결된다', async () => {
  let w = load('lawyer.html').window; await tick();
  assert.equal(w.document.querySelectorAll('#fieldsBox .field').length, 12);
  w.document.getElementById('moreBtn').click();
  assert.equal(w.document.querySelectorAll('#fieldsBox .field').length, 46);
  w = load('lawyer.html', '?field=lawyer-civil').window; await tick();
  assert.ok(w.document.querySelector('#fieldDetail table a.btn').getAttribute('href').startsWith('write.html?persona=lawyer-civil&doc='));
  assert.ok(w.document.querySelector('#listBox .item a.btn').getAttribute('href').includes('persona=lawyer-civil'));
});

test('작성 화면: 잘못된 persona는 선택 화면, 올바르면 hondi.net 대화창을 끼운다', async () => {
  let w = load('write.html', '?persona=evil').window; await tick();
  assert.equal(w.document.getElementById('chooser').hidden, false);
  assert.equal(w.document.getElementById('app').hidden, true);
  w = load('write.html', '?persona=judicial-scrivener').window; await tick();
  assert.equal(w.document.getElementById('app').hidden, false);
  assert.equal(w.document.getElementById('chatFrame').src, 'https://hondi.net/pages/expert-chat.html?persona=judicial-scrivener&embed=1');
  w = load('write.html', '?persona=lawyer-civil').window; await tick();
  assert.match(w.document.getElementById('h1').textContent, /민사법/);
});

const DRAFT = '[법무사 보조 AI | 서류 작성 트랙 | 현재: W-6 | 서류: 근저당권말소 | 서식: 신규 | 게이트: 서류 승인 대기]\n\n~~~markdown\n---\ndoc_type: 근저당권말소등기신청서\nstatus: DRAFT\nopen_items: 2\n---\n\n# 근저당권말소등기신청서\n\n## 2. 서류 본문\n- 등기목적: 근저당권말소\n- 등기원인: [확인 필요: 해지 일자]\n~~~\n\n초안을 작성했습니다. 빈 칸 2곳.\n\n| 칸 | 들어갈 내용 | 채우는 사람 |\n|---|---|---|\n| 해지 일자 | 해지증서 일자 | 이용자 알림 |\n\n[NEXT_STEP: 빈 칸 반영]';

test('작성 화면: 자동 시작 메시지는 질문 없이 초안 우선이고, 답변에서 초안·빈 칸 표·진행 단계를 읽는다', async () => {
  const dom = load('write.html', '?persona=judicial-scrivener&doc=' + encodeURIComponent('근저당권말소등기신청서')); const w = dom.window; await tick();
  const sent = [];
  const frame = w.document.getElementById('chatFrame');
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (m, o) => sent.push([m, o]) } });
  const fire = (data) => w.dispatchEvent(Object.assign(new w.Event('message'), { data, origin: 'https://hondi.net', source: frame.contentWindow }));
  fire({ type: 'expert-embed-ready' }); await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], 'https://hondi.net');
  assert.match(sent[0][0].text, /근저당권말소등기신청서/);
  assert.match(sent[0][0].text, /묻지 말고 빈 칸으로 남긴 뒤/);
  assert.doesNotMatch(sent[0][0].text, /물어봐 주세요|3개 이내/);
  // 다른 출처의 메시지는 무시한다
  w.dispatchEvent(Object.assign(new w.Event('message'), { data: { type: 'expert-embed-reply', text: DRAFT }, origin: 'https://evil.example', source: frame.contentWindow })); await tick();
  assert.equal(w.document.getElementById('draft').querySelector('h1'), null);
  fire({ type: 'expert-embed-reply', text: DRAFT }); await tick();
  assert.ok(w.document.getElementById('draft').querySelector('h1'));
  assert.match(w.document.getElementById('draft').textContent, /근저당권말소등기신청서/);
  assert.equal(w.document.getElementById('blanks').hidden, false);
  assert.match(w.document.getElementById('blanksBody').textContent, /해지 일자/);
  assert.doesNotMatch(w.document.getElementById('blanksBody').textContent, /NEXT_STEP|서류 작성 트랙/);
  assert.equal(w.document.querySelector('.phase.on').textContent, '2. 수정·보완');
  assert.ok(w.document.querySelector('#actions [data-act="download"]'));
  assert.ok(w.document.querySelector('#actions [data-act="next"]'));
});

test('모든 HTML의 로컬 링크·스크립트가 실제 파일을 가리킨다', () => {
  for (const p of ['index.html', 'lawyer.html', 'scrivener.html', 'write.html']) {
    const h = read(p);
    for (const m of h.matchAll(/(?:href|src)="([^"#?:]+\.(?:html|css|js))"/g)) { try { read(m[1]); } catch { assert.fail(p + ' → ' + m[1]); } }
  }
  assert.equal(read('CNAME').trim(), 'law.hondi.net');
});
