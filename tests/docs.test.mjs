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
const db = JSON.parse(read('data/docs.json'));           // 실제 배포본(법제처 민원서식 포함)
const CORE = buildDocsDb({ forms: [], issued: [], court: [] });  // 핵심 서류만 — 수집·발급·법원 양식 데이터와 무관하게 검색 동작을 시험한다
const win = {}; vm.runInNewContext(read('assets/docs-search.js'), { window: win });
const D = win.NaviLawDocs, idx = D.createIndex(CORE);
const titles = (r) => r.map((e) => e.t);

test('서류 DB: data/docs.json 이 서류 목록(scrivener·lawyer.json)에서 만든 최신본이다', () => {
  assert.equal(read('data/docs.json'), serialize(buildDocsDb()), 'node scripts/build-docs-index.mjs 를 실행하세요');
});

test('서류 DB: 핵심 서류는 법무사 98 + 변호사 공통 19 + 세부 분야 282 = 399건, 분야 46개이고, 배포본은 거기에 민원서식만 더한다', () => {
  assert.equal(CORE.docs.length, 399);
  assert.equal(CORE.docs.filter((d) => d.p === 'scrivener').length, 98);
  assert.equal(CORE.docs.filter((d) => d.p === 'lawyer' && d.pid === 'lawyer').length, 19);
  assert.equal(CORE.fields.length, 46);
  assert.ok(!CORE.docs.some((d) => d.t === '유의'));
  for (const d of CORE.docs) assert.ok(d.t && d.p && d.pid && d.c, JSON.stringify(d));
  assert.equal(db.docs.filter((d) => !['minwon', 'issued', 'court'].includes(d.p)).length, 399, '배포본의 핵심 서류 수');
  assert.equal(db.fields.length, 46);
  for (const d of db.docs.filter((x) => x.p === 'minwon')) assert.ok(d.t && d.c, JSON.stringify(d));
});

// 발급 민원서류 — 등기·소송에 첨부하는 가족관계증명서 같은 서류. 법제처 서식 목록에는 이름이 없어 data/issued-docs.json 에 따로 둔다.
const ISSUED = JSON.parse(read('data/issued-docs.json')).docs;
const WITH_ISSUED = D.createIndex(buildDocsDb({ forms: [], court: [] }));
test('발급 서류: 모든 항목에 서류명·발급처·안내가 있고, 이름이 겹치지 않으며 핵심 서류와도 겹치지 않는다', () => {
  assert.ok(ISSUED.length >= 40, '발급 서류 ' + ISSUED.length + '건');
  const seen = new Set(), core = new Set(CORE.docs.map((d) => d.t.replace(/\s+/g, '')));
  for (const f of ISSUED) {
    assert.ok(f.t && f.d && /^(발급 서류|조회 신청) · .+/.test(f.c), JSON.stringify(f));
    assert.ok(Array.isArray(f.a || []) && (f.a || []).every((x) => typeof x === 'string' && x.trim()), f.t);
    const k = f.t.replace(/\s+/g, ''); assert.ok(!seen.has(k), '중복: ' + f.t); seen.add(k);
    assert.ok(!core.has(k), '핵심 서류와 겹침: ' + f.t);
  }
  assert.equal(db.docs.filter((d) => d.p === 'issued').length, ISSUED.length, '배포본에 모두 들어 있다');
});

