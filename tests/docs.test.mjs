// 서류 DB와 자동 완성 시험
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { buildDocsDb, serialize } from '../scripts/build-docs-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const db = JSON.parse(read('data/docs.json'));
const win = {}; vm.runInNewContext(read('assets/docs-search.js'), { window: win });
const D = win.NaviLawDocs, idx = D.createIndex(db);
const titles = (r) => r.map((e) => e.t);

test('서류 DB: data/docs.json 이 서류 목록(scrivener·lawyer.json)에서 만든 최신본이다', () => {
  assert.equal(read('data/docs.json'), serialize(buildDocsDb()), 'node scripts/build-docs-index.mjs 를 실행하세요');
});

test('서류 DB: 법무사 98 + 변호사 공통 19 + 세부 분야 282 = 399건, 분야 46개, 서류가 아닌 항목 없음', () => {
  assert.equal(db.docs.length, 399);
  assert.equal(db.docs.filter((d) => d.p === 'scrivener').length, 98);
  assert.equal(db.docs.filter((d) => d.pid === 'lawyer').length, 19);
  assert.equal(db.fields.length, 46);
  assert.ok(!db.docs.some((d) => d.t === '유의'));
  for (const d of db.docs) assert.ok(d.t && d.p && d.pid && d.c, JSON.stringify(d));
});

test('자모: 입력 도중의 글자도 앞부분이 맞으면 찾는다', () => {
  assert.equal(D.jamo('근저당'), 'ㄱㅡㄴㅈㅓㄷㅏㅇ');
  assert.equal(D.cho('근저당권'), 'ㄱㅈㄷㄱ');
  for (const q of ['근', '근저', '근저ㄷ', '근저다', '근저당', '근저당ㄱ', '근저당권', '근저당권ㅅ']) {
    assert.ok(titles(D.search(idx, q, { persona: 'scrivener' })).some((t) => t.startsWith('근저당권설정')), q);
  }
});

test('초성 검색과 띄어쓰기·가운뎃점 무시', () => {
  assert.ok(titles(D.search(idx, 'ㄱㅈㄷ', { persona: 'scrivener' })).some((t) => t.includes('근저당')));
  assert.ok(titles(D.search(idx, '소유권 이전 등기', { persona: 'scrivener' }))[0].startsWith('소유권이전등기신청서'));
  assert.ok(titles(D.search(idx, '구속적부심', { persona: 'lawyer' })).length > 0);
});

test('별칭·제목 변형: 일상어로도 찾는다', () => {
  assert.ok(titles(D.search(idx, '이혼', { persona: 'scrivener' })).includes('협의이혼의사확인신청서'));
  assert.ok(titles(D.search(idx, '법인설립', { persona: 'scrivener' })).some((t) => t.startsWith('회사(주식·유한 등) 설립등기')));
  assert.ok(titles(D.search(idx, '근저당말소', { persona: 'scrivener' }))[0].startsWith('근저당권 변경·이전·말소'));
  assert.ok(titles(D.search(idx, '개인회생', { persona: 'scrivener' }))[0].startsWith('개인회생 개시신청서'));
});

test('목록에 없는 서류(농지취득자격증명)는 결과가 없다 — 화면은 "직접 작성" 줄로 이어 준다', () => {
  assert.equal(D.search(idx, '농지취득자격증명', {}).length, 0);
  assert.equal(D.search(idx, '농지취득자격', {}).length, 0);
});

test('"직접 작성" 줄의 조사: 받침 없음·ㄹ 받침은 "로", 그 밖은 "으로"', async () => {
  const w = load('index.html');
  await type(w, '소장'); assert.match(w.document.querySelector('.sug-free .sug-t').textContent, /「소장」으로 직접 작성/);
  await type(w, '내용증명서류'); assert.match(w.document.querySelector('.sug-free .sug-t').textContent, /「내용증명서류」로 직접 작성/);
  await type(w, '의결'); assert.match(w.document.querySelector('.sug-free .sug-t').textContent, /「의결」로 직접 작성/);
});

test('직역 제한과 같은 이름 서류 중복 제거, 세부 분야 제안', () => {
  assert.ok(D.search(idx, '소장', { persona: 'lawyer' }).every((e) => e.p === 'lawyer'));
  assert.ok(D.search(idx, '소장', { persona: 'scrivener' }).every((e) => e.p === 'scrivener'));
  assert.equal(titles(D.search(idx, '소장', { persona: 'lawyer' })).filter((t) => t === '소장').length, 1);
  const f = D.search(idx, '민사', { persona: 'lawyer' }).find((e) => e.kind === 'field');
  assert.ok(f && f.fid === 'lawyer-civil');
  assert.equal(D.search(idx, '민사', { persona: 'scrivener' }).filter((e) => e.kind === 'field').length, 0);
});

