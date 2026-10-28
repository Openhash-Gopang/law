// 대법원 전자민원센터 양식모음(법원 양식) → data/court-forms.json  (그다음 npm run build:docs 로 서류 DB·자동 완성에 합친다)
//   먼저 모양만 확인:  node scripts/fetch-court-forms.mjs --diagnose      (1쪽 HTML 을 data/raw/court-page1.html 에 저장하고 읽은 행 수를 보여 준다)
//   수집:              node scripts/fetch-court-forms.mjs                 (99쪽을 차례로, 호출 사이 1초 — 2분 안팎)
//   옵션: --delay 1000  --out data/court-forms.json
// 인증키가 필요 없다. 목록 화면만 읽으며 양식 파일(hwp·pdf)은 내려받지 않는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collect, buildUrl, parseTotal, parseRows, groupByTitle, decodeBody } from './court-forms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const headers = { 'User-Agent': 'Mozilla/5.0 (navilaw form index; contact tensor.city@gmail.com)', 'Accept-Language': 'ko' };
// 법원 사이트는 EUC-KR 로 내려올 수 있어, 바이트로 받아 charset 에 맞게 푼다(res.text() 는 UTF-8 로만 읽어 한글이 깨진다).
const fetchFn = async (url) => {
  const res = await fetch(url, { headers }), buf = new Uint8Array(await res.arrayBuffer());
  const { html, charset } = decodeBody(buf, res.headers.get('content-type') || '');
  return { status: res.status, buf, charset, text: async () => html };
};

if (args.includes('--diagnose')) {
  const res = await fetchFn(buildUrl(1)); const html = await res.text();
  mkdirSync(join(ROOT, 'data/raw'), { recursive: true });
  writeFileSync(join(ROOT, 'data/raw/court-page1.html'), res.buf);   // 받은 그대로(바이트) 저장한다
  const rows = parseRows(html);
  console.log('HTTP', res.status, '· 글자 인코딩:', res.charset, '· 저장: data/raw/court-page1.html (' + res.buf.length + '바이트) · 전체 건수:', parseTotal(html), '· 읽은 행:', rows.length);
  if (rows[0]) console.log('첫 행:', rows[0]); else console.log('행을 읽지 못했습니다. 이 HTML 파일을 보내 주면 읽기 코드를 맞춥니다.');
} else {
  const { rows, total, read } = await collect({ fetchFn, delay: Number(opt('delay', '1000')), log: (m) => console.log(m) });
  const hangul = rows.filter((r) => /[가-힣]/.test(r.t)).length;
  if (!rows.length || hangul < rows.length * 0.9) { console.error('양식명 ' + rows.length + '건 중 한글이 읽힌 것이 ' + hangul + '건뿐입니다(글자 인코딩 문제로 보입니다). 저장하지 않고 멈춥니다 — --diagnose 의 "글자 인코딩"과 첫 행을 확인하세요.'); process.exit(3); }
  if (!total) console.warn('사이트 표시 건수를 읽지 못했습니다. 읽은 건수(' + read + ')를 사이트의 "전체글수"와 직접 비교하세요.');
  if (total && read < total * 0.9) { console.error('읽은 건수(' + read + ')가 사이트 표시 건수(' + total + ')의 90%에 못 미칩니다. 저장하지 않고 멈춥니다 — --diagnose 로 저장한 data/raw/court-page1.html 을 확인하세요.'); process.exit(2); }
  const forms = groupByTitle(rows);
  forms.sort((a, b) => a.t.localeCompare(b.t, 'ko'));
  const out = join(ROOT, opt('out', 'data/court-forms.json'));
  writeFileSync(out, JSON.stringify({ v: 1, source: '대법원 전자민원센터 양식모음', forms }).replace(/\},\{/g, '},\n{') + '\n');
  console.log('양식 ' + read + '건 읽음(사이트 표시 ' + (total || '?') + '건) → 중복 제거 ' + rows.length + '건 → 양식명 기준 ' + forms.length + '건 → ' + out + '\n다음: npm run build:docs');
}
