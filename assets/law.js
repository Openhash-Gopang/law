/* 나비로 Navi Law — 페이지 스크립트 (law.hondi.net)
   body[data-page] = home | list | write.
   AI 대화는 hondi.net 의 전문가 대화 화면(expert-chat.html?embed=1)을 iframe 으로 끼워 쓴다.
   (서식 DB 태그·SP 결합·로그인·과금은 그 화면이 맡는다. 이 사이트는 화면과 진행 표시만 맡는다.)
   부모 → 대화창 {type:'expert-embed-send', text} / 대화창 → 부모 {type:'expert-embed-ready'} · {type:'expert-embed-reply', text}. */
(function () {
  'use strict';
  var HONDI = 'https://hondi.net';
  var BT = String.fromCharCode(96);
  var qs = new URLSearchParams(location.search);

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function enc(s) { return encodeURIComponent(s); }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function storeGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장은 편의 기능 */ } }

  /* 엔진: 화면에는 드러내지 않는다. 서류 DB 의 pid(서류가 실린 목록)로 정하고, 모르면 질문 내용으로 정한다(어느 쪽이든 모든 서류를 쓴다). */
  var ENGINE_S = 'judicial-scrivener', ENGINE_L = 'lawyer';
  var LABEL = '서류 보조';

  function writeUrl(personaId, p) {
    var u = 'write.html?persona=' + enc(personaId);
    Object.keys(p || {}).forEach(function (k) { if (p[k]) u += '&' + k + '=' + enc(p[k]); });
    return u;
  }

  /* ── 질문 → 어느 쪽인가 ──
     확실할 때만 바로 연결한다. 소장·답변서처럼 양쪽이 다 쓰는 말이나 판단이 어려운 말은 문 두 개를 다시 보여 준다. */
  var SCR_WORDS = /등기|공탁|경매|공매|입찰|개인회생|개인파산|파산|면책|독촉|지급명령|가압류|가처분|압류|추심명령|전부명령|법무사|소액|소유권|근저당|말소|법인설립|임원변경|본점이전|채권자목록|변제계획|재산분할협의/;
  var LAW_WORDS = /고소|고발|변호|의견서|내용증명|계약서|합의서|변론|항소|상고|항고|구속|보석|손해배상|이혼|행정심판|헌법소원|자문/;
  function route(text) {
    var s = SCR_WORDS.test(text), l = LAW_WORDS.test(text);
    if (s && !l) return 'scrivener';
    if (l && !s) return 'lawyer';
    return '';
  }

  /* ══════════ 서류 자동 완성 ══════════
     입력하는 대로 서류 DB(data/docs.json)에서 찾아 보여 준다. 처음 입력할 때 한 번만 내려받는다.
     목록에 없으면 맨 아래 "직접 작성" 줄로 기존 방식(입력 내용 그대로 시작)을 쓴다. */
  function hl(text, q) {
    var i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  /** 받침이 있으면(ㄹ 제외) "으로", 없으면 "로" */
  function euro(w) {
    var c = w.charCodeAt(w.length - 1), t = c >= 0xAC00 && c <= 0xD7A3 ? (c - 0xAC00) % 28 : 0;
    return t === 0 || t === 8 ? '로' : '으로';
  }
  function attachSuggest(input, form) {
    var list = $('sugList'), status = $('sugStatus');
    if (!list || !window.NaviLawDocs) return;
    var index = null, loading = null, items = [], active = -1, q = '';

    function load() {
      if (!loading) loading = fetch('data/docs.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { index = window.NaviLawDocs.createIndex(d); }).catch(function () { loading = null; });
      return loading;
    }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function mark() {
      Array.prototype.forEach.call(list.children, function (li, i) { li.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
      if (active >= 0) { input.setAttribute('aria-activedescendant', 'sug-' + active); var el = $('sug-' + active); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function render() {
      var h = items.map(function (e, i) {
        return '<li role="option" id="sug-' + i + '" data-i="' + i + '" aria-selected="false"><span class="sug-t">' + hl(e.t, q) + '</span>' +
          '<span class="sug-m">' + esc(e.c) + '</span></li>';
      }).join('');
      var n = items.length;
      h += '<li role="option" id="sug-' + n + '" data-free="1" aria-selected="false" class="sug-free"><span class="sug-t">「' + esc(q) + '」' + euro(q) + ' 직접 작성</span>' +
        '<span class="sug-m">' + (n ? '목록에 원하는 서류가 없을 때' : '목록에 없는 서류입니다. 말씀하신 대로 초안을 씁니다.') + '</span></li>';
      list.innerHTML = h; list.hidden = false; active = -1;
      input.setAttribute('aria-expanded', 'true');
      status.textContent = n ? ('제안 ' + n + '건') : '제안 없음';
    }
    function update() {
      q = input.value.trim();
      if (!q) { close(); return; }
      var mine = q;
      load().then(function () {
        if (!index || input.value.trim() !== mine) return;
        items = window.NaviLawDocs.search(index, mine, { limit: 8 });
        render();
      });
    }
    function choose(i) {
      if (i < 0) return;
      var e = items[i];
      if (!e) { close(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); return; }
      window.NaviLaw.go(e.kind === 'field' ? 'docs.html?field=' + enc(e.fid) : writeUrl(e.pid, { doc: e.t }));
    }
    input.addEventListener('input', update);
    input.addEventListener('focus', function () { if (input.value.trim()) update(); });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (ev) {
      if (ev.isComposing) return;
      var open = !list.hidden, total = items.length + 1;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (!open) { update(); return; } active = (active + 1) % total; mark(); }
      else if (ev.key === 'ArrowUp') { if (!open) return; ev.preventDefault(); active = active <= 0 ? total - 1 : active - 1; mark(); }
      else if (ev.key === 'Enter') { if (open && active >= 0) { ev.preventDefault(); choose(active); } }
      else if (ev.key === 'Escape') { if (open) { ev.preventDefault(); close(); } }
    });
    list.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    list.addEventListener('click', function (ev) {
      var li = ev.target.closest('li'); if (!li) return;
      choose(li.getAttribute('data-free') ? items.length : +li.getAttribute('data-i'));
    });
  }

  /* 서류를 쓸 엔진 정하기 — 서류 DB 에서 찾으면 그 서류의 엔진, 아니면 질문 내용, 그래도 모르면 ENGINE_L */
  function pickEngine(index, text) {
    if (text && index && window.NaviLawDocs) { var b = window.NaviLawDocs.best(index, text); if (b) return b.pid; }
    return route(text || '') === 'scrivener' ? ENGINE_S : ENGINE_L;
  }

  /* ══════════ 홈 ══════════ */
  function initHome() {
    var form = $('askForm'), input = $('askInput');
    attachSuggest(input, form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) { input.focus(); return; }
      window.NaviLaw.go('write.html?q=' + enc(t));
    });
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-q]'), function (c) {
      c.addEventListener('click', function () { input.value = c.getAttribute('data-q'); form.requestSubmit(); });
    });
  }

  /* ══════════ 서류 목록 (직역 구분 없이 한 목록) ══════════ */
  function initDocs() {
    var cats = [], fields = [], activeCat = null, showAll = false, curField = null;
    attachSuggest($('askInput'), $('askForm'));
    $('askForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('askInput').value.trim();
      if (!t) { $('askInput').focus(); return; }
      window.NaviLaw.go('write.html?q=' + enc(t));
    });
    function getJson(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

    Promise.all([getJson('data/scrivener.json'), getJson('data/lawyer.json')]).then(function (r) {
      cats = r[0].catalog.map(function (c) { return { key: 's-' + c.id, engine: ENGINE_S, c: c }; })
        .concat(r[1].catalog.map(function (c) { return { key: 'l-' + c.id, engine: ENGINE_L, c: c }; }));
      fields = r[1].fields;
      var fid = qs.get('field');
      curField = (fid && fields.filter(function (x) { return x.id === fid; })[0]) || null;
      var h = (location.hash || '').replace('#', '');
      activeCat = (cats.filter(function (x) { return x.key === h; })[0] || cats[0]).key;
      if (curField) $('otherDoc').href = writeUrl(curField.id, {});
      renderFields(); renderTabs(); renderCat();
      $('askInput').placeholder = '작성할 서류를 말씀하십시오';
    }).catch(function () {
      $('listBox').innerHTML = '<div class="empty">서류 목록을 불러오지 못했습니다. 새로 고침해 주세요. 목록 없이도 위 입력창으로 바로 시작할 수 있습니다.</div>';
    });

    function engineOf(cat) { return curField ? curField.id : cat.engine; }
    function renderTabs() {
      $('tabs').innerHTML = cats.map(function (x) {
        return '<button type="button" class="tab" role="tab" data-id="' + esc(x.key) + '" aria-selected="' + (x.key === activeCat) + '">' + esc(x.c.tab) + '</button>';
      }).join('');
      Array.prototype.forEach.call($('tabs').querySelectorAll('.tab'), function (b) {
        b.addEventListener('click', function () { activeCat = b.getAttribute('data-id'); renderTabs(); renderCat(); try { history.replaceState(null, '', location.search + '#' + activeCat); } catch (e) { /* 무시 */ } });
      });
    }
    function renderCat() {
      var cat = cats.filter(function (x) { return x.key === activeCat; })[0]; if (!cat) return;
      var c = cat.c, h = '';
      if (c.lead) h += '<div class="lead-box">' + esc(c.lead) + '</div>';
      if (c.note) h += '<div class="lead-box" style="background:#fff8e6;border-color:#ecd9a0;color:#5c4300"><b>유의</b> ' + esc(c.note) + '</div>';
      h += '<div class="list">' + c.items.map(function (it) {
        return '<div class="item"><b>' + esc(it.t) + '</b><small>' + esc(it.d) + '</small>' +
          '<a class="btn sm" href="' + writeUrl(engineOf(cat), { doc: it.t }) + '">초안 작성</a></div>';
      }).join('') + '</div>';
      if (c.meta) h += '<p class="meta-line">' + esc(c.meta) + '</p>';
      $('listBox').innerHTML = h;
      $('countLine').textContent = cats.length + '개 분류, ' + cats.reduce(function (n, x) { return n + x.c.items.length; }, 0) + '종';
    }

    /* 분야별 서류 — 세부 분야 46개 */
    function renderFields() {
      var box = $('fieldsBox'), vis = showAll || curField ? fields : fields.slice(0, 12);
      var h = '<div class="fields">' + vis.map(function (f) {
        return '<a class="field" href="docs.html?field=' + enc(f.id) + '"' + (curField && curField.id === f.id ? ' aria-current="true"' : '') + '>' + esc(f.name) + '</a>';
      }).join('') + '</div>';
      if (!curField) h += '<button type="button" class="more" id="moreBtn">' + (showAll ? '자주 찾는 분야만 보기' : '전체 ' + fields.length + '개 분야 보기') + '</button>';
      box.innerHTML = h;
      var mb = $('moreBtn'); if (mb) mb.onclick = function () { showAll = !showAll; renderFields(); };
      var fb = $('fieldDetail');
      if (!curField) { fb.innerHTML = ''; return; }
      getJson('data/lawyer.json').then(function (d) {
        var cur = d.fields.filter(function (x) { return x.id === curField.id; })[0];
        var x = '<div class="field-head"><h2>' + esc(cur.name) + '</h2>' + (cur.scope ? '<p class="small" style="margin:0">' + esc(cur.scope) + '</p>' : '') +
          '<p style="margin:10px 0 0"><a href="docs.html" class="small">분야 선택 해제</a></p></div>';
        if (cur.forms.length) {
          x += '<div class="table-wrap"><table><thead><tr><th>서류</th><th>제출처 · 시기</th><th>핵심 기재 · 첨부</th><th></th></tr></thead><tbody>' +
            cur.forms.map(function (f) { return '<tr><td><b>' + esc(f.t) + '</b></td><td>' + esc(f.when) + '</td><td>' + esc(f.d) + '</td><td><a class="btn sm" href="' + writeUrl(cur.id, { doc: f.t }) + '">초안 작성</a></td></tr>'; }).join('') +
            '</tbody></table></div>';
        }
        if (cur.deadlines.length) {
          x += '<details class="fold"><summary>기한 참고 (조문·법원 공고로 확인 필요)</summary><div><div class="table-wrap" style="margin:0"><table><thead><tr><th>기한</th><th>통상 길이 · 기산</th></tr></thead><tbody>' +
            cur.deadlines.map(function (y) { return '<tr><td>' + esc(y.t) + '</td><td>' + esc(y.d) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
            (cur.note ? '<p style="margin-top:10px">' + esc(cur.note) + '</p>' : '') + '</div></details>';
        }
        fb.innerHTML = x;
      });
    }
  }

  /* ══════════ 초안 추출 · 웹 표준 서식 (hondi.net pro-doc-page.js 와 같은 규격) ══════════ */
  function parseFront(md) {
    var fm = {}, m = md.match(/^---\s*\n([\s\S]*?)\n---/);
    if (m) m[1].split('\n').forEach(function (l) { var k = l.match(/^([A-Za-z_]+):\s*(.*)$/); if (k) fm[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); });
    return fm;
  }
  function isDoc(md) { return /^---[ \t]*\n[\s\S]{0,800}?doc_type:/.test(md.trim()); }
  function extractDoc(reply) {
    var re = new RegExp('(^|\\n)(' + BT + '{3,}|~{3,})[ \\t]*(?:markdown|md)?[ \\t]*\\n([\\s\\S]*?)\\n\\2[ \\t]*(?=\\n|$)', 'g'), m;
    while ((m = re.exec(reply))) { if (isDoc(m[3])) return { raw: m[0].replace(/^\n/, ''), md: m[3].trim() + '\n' }; }
    var s = reply.match(/(^|\n)(---[ \t]*\n(?:[^\n]*\n){0,8}?doc_type:[^\n]*\n)/);
    if (s) {
      var tail = reply.slice(s.index + s[1].length);
      var endM = tail.match(/\n\[(?:초안 검토 고지|1차 통로 고지|인간 전문가 상담 권고)\]/);
      var raw = endM ? tail.slice(0, endM.index) : tail;
      return { raw: raw, md: raw.trim() + '\n' };
    }
    return null;
  }
  function docTitle(md) { var fm = parseFront(md); if (fm.doc_type) return fm.doc_type; var h = md.match(/^#\s+(.+)$/m); return h ? h[1].trim() : '서류 초안'; }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function fileName(title, d) { return title.replace(/[\\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') + '_' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '.html'; }
  function inlineH(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  function mdToHtml(md) {
    var lines = md.replace(/\r/g, '').split('\n'), out = [], i = 0, list = null;
    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    var fm = md.match(/^---\s*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (fm) i = md.slice(0, fm[0].length).split('\n').length - 1;   // 앞머리(doc_type·status·generated_by 등 내부 처리용 표)는 사용자에게 보이지 않는다
    for (; i < lines.length; i++) {
      var l = lines[i], m;
      if (/^\s*$/.test(l)) { closeList(); continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { closeList(); out.push('<h' + m[1].length + '>' + inlineH(m[2]) + '</h' + m[1].length + '>'); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { closeList(); out.push('<hr>'); continue; }
      if (/^\s*\|.*\|\s*$/.test(l)) {
        closeList();
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        i--;
        var cells = function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); };
        var head = cells(rows[0]), body = rows.slice(/^\s*\|[\s:|-]+\|\s*$/.test(rows[1] || '') ? 2 : 1);
        out.push('<div class="table-wrap" style="margin:8px 0"><table><thead><tr>' + head.map(function (c) { return '<th>' + inlineH(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + cells(r).map(function (c) { return '<td>' + inlineH(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      if ((m = l.match(/^\s*[-*]\s+(.*)$/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inlineH(m[1]) + '</li>'); continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inlineH(m[1]) + '</li>'); continue; }
      if ((m = l.match(/^>\s?(.*)$/))) { closeList(); out.push('<blockquote>' + inlineH(m[1]) + '</blockquote>'); continue; }
      closeList(); out.push('<p>' + inlineH(l) + '</p>');
    }
    closeList();
    return out.join('\n');
  }
  /* ── 서식의 빈 칸 → 입력 칸 ──
     엔진은 모르는 항목을 [확인 필요: …] 또는 [변호사·법무사 기재: …] 로 남긴다. 이 표시를 찾아 입력 칸으로 바꾸고, 입력한 값은 이 브라우저에서만 서식에 끼워 넣는다(AI 에게 보내지 않는다). */
  var BLANK_RE = /\[(?:확인 필요|[가-힣]{2,6} 기재)\s*[:：]\s*([^\]]*?)\s*\]/g;
  var SENSITIVE_RE = /(주민등록번호|주민번호|외국인등록번호|계좌번호|카드번호|비밀번호|여권번호|운전면허번호)/;
  var NOT_SELF_RE = /(피신청인|피청구인|피고|피상속인|상대|채무자|채권자|임대인|임차인|매도인|매수인|양도인|양수인|대리인|증인|사망|배우자|자녀|부모|법정|변호사|법무사|세무사|변리사|관할|법원|기관|회사|법인|사업장|사업자|상호|소재지|목적물|부동산|토지|건물|사건|대표|피해자|가해자|제출처)/;
  function cleanLabel(s) { return String(s || '').replace(/[*_`#>|]/g, '').replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').trim(); }
  function blankLabel(line, idx, hint) {
    var bars = [], i, k, m;
    if (/^\s*\|/.test(line)) {
      for (i = 0; i < line.length; i++) if (line.charAt(i) === '|') bars.push(i);
      for (k = 0; k < bars.length - 1; k++) if (idx > bars[k] && idx < bars[k + 1]) break;
      if (k > 0 && k < bars.length - 1) { var prev = cleanLabel(line.slice(bars[k - 1] + 1, bars[k])); if (prev && !/\[(?:확인 필요|[가-힣]{2,6} 기재)/.test(prev)) return prev; }
      return hint;
    }
    m = line.slice(0, idx).match(/([^:：|\[\]]{1,24})\s*[:：]\s*$/);
    return (m && cleanLabel(m[1])) || hint;
  }
  function stripFront(md) { return String(md || '').replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '').replace(/^\s+/, ''); }
  function blankKey(label, hint) { return label + '\u2502' + hint; }
  /** pdvKind("신청인 성명","") → 'name' | 'address' | 'phone' | null — 의뢰인 본인의 인적사항으로 볼 수 있는 칸만. 상대방·부동산 주소·법인 등은 PDV 로 채우지 않는다. */
  function pdvKind(label, hint) {
    var t = String(label || '') + ' ' + String(hint || '');
    if (SENSITIVE_RE.test(t) || NOT_SELF_RE.test(t)) return null;
    if (/(성명|이름)/.test(t)) return 'name';
    if (/주소/.test(t)) return 'address';
    if (/(연락처|전화|휴대)/.test(t)) return 'phone';
    return null;
  }
  /** scanBlanks(md) → [{key,label,hint,kind,sensitive}] — 같은 칸(이름·안내가 같은 것)은 한 칸으로 묶는다. */
  function scanBlanks(md) {
    var lines = stripFront(md).split('\n'), seen = {}, out = [], re, m, l, i, label, key;
    for (i = 0; i < lines.length; i++) {
      l = lines[i]; re = new RegExp(BLANK_RE.source, 'g');
      while ((m = re.exec(l))) {
        label = blankLabel(l, m.index, m[1].trim()); key = blankKey(label, m[1].trim());
        if (seen[key]) continue;
        seen[key] = 1;
        out.push({ key: key, label: label || m[1].trim(), hint: m[1].trim(), kind: pdvKind(label, m[1]), sensitive: SENSITIVE_RE.test(label + ' ' + m[1]) });
      }
    }
    return out;
  }
  /** fillBlanks(md, vals, 'text'|'html') — 앞머리를 떼고 빈 칸을 값(text)이나 입력 칸 자리표시(html: \uE000번호\uE001)로 바꾼다. 값이 없으면 text 모드는 원래 표시를 남긴다. */
  function fillBlanks(md, vals, mode) {
    var fields = scanBlanks(md), idx = {}, i;
    for (i = 0; i < fields.length; i++) idx[fields[i].key] = i;
    return stripFront(md).split('\n').map(function (l) {
      return l.replace(new RegExp(BLANK_RE.source, 'g'), function (all, hint, off) {
        var h = hint.trim(), key = blankKey(blankLabel(l, off, h), h), v = vals && vals[key];
        if (mode === 'html') return '\uE000' + idx[key] + '\uE001';
        return v ? String(v).replace(/[\r\n]+/g, ' ').replace(/\|/g, '｜').trim() : all;
      });
    }).join('\n');
  }
  function toWebDoc(title, md) {
    return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title><style>' +
      'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:17px;line-height:1.75;max-width:820px;margin:32px auto;padding:0 16px;color:#111}' +
      'h1{font-size:1.5em}h2{font-size:1.25em;margin-top:1.6em}h3{font-size:1.1em}table{border-collapse:collapse;width:100%;margin:12px 0}' +
      'th,td{border:1px solid #bbb;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f2f4f7}table.meta{font-size:.9em;color:#444}' +
      'blockquote{margin:12px 0;padding:8px 14px;border-left:4px solid #ccc;background:#fafafa}code{background:#f2f4f7;padding:1px 4px;border-radius:3px}' +
      'mark{background:#fde68a;padding:0 2px}@media print{body{margin:0;max-width:none}}</style></head><body>\n' + mdToHtml(md).replace(/\[(?:확인 필요|[가-힣]{2,6} 기재)\s*[:：][^\]]*\]/g, '<mark>$&</mark>') + '\n</body></html>\n';
  }

  /* ══════════ 서류 작성 화면 ══════════ */
  var PHASES = ['초안 작성', '수정·보완', '제출 준비', '수수료·결과 기록'];
  var STATUS_RE = /\[[^\]|]*보조 AI\s*\|\s*서류 작성 트랙\s*\|\s*현재:\s*W-([1-9])([^\]]*)\]/;
  function phaseOf(w) { return w <= 5 ? 1 : w === 6 ? 2 : w === 7 ? 3 : 4; }
  function cleanRest(text, rawDoc) {
    var t = String(text || '');
    if (rawDoc) t = t.replace(rawDoc, '');
    t = t.replace(/\[[^\]|]*보조 AI\s*\|\s*서류 작성 트랙[^\]]*\]/g, '')
      .replace(/\[FORM_SAVE_PROPOSAL:[\s\S]*?\[\/FORM_SAVE_PROPOSAL\]/g, '')
      .replace(/\[(?:NEXT_STEP|FORM_LOOKUP|WEB_SEARCH|DOCUMENT_DRAFT|REFER_LAWYER|ESCALATE_URGENT)[^\]]*\]/g, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  function initWrite() {
    var pid = qs.get('persona') || '', fieldName = '';
    var st = { w: 0, doc: '', md: '', title: '', at: 0, rest: '', pid: '', kind: '', vals: {}, pdv: {} };   // vals: 칸별 입력값(key→값), pdv: PDV 로 채운 칸. kind 'issued' = 발급 서류(초안 대신 발급 안내)
    var frame = null, ready = false, queue = [], busy = false, readyTimer = null, docsDb = null;
    var pdvAuto = false, fields = [], drawSig = '', pdvReq = null, pdvStatus = '', chatOpen = false;

    /* 어느 엔진으로 쓸지는 화면에 드러내지 않는다 — 주소의 persona(서류 목록이 정해 준 값) → 저장된 이어쓰기 → 서류 DB·질문 내용 순으로 정한다. */
    function boot(db) {
      docsDb = db;
      var index = db ? window.NaviLawDocs.createIndex(db) : null, fields = db ? db.fields : null;
      var doc = (qs.get('doc') || '').slice(0, 80), q = (qs.get('q') || '').slice(0, 600);
      var fresh = !!(doc || q), saved = fresh ? null : storeGet('navilaw_write_last');
      function fieldOf(id) { return fields ? fields.filter(function (x) { return x.id === id; })[0] : null; }
      var ok = pid === ENGINE_S || pid === ENGINE_L || (/^lawyer-[a-z-]+$/.test(pid) && !!fieldOf(pid));
      if (!ok) pid = (saved && saved.pid) || pickEngine(index, doc || q);
      if (/^lawyer-/.test(pid)) { var f = fieldOf(pid); if (f) fieldName = f.name; else pid = ENGINE_L; }
      if (pid !== ENGINE_S && pid !== ENGINE_L && !fieldName) pid = ENGINE_L;
      document.title = '서류 작성 · 나비로 Navi Law';
      $('h1').textContent = '서류 작성' + (fieldName ? ' · ' + fieldName : '');
      $('back').href = 'docs.html' + (fieldName ? '?field=' + enc(pid) : '');
      frame = $('chatFrame');
      frame.src = HONDI + '/pages/expert-chat.html?persona=' + enc(pid) + '&embed=1&label=' + enc(LABEL);
      bind();
      if (fresh) {
        $('fDoc').value = doc;
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }
        begin(doc, '', doc ? '' : q);
      } else {
        if (saved && saved.w > 0) { st = saved; st.vals = st.vals || {}; st.pdv = st.pdv || {}; }
        render();
      }
    }

    function save() {
      st.pid = pid;
      var keep = {}, snap = {}, k, sens = {}, i;
      for (i = 0; i < fields.length; i++) if (fields[i].sensitive) sens[fields[i].key] = 1;
      for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) snap[k] = st[k];
      for (k in st.vals) if (!sens[k]) keep[k] = st.vals[k];   // 주민등록번호 등은 이 화면을 닫으면 사라지게 저장하지 않는다
      snap.vals = keep;
      storeSet('navilaw_write_last', snap);
    }
    var saveT = null;
    function saveSoon() { if (saveT) clearTimeout(saveT); saveT = setTimeout(function () { saveT = null; save(); }, 400); }

    /* ── 입력 칸 ── */
    function valOf(f) { return (st.vals && st.vals[f.key]) || ''; }
    function draftHtml() {
      var html = mdToHtml(fillBlanks(st.md, null, 'html'));
      return html.replace(/\uE000(\d+)\uE001/g, function (all, n) {
        var f = fields[+n]; if (!f) return '';
        var isPdv = !!(st.pdv && st.pdv[f.key]);
        return '<input type="text" class="fld' + (isPdv ? ' pdv' : '') + (valOf(f) ? ' done' : '') + '" data-i="' + n + '" aria-label="' + esc(f.label) + '" placeholder="' + esc(f.hint || f.label) + '" value="' + esc(valOf(f)) + '"' +
          (f.sensitive ? ' autocomplete="off"' : '') + '>' + (isPdv ? '<span class="fld-badge" title="혼디 PDV에서 가져온 값입니다. 맞는지 확인해 주십시오.">PDV</span>' : '');
      });
    }
    function fillCount() { var n = 0, i; for (i = 0; i < fields.length; i++) if (valOf(fields[i])) n++; return n; }
    function updateFill() {
      var bar = $('fillbar'), has = !!st.md && st.kind !== 'issued' && fields.length > 0;
      bar.hidden = !has; if (!has) return;
      var n = fillCount(), sens = fields.some(function (f) { return f.sensitive; });
      $('fillSum').textContent = '입력할 항목 ' + fields.length + '개 중 ' + n + '개 입력' + (n === fields.length ? ' — 모두 입력했습니다.' : '. 아래 서식의 빈 칸에 직접 쓰시면 됩니다.') + (sens ? ' 주민등록번호 등은 이 화면을 닫으면 지워지며 저장되지 않습니다.' : '');
      var wants = pdvWants(), ac = findAc();
      $('pdvBtn').hidden = !(ac && wants.length);
      $('pdvNote').textContent = pdvStatus || (ac ? (wants.length ? '내 AI 비서의 PDV에 있는 성명·연락처·주소를 가져올 수 있습니다.' : '') : '혼디 이용자가 아니면 빈 칸에 직접 입력해 주십시오.');
    }
    function onField(e) {
      var t = e.target; if (!t.classList || !t.classList.contains('fld')) return;
      var f = fields[+t.getAttribute('data-i')]; if (!f) return;
      st.vals[f.key] = t.value; if (st.pdv) delete st.pdv[f.key];
      t.classList.toggle('done', !!t.value); t.classList.remove('pdv');
      var b = t.nextSibling; if (b && b.classList && b.classList.contains('fld-badge')) b.remove();
      var same = $('draft').querySelectorAll('.fld'), i;
      for (i = 0; i < same.length; i++) if (same[i] !== t && fields[+same[i].getAttribute('data-i')] === f) { same[i].value = t.value; same[i].classList.toggle('done', !!t.value); }
      updateFill(); saveSoon();
    }
    function filledMd() { return fillBlanks(st.md, st.vals, 'text'); }

    /* ── 혼디 PDV (의뢰인의 AI 비서에게 요청) ── */
    var AC_ORIGINS = [HONDI, 'https://www.hondi.net'], PDV_NAME = { name: '이름', phone: '연락처', address: '주소' };
    function findAc() {
      var o = ''; try { o = sessionStorage.getItem('navilaw_ac') || ''; } catch (e) { o = ''; }
      try { if (!o || !window.opener || window.opener.closed) return ''; } catch (e) { return ''; }
      return AC_ORIGINS.indexOf(o) >= 0 ? o : '';
    }
    function pdvWants() { return fields.filter(function (f) { return f.kind && !valOf(f); }); }
    function pdvFill(auto) {
      var ac = findAc(), want = pdvWants(), names = [];
      if (!ac || !want.length || pdvReq) return;
      want.forEach(function (f) { var n = PDV_NAME[f.kind]; if (names.indexOf(n) < 0) names.push(n); });
      var rid = 'law-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      pdvReq = { rid: rid, ac: ac, want: want, timer: setTimeout(function () { if (pdvReq && pdvReq.rid === rid) { pdvReq = null; pdvStatus = 'AI 비서의 응답이 없어 가져오지 못했습니다. 직접 입력해 주십시오.'; updateFill(); } }, 180000) };
      pdvStatus = 'AI 비서에게 ' + names.join('·') + ' 정보를 요청했습니다. 비서 창에서 허용해 주십시오…'; updateFill();
      try { window.opener.postMessage({ type: 'GWP_PDV_REQUEST', request_id: rid, requesting_sp: 'navi-law', fields: names, reason: '서류 서식의 인적사항 칸을 채우기 위해' }, ac); }
      catch (e) { clearTimeout(pdvReq.timer); pdvReq = null; pdvStatus = '비서에게 요청하지 못했습니다. 직접 입력해 주십시오.'; updateFill(); }
    }
    function onPdv(e) {
      var d = e.data;
      if (!pdvReq || !d || d.type !== 'GWP_PDV_RESPONSE' || d.request_id !== pdvReq.rid) return;
      if (e.origin !== pdvReq.ac || e.source !== window.opener) return;
      var req = pdvReq; pdvReq = null; clearTimeout(req.timer);
      if (!d.approved || !d.values) { pdvStatus = '정보 제공이 허용되지 않았습니다. 빈 칸에 직접 입력해 주십시오.'; updateFill(); return; }
      var n = 0;
      req.want.forEach(function (f) {
        var v = d.values[PDV_NAME[f.kind]];
        if (v && typeof v === 'object') v = v.value;
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim() && !valOf(f)) { st.vals[f.key] = String(v).trim(); st.pdv[f.key] = 1; n++; }
      });
      pdvStatus = n ? 'PDV에서 ' + n + '개 항목을 가져왔습니다. 맞는지 확인해 주십시오. 나머지는 직접 입력해 주십시오.' : 'PDV에 해당 정보가 없습니다. 직접 입력해 주십시오.';
      drawSig = ''; save(); render();
    }

    /* ── 떠 있는 대화창 ── */
    function setChat(open) {
      chatOpen = !!open;
      $('chatPanel').classList.toggle('open', chatOpen);
      $('chatPanel').setAttribute('aria-hidden', chatOpen ? 'false' : 'true');
      $('chatFab').setAttribute('aria-expanded', chatOpen ? 'true' : 'false');
      $('chatFab').setAttribute('aria-label', chatOpen ? '대화창 닫기' : '대화창 열기');
      if (chatOpen) { $('chatDot').hidden = true; try { $('chatClose').focus(); } catch (e) { /* 무시 */ } }
      else if (document.activeElement && $('chatPanel').contains(document.activeElement)) { try { $('chatFab').focus(); } catch (e) { /* 무시 */ } }
    }
    function render() {
      var ph = phaseOf(st.w || 1), started = st.w > 0, issued = st.kind === 'issued';
      $('phases').style.display = issued ? 'none' : '';   // .phases 는 display:grid 라 hidden 속성이 먹지 않는다
      $('chatH').textContent = issued ? '궁금한 점은 여기에 말씀하십시오' : '수정·보완은 여기에 말씀하십시오';
      $('phases').innerHTML = PHASES.map(function (n, i) {
        var cls = !started ? '' : (i + 1 < ph ? 'done' : i + 1 === ph ? 'on' : '');
        return '<div class="phase ' + cls + '">' + (i + 1) + '. ' + esc(n) + '</div>';
      }).join('');
      var hasDraft = !!st.md && !issued;
      fields = hasDraft ? scanBlanks(st.md) : [];
      if (issued) {
        $('draft').innerHTML = st.rest ? mdToHtml(st.rest) : '<div class="empty">' + (busy ? 'AI가 발급 안내를 작성하는 중입니다…' : '발급 안내가 여기에 나타납니다.') + '</div>';
        $('draftTitle').textContent = '발급 안내'; drawSig = '';
      } else {
        var sig = hasDraft ? 'd|' + st.md + '|' + JSON.stringify(st.pdv || {}) : 'e|' + busy;
        if (sig !== drawSig) {
          var act = document.activeElement, ai = act && act.classList && act.classList.contains('fld') && $('draft').contains(act) ? act.getAttribute('data-i') : null, caret = ai !== null ? act.selectionStart : 0;
          $('draft').innerHTML = hasDraft ? draftHtml() : '<div class="empty">' + (busy ? 'AI가 초안을 작성하는 중입니다…' : '서류를 정하면 여기에 초안이 나타납니다.') + '</div>';
          drawSig = sig;
          if (ai !== null) { var again = $('draft').querySelector('.fld[data-i="' + ai + '"]'); if (again) { try { again.focus(); again.setSelectionRange(caret, caret); } catch (e) { /* 무시 */ } } }
        }
        $('draftTitle').textContent = hasDraft ? st.title : '초안';
      }
      updateFill();
      var rest = $('blanks');
      if (issued) rest.hidden = true;
      else if (st.rest) { rest.hidden = false; $('blanksTitle').textContent = ph <= 2 ? '남은 빈 칸과 수정·보완' : '안내'; $('blanksBody').innerHTML = mdToHtml(st.rest); }
      else rest.hidden = true;
      var a = [];
      if (hasDraft) {
        a.push('<button type="button" class="btn sm" data-act="download">웹 표준 서식으로 내려받기</button>');
        a.push('<button type="button" class="btn sm line" data-act="copy">복사</button>');
        if (st.w <= 6) a.push('<button type="button" class="btn sm line" data-act="next">수정 끝 — 제출 준비로</button>');
        else if (st.w === 7) a.push('<button type="button" class="btn sm line" data-act="submitted">제출을 마쳤습니다</button>');
        else if (st.w === 8) a.push('<button type="button" class="btn sm line" data-act="paid">납부를 마쳤습니다(또는 해당 없음)</button>');
      }
      if (issued && st.rest) a.push('<button type="button" class="btn sm line" data-act="copy">복사</button>');
      $('actions').innerHTML = a.join('');
      $('busy').hidden = !busy;
      $('chatFab').classList.toggle('busy', busy);
      $('startBox').hidden = started;
      $('startSum').hidden = !started;
      $('startSumText').textContent = st.doc ? '서류: ' + st.doc + (issued ? ' · 발급 안내' : '') : '서류 작성 중';
    }

    function setBusy(v) { busy = v; render(); }
    function post(text) { setBusy(true); try { frame.contentWindow.postMessage({ type: 'expert-embed-send', text: text }, HONDI); } catch (e) { setBusy(false); toast('대화창에 보내지 못했습니다. 새로 고침해 주세요.'); } }
    function send(text) {
      if (ready) { post(text); return; }
      queue.push(text); setBusy(true);
      if (!readyTimer) readyTimer = setTimeout(function () {
        if (!ready) { setBusy(false); $('connWarn').hidden = false; setChat(true); }
      }, 15000);
    }
    function flush() { if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; } $('connWarn').hidden = true; while (queue.length) post(queue.shift()); }

    function onReply(text) {
      if (st.kind === 'issued') { st.rest = cleanRest(text, ''); st.at = Date.now(); save(); setBusy(false); if (!chatOpen) $('chatDot').hidden = false; return; }   // 발급 안내는 답변 전체를 안내 칸에 보여 준다
      var m = STATUS_RE.exec(text), ex = extractDoc(text);
      if (m) st.w = parseInt(m[1], 10);
      else if (ex && st.w < 6) st.w = 6;
      if (ex) { st.md = ex.md; st.title = docTitle(ex.md); st.at = Date.now(); }
      st.rest = cleanRest(text, ex ? ex.raw : '');
      save(); setBusy(false);
      if (ex) {
        if (!chatOpen) $('chatDot').hidden = false;
        $('draftPane').scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!pdvAuto) { pdvAuto = true; pdvFill(true); }   // 처음 초안이 나오면 한 번만 AI 비서에게 인적사항을 요청한다
      }
    }

    function startMessage(doc, memo, q) {
      var tail = ' 모르는 항목은 묻지 말고 빈 칸으로 남긴 뒤, 초안 아래 빈 칸 표로 알려 주세요.';
      if (q) return '다음 요청에 맞는 서류 초안을 작성해 주세요: ' + q + '.' + tail;
      return '「' + doc + '」 초안을 작성해 주세요.' + (memo ? ' 알고 있는 내용: ' + memo + '.' : '') + tail;
    }
    function begin(doc, memo, q) {
      var N = window.NaviLawDocs, it = !q && doc && N.findIssued ? N.findIssued(docsDb, doc) : (q && N.findIssuedAsk ? N.findIssuedAsk(docsDb, q) : null);   // 받아서 첨부하는 서류는 초안이 아니라 발급 안내로 시작한다 — 서류명만 고른 경우와 "…떼는 법" 같은 발급 문의 문장
      st = { w: 1, doc: it ? it.t : (doc || (q ? q.slice(0, 40) : '')), md: '', title: '', at: 0, rest: '', pid: pid, kind: it ? 'issued' : '', vals: {}, pdv: {} }; drawSig = ''; pdvStatus = '';
      save(); render(); send(it ? N.issuedAsk(it, memo, q) : startMessage(doc, memo, q));
    }

    function bind() {
      window.addEventListener('message', function (e) {
        if (e.origin !== HONDI || !frame || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.type === 'expert-embed-ready') { ready = true; flush(); }
        else if (e.data.type === 'expert-embed-reply') onReply(String(e.data.text || ''));
      });
      window.addEventListener('message', onPdv);
      $('draft').addEventListener('input', onField);
      $('pdvBtn').addEventListener('click', function () { pdvStatus = ''; pdvFill(false); });
      $('chatFab').addEventListener('click', function () { setChat(!chatOpen); });
      $('chatClose').addEventListener('click', function () { setChat(false); });
      $('connOpen').addEventListener('click', function () { setChat(true); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && chatOpen) setChat(false); });
      $('startForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var doc = $('fDoc').value.trim(), memo = $('fMemo').value.trim();
        if (!doc && !memo) { $('fDoc').focus(); toast('작성할 서류를 적어 주세요.'); return; }
        begin(doc, memo, doc ? '' : memo);
      });
      $('newDoc').addEventListener('click', function () { st = { w: 0, doc: '', md: '', title: '', at: 0, rest: '', pid: pid, kind: '', vals: {}, pdv: {} }; drawSig = ''; pdvStatus = ''; save(); $('fDoc').value = ''; $('fMemo').value = ''; render(); $('fDoc').focus(); });
      $('actions').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]'); if (!b) return;
        var act = b.getAttribute('data-act');
        if (act === 'download') {
          var blob = new Blob([toWebDoc(st.title, filledMd())], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = url; a.download = fileName(st.title, new Date(st.at || Date.now())); document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } else if (act === 'copy') {
          var done = function () { toast('복사했습니다.'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(st.kind === 'issued' ? st.rest : filledMd()).then(done, function () { toast('복사하지 못했습니다.'); });
          else toast('이 브라우저에서는 복사할 수 없습니다. 내려받기를 이용해 주세요.');
        } else if (act === 'next') send('W-6 작성된 서류를 검증했고 제출 준비를 진행하겠습니다. 승인합니다.');
        else if (act === 'submitted') send('W-7 제출을 직접 마쳤습니다. W-8로 진행해 주세요.');
        else if (act === 'paid') send('W-8 수수료 납부를 직접 마쳤습니다(또는 납부 대상이 없습니다). W-9로 진행해 주세요.');
      });
    }

    fetch('data/docs.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(boot).catch(function () { boot(null); });
  }

  /* ── 나비로의 특징 배너 — "다시 보지 않기"를 누르면 이 브라우저에서 다시 나오지 않는다(문구를 바꾸면 키의 버전을 올려 다시 보이게 한다). ── */
  var PROMO_KEY = 'navilaw_promo_v1';
  function initPromo() {
    var el = $('promo'), tab = $('promoTab'); if (!el || !tab) return;
    var seen = false;
    try { seen = localStorage.getItem(PROMO_KEY) === '1'; } catch (e) { /* 저장을 못 하면 처음 온 것으로 본다 */ }
    function setOpen(open, focus) {
      el.classList.toggle('open', open);
      el.setAttribute('aria-hidden', open ? 'false' : 'true');
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (focus) { try { (open ? $('promoX') : tab).focus(); } catch (e) { /* 무시 */ } }
    }
    tab.addEventListener('click', function () { setOpen(true, true); });
    $('promoX').addEventListener('click', function () { setOpen(false, true); });
    $('promoClose').addEventListener('click', function () { try { localStorage.setItem(PROMO_KEY, '1'); } catch (e) { /* 이번만 닫힌다 */ } setOpen(false, true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('open')) setOpen(false, true); });
    var tb = $('towerBtn'), tip = $('towerTip');
    if (tb && tip) tb.addEventListener('click', function () { var o = tip.hidden; tip.hidden = !o; tb.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    if (!seen) setTimeout(function () { setOpen(true, false); }, 350);   // 처음 오신 분께는 한 번 밀어서 보여 드린다
  }

  /* 나만의 AI 비서(hondi.net)가 ?gwp=1&origin=… 로 연 창이면 그 출처를 기억한다 — 이후 다른 쪽으로 이동해도 window.opener 로 비서와 이야기할 수 있다. */
  (function captureAc() {
    try { var o = qs.get('origin') || ''; if (qs.get('gwp') === '1' && (o === HONDI || o === 'https://www.hondi.net')) sessionStorage.setItem('navilaw_ac', o); } catch (e) { /* 무시 */ }
  })();
  var page = document.body.getAttribute('data-page');
  initPromo();
  if (page === 'home') initHome();
  else if (page === 'docs') initDocs();
  else if (page === 'write') initWrite();
  window.NaviLaw = { scanBlanks: scanBlanks, fillBlanks: fillBlanks, pdvKind: pdvKind, go: function (u) { location.href = u; }, route: route, pickEngine: pickEngine, attachSuggest: attachSuggest, extractDoc: extractDoc, mdToHtml: mdToHtml, cleanRest: cleanRest, phaseOf: phaseOf, STATUS_RE: STATUS_RE };
})();
