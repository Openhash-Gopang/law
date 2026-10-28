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
    return (e.p === 'minwon' || e.p === 'court') && s > 3 ? s - 3 : s;   // 법제처 민원서식·법원 양식은 같은 점수면 핵심·발급 서류 뒤
  }
  /** search(index, "근저", { persona: 'scrivener'|'lawyer'|'', limit: 8 }) → 점수 순 결과(같은 이름의 서류는 첫 항목만) */
  function pick(out, opts) {
    var res = [], seen = {}, i, e, key;
    out.sort(function (a, b) { return b.s - a.s || a.e.order - b.e.order; });
    for (i = 0; i < out.length && res.length < (opts.limit || 8); i++) {
      e = out[i].e; key = e.kind + '|' + e.p + '|' + e.n;
      if (seen[key]) continue; seen[key] = 1; res.push(e);
    }
    return res;
  }
  function scan(index, qn, opts) {
    var qj = jamo(qn), qc = /^[ㄱ-ㅎ]{2,}$/.test(qn) ? qn : '', out = [], i, e, s;
    for (i = 0; i < index.length; i++) {
      e = index[i];
      if (opts.persona && e.p !== opts.persona) continue;
      s = score(e, qj, qc); if (!s) continue;
      out.push({ e: e, s: s });
    }
    return out;
  }
  /** 띄어 쓴 단어가 모두 들어 있는 서류(제목·변형·별칭이면 높게, 분류·설명에만 있으면 낮게) — 순서와 붙임은 따지지 않는다. */
  function scanWords(index, words, opts) {
    var wj = words.map(function (w) { return jamo(w); }), out = [], i, e, k, w, s, inT, inAll;
    for (i = 0; i < index.length; i++) {
      e = index[i]; if (e.kind !== 'doc') continue;
      if (opts.persona && e.p !== opts.persona) continue;
      inT = e.j + ' ' + e.vj.join(' ') + ' ' + e.aj.join(' '); inAll = inT + ' ' + e.cj + ' ' + e.dj; s = 0;
      for (k = 0; k < wj.length; k++) { w = wj[k]; if (inT.indexOf(w) < 0) { s = -1; break; } }
      if (s < 0) {
        for (k = 0; k < wj.length; k++) if (inAll.indexOf(wj[k]) < 0) { s = -1; break; }
        s = s < 0 ? 0 : 36;
      } else s = 56;
      if (!s) continue;
      out.push({ e: e, s: (e.p === 'minwon' || e.p === 'court') ? s - 3 : s });
    }
    return out;
  }
  var TAIL = /(신청서|청구서|신고서|신청|청구|서류|서|장)$/;
  /** search(index, "근저", { persona, limit }) — 먼저 그대로 찾고, 결과가 없을 때만 ① 끝의 서·장·신청 등을 뗀 말 ② 띄어 쓴 단어가 모두 든 서류를 찾는다. */
  function search(index, q, opts) {
    opts = opts || {};
    var qn = norm(q); if (!qn) return [];
    var res = pick(scan(index, qn, opts), opts), words, ws, s2;
    if (res.length) return res;
    words = String(q).split(/[\s,]+/).filter(function (w) { return norm(w).length >= 2; }).map(norm);
    if (words.length >= 2) {
      ws = words.map(function (w) { var t = w.replace(TAIL, ''); return t.length >= 2 ? t : w; });
      res = pick(scanWords(index, ws, opts), opts); if (res.length) return res;
    }
    s2 = qn.replace(TAIL, '');
    if (s2 !== qn && s2.length >= 2) { res = pick(scan(index, s2, opts), opts); if (res.length) return res; }
    return [];
  }
  var GENERIC = {}; ['신청서', '청구서', '신고서', '증명서', '확인서', '계약서', '허가신청서', '제출서', '요청서', '통지서', '동의서', '진술서', '의견서', '보고서', '승낙서', '위임장', '확인원', '신청', '청구'].forEach(function (g) { GENERIC[jamo(g)] = 1; });
  /** best(index, "근저당권 말소등기 신청서 작성") → 서류 하나(없으면 null). 입력이 제목·변형·별칭을 포함하거나(문장 속 서류명), 제목이 입력을 충분히 덮을 때만. */
  function best(index, q) {
    var qn = norm(q); if (!qn) return null;
    var qj = jamo(qn), top = null, ts = 0, i, k, e, s, hay;
    for (i = 0; i < index.length; i++) {
      e = index[i]; if (e.kind !== 'doc') continue;
      s = score(e, qj, '');
      hay = [e.j].concat(e.vj, e.aj);
      for (k = 0; k < hay.length; k++) if (hay[k].length >= 7 && !GENERIC[hay[k]] && qj.indexOf(hay[k]) >= 0) s = Math.max(s, 85);   // 문장 속 서류명: 세 글자 이상이고 "신청서" 같은 일반어가 아닐 때만(부동산 속 "동산" 같은 오탐 방지)
      if (s > ts) { ts = s; top = e; }
    }
    return ts >= 72 ? top : null;
  }
  /** 발급 서류 찾기: 입력이 서류명(괄호 뺀 이름 포함)이나 별칭과 "정확히" 같을 때만 — 문장 속에 서류명이 들어 있는 요청("가족관계증명서를 붙인 소장")은 해당하지 않는다. db 는 data/docs.json 내용. */
  function findIssued(db, text) {
    var n = norm(text), list = (db && db.docs) || [], i, k, d;
    if (!n) return null;
    for (i = 0; i < list.length; i++) {
      d = list[i]; if (d.p !== 'issued') continue;
      if (norm(d.t) === n || norm(d.t.replace(/\([^)]*\)/g, '')) === n) return d;
      for (k = 0; d.a && k < d.a.length; k++) if (norm(d.a[k]) === n) return d;
    }
    return null;
  }
  var ASK_RE = /(떼는|떼려|떼야|뗄수|뗄때|발급|어디서|어떻게받|받는법|받으려|받는방법|뽑는|뽑으려|뽑아|출력|신청방법|준비물|필요서류|필요한서류|수수료|유효기간|인터넷발급|무인발급|정부24|민원24|열람)/;
  var DRAFT_RE = /(초안|작성해|써줘|써주|써달|만들어줘|양식만들)/;
  /** 문장이 발급 서류를 "발급받는 방법"으로 묻는지 판별: 서류명(4글자 이상)이 들어 있고 발급 문의 표현이 있으며 초안 요청 표현은 없을 때. 서류명만 정확히 쓴 입력은 findIssued 가 맡는다. */
  function findIssuedAsk(db, text) {
    var n = norm(text), list = (db && db.docs) || [], best = null, bl = 0, i, k, d, keys, key;
    if (!n || !ASK_RE.test(n) || DRAFT_RE.test(n)) return null;
    for (i = 0; i < list.length; i++) {
      d = list[i]; if (d.p !== 'issued') continue;
      keys = [norm(d.t), norm(d.t.replace(/\([^)]*\)/g, ''))].concat((d.a || []).map(norm));
      for (k = 0; k < keys.length; k++) { key = keys[k]; if (key.length >= 4 && n.indexOf(key) >= 0 && key.length > bl) { best = d; bl = key.length; } }
    }
    return best;
  }
  /** 발급 서류를 골랐을 때 엔진에 보내는 요청문: 초안이 아니라 발급 안내를 청한다. */
  function issuedAsk(d, memo, ask) {
    var where = String(d.c || '').replace(/^(?:발급 서류|조회 신청) · /, ''), service = /^조회 신청/.test(d.c || '');
    return '「' + d.t + '」은(는) 작성하는 서류가 아니라 ' + (service ? '신청해서 결과를 받는 서비스' : '발급받아 첨부하는 서류') + '입니다. 초안을 쓰지 말고 다음을 안내해 주세요: ' +
      '① 어디서 ' + (service ? '신청' : '발급받') + '는지(참고 처리 기관: ' + where + ') ② 온라인·방문 가능 여부와 준비물 ③ 본인·대리인 신청 가능 여부와 위임장 ④ 종류·용도 선택(예: 상세·일반, 열람·발급) ⑤ 유효기간이나 제출처가 정하는 기준 ⑥ 이 서류가 쓰이는 절차와 흔한 실수. ' +
      '수수료·제한처럼 확실하지 않은 것은 단정하지 말고 해당 기관에서 확인하도록 안내해 주세요. 신청과 수수료 납부는 제가 직접 합니다.' + (ask ? ' 사용자의 원래 요청: 「' + ask + '」.' : '') + (memo ? ' 알고 있는 내용: ' + memo + '.' : '');
  }
  root.NaviLawDocs = { createIndex: createIndex, search: search, best: best, findIssued: findIssued, findIssuedAsk: findIssuedAsk, issuedAsk: issuedAsk, norm: norm, jamo: jamo, cho: cho };
})(typeof window !== 'undefined' ? window : this);
