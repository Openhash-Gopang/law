// 법제처 국가법령정보 Open API(법령·행정규칙·자치법규 별표·서식 목록)에서 서식을 모으는 순수 함수들 — 네트워크는 fetchFn 으로 주입한다(시험용).
//   목록 호출: https://www.law.go.kr/DRF/lawSearch.do?OC=<OC>&target=licbyl|admbyl|ordinbyl&type=JSON&search=1&knd=2&query=<서식명 검색어>&display=100&page=<쪽>
//   응답 모양은 실제 호출로 확인한다(node scripts/fetch-law-forms.mjs --diagnose). 아래 함수는 모양이 조금 달라도 읽히도록 느슨하게 쓴다.
export const TARGETS = { licbyl: '법령', admbyl: '행정규칙', ordinbyl: '자치법규' };
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim(); return ''; };

/** JSON 응답 안에서 별표·서식 행 배열과 전체 건수를 찾는다. */
export function extractRows(json) {
  let rows = null, total = 0;
  const walk = (v, depth) => {
    if (rows || depth > 4 || v == null) return;
    if (Array.isArray(v)) { if (v.length && typeof v[0] === 'object' && Object.keys(v[0]).some((k) => /별표|서식|법령명|행정규칙명|자치법규명/.test(k))) rows = v; else v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (/^totalCnt$/i.test(k)) total = Number(x) || 0;
      for (const x of Object.values(v)) walk(x, depth + 1);
    }
  };
  walk(json, 0);
  if (!rows) { // 행이 하나뿐이면 배열이 아니라 객체로 올 수 있다
    const one = (function find(v, d) { if (d > 4 || !v || typeof v !== 'object') return null; if (!Array.isArray(v) && Object.keys(v).some((k) => /^별표(명|서식명)$/.test(k))) return v; for (const x of Object.values(v)) { const r = find(x, d + 1); if (r) return r; } return null; })(json, 0);
    if (one) rows = [one];
  }
  return { rows: rows || [], total };
}

/** 제목 앞의 "[별지 제3호서식]" 같은 서식 번호를 떼어 서식명과 번호를 나눈다. */
export function splitTitle(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^\[?\s*(별지\s*제?\s*\d+(?:호)?(?:의\s*\d+)?\s*서식|서식\s*제?\s*\d+\s*호?|별표\s*제?\s*\d+(?:호)?(?:의\s*\d+)?)\s*\]?\s*(.*)$/);
  if (m && m[2]) return { t: m[2].replace(/\s*\((앞쪽|뒤쪽|\d+쪽 ?중 ?\d+쪽)\)\s*$/, '').trim(), no: m[1].replace(/\s+/g, '') };
  return { t: s.replace(/\s*\((앞쪽|뒤쪽)\)\s*$/, '').trim(), no: '' };
}

/** 응답 한 행 → 서식 한 건(서식이 아니면 null) */
export function normalizeRow(r, target) {
  const rawTitle = pick(r, ['별표명', '별표서식명', '서식명', '별표제목']);
  if (!rawTitle) return null;
  const kind = pick(r, ['별표종류', '별표서식종류', '서식종류']);
  if (kind && /별표/.test(kind) && !/서식|별지/.test(kind)) return null;   // 표(별표)는 서류가 아니다
  const { t, no } = splitTitle(rawTitle);
  if (!t || t.length < 2) return null;
  return {
    t, no,
    law: pick(r, ['관련법령명', '법령명한글', '법령명', '행정규칙명', '자치법규명', '관련행정규칙명', '관련자치법규명']),
    kind: kind || '서식',
    dept: pick(r, ['소관부처명', '소관부처', '지자체기관명']),
    src: TARGETS[target] || target,
  };
}

const key = (f) => (f.t + '|' + f.law).replace(/\s+/g, '').toLowerCase();
export function dedupe(list) { const seen = new Set(), out = []; for (const f of list) { const k = key(f); if (seen.has(k)) continue; seen.add(k); out.push(f); } return out; }

export function buildUrl({ oc, target, query, knd, page, display = 100 }) {
  const p = new URLSearchParams({ OC: oc, target, type: 'JSON', search: '1', query, display: String(display), page: String(page) });
  if (knd) p.set('knd', knd);
  return 'https://www.law.go.kr/DRF/lawSearch.do?' + p.toString();
}

export class LawApiError extends Error {}
const checkBody = (text) => {
  const t = String(text || '').trim();
  if (!t) throw new LawApiError('빈 응답입니다. 인증키(OC)의 서버 IP 등록과 target 값을 확인하세요.');
  if (t[0] === '<' || /사용자\s*정보\s*검증에\s*실패|미신청|IP주소|도메인주소/.test(t.slice(0, 400)))
    throw new LawApiError('법제처가 호출을 거절했습니다(서버 IP 미등록이거나 OC 오류): ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  try { return JSON.parse(t); } catch { throw new LawApiError('JSON 이 아닌 응답입니다: ' + t.slice(0, 120)); }
};

/** 검색어마다 쪽을 넘기며 모은다. 호출 사이에 delay 를 둔다(법제처는 짧은 시간의 과도한 호출을 제한한다). */
export async function collect({ oc, targets = ['licbyl'], queries, knd = '2', max = 300, delay = 1200, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} }) {
  const all = [];
  for (const target of targets) {
    for (const query of queries) {
      let got = 0, page = 1, total = Infinity, useKnd = knd;
      for (;;) {
        const res = await fetchFn(buildUrl({ oc, target, query, knd: useKnd, page }));
        const json = checkBody(await res.text());
        const { rows, total: tc } = extractRows(json);
        if (page === 1) { total = tc || rows.length; if (!rows.length && useKnd) { useKnd = ''; log(`  ${target} "${query}": knd=${knd} 결과 없음 → knd 없이 다시`); await sleep(delay); continue; } }
        if (!rows.length) break;
        for (const r of rows) { const f = normalizeRow(r, target); if (f) all.push(f); }
        got += rows.length; page += 1;
        log(`  ${target} "${query}": ${Math.min(got, total)}/${total}`);
        await sleep(delay);
        if (got >= Math.min(total, max)) break;
      }
    }
  }
  return dedupe(all);
}