test('발급 서류: 첨부서류 이름과 일상어로 찾는다 — 법제처 목록에 없던 서류', () => {
  const first = (q) => titles(D.search(WITH_ISSUED, q, { limit: 5 }))[0];
  assert.equal(first('가족관계증명서'), '가족관계증명서');
  assert.equal(first('주민등록등본'), '주민등록등본');
  assert.equal(first('주민등록초본'), '주민등록초본');
  assert.deepEqual(Array.from(titles(D.search(WITH_ISSUED, '등기사항전부증명서', { limit: 2 }))).sort(),   // vm 안에서 만든 배열은 Array.from 으로 옮겨야 deepEqual 이 맞는다
     ['등기사항전부증명서(법인)', '등기사항전부증명서(부동산)'], '부동산·법인 두 종류가 모두 위에 나온다');
  assert.equal(first('부동산등기부등본'), '등기사항전부증명서(부동산)', '별칭');
  assert.equal(first('법인등기부등본'), '등기사항전부증명서(법인)', '별칭');
  assert.equal(first('ㄱㅈㄱㄱㅈㅁㅅ'), '가족관계증명서', '초성으로도');
  assert.equal(first('제적'), '제적등본');
  assert.equal(first('안심상속'), '안심상속 원스톱 서비스(상속인 재산조회)');
  assert.equal(D.best(WITH_ISSUED, '가족관계증명서를 첨부해야 해요').t, '가족관계증명서', '문장 속 서류명');
});

