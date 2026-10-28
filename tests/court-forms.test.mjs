// 법원 양식(대법원 전자민원센터 양식모음) 수집 — 네트워크 없이 읽기·합치기·서류 DB 병합을 시험한다.
// 아래 HTML 은 목록 화면(전체글수·표의 행·"[분류] (법원명) 양식명" 제목)을 본뜬 시험용 조각이다. 실제 화면 모양은 `node scripts/fetch-court-forms.mjs --diagnose` 로 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTotal, splitCourtTitle, parseRows, dedupe, groupByTitle, collect, buildUrl, decodeBody, CourtSiteError } from '../scripts/court-forms-lib.mjs';
import { buildDocsDb } from '../scripts/build-docs-index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const row = (no, title) => `<tr><td>${no}</td><td class="tit"><a href="#" onclick="view(${no})">${title}</a></td><td><img alt="hwp"> <img alt="pdf"></td></tr>`;
const page = (total, rows) => `<html><body><div>전체글수 : ${total}건</div><table><thead><tr><th>No.</th><th>Title</th><th>File</th></tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;

test('전체 건수와 제목 나누기: 분류·법원·양식 번호·파일 형식 표시', () => {
  assert.equal(parseTotal(page('984', [])), 984);
  assert.equal(parseTotal('<p>전체글수 : 1,234건</p>'), 1234);
  assert.equal(parseTotal('<p>없음</p>'), 0);
  assert.deepEqual(splitCourtTitle('[개인회생] (부산회생법원) 변경 채권자목록 수정허가신청서'), { cat: '개인회생', court: '부산회생법원', no: '', t: '변경 채권자목록 수정허가신청서' });
  assert.deepEqual(splitCourtTitle('[법인회생] (서울회생법원) [양식1-01] 직원 급여 지급 허가 신청서(개시전)'), { cat: '법인회생', court: '서울회생법원', no: '양식1-01', t: '직원 급여 지급 허가 신청서(개시전)' });
  assert.equal(splitCourtTitle('[가사] (서울가정법원)인지의 허가청구').t, '인지의 허가청구');
  assert.equal(splitCourtTitle('[민사] 소장 hwp pdf').t, '소장');
  assert.equal(splitCourtTitle('[민사] (서울중앙지방법원) 소장').court, '서울중앙지방법원');
  assert.equal(splitCourtTitle('공지사항'), null);
  assert.equal(splitCourtTitle('[민사]'), null);
});

test('쪽 HTML 에서 양식 행만 읽는다(머리줄·분류 표시 없는 줄은 건너뜀, &amp; 풀기)', () => {
  const html = page(3, [row(3, '[민사] (서울중앙지방법원) 소장'), row(2, '공지: 양식 안내'), row(1, '[개인회생] (부산회생법원) 채권자목록 &amp; 변제계획')]);
  const r = parseRows(html);
  assert.deepEqual(r.map((x) => [x.cat, x.court, x.t]), [['민사', '서울중앙지방법원', '소장'], ['개인회생', '부산회생법원', '채권자목록 & 변제계획']]);
  assert.deepEqual(parseRows(''), []);
});

test('같은 분류·법원·양식명은 한 번만, 양식명이 같으면 법원을 3곳까지만 남겨 합친다, 일반 이름은 버린다', () => {
  const a = { cat: '민사', court: 'A법원', t: '지급명령 신청서', no: '' };
  assert.equal(dedupe([a, { ...a }, { ...a, court: 'B법원' }]).length, 2);
  const g = groupByTitle([a, { ...a, court: 'B법원' }, { ...a, court: 'C법원' }, { ...a, court: 'D법원' }, { ...a, court: 'D법원' }, { cat: '민사', court: 'A법원', t: '신청서' }, { cat: '가사', court: 'A법원', t: '인지의 허가청구' }]);
  assert.deepEqual(g.map((x) => x.t), ['지급명령 신청서', '인지의 허가청구']);   // '신청서'(일반 이름)는 버린다
  assert.equal(g[0].n, 5); assert.deepEqual(g[0].courts, ['A법원', 'B법원', 'C법원']);
});

test('수집: 1쪽에서 쪽당 건수로 전체 쪽 수를 정하고 모든 쪽을 읽으며, 쉬고, 중복을 거른다', async () => {
  const mk = (p) => [row(p * 2, `[민사] (법원${p}) 양식${p}A`), row(p * 2 - 1, `[민사] (법원${p}) 양식${p}B`)];
  const urls = [], sleeps = [];
  const fetchFn = async (u) => { urls.push(u); const p = Number(new URL(u).searchParams.get('pageIndex')); return { text: async () => page(6, p <= 3 ? mk(p) : []) }; };
  const out = await collect({ fetchFn, delay: 7, sleep: async (ms) => sleeps.push(ms) });
  assert.deepEqual(urls, [buildUrl(1), buildUrl(2), buildUrl(3)]);
  assert.equal(out.rows.length, 6); assert.equal(out.total, 6); assert.deepEqual(sleeps, [7, 7]);
});

test('수집: 목록이 아닌 응답·행을 못 읽는 1쪽은 분명한 오류로 멈춘다', async () => {
  for (const body of ['', '<html><body>접속이 제한되었습니다.</body></html>']) await assert.rejects(collect({ fetchFn: async () => ({ text: async () => body }), sleep: async () => {} }), CourtSiteError);
  await assert.rejects(collect({ fetchFn: async () => ({ text: async () => page(10, [row(1, '제목 형식이 다른 줄')]) }), sleep: async () => {} }), /행을 읽지 못했습니다/);
});

test('서류 DB: 법원 양식은 "법원 양식 · 분류 · 법원"으로 합쳐지고, 핵심 서류·발급 서류와 이름이 같으면 그쪽만 남으며, 검색에서는 같은 점수의 핵심 서류 뒤에 온다', () => {
  const court = [{ t: '소장', cat: '민사', court: '서울중앙지방법원', courts: ['서울중앙지방법원'], n: 3 },
                 { t: '가족관계증명서', cat: '가사', court: 'A법원', courts: ['A법원'], n: 1 },
                 { t: '채권자목록 수정허가신청서', cat: '개인회생', court: '부산회생법원', courts: ['부산회생법원'], n: 1, no: '양식2-03' }];
  const db = buildDocsDb({ forms: [], court });
  const c = db.docs.filter((d) => d.p === 'court');
  assert.equal(c.length, 1, '핵심 서류(소장)·발급 서류(가족관계증명서)와 같은 이름은 뺀다');
  assert.equal(c[0].c, '법원 양식 · 개인회생 · 부산회생법원'); assert.match(c[0].d, /양식2-03 · 대법원 전자민원센터 양식모음/);
  assert.equal(buildDocsDb({ forms: [], court: [{ ...court[2], n: 4 }] }).docs.find((d) => d.p === 'court').c, '법원 양식 · 개인회생 · 부산회생법원 외 3곳');
  const ctx = {}; vm.runInNewContext(readFileSync(join(ROOT, 'assets/docs-search.js'), 'utf8'), { window: ctx });
  const D = ctx.NaviLawDocs, idx = D.createIndex(buildDocsDb({ forms: [], court: [{ t: '소장 제출 안내서', cat: '민사', court: 'A', courts: ['A'], n: 1 }, { t: '채권자목록 수정허가신청서', cat: '개인회생', court: 'B', courts: ['B'], n: 1 }] }));
  assert.equal(D.search(idx, '소장', { limit: 3 })[0].t, '소장', '같은 점수면 핵심 서류가 먼저');
  assert.equal(D.search(idx, '채권자목록수정', { limit: 3 })[0].t, '채권자목록 수정허가신청서', '법원 양식도 찾는다');
});

// 법원 사이트는 EUC-KR 로 내려온다 — 아래 바이트는 실제 EUC-KR 로 인코딩한 목록 조각이다(<meta charset=euc-kr>, "전체글수 : 984건", "[개인회생] (부산회생법원) 채권자목록").
const KR_HEX = '3c68746d6c3e3c686561643e3c6d65746120687474702d65717569763d22436f6e74656e742d547970652220636f6e74656e743d22746578742f68746d6c3b20636861727365743d6575632d6b72223e3c2f686561643e3c626f64793ec0fcc3bcb1dbbcf6203a20393834b0c73c7461626c653e3c74723e3c74643e313c2f74643e3c74643e5bb0b3c0cec8b8bbfd5d2028bacebbeac8b8bbfdb9fdbff82920c3a4b1c7c0dab8f1b7cf3c2f74643e3c2f74723e3c2f7461626c653e3c2f626f64793e3c2f68746d6c3e';
const krBytes = () => Uint8Array.from(Buffer.from(KR_HEX, 'hex'));
test('글자 인코딩: EUC-KR 응답은 meta·헤더의 charset 으로, 선언이 없어도 깨짐을 보고 EUC-KR 로 읽는다(UTF-8 로 읽으면 한글이 깨진다)', () => {
  assert.ok(new TextDecoder('utf-8').decode(krBytes()).includes('\ufffd'), '전제: UTF-8 로 읽으면 깨진다');
  // 세 번째는 charset 선언을 지운 바이트 — 선언이 없어도 UTF-8 로 읽었을 때의 깨짐을 보고 EUC-KR 로 읽어야 한다
  for (const [ct, bytes] of [['text/html', krBytes()], ['text/html; charset=EUC-KR', krBytes()], ['', Uint8Array.from(Buffer.from(Buffer.from(KR_HEX, 'hex').toString('latin1').replace('charset=euc-kr', 'none'), 'latin1'))]]) {
    const { html } = decodeBody(bytes, ct);
    assert.equal(parseTotal(html), 984, ct || '선언 없음');
    const r = parseRows(html); assert.deepEqual([r[0].cat, r[0].court, r[0].t], ['개인회생', '부산회생법원', '채권자목록']);
  }
  assert.equal(decodeBody(Buffer.from('<p>전체글수 : 5건</p>', 'utf8'), 'text/html; charset=utf-8').charset, 'utf-8');
  assert.equal(parseTotal(decodeBody(Buffer.from('<p>전체글수 : 5건</p>', 'utf8'), '').html), 5, '선언 없는 UTF-8 은 그대로');
});
