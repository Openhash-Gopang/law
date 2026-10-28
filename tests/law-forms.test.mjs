// 법제처 서식 수집 — 네트워크 없이 응답 모양과 수집 흐름을 시험한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRows, normalizeRow, splitTitle, dedupe, buildUrl, collect, groupByTitle, isGeneric, LawApiError } from '../scripts/law-forms-lib.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDocsDb } from '../scripts/build-docs-index.mjs';

const row = (name, law, kind = '서식', dept = '농림축산식품부') => ({ 별표일련번호: '1', 관련법령명: law, 별표명: name, 별표종류: kind, 소관부처명: dept });
const page1 = { licBylSearch: { target: 'licbyl', totalCnt: 3, page: 1, licbyl: [
  row('[별지 제3호서식] 농지취득자격증명신청서(앞쪽)', '농지법 시행규칙'),
  row('별지 제2호서식 가족관계증명서 발급신청서', '가족관계의 등록 등에 관한 법률 시행규칙', '서식', '법원행정처'),
  row('별표 1 과태료 부과기준', '농지법 시행령', '별표'),
] } };

test('응답에서 행과 전체 건수를 찾고, 단일 행 객체도 읽는다', () => {
  const r = extractRows(page1); assert.equal(r.rows.length, 3); assert.equal(r.total, 3);
  const one = extractRows({ x: { totalCnt: 1, licbyl: row('[별지 제1호서식] 신고서', '법') } });
  assert.equal(one.rows.length, 1);
  assert.deepEqual(extractRows({}).rows, []);
});

test('제목에서 서식 번호·"(앞쪽)"을 떼고, 별표(표)는 버린다', () => {
  assert.deepEqual(splitTitle('[별지 제3호서식] 농지취득자격증명신청서(앞쪽)'), { t: '농지취득자격증명신청서', no: '별지제3호서식' });
  assert.equal(splitTitle('토지 임대차 계약서').t, '토지 임대차 계약서');
  const f = normalizeRow(row('[별지 제3호서식] 농지취득자격증명신청서(앞쪽)', '농지법 시행규칙'), 'licbyl');
  assert.equal(f.t, '농지취득자격증명신청서'); assert.equal(f.law, '농지법 시행규칙'); assert.equal(f.src, '법령');
  assert.equal(normalizeRow(row('별표 1 과태료 부과기준', '농지법 시행령', '별표'), 'licbyl'), null);
  assert.equal(normalizeRow({}, 'licbyl'), null);
});

test('같은 서식명·법령은 한 번만', () => {
  assert.equal(dedupe([{ t: '신청서', law: 'A' }, { t: '신 청 서', law: 'A' }, { t: '신청서', law: 'B' }]).length, 2);
});

test('호출 주소: OC·target·type=JSON·검색어·쪽', () => {
  const u = new URL(buildUrl({ oc: 'x', target: 'licbyl', query: '신청서', knd: '2', page: 3 }));
  assert.equal(u.origin + u.pathname, 'https://www.law.go.kr/DRF/lawSearch.do');
  for (const [k, v] of [['OC', 'x'], ['target', 'licbyl'], ['type', 'JSON'], ['query', '신청서'], ['knd', '2'], ['page', '3'], ['display', '100']]) assert.equal(u.searchParams.get(k), v, k);
});

const resp = (obj) => ({ text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });

