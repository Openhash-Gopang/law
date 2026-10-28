// 서류 DB 만들기 — data/scrivener.json · data/lawyer.json 의 서류 목록(+ data/docs-aliases.json 의 별칭)을 한 파일 data/docs.json 으로 합친다.
// 사용: node scripts/build-docs-index.mjs        (서류 목록을 바꾼 뒤 반드시 다시 실행 — tests/ 가 최신인지 확인한다)
//       node scripts/build-docs-index.mjs --check (docs.json 이 최신이 아니면 종료 코드 1)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

export function buildDocsDb(opts = {}) {
  const scr = read('data/scrivener.json'), law = read('data/lawyer.json'), aliases = read('data/docs-aliases.json');
  const docs = [];
  const aliasFor = (t) => {
    const out = [];
    for (const a of aliases) if (a.exact ? t === a.match : t.includes(a.match)) out.push(...a.add);
    return [...new Set(out)];
  };
  const push = (p, pid, c, t, d, own = []) => {
    const row = { t, p, pid, c, d: d.length > 120 ? d.slice(0, 119) + '…' : d };
    const a = [...new Set([...own, ...aliasFor(t)])]; if (a.length) row.a = a;
    docs.push(row);
  };
  for (const c of scr.catalog) for (const it of c.items) push('scrivener', 'judicial-scrivener', c.tab, it.t, it.d);
  for (const c of law.catalog) for (const it of c.items) push('lawyer', 'lawyer', c.tab, it.t, it.d);
  for (const f of law.fields) for (const it of f.forms) push('lawyer', f.id, f.name, it.t, it.d);
  // 발급 민원서류(가족관계증명서·등기사항전부증명서 등 첨부서류) — data/issued-docs.json. 법제처 서식 목록에는 신청 서식만 있어 따로 둔다.
  let issued = opts.issued; if (!issued) { try { issued = read('data/issued-docs.json').docs || []; } catch { issued = []; } }
  const nk = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  for (const f of issued) push('issued', 'lawyer', f.c, f.t, f.d || '', f.a || []);
  const issuedKeys = new Set(issued.map((f) => nk(f.t)));
  // 법원 양식(대법원 전자민원센터 양식모음) — data/court-forms.json 이 있을 때만 합친다(scripts/fetch-court-forms.mjs 가 만든다). 핵심 서류·발급 서류와 이름이 같으면 그쪽만 남긴다.
  let court = opts.court; if (!court) { try { court = read('data/court-forms.json').forms || []; } catch { court = []; /* 아직 수집 전 */ } }
  const have = new Set(docs.map((d) => nk(d.t)));
  const stripEff = (t) => String(t).replace(/\s*\(\s*\d{2,4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*(?:부터\s*)?시행\s*\)/g, '').replace(/\s+/g, ' ').trim();   // 제목 끝의 시행일 꼬리표(scripts/court-forms-lib.mjs 의 stripEffective 와 같다)
  for (const f0 of court) {
    const f = { ...f0, t: stripEff(f0.t) };
    if (!f.t || have.has(nk(f.t))) continue;
    have.add(nk(f.t));
    const where = f.n > 1 && f.court ? f.court + ' 외 ' + (f.n - 1) + '곳' : (f.court || '법원');
    const row = { t: f.t, p: 'court', pid: 'lawyer', c: ['법원 양식', f.cat, where].filter(Boolean).join(' · '), d: [f.no, '대법원 전자민원센터 양식모음'].filter(Boolean).join(' · ') };
    const a = aliasFor(f.t); if (a.length) row.a = a;
    docs.push(row);
  }
  // 법제처 별표·서식(민원서식) — data/law-forms.json 이 있을 때만 합친다(scripts/fetch-law-forms.mjs 가 만든다). 발급 서류와 이름이 같으면 발급 서류만 남긴다.
  let extra = opts.forms; if (!extra) { try { extra = read('data/law-forms.json').forms || []; } catch { extra = []; /* 아직 수집 전 */ } }
  for (const f of extra) {
    if (issuedKeys.has(nk(f.t))) continue;
    const more = f.n > 1 && f.law ? f.law + ' 외 ' + (f.n - 1) + '건' : (f.law || '민원서식');
    const row = { t: f.t, p: 'minwon', pid: 'lawyer', c: more, d: [f.no, f.dept, f.src].filter(Boolean).join(' · ') };
    const a = aliasFor(f.t); if (a.length) row.a = a;
    docs.push(row);
  }
  const fields = law.fields.map((f) => ({ id: f.id, name: f.name, scope: f.scope || '' }));
  return { v: 1, docs, fields };
}
export function serialize(db) {
  return '{"v":1,\n"docs":[\n' + db.docs.map((x) => JSON.stringify(x)).join(',\n') + '\n],\n"fields":[\n' + db.fields.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n';
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = serialize(buildDocsDb()), path = join(ROOT, 'data/docs.json');
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(path, 'utf8'); } catch { /* 없음 */ }
    if (cur !== out) { console.error('data/docs.json 이 최신이 아닙니다. node scripts/build-docs-index.mjs 를 실행하세요.'); process.exit(1); }
    console.log('docs.json 최신'); process.exit(0);
  }
  writeFileSync(path, out);
  const db = JSON.parse(out); console.log('서류 ' + db.docs.length + '건 · 분야 ' + db.fields.length + '개 → data/docs.json (' + out.length + '자)');
}
