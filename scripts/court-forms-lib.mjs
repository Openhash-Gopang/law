// 대법원 전자민원센터 "양식모음"(법원 양식)을 모으는 순수 함수들 — 네트워크는 fetchFn 으로 주입한다(시험용).
//   목록: https://www.scourt.go.kr/nm/minwon/doc/DocListAction.work?pageIndex=<쪽>   (전체 984건·쪽당 10건 안팎, 제목은 "[분류] (법원명) 양식명")
//   HTML 모양은 실제 호출로 확인한다(node scripts/fetch-court-forms.mjs --diagnose). 아래 함수는 모양이 조금 달라도 읽히도록 느슨하게 쓴다.
import { isGeneric } from './law-forms-lib.mjs';

export const LIST_URL = 'https://www.scourt.go.kr/nm/minwon/doc/DocListAction.work';
export const buildUrl = (page) => LIST_URL + '?pageIndex=' + page;

/** 응답 바이트 → 글자. Content-Type 의 charset → HTML 의 <meta charset> 순으로 정하고, 알 수 없으면 UTF-8 로 읽되 깨진 글자(U+FFFD)가 나오면 EUC-KR 로 다시 읽는다. 법원 사이트는 EUC-KR 로 내려온다. */
export function decodeBody(buf, contentType = '') {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const cs = (/charset=["']?([\w-]+)/i.exec(contentType) || /charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 4096))) || [])[1];
  const read = (label) => { try { return new TextDecoder(label.toLowerCase()).decode(bytes); } catch { return null; } };
  if (cs) { const html = read(cs); if (html != null) return { html, charset: cs.toLowerCase() }; }
  const utf8 = read('utf-8');
  if (!utf8.includes('\ufffd')) return { html: utf8, charset: 'utf-8' };
  const kr = read('euc-kr'); return kr != null && !kr.includes('\ufffd') ? { html: kr, charset: 'euc-kr(추정)' } : { html: utf8, charset: 'utf-8' };
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&middot;': '·' };
const unesc = (s) => s.replace(/&(?:amp|lt|gt|quot|nbsp|middot|#39);/g, (m) => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (html) => unesc(String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "전체글수 : 984건" → 984 (없으면 0) */
export function parseTotal(html) {
  const m = text(html).match(/전체\s*글\s*수\s*:?\s*([\d,]+)\s*건/);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/** 제목 "[개인회생] (부산회생법원) [양식1-01] 변경 채권자목록" → { cat, court, no, t } (양식이 아니면 null) */
export function splitCourtTitle(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^\[([^\]]+)\]\s*(?:\(([^)]*)\)\s*)?(.+)$/);
  if (!m) return null;
  let t = m[3].trim(), no = '';
  const n = t.match(/^\[\s*(양식[^\]]*)\]\s*(.+)$/);
  if (n) { no = n[1].replace(/\s+/g, ''); t = n[2].trim(); }
  t = t.replace(/\s*(?:\bhwp\b|\bpdf\b|한글|파일)(?:\s*(?:\bhwp\b|\bpdf\b|한글|파일))*\s*$/i, '').trim();   // 제목 끝에 붙은 파일 형식 표시
  if (!t || t.length < 2) return null;
  return { cat: m[1].trim(), court: (m[2] || '').trim(), no, t };
}

/** 쪽 HTML → 양식 행들. 표의 행(tr)마다 "[분류]"로 시작하는 칸을 제목으로 본다. */
export function parseRows(html) {
  const out = [];
  for (const tr of String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(text);
    const title = cells.find((c) => /^\[[^\]]+\]/.test(c));
    if (!title) continue;
    const r = splitCourtTitle(title); if (r) out.push(r);
  }
  return out;
}

const key = (f) => [f.cat, f.court, f.t].join('|').replace(/\s+/g, '').toLowerCase();
export function dedupe(list) { const seen = new Set(), out = []; for (const f of list) { const k = key(f); if (seen.has(k)) continue; seen.add(k); out.push(f); } return out; }

export class CourtSiteError extends Error {}
const checkBody = (html) => {
  const t = String(html || '').trim();
  if (!t) throw new CourtSiteError('빈 응답입니다.');
  if (!/<tr/i.test(t) && !/전체\s*글\s*수/.test(text(t))) throw new CourtSiteError('양식 목록이 아닌 응답입니다: ' + text(t).slice(0, 120));
  return t;
};

/** 1쪽에서 전체 건수와 쪽당 건수를 알아낸 뒤 모든 쪽을 읽는다. 호출 사이에 delay 를 둔다. */
export async function collect({ fetchFn = fetch, delay = 1000, maxPages = 400, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const all = [];
  const first = checkBody(await (await fetchFn(buildUrl(1))).text());
  const total = parseTotal(first), rows1 = parseRows(first);
  if (!rows1.length) throw new CourtSiteError('1쪽에서 양식 행을 읽지 못했습니다. --diagnose 로 저장한 HTML 을 확인하세요.');
  const per = rows1.length, pages = Math.min(maxPages, total ? Math.ceil(total / per) : maxPages);
  all.push(...rows1); log(`  1/${pages}쪽: ${rows1.length}건 (전체 ${total || '?'}건)`);
  for (let p = 2; p <= pages; p++) {
    await sleep(delay);
    const rows = parseRows(checkBody(await (await fetchFn(buildUrl(p))).text()));
    if (!rows.length) { log(`  ${p}쪽: 행 없음 → 끝`); break; }
    all.push(...rows); if (p % 10 === 0 || p === pages) log(`  ${p}/${pages}쪽 (누적 ${all.length}건)`);
  }
  return { rows: dedupe(all), total, read: all.length };
}

/** 같은 양식명은 한 건으로 합친다(법원명은 앞의 3곳만 남기고 곳수를 센다). 법원마다 같은 양식이 있어 자동 완성이 같은 이름으로 차는 것을 막는다. */
export function groupByTitle(list) {
  const map = new Map();
  for (const f of list) {
    if (isGeneric(f.t)) continue;
    const k = f.t.replace(/\s+/g, '').toLowerCase();
    const g = map.get(k);
    if (!g) { map.set(k, { t: f.t, cat: f.cat, court: f.court, courts: f.court ? [f.court] : [], n: 1, no: f.no || '' }); continue; }
    g.n += 1; if (f.court && g.courts.length < 3 && !g.courts.includes(f.court)) g.courts.push(f.court);
  }
  return [...map.values()];
}