test('발급 서류: 자동 완성에는 발급처가 보이고, 법제처 민원서식과 이름이 같으면 발급 서류 한 건만 남는다', () => {
  const hit = D.search(WITH_ISSUED, '가족관계증명서', { limit: 1 })[0];
  assert.match(hit.c, /^발급 서류 · .*정부24/);
  const dup = buildDocsDb({ forms: [{ t: '인감증명서', law: '인감증명법 시행규칙', laws: ['인감증명법 시행규칙'], n: 1, dept: '행정안전부', src: '법령' }, { t: '인감증명 발급대장', law: 'X', n: 1 }] });
  assert.equal(dup.docs.filter((d) => d.t === '인감증명서').length, 1);
  assert.equal(dup.docs.find((d) => d.t === '인감증명서').p, 'issued');
  assert.equal(dup.docs.filter((d) => d.p === 'minwon').length, 1, '이름이 다른 민원서식은 그대로');
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

const FORMS = [{ t: '농지취득자격증명', no: '별지제3호서식', law: '농지법 시행규칙', laws: ['농지법 시행규칙'], n: 1, dept: '농림축산식품부', src: '법령' }];
const WITH = D.createIndex(buildDocsDb({ forms: FORMS }));

test('목록에 없는 서류는 결과가 없다 — 화면은 "직접 작성" 줄로 이어 준다. 법제처 민원서식이 합쳐지면 그 서류도 찾는다', () => {
  assert.equal(D.search(idx, '쿼카쿼카서류', {}).length, 0);
  assert.equal(D.search(idx, '농지취득자격증명', {}).length, 0, '핵심 서류에는 없다');
  assert.equal(titles(D.search(WITH, '농지취득자격', {}))[0], '농지취득자격증명', '민원서식을 합치면 찾는다');
  assert.equal(titles(D.search(WITH, 'ㄴㅈㅊㄷㅈㄱ', {}))[0], '농지취득자격증명', '초성으로도');
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
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(u === 'data/docs.json' ? CORE : JSON.parse(read(u))) });
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

test('홈 자동 완성: 목록에 없는 서류는 직접 작성 줄만 나오고, 고르면 입력 그대로 작성 화면으로 간다', async () => {
  const w = load('index.html'); let went = ''; w.NaviLaw.go = (u) => { went = u; };
  await type(w, '쿼카쿼카서류');
  const opts = w.document.querySelectorAll('#sugList [role=option]');
  assert.equal(opts.length, 1);
  assert.match(opts[0].textContent, /「쿼카쿼카서류」(으로|로) 직접 작성/);
  assert.match(opts[0].textContent, /목록에 없는 서류입니다/);
  opts[0].click();
  assert.equal(went, 'write.html?q=' + encodeURIComponent('쿼카쿼카서류'));
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
  assert.equal(D.best(idx, '쿼카쿼카서류'), null);
  assert.equal(D.best(idx, ''), null);
  assert.equal(D.best(WITH, '농지취득자격증명 신청서를 써 주세요').t, '농지취득자격증명');
});

test('규모: 민원서식이 만 건 넘게 합쳐져도 색인은 2초 안, 검색은 한 번에 20ms 안', () => {
  const words = ['영업', '건축', '농지', '식품', '위생', '체육', '관광', '학원', '의료', '약국', '산림', '해양', '항공', '도로', '하천', '환경', '전기', '가스', '방송', '금융'];
  const kinds = ['허가신청서', '등록신청서', '변경신고서', '확인서', '발급신청서', '이전신고서', '폐업신고서', '승인신청서'];
  const many = []; for (const a of words) for (const b of words) for (const k of kinds) many.push({ t: a + b + k, law: a + '법 시행규칙', laws: [a + '법 시행규칙'], n: 2, dept: '부처', src: '법령' });
  assert.ok(many.length >= 3000);
  const big = []; while (big.length < 12000) big.push(...many.map((f, i) => ({ ...f, t: f.t + (big.length ? String(big.length + i) : '') })));
  const t0 = Date.now(), index = D.createIndex(buildDocsDb({ forms: big.slice(0, 12000) })); const build = Date.now() - t0;
  assert.ok(build < 2000, '색인 ' + build + 'ms');
  const t1 = Date.now(); for (let i = 0; i < 50; i++) D.search(index, i % 2 ? '영업허' : 'ㅇㅇㅎㄱ', { limit: 8 });
  assert.ok((Date.now() - t1) / 50 < 20, '검색 느림');
});


// 발급 서류를 고르면 초안이 아니라 발급 안내로 시작한다 — 판정은 입력이 서류명·별칭과 "정확히" 같을 때만.
test('발급 서류 판정: 서류명·괄호 뺀 이름·별칭과 같을 때만 발급 서류, 문장 속 서류명·작성 서류는 아니다', () => {
  const dbI = buildDocsDb({ forms: [], court: [] });
  const f = (t) => D.findIssued(dbI, t);
  assert.equal(f('가족관계증명서').t, '가족관계증명서');
  assert.equal(f('가족 관계 증명서').t, '가족관계증명서', '띄어쓰기 무시');
  assert.equal(f('등기사항전부증명서(법인)').t, '등기사항전부증명서(법인)');
  assert.equal(f('법인등기부등본').t, '등기사항전부증명서(법인)', '별칭');
  assert.equal(f('등기사항전부증명서').p, 'issued', '괄호를 뺀 이름도 발급 서류');
  assert.equal(f('안심상속').p, 'issued');
  for (const no of ['가족관계증명서를 붙인 소장', '근저당권말소등기신청서', '소장', '', '   ', '쿼카쿼카서류']) assert.equal(f(no), null, JSON.stringify(no));
  assert.equal(D.findIssued(null, '가족관계증명서'), null);
  assert.equal(D.findIssued(CORE, '가족관계증명서'), null, '발급 서류가 없는 DB');
});

test('발급 안내 요청문: 초안을 쓰지 말고 발급처·준비물·대리·유효기간을 안내하게 하며, 조회 신청 서비스는 말을 바꾼다', () => {
  const dbI = buildDocsDb({ forms: [], court: [] });
  const a = D.issuedAsk(D.findIssued(dbI, '가족관계증명서'), '');
  assert.match(a, /^「가족관계증명서」은\(는\) 작성하는 서류가 아니라 발급받아 첨부하는 서류입니다\. 초안을 쓰지 말고/);
  for (const w of ['정부24', '전자가족관계등록시스템', '준비물', '대리인', '유효기간', '단정하지 말고', '수수료 납부는 제가 직접']) assert.ok(a.includes(w), w);
  assert.ok(!a.includes('발급 서류 · '), '발급처 앞의 분류 표시는 뗀다');
  assert.doesNotMatch(a, /알고 있는 내용/);
  assert.match(D.issuedAsk(D.findIssued(dbI, '가족관계증명서'), '2018년 이혼'), /알고 있는 내용: 2018년 이혼\.$/);
  const s = D.issuedAsk(D.findIssued(dbI, '안심상속'), '');
  assert.match(s, /신청해서 결과를 받는 서비스입니다/); assert.doesNotMatch(s, /발급받아 첨부하는 서류/);
});
