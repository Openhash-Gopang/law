// 법제처 별표·서식 목록 → data/law-forms.json  (그다음 npm run build:docs 로 서류 DB·자동 완성에 합친다)
//   준비: open.law.go.kr 마이페이지 > API인증키관리 에서 이 PC 의 공인 IP 를 등록한다(안 하면 빈 결과/거절).
//   먼저 모양만 확인:  $env:LAW_OC="내OC"; node scripts/fetch-law-forms.mjs --diagnose
//   수집:              $env:LAW_OC="내OC"; node scripts/fetch-law-forms.mjs
//   옵션: --targets licbyl,admbyl,ordinbyl  --queries 신청서,신고서  --knd 2  --max 300  --delay 1200  --out data/law-forms.json
// OC 는 요청 주소에 그대로 실린다 — 저장소에 올리지 말고 환경변수로만 쓴다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collect, buildUrl, extractRows, TARGETS } from './law-forms-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const oc = process.env.LAW_OC;
if (!oc) { console.error('환경변수 LAW_OC 가 없습니다. 예) $env:LAW_OC="내OC"'); process.exit(1); }
const targets = opt('targets', 'licbyl').split(',').map((s) => s.trim()).filter((t) => TARGETS[t]);
const queries = opt('queries', '') ? opt('queries', '').split(',').map((s) => s.trim()).filter(Boolean) : JSON.parse(readFileSync(join(ROOT, 'data/law-form-queries.json'), 'utf8'));
const knd = opt('knd', '2');

if (args.includes('--diagnose')) {
  // 한 번만 호출해 응답 모양을 저장·출력한다 — 모양이 다르면 이 파일(data/raw/diagnose.json)을 보내 주면 읽기 코드를 맞춘다.
  const url = buildUrl({ oc, target: targets[0] || 'licbyl', query: queries[0], knd, page: 1, display: 5 });
  const res = await fetch(url); const text = await res.text();
  mkdirSync(join(ROOT, 'data/raw'), { recursive: true });
  writeFileSync(join(ROOT, 'data/raw/diagnose.json'), text);
  console.log('HTTP', res.status, '· 저장: data/raw/diagnose.json (' + text.length + '자)');
  try { const j = JSON.parse(text); const { rows, total } = extractRows(j); console.log('최상위 키:', Object.keys(j), '· 전체 건수:', total, '· 읽은 행:', rows.length); if (rows[0]) console.log('첫 행 키:', Object.keys(rows[0])); }
  catch { console.log('JSON 이 아닙니다. 앞부분:\n' + text.slice(0, 300)); }
  process.exit(0);
}

const forms = await collect({ oc, targets, queries, knd, max: Number(opt('max', '300')), delay: Number(opt('delay', '1200')), log: (m) => console.log(m) });
const out = join(ROOT, opt('out', 'data/law-forms.json'));
forms.sort((a, b) => a.t.localeCompare(b.t, 'ko'));
writeFileSync(out, JSON.stringify({ v: 1, source: '법제처 국가법령정보 Open API (별표·서식 목록)', forms }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log('서식 ' + forms.length + '건 → ' + out + '\n다음: npm run build:docs');