test('수집: 쪽을 넘기고 중복·별표를 거르며, 호출 사이에 쉰다', async () => {
  const calls = [], sleeps = [];
  const fetchFn = async (url) => {
    calls.push(url); const p = Number(new URL(url).searchParams.get('page'));
    return resp(p === 1 ? { r: { totalCnt: 3, licbyl: [row('[별지 제3호서식] 농지취득자격증명신청서', '농지법 시행규칙'), row('별표 1 기준', '령', '별표')] } }
                       : { r: { totalCnt: 3, licbyl: [row('[별지 제3호서식] 농지취득자격증명신청서', '농지법 시행규칙')] } });
  };
  const out = await collect({ oc: 'x', queries: ['신청서'], max: 300, delay: 5, fetchFn, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(calls.length, 2); assert.equal(out.length, 1); assert.equal(out[0].t, '농지취득자격증명신청서');
  assert.ok(sleeps.length >= 2 && sleeps.every((m) => m === 5));
});

test('수집: knd 로 결과가 없으면 knd 없이 다시 묻는다', async () => {
  const urls = [];
  const fetchFn = async (url) => { urls.push(url); return resp(new URL(url).searchParams.get('knd') ? { r: { totalCnt: 0 } } : { r: { totalCnt: 1, licbyl: [row('[별지 제1호서식] 증명서', '법')] } }); };
  const out = await collect({ oc: 'x', queries: ['증명서'], fetchFn, sleep: async () => {} });
  assert.equal(out.length, 1); assert.equal(urls.length, 2);
});

test('서버 IP 미등록·HTML 응답은 분명한 오류로 멈춘다', async () => {
  for (const body of ['', '<html><body>사용자 정보 검증에 실패하였습니다.</body></html>', '<?xml version="1.0"?><Response>미신청</Response>']) {
    await assert.rejects(collect({ oc: 'x', queries: ['a'], fetchFn: async () => resp(body), sleep: async () => {} }), LawApiError);
  }
});

test('서류 DB: law-forms.json 이 있으면 "민원서식"으로 합치고, 없으면 그대로다', () => {
  const db = buildDocsDb();
  assert.ok(db.docs.length >= 399);
  assert.ok(db.docs.filter((d) => d.p !== 'minwon' && d.p !== 'issued').length === 399);
});

test('일반 이름(신청서·증명서 등)은 버리고, 서식명이 같은 것은 법령을 3개까지만 남겨 합친다', () => {
  assert.ok(isGeneric('신청서') && isGeneric('증명서') && isGeneric('위임장') && isGeneric('서식') && !isGeneric('농지취득자격증명신청서'));
  const g = groupByTitle([
    { t: '농지취득자격증명신청서', law: '농지법 시행규칙', kind: '서식', dept: '농림축산식품부', src: '법령' },
    { t: '허가신청서', law: 'A법 시행규칙' }, { t: '신청서', law: 'B' },
    { t: '영업신고서', law: '식품위생법 시행규칙' }, { t: '영업 신고서', law: '공중위생관리법 시행규칙' }, { t: '영업신고서', law: '체육시설법 시행규칙' }, { t: '영업신고서', law: '4번째법' }, { t: '영업신고서', law: '5번째법' },
  ]);
  assert.deepEqual(g.map((x) => x.t), ['농지취득자격증명신청서', '영업신고서']);
  const y = g[1]; assert.equal(y.n, 5); assert.equal(y.laws.length, 3);
});

test('서류 DB: 합쳐진 민원서식은 "법령 외 N건"으로 표시되고, 검색에서는 같은 점수의 핵심 서류 뒤에 온다', () => {
  const forms = [{ t: '농지취득자격증명신청서', no: '별지제3호서식', law: '농지법 시행규칙', laws: ['농지법 시행규칙'], n: 1, dept: '농림축산식품부', src: '법령' },
                 { t: '영업신고서(식품)', law: '식품위생법 시행규칙', laws: ['식품위생법 시행규칙'], n: 3, dept: '식품의약품안전처', src: '법령' },
                 { t: '소장 작성 안내', law: 'X', n: 1 }];
  const db = buildDocsDb({ forms });
  const m = db.docs.filter((d) => d.p === 'minwon');
  assert.equal(m.length, 3); assert.equal(m[0].c, '농지법 시행규칙'); assert.equal(m[1].c, '식품위생법 시행규칙 외 2건'); assert.match(m[0].d, /별지제3호서식 · 농림축산식품부 · 법령/);
  const ctx = {}; vm.runInNewContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../assets/docs-search.js'), 'utf8'), { window: ctx });
  const idx = ctx.NaviLawDocs.createIndex(db), titles = (q) => ctx.NaviLawDocs.search(idx, q, { limit: 5 }).map((e) => e.t);
  assert.equal(titles('농지취득자격')[0], '농지취득자격증명신청서', '목록에 없던 서류를 이제 찾는다');
  assert.equal(titles('ㄴㅈㅊㄷㅈㄱ')[0], '농지취득자격증명신청서', '초성으로도');
  assert.equal(titles('소장')[0], '소장', '같은 점수면 핵심 서류가 먼저');
});