test('성능: 399건 색인 위 검색이 1회 5ms 안팎', () => {
  const t0 = Date.now(); for (let i = 0; i < 200; i++) D.search(idx, i % 2 ? '근저' : '소유권이전', { limit: 8 });
  assert.ok((Date.now() - t0) / 200 < 5, '느림');
});

// ── 화면 ──
function load(page) {
  const html = read(page).replace(/<script[^>]*src="https:[^>]*><\/script>/g, '');
  const w = new JSDOM(html, { url: 'https://law.hondi.net/' + page, runScripts: 'outside-only', pretendToBeVisual: true }).window;
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read(u))) });
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); };
  w.eval(read('assets/docs-search.js')); w.eval(read('assets/law.js').replace(/^\/\*[\s\S]*?\*\//, ''));
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 30));
const type = async (w, v) => { const i = w.document.getElementById('askInput'); i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); await tick(); };
const key = (w, k) => w.document.getElementById('askInput').dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('홈 자동 완성: 입력하면 제안이 열리고, 방향키·Enter로 고른 서류가 작성 화면으로 이어진다', async () => {
  const w = load('index.html'); let went = ''; w.NaviLaw.go = (u) => { went = u; };
  const input = w.document.getElementById('askInput'), list = w.document.getElementById('sugList');
  await type(w, '근저');
  assert.equal(list.hidden, false);
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  const opts = list.querySelectorAll('[role=option]');
  assert.ok(opts.length >= 3);
  assert.match(opts[0].textContent, /근저당/);
  assert.ok(opts[0].querySelector('mark'), '맞은 글자 강조');
  assert.match(opts[opts.length - 1].textContent, /직접 작성/);
  key(w, 'ArrowDown'); key(w, 'ArrowDown');
  assert.equal(input.getAttribute('aria-activedescendant'), 'sug-1');
  key(w, 'ArrowUp');
  key(w, 'Enter');
  assert.ok(went.startsWith('write.html?persona=judicial-scrivener&doc=' + encodeURIComponent('근저당권')), went);
});

test('홈 자동 완성: 목록에 없는 "농지취득자격증명"은 직접 작성 줄만 나오고, 고르면 입력 그대로 작성 화면으로 간다', async () => {
  const w = load('index.html'); let went = ''; w.NaviLaw.go = (u) => { went = u; };
  await type(w, '농지취득자격증명');
  const opts = w.document.querySelectorAll('#sugList [role=option]');
  assert.equal(opts.length, 1);
  assert.match(opts[0].textContent, /「농지취득자격증명」으로 직접 작성/);
  assert.match(opts[0].textContent, /목록에 없는 서류입니다/);
  opts[0].click();
  assert.equal(went, 'write.html?q=' + encodeURIComponent('농지취득자격증명'));
});

test('자동 완성: 입력을 지우거나 Esc 로 닫고, 고르지 않은 Enter 는 막지 않는다', async () => {
  const w = load('index.html'); const list = w.document.getElementById('sugList');
  await type(w, '소유권'); assert.equal(list.hidden, false);
  key(w, 'Escape'); assert.equal(list.hidden, true);
  await type(w, '소유권'); await type(w, ''); assert.equal(list.hidden, true);
  await type(w, '소유권');
  const ev = new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  w.document.getElementById('askInput').dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
});

test('서류 목록 페이지 자동 완성: 직역 구분 없이 모든 서류와 분야를 보여 주고 직역 표시가 없다', async () => {
  const w = load('docs.html'); await tick(); await type(w, '소장');
  assert.equal(w.document.querySelectorAll('#sugList .badge').length, 0, '직역 배지 없음');
  assert.ok(!/변호사|법무사/.test(w.document.getElementById('sugList').textContent));
  await type(w, '민사');
  assert.match(w.document.getElementById('sugList').textContent, /민사법/);
  let went = ''; w.NaviLaw.go = (u) => { went = u; };
  key(w, 'ArrowDown'); key(w, 'Enter');
  assert.ok(went.startsWith('docs.html?field=lawyer-civil') || went.startsWith('write.html?persona='), went);
});

test('best(): 문장 속 서류명도 찾고, 목록에 없으면 null', () => {
  assert.equal(D.best(idx, '근저당권설정등기신청서를 작성해 주세요').t, '근저당권설정등기신청서');
  assert.equal(D.best(idx, '변호인선임서').pid, 'lawyer');
  assert.equal(D.best(idx, '농지취득자격증명'), null);
  assert.equal(D.best(idx, ''), null);
});
