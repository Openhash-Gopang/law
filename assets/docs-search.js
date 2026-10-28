/* 나비로 Navi Law — 서류 검색 (data/docs.json 위의 가벼운 인메모리 색인)
   - 한글을 자모로 풀어 비교한다: 글자를 치는 도중("근저ㄷ", "농지취득자ㄱ")에도 앞부분이 맞으면 바로 찾는다.
   - 초성 검색: "ㄱㅈㄷ" → 근저당…
   - 제목 변형(괄호 뺀 이름, ·/+ 로 나뉜 각 이름, 끝의 신청서·청구서 뺀 이름)과 별칭(data/docs-aliases.json)도 찾는다.
   전역: window.NaviLawDocs = { createIndex, search, norm, jamo, cho } */
(function (root) {
  'use strict';
  var L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  var T = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  var VS = { 'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ' };
  var TS = { 'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ' };

  /** 검색용으로 정리: 소문자, 공백·구두점 제거. */
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s·.,:;!?()\[\]{}「」『』"'`~\-–—_\/\\+&*]/g, ''); }
  /** 자모 풀어쓰기: "근저당" → "ㄱㅡㄴㅈㅓㄷㅏㅇ". 겹모음·겹받침도 낱자로 푼다. */
  function jamo(s) {
    var out = '', i, c, x, v, t;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        x = c - 0xAC00; v = V.charAt(Math.floor((x % 588) / 28)); t = T.charAt(x % 28);
        out += L.charAt(Math.floor(x / 588)) + (VS[v] || v) + (t === ' ' ? '' : (TS[t] || t));
      } else out += s.charAt(i);
    }
    return out;
  }
  /** 초성만 뽑기: "근저당" → "ㄱㅈㄷ" */
  function cho(s) {
    var out = '', i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); if (c >= 0xAC00 && c <= 0xD7A3) out += L.charAt(Math.floor((c - 0xAC00) / 588)); }
    return out;
  }
  /** 제목 변형: 괄호 뺀 이름, ·/+ 로 나뉜 각 이름, 끝의 신청서·청구서 등을 뺀 이름 */
  function variants(t) {
    var set = {}, base = t.replace(/\([^)]*\)/g, ''), parts = base.split(/\s*[·+\/]\s*|\s[-–]\s|,\s*/), i, p, q;
    set[base] = 1;
    for (i = 0; i < parts.length; i++) {
      p = parts[i].trim(); if (p.length >= 2) set[p] = 1;
      q = p.replace(/(신청서|청구서|신청|제출서|개시신청서)$/, ''); if (q.length >= 2) set[q] = 1;
    }
    delete set[t];
    return Object.keys(set);
  }

  function entry(kind, o) {
    var e = { kind: kind, t: o.t, p: o.p, pid: o.pid, fid: o.fid, c: o.c, d: o.d || '' };
    e.n = norm(o.t); e.j = jamo(e.n); e.h = cho(e.n);
    e.vj = variants(o.t).map(function (v) { return jamo(norm(v)); }).filter(function (v) { return v && v !== e.j; });
    e.aj = (o.a || []).map(function (a) { return jamo(norm(a)); });
    e.cj = jamo(norm(o.c || '')); e.dj = jamo(norm(o.d || ''));
    return e;
  }
  /** data/docs.json 내용 → 색인 */
  function createIndex(db) {
    var list = [], i;
    for (i = 0; i < db.docs.length; i++) { var d = db.docs[i]; list.push(entry('doc', { t: d.t, p: d.p, pid: d.pid, c: d.c, d: d.d, a: d.a })); list[i].order = i; }
    var base = list.length;
    for (i = 0; i < (db.fields || []).length; i++) {
      var f = db.fields[i], e = entry('field', { t: f.name, p: 'lawyer', pid: f.id, c: '분야별 서류', d: f.scope });
      e.fid = f.id; e.order = base + i; list.push(e);
    }
    return list;
  }

  function at(hay, q) { return hay ? hay.indexOf(q) : -1; }
  function score(e, qj, qc) {
    var s = 0, i, k;
    if (qc) { i = at(e.h, qc); return i === 0 ? 65 : i > 0 ? 55 : 0; }
    if (e.kind === 'field') { i = at(e.j, qj); return i === 0 ? 78 : i > 0 ? 60 : 0; }
    i = at(e.j, qj);
    if (i === 0) s = 100 + Math.round(10 * qj.length / e.j.length);
    else if (i > 0) s = 80 - Math.min(i, 20) * 0.1;
    for (k = 0; k < e.vj.length; k++) { i = at(e.vj[k], qj); if (i === 0) s = Math.max(s, 92); else if (i > 0) s = Math.max(s, 72); }
    for (k = 0; k < e.aj.length; k++) { i = at(e.aj[k], qj); if (i === 0) s = Math.max(s, 88); else if (i > 0) s = Math.max(s, 74); }
    if (!s && at(e.cj, qj) >= 0) s = 40;
    if (!s && at(e.dj, qj) >= 0) s = 30;
    return s;
  }
  /** search(index, "근저", { persona: 'scrivener'|'lawyer'|'', limit: 8 }) → 점수 순 결과(같은 이름의 서류는 첫 항목만) */
  function search(index, q, opts) {
    opts = opts || {};
    var qn = norm(q); if (!qn) return [];
    var qj = jamo(qn), qc = /^[ㄱ-ㅎ]{2,}$/.test(qn) ? qn : '';
    var out = [], seen = {}, i, e, s;
    for (i = 0; i < index.length; i++) {
      e = index[i];
      if (opts.persona && e.p !== opts.persona) continue;
      s = score(e, qj, qc); if (!s) continue;
      out.push({ e: e, s: s });
    }
    out.sort(function (a, b) { return b.s - a.s || a.e.order - b.e.order; });
    var res = [], key;
    for (i = 0; i < out.length && res.length < (opts.limit || 8); i++) {
      e = out[i].e; key = e.kind + '|' + e.p + '|' + e.n;
      if (seen[key]) continue; seen[key] = 1; res.push(e);
    }
    return res;
  }
  /** best(index, "근저당권 말소등기 신청서 작성") → 서류 하나(없으면 null). 입력이 제목·변형·별칭을 포함하거나(문장 속 서류명), 제목이 입력을 충분히 덮을 때만. */
  function best(index, q) {
    var qn = norm(q); if (!qn) return null;
    var qj = jamo(qn), top = null, ts = 0, i, k, e, s, hay;
    for (i = 0; i < index.length; i++) {
      e = index[i]; if (e.kind !== 'doc') continue;
      s = score(e, qj, '');
      hay = [e.j].concat(e.vj, e.aj);
      for (k = 0; k < hay.length; k++) if (hay[k].length >= 6 && qj.indexOf(hay[k]) >= 0) s = Math.max(s, 85);
      if (s > ts) { ts = s; top = e; }
    }
    return ts >= 72 ? top : null;
  }
  root.NaviLawDocs = { createIndex: createIndex, search: search, best: best, norm: norm, jamo: jamo, cho: cho };
})(typeof window !== 'undefined' ? window : this);
