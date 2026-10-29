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
  /* 떠 있는 대화 아이콘 — 처음 누를 때 대화창(hondi.net)을 불러온다. 홈·서류 목록에서 서류와 절차를 묻는 용도. */
  function initChat() {
    var fab = $('chatFab'), panel = $('chatPanel'); if (!fab || !panel) return;
    var loaded = false;
    function setChat(open) {
      if (open && !loaded) { loaded = true; $('chatFrame').src = HONDI + '/pages/expert-chat.html?persona=' + enc(ENGINE_L) + '&embed=1&label=' + enc(LABEL); }
      panel.classList.toggle('open', open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      fab.setAttribute('aria-label', open ? '대화창 닫기' : '대화창 열기');
      try { (open ? $('chatClose') : fab).focus(); } catch (e) { /* 무시 */ }
    }
    fab.addEventListener('click', function () { setChat(!panel.classList.contains('open')); });
    $('chatClose').addEventListener('click', function () { setChat(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) setChat(false); });
    document.addEventListener('click', function (e) { if (panel.classList.contains('open') && !panel.contains(e.target) && !fab.contains(e.target)) setChat(false); });
  }
  /* ── 내 서류: 작성한 서류를 이 브라우저에 모아 둔다(최대 50건). 주민등록번호 등 민감한 칸의 값은 넣지 않는다. ── */
  var MY_KEY = 'navilaw_mydocs', MY_MAX = 50;
  function myDocs() { var a = storeGet(MY_KEY); return Array.isArray(a) ? a : []; }
  function myDocPut(rec) {
    var a = myDocs().filter(function (x) { return x.id !== rec.id; }); a.unshift(rec);
    a.sort(function (x, y) { return y.at - x.at; }); storeSet(MY_KEY, a.slice(0, MY_MAX));
  }
  function fmtTime(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function initMyDocs() {
    var key = 'time', dir = { time: -1, name: 1, client: 1 }, box = $('myList');
    function cmpStr(a, b) { return String(a || '').localeCompare(String(b || ''), 'ko'); }
    function sorted() {
      var a = myDocs().slice(), d = dir[key];
      a.sort(function (x, y) {
        var r = key === 'time' ? x.at - y.at : key === 'name' ? cmpStr(x.title, y.title) : cmpStr(x.client, y.client);
        return (r || y.at - x.at) * (r ? d : 1);   // 같으면 최근 것이 먼저
      });
      return a;
    }
    function draw() {
      var a = sorted();
      Array.prototype.forEach.call(document.querySelectorAll('.sortbtn'), function (b) {
        var k = b.getAttribute('data-sort'), on = k === key;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.querySelector('.dir').textContent = on ? (dir[k] < 0 ? '↓' : '↑') : '';
      });
      $('myCount').textContent = a.length ? '총 ' + a.length + '건' : '';
      if (!a.length) { box.innerHTML = '<div class="empty">아직 작성한 서류가 없습니다. 홈에서 서류명을 입력하면 초안을 만들어 이곳에 모아 둡니다.</div>'; return; }
      box.innerHTML = '<div class="my-head" aria-hidden="true"><span>서류</span><span>의뢰인</span><span>작성</span><span></span></div>' + a.map(function (x) {
        return '<div class="my-row" data-id="' + esc(x.id) + '"><div><h2>' + esc(x.title) + '</h2>' + (x.step ? '<p class="small">' + esc(x.step) + '</p>' : '') + '</div>' +
          '<div class="who">' + esc(x.client || '의뢰인 미상') + '</div><div class="small">' + esc(fmtTime(x.at)) + '</div>' +
          '<div class="acts"><button type="button" class="btn sm" data-open="' + esc(x.id) + '">열기</button><button type="button" class="btn sm line" data-del="' + esc(x.id) + '" aria-label="' + esc(x.title) + ' 삭제">삭제</button></div></div>';
      }).join('');
    }
    Array.prototype.forEach.call(document.querySelectorAll('.sortbtn'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (k === key) dir[k] = -dir[k]; else { key = k; dir[k] = k === 'time' ? -1 : 1; }
        draw();
      });
    });
    box.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]'), x = e.target.closest('[data-del]');
      if (o) {
        var rec = myDocs().filter(function (r) { return r.id === o.getAttribute('data-open'); })[0];
        if (rec && rec.state) { storeSet('navilaw_write_last', rec.state); window.NaviLaw.go('write.html'); }
      } else if (x) {
        var id = x.getAttribute('data-del'), r2 = myDocs().filter(function (r) { return r.id === id; })[0];
        if (r2 && window.confirm('「' + r2.title + '」을(를) 내 서류 목록에서 지울까요?')) { storeSet(MY_KEY, myDocs().filter(function (r) { return r.id !== id; })); draw(); }
      }
    });
    draw();
  }

  /* 입력칸의 + (파일 첨부)와 마이크. 첨부한 글 파일의 내용은 작성 화면으로 넘어가 첫 요청에 함께 실린다. 글이 아닌 파일은 이름만 전한다. */
  var ATT_KEY = 'navilaw_attach', ATT_MAX = 4000;
  function initAttach(input) {
    var btn = $('attBtn'), file = $('attFile'), list = $('attList'), mic = $('micBtn'), files = [];
    if (!btn || !file) return;
    function persist() {
      var text = files.filter(function (f) { return f.text; }).map(function (f) { return '[' + f.name + ']\n' + f.text; }).join('\n\n').slice(0, ATT_MAX);
      try { sessionStorage.setItem(ATT_KEY, JSON.stringify({ names: files.map(function (f) { return f.name; }), text: text })); } catch (e) { /* 이번만 넘기지 못한다 */ }
    }
    function draw() {
      list.innerHTML = files.map(function (f, i) {
        return '<li>' + esc(f.name) + (f.text ? '' : ' <small>(이름만 전달)</small>') + '<button type="button" data-rm="' + i + '" aria-label="' + esc(f.name) + ' 빼기">×</button></li>';
      }).join('');
    }
    btn.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      Array.prototype.forEach.call(file.files || [], function (f) {
        if (files.length >= 5 || files.some(function (x) { return x.name === f.name; })) return;
        var rec = { name: f.name, text: '' };
        files.push(rec);
        if (/^text\//.test(f.type) || /\.(txt|md|csv|json|html?)$/i.test(f.name)) {
          var r = new FileReader();
          r.onload = function () { rec.text = String(r.result || '').slice(0, ATT_MAX); persist(); draw(); };
          r.readAsText(f);
        }
      });
      file.value = ''; persist(); draw();
    });
    list.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; files.splice(+b.getAttribute('data-rm'), 1); persist(); draw(); });
    try { sessionStorage.removeItem(ATT_KEY); } catch (e) { /* 무시 */ }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, base = '';
    mic.addEventListener('click', function () {
      if (!SR) { toast('이 브라우저에서는 음성 입력을 쓸 수 없습니다. 크롬이나 엣지에서 이용해 주세요.'); return; }
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = false; base = input.value ? input.value.replace(/\s*$/, ' ') : '';
      rec.onresult = function (ev) {
        var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        input.value = (base + t).slice(0, 600); input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      rec.onerror = function (ev) { if (ev && ev.error === 'not-allowed') toast('마이크 사용을 허용해 주세요.'); };
      rec.onend = function () { rec = null; mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', '음성으로 입력'); };
      try { rec.start(); mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', '음성 입력 끝내기'); } catch (e) { rec = null; }
    });
  }
  function takeAttach() {
    try { var a = JSON.parse(sessionStorage.getItem(ATT_KEY) || 'null'); sessionStorage.removeItem(ATT_KEY); return a && (a.names || []).length ? a : null; } catch (e) { return null; }
  }
  /* 서류 초안을 처음 청하는 말 — 작성 화면과 홈(바로 작성)이 함께 쓴다. */
  function draftStartMessage(doc, memo, q) {
    var tail = ' 인사나 질문 없이 지금 바로 초안 전체를 작성해 주세요. 의뢰인의 성명·주소·전화번호·이메일·주민등록번호는 의뢰인의 PDV에서 자동으로 채워지므로 [확인 필요: 항목명] 빈 칸으로 두고, 그 밖에 모르는 항목은 묻지 말고 빈 칸으로 남긴 뒤, 초안 아래 빈 칸 표로 알려 주세요.';
    if (q) return '다음 요청에 맞는 서류 초안을 작성해 주세요: ' + q + '.' + tail;
    return '「' + doc + '」 초안을 작성해 주세요.' + (memo ? ' 알고 있는 내용: ' + memo + '.' : '') + tail;
  }
  var NUDGE = function (doc) { return '질문하지 말고 지금 바로 「' + (doc || '요청한 서류') + '」 초안 전체를 ~~~markdown 코드 블록(앞머리 포함)으로 작성해 주세요. 모르는 항목은 [확인 필요: 항목명] 빈 칸으로 두세요.'; };
  /** 빈 칸 자리표(\uE000n\uE001)를 입력 칸으로 바꾼 초안 HTML. 작성 화면과 홈이 같은 모양을 쓴다. */
  function fieldsHtml(md, fields, vals, pdv) {
    md = String(md).replace(/^# [^\n\[]*\n?/m, '');   // 카드 제목에 이미 서류 이름이 있으므로 본문 첫 제목 줄은 다시 쓰지 않는다
    return mdToHtml(fillBlanks(md, null, 'html')).replace(/\uE000(\d+)\uE001/g, function (all, n) {
      var f = fields[+n]; if (!f) return '';
      var v = (vals && vals[f.key]) || '', isPdv = !!(pdv && pdv[f.key]);
      return '<input type="text" class="fld' + (isPdv ? ' pdv' : '') + (v ? ' done' : '') + '" data-i="' + n + '" aria-label="' + esc(f.label) + '" placeholder="' + esc(f.hint || f.label) + '" value="' + esc(v) + '"' + (f.sensitive ? ' autocomplete="off"' : '') + '>' + (isPdv ? '<span class="fld-badge" title="의뢰인의 PDV에서 가져온 값입니다. 맞는지 확인해 주십시오.">PDV</span>' : '');
    });
  }
  /* 시험용(시뮬레이션) 의뢰인 — 실제로는 의뢰인의 PDV 에서 가져온다. 작성 화면과 홈의 서류 미리보기가 함께 쓴다. */
  var SIM_CLIENT = { name: '도 영민', address: '제주시 한림읍 금능남로 3', phone: '010-9662-7170', email: 'tensor.city@gmail.com', rrn: '641005-1******' };
  function docPreviewHtml(title, hit, alts) {
    var meta = hit ? esc(hit.c) + (hit.d ? ' · ' + esc(hit.d) : '') : '말씀하신 대로 초안을 씁니다';
    function row(label, val, ph, pdv) {
      return '<tr><th scope="row">' + esc(label) + '</th><td><input type="text" class="fld' + (pdv ? ' pdv' : '') + (val ? ' done' : '') + '" aria-label="' + esc(label) + '" placeholder="' + esc(ph) + '" value="' + esc(val || '') + '">' + (pdv ? '<span class="fld-badge" title="의뢰인의 PDV에서 가져온 값입니다.">PDV</span>' : '') + '</td></tr>';
    }
    var h = '<div class="dp-card"><h2>' + esc(title) + '</h2><p class="dp-meta">' + meta + '</p>';
    if (alts && alts.length) h += '<div class="dp-alt" aria-label="비슷한 서류">' + alts.map(function (t) { return '<button type="button" class="chip" data-alt="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
    h += '<table class="dp-tbl"><tbody>' +
      row('신청인 성명', SIM_CLIENT.name, '성명', true) + row('주소', SIM_CLIENT.address, '주소', true) + row('전화번호', SIM_CLIENT.phone, '전화번호', true) +
      row('이메일', SIM_CLIENT.email, '이메일', true) + row('주민등록번호', SIM_CLIENT.rrn, '주민등록번호', true) + row('상대방·대상', '', '해당하면 적어 주십시오') + '</tbody></table></div>';
    return h;
  }
  function initHome() {
    var form = $('askForm'), input = $('askInput'), prev = $('docPrev'), prevIn = $('docPrevIn'), db = null, index = null, sig = '', cur = '', timer = null;
    attachSuggest(input, form);
    initAttach(input);
    var curPid = ENGINE_L, curIssued = false, gen = null, frame = null, fReady = false, fQueue = [], fTimer = null, saveT = null, autoT = null, rv = null, rvTimer = null;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) { input.focus(); return; }
      if (timer) { clearTimeout(timer); timer = null; }
      showPrev();   // 방금 친 글자까지 반영한 미리보기를 확정한다
      if (curIssued) { window.NaviLaw.go(writeUrl(curPid, { doc: cur })); return; }   // 발급받는 서류는 발급 안내로
      input.value = cur;   // 화면에 보이는 서류를 고른 것으로 한다
      startGen(cur, curPid);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.chip[data-q]'), function (c) {
      c.addEventListener('click', function () { input.value = c.getAttribute('data-q'); form.requestSubmit(); });
    });

    /* ── 이 화면에서 바로 작성: 엔터를 누르면 페이지를 옮기지 않고, 보이는 서류의 나머지 항목을 AI가 채워 같은 자리에 펼친다. ── */
    function genMd() { return gen ? (gen.md || gen.part || '') : ''; }
    function genFields() { var m = genMd(); return m ? scanBlanks(m) : []; }
    function genSecret() { var m = {}; genFields().forEach(function (f) { if (f.sensitive) m[f.key] = 1; }); return m; }
    function genSnap() {
      var sec = genSecret(), vals = {}, k; for (k in gen.vals) if (!sec[k]) vals[k] = gen.vals[k];
      return { w: gen.w, doc: gen.title, md: gen.md, title: gen.title, at: gen.at, rest: gen.rest || '', pid: gen.pid, kind: '', vals: vals, pdv: gen.pdv, id: gen.id };
    }
    function genSave() {
      var nm = genFields().filter(function (f) { return f.kind === 'name'; })[0], snap = genSnap();
      myDocPut({ id: gen.id, title: gen.title, client: (nm && gen.vals[nm.key]) || '', at: gen.at, step: PHASES[phaseOf(gen.w) - 1], state: snap });
    }
    function genSimFill() { genFields().forEach(function (f) { var v = f.kind && SIM_CLIENT[f.kind]; if (v && !gen.vals[f.key]) { gen.vals[f.key] = v; gen.pdv[f.key] = 1; } }); }
    function genSummary() {
      var fs = genFields(), n = fs.filter(function (f) { return gen.vals[f.key]; }).length, el = $('gSum');
      if (el && !gen.md) el.textContent = '작성 중입니다. 지금까지 입력할 항목 ' + fs.length + '개 중 ' + n + '개 입력.';
      else if (el) el.textContent = '입력할 항목 ' + fs.length + '개 중 ' + n + '개 입력' + (n === fs.length ? ' — 모두 입력했습니다.' : '. 아래 서식의 빈 칸에 바로 쓰시면 됩니다.');
    }
    function genFail(msg) {
      prevIn.innerHTML = '<div class="dp-card"><h2>' + esc(gen.title) + '</h2><p class="dp-meta" role="alert">' + esc(msg) + '</p><div class="dp-foot"><button type="button" class="btn" data-go="1">작성 화면에서 하기</button></div></div>';
      prev.classList.add('open');
    }
    /* 초안 밖의 AI 말에서 코드 울타리 줄·짧은 제목 줄만 남은 찌꺼기는 버린다. 쓸 만한 안내(빈 칸 표 등)가 있을 때만 보인다. */
    function restOf(r) {
      var t = String(r || '').replace(/^[ \t]*(?:~{3,}|`{3,})[^\n]*$/gm, '').replace(/^[^\n]{0,40}초안[ \t]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      return t.replace(/[\s·\-|:]/g, '').length >= 12 ? t : '';
    }
    function genDraw() {
      var fs = genFields(), restText = restOf(gen.rest);
      prevIn.innerHTML = '<div class="dp-card dp-draft"><h2>' + esc(gen.title) + '</h2><p class="dp-meta" id="gSum" role="status"></p><div class="dp-act"><button type="button" class="btn line" data-act="review">제출 결과 예상</button></div><div class="dp-review" id="rvBox" role="status" hidden></div><div class="draft dp-body">' + fieldsHtml(gen.md, fs, gen.vals, gen.pdv) + '</div>' +
        (restText ? '<details class="dp-rest"><summary>AI의 안내·남은 빈 칸</summary><div class="draft">' + mdToHtml(restText) + '</div></details>' : '') +
        '<div class="dp-foot"><button type="button" class="btn" data-act="review">제출 결과 예상</button><button type="button" class="btn line" data-act="download">웹 표준 서식으로 내려받기</button><button type="button" class="btn line" data-act="copy">복사</button><button type="button" class="btn line" data-act="continue">작성 화면에서 이어서 고치기</button><span class="dp-note">의뢰인 정보는 PDV에서 채워졌습니다. 변호사·법무사가 승인합니다.</span></div></div>';
      genSummary(); rvRender(); prev.classList.add('open'); prev.setAttribute('aria-hidden', 'false');
    }
    /* 응답이 오는 대로 윗부분부터 그려 나간다(스트리밍). 입력 칸에 글을 쓰는 중이면 그 순간만 건너뛴다. */
    function genDrawPartial() {
      var fs = genFields();
      prevIn.innerHTML = '<div class="dp-card dp-draft"><h2>' + esc(gen.title) + '</h2><p class="dp-meta" id="gSum" role="status"></p><div class="draft dp-body">' + fieldsHtml(gen.part, fs, gen.vals, gen.pdv) + '</div>' +
        '<div class="dp-sec busy" role="status"><b>AI가 작성하는 중…</b> 위에서부터 차례로 채워집니다.</div></div>';
      genSummary(); prev.classList.add('open'); prev.setAttribute('aria-hidden', 'false');
    }
    /* ── 제출 결과 예상: 서류가 관련 법령에 따라 승인될지, 보정·수정 요청이 나올지 AI가 법적 결격 사유 중심으로 예상한다(법적 검토 SP 방식). ── */
    function reviewMessage() {
      var vals = genFields().filter(function (f) { return gen.vals[f.key] && !f.sensitive; }).map(function (f) { return f.label + ': ' + gen.vals[f.key]; }).join('\n').slice(0, 1200);
      return '「' + gen.title + '」 초안의 제출 결과를 예상해 주세요. 관련 법령에 따라 제출 기관이 이 서류를 승인(수리)할지, 보정이나 수정을 요청할지 법적 결격 사유 중심으로 검토합니다. 초안을 다시 쓰지 말고 아래 형식으로만, 인사나 질문 없이 답해 주세요.\n' +
        '1. 결론 한 줄: 승인 예상 / 보정 요청 예상 / 수정 필요 / 판단 불가 중 하나와 확신도(1~10)\n' +
        '2. 근거: 형식 요건 · 실체 요건 · 절차 요건 · 결격 사유 순으로, 문제가 있는 것만\n' +
        '3. 보정 목록: 표(항목 | 문제 | 근거 법령(확인이 필요하면 표시) | 조치)\n' +
        '4. 다음 단계 한 줄\n마지막 줄에 [REVIEW_RESULT: verdict=승인 예상|보정 요청 예상|수정 필요|판단 불가; confidence=숫자] 를 붙여 주세요.' +
        (vals ? '\n\n이용자가 서식에 입력한 값(초안에 반영):\n' + vals : '');
    }
    function parseReview(text) {
      var t = String(text || ''), m = /\[REVIEW_RESULT:([^\]]*)\]/.exec(t), v = m && /verdict=\s*([^;\]]+)/.exec(m[1]), c = m && /confidence=\s*(\d+)/.exec(m[1]);
      t = cleanRest(t.replace(/\[REVIEW_RESULT:[^\]]*\]?/g, ''), '').replace(/^[ \t]*(?:~{3,}|`{3,})[^\n]*$/gm, '').trim();
      return { body: t, verdict: v ? v[1].trim() : '', conf: c ? c[1] : '' };
    }
    function rvRender() {
      var box = $('rvBox'), btns = prevIn.querySelectorAll('[data-act="review"]'), i;
      for (i = 0; i < btns.length; i++) btns[i].disabled = !!(rv && rv.busy);
      if (!box) return;
      if (!rv) { box.hidden = true; box.innerHTML = ''; return; }
      var p = parseReview(rv.text), cls = /^승인/.test(p.verdict) ? 'ok' : /^보정/.test(p.verdict) ? 'warn' : /^수정/.test(p.verdict) ? 'bad' : 'na';
      box.hidden = false;
      box.innerHTML = '<div class="rv-head"><b>제출 결과 예상</b>' + (p.verdict ? '<span class="rv-badge ' + cls + '">' + esc(p.verdict) + (p.conf ? ' · 확신도 ' + esc(p.conf) + '/10' : '') + '</span>' : '') + '</div>' +
        (rv.err ? '<p class="dp-meta" role="alert">' + esc(rv.err) + '</p>' : '') +
        (p.body ? '<div class="draft">' + mdToHtml(p.body) + '</div>' : '') +
        (rv.busy ? '<div class="dp-sec busy"><b>관련 법령에 따라 검토하는 중…</b> 형식·실체·절차 요건과 결격 사유를 확인합니다.</div>' : '');
    }
    function startReview() {
      if (!gen || !gen.md || (rv && rv.busy)) return;
      rv = { busy: true, text: '', at: 0 }; rvRender();
      var box = $('rvBox'); try { if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* 무시 */ }
      fSend(reviewMessage());
      if (rvTimer) clearTimeout(rvTimer);
      rvTimer = setTimeout(function () { if (rv && rv.busy) { rv.busy = false; rv.err = 'AI와 연결되지 않아 결과를 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.'; rvRender(); } }, 90000);
    }
    function fSend(text) {
      if (fReady) { try { frame.contentWindow.postMessage({ type: 'expert-embed-send', text: text }, HONDI); } catch (e) { genFail('AI에 요청을 보내지 못했습니다.'); } }
      else fQueue.push(text);
    }
    function startGen(title, pid) {
      var att = takeAttach(), extra = att ? ' 의뢰인이 첨부한 자료: ' + att.names.join(', ') + '.' + (att.text ? '\n\n' + att.text : '') : '';
      gen = { title: title, pid: pid, md: '', rest: '', vals: {}, pdv: {}, w: 1, at: Date.now(), nudged: false, id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
      var sec = prevIn.querySelector('.dp-sec'), card = prevIn.querySelector('.dp-card');
      if (!sec && card) { sec = document.createElement('div'); sec.className = 'dp-sec'; card.appendChild(sec); }
      if (sec) { sec.classList.add('busy'); sec.setAttribute('role', 'status'); sec.innerHTML = '<b>AI가 이 서류의 나머지 항목을 작성하고 있습니다…</b> 신청 취지·이유·첨부서류 등을 채우는 중입니다.'; }
      var btn = prevIn.querySelector('[data-go]'); if (btn) btn.disabled = true;
      if (!frame || frame.getAttribute('data-pid') !== pid) {
        if (frame) frame.remove();
        fReady = false; fQueue = [];
        frame = document.createElement('iframe'); frame.className = 'gen-frame'; frame.setAttribute('data-pid', pid); frame.setAttribute('title', '서류 작성 AI'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.src = HONDI + '/pages/expert-chat.html?persona=' + enc(pid) + '&embed=1&label=' + enc(LABEL);
        document.body.appendChild(frame);
      }
      fSend(draftStartMessage(title, '', '') + extra);
      if (fTimer) clearTimeout(fTimer);
      fTimer = setTimeout(function () { if (gen && !gen.md && !gen.failed) { gen.failed = true; genFail('AI와 연결되지 않았습니다. 같은 브라우저에서 hondi.net에 로그인했는지 확인하거나 작성 화면에서 해 주십시오.'); } }, 90000);
    }
    window.addEventListener('message', function (e) {
      if (e.origin !== HONDI || !frame || e.source !== frame.contentWindow || !e.data) return;
      if (e.data.type === 'expert-embed-ready') { fReady = true; while (fQueue.length) fSend(fQueue.shift()); }
      else if (rv && rv.busy && (e.data.type === 'expert-embed-partial' || e.data.type === 'expert-embed-reply')) {
        var done = e.data.type === 'expert-embed-reply', nowR = Date.now();
        if (!done && nowR - rv.at < 150) return;
        rv.at = nowR; rv.text = String(e.data.text || '');
        if (done) { rv.busy = false; if (rvTimer) { clearTimeout(rvTimer); rvTimer = null; } }
        rvRender();
      }
      else if (e.data.type === 'expert-embed-partial' && gen && !gen.md && !gen.failed) {
        var now = Date.now(), part = partialDoc(e.data.text), ae = document.activeElement;
        if (!part || part === gen.part || now - (gen.pt || 0) < 150) return;
        if (ae && ae.classList && ae.classList.contains('fld') && prevIn.contains(ae)) return;
        gen.pt = now; gen.part = part; gen.title = docTitle(part) || gen.title; genSimFill(); genDrawPartial();
      }
      else if (e.data.type === 'expert-embed-reply' && gen && !gen.md) {
        var text = String(e.data.text || ''), ex = extractDoc(text);
        if (!ex) { if (!gen.nudged) { gen.nudged = true; fSend(NUDGE(gen.title)); } else { gen.failed = true; genFail('초안을 받지 못했습니다. 작성 화면에서 다시 해 주십시오.'); } return; }
        if (fTimer) { clearTimeout(fTimer); fTimer = null; }
        var m = STATUS_RE.exec(text); gen.w = m ? parseInt(m[1], 10) : 6;
        gen.part = ''; gen.md = ex.md; gen.title = docTitle(ex.md) || gen.title; gen.rest = cleanRest(text, ex.raw); gen.at = Date.now();
        genSimFill(); genDraw(); genSave();
      }
    });
    prevIn.addEventListener('input', function (e) {
      var t = e.target; if (!gen || !genMd() || !t.classList || !t.classList.contains('fld')) return;
      var fs = genFields(), f = fs[+t.getAttribute('data-i')]; if (!f) return;
      gen.vals[f.key] = t.value; delete gen.pdv[f.key]; t.classList.toggle('done', !!t.value); t.classList.remove('pdv');
      var b = t.nextSibling; if (b && b.classList && b.classList.contains('fld-badge')) b.remove();
      Array.prototype.forEach.call(prevIn.querySelectorAll('.fld'), function (o) { if (o !== t && fs[+o.getAttribute('data-i')] === f) { o.value = t.value; o.classList.toggle('done', !!t.value); } });
      genSummary(); if (saveT) clearTimeout(saveT); saveT = setTimeout(function () { gen.at = Date.now(); genSave(); }, 400);
    });
    prevIn.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b || !gen || !gen.md) return;
      if (b.getAttribute('data-act') === 'review') { startReview(); return; }
      var act = b.getAttribute('data-act'), filled = fillBlanks(gen.md, gen.vals, 'text');
      if (act === 'download') {
        var blob = new Blob([toWebDoc(gen.title, filled)], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = fileName(gen.title, new Date(gen.at)); document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } else if (act === 'copy') {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(filled).then(function () { toast('복사했습니다.'); }, function () { toast('복사하지 못했습니다.'); });
        else toast('이 브라우저에서는 복사할 수 없습니다. 내려받기를 이용해 주세요.');
      } else if (act === 'continue') { genSave(); storeSet('navilaw_write_last', genSnap()); window.NaviLaw.go('write.html'); }
    });
    /* 서류 미리보기 — 입력하면 곧바로(0.12초 뒤) 입력칸 아래로 펼친다. 서류 목록이 아직 오지 않았어도 입력한 말로 먼저 펼치고, 목록이 오면 맞는 서류로 바꾼다. */
    function showPrev() {
      var q = input.value.trim();
      if (!q) { prev.classList.remove('open'); prev.setAttribute('aria-hidden', 'true'); sig = ''; gen = null; rv = null; return; }
      var hits = index ? window.NaviLawDocs.search(index, q, { limit: 5 }).filter(function (e) { return e.kind !== 'field'; }) : [];
      var top = hits[0] || null, title = top ? top.t : q, issued = db && window.NaviLawDocs.findIssued ? window.NaviLawDocs.findIssued(db, title) : null;
      var key = title + '|' + (issued ? 'i' : '');
      cur = title; curPid = (top && top.pid) || ENGINE_L; curIssued = !!issued;
      if (key !== sig) {
        sig = key; gen = null; rv = null;
        if (issued) prevIn.innerHTML = '<div class="dp-card"><h2>' + esc(title) + '</h2><p class="dp-meta">발급받아 첨부하는 서류입니다</p><div class="dp-foot"><button type="button" class="btn" data-go="1">발급 안내 보기</button><span class="dp-note">작성하는 서류가 아니라 발급처·준비물을 안내합니다.</span></div></div>';
        else prevIn.innerHTML = docPreviewHtml(title, top, hits.slice(1, 5).map(function (e) { return e.t; }));
      }
      prev.classList.add('open'); prev.setAttribute('aria-hidden', 'false');
      /* 입력한 말이 서류 명칭과 정확히 같으면 확정으로 보고 잠시 뒤 바로 작성을 시작한다(엔터·추천 서류 선택은 즉시). */
      if (autoT) { clearTimeout(autoT); autoT = null; }
      if (top && !issued && !gen && top.t === q) autoT = setTimeout(function () { autoT = null; if (!gen && input.value.trim() === q) form.requestSubmit(); }, 700);
    }
    function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(showPrev, 120); }
    input.addEventListener('input', schedule);
    prevIn.addEventListener('click', function (e) {
      var alt = e.target.closest('[data-alt]'), go = e.target.closest('[data-go]');
      if (alt) { input.value = alt.getAttribute('data-alt'); showPrev(); form.requestSubmit(); }   // 추천 서류를 고르면 바로 이 화면에서 작성
      else if (go && cur) window.NaviLaw.go(writeUrl(curPid, { doc: cur }));
    });
    /* 홈 맨 위: 오늘 날짜 기준으로 작성할 수 있는 서류 수(발급받아 첨부하는 서류는 뺀다). */
    function showCount(d) {
      var el = $('docCount'), n = ((d && d.docs) || []).filter(function (x) { return x.p !== 'issued'; }).length;
      if (!el || !n) return;
      function draw() {   // 한국 표준시(UTC+9) 기준 날짜. 기기 시간대와 무관하게 한국 날짜로 표시한다.
        var k = new Date(Date.now() + 9 * 3600000);
        el.textContent = k.getUTCFullYear() + '년 ' + (k.getUTCMonth() + 1) + '월 ' + k.getUTCDate() + '일 현재, ' + n.toLocaleString('en-US') + '건의 민원 & 법원 서류를 작성합니다.';
      }
      draw();
      if (!/jsdom/i.test(navigator.userAgent)) setInterval(draw, 60000);   // 화면을 켜 둔 채 자정이 지나도 날짜가 바뀐다(시험 환경 제외)
      document.addEventListener('visibilitychange', draw);
    }
    fetch('data/docs.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { db = d; showCount(d); index = window.NaviLawDocs.createIndex(d); if (input.value.trim()) showPrev(); }).catch(function () { /* 목록이 없어도 입력한 말로 미리보기는 나온다 */ });
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
  /** 아직 끝나지 않은 AI 응답에서 지금까지 쓴 초안 줄만 뽑는다(스트리밍 표시용). 제목(# …) 줄이 나오기 전이면 빈 문자열. */
  function partialDoc(reply) {
    var s = String(reply || ''), m = /(^|\n)(~{3,}|`{3,})[ \t]*(?:markdown|md)?[ \t]*\n/.exec(s), body, close;
    if (!m) return '';
    body = s.slice(m.index + m[0].length);
    close = new RegExp('\\n' + m[2].charAt(0) + '{' + m[2].length + ',}[ \\t]*(?:\\n|$)').exec('\n' + body);
    body = close ? body.slice(0, Math.max(0, close.index)) + '\n' : body.slice(0, body.lastIndexOf('\n') + 1);   // 끝난 줄까지만
    return /^# /m.test(body) ? body : '';
  }
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
  var NOT_SELF_RE = /(피신청인|피청구인|피고|피상속인|상대|채무자|채권자|임대인|임차인|매도인|매수인|양도인|양수인|대리인|증인|사망|배우자|자녀|부모|법정|변호사|법무사|세무사|변리사|관할|법원|기관|회사|사업장|사업자|상호|목적물|부동산|토지|농지|임야|건물|사건|피해자|가해자|제출처)/;
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
  /** pdvKind("신청인 성명","") → 'name' | 'address' | 'phone' | 'email' | 'rrn' | null — 의뢰인 본인의 인적사항으로 볼 수 있는 칸만. 상대방·부동산 주소·법인 등은 PDV 로 채우지 않는다. */
  function pdvKind(label, hint) {
    var t = String(label || '') + ' ' + String(hint || '');
    if (NOT_SELF_RE.test(t)) return null;
    if (/(주민등록번호|주민번호)/.test(t)) return 'rrn';   // 의뢰인 본인 칸. 실제 PDV 에는 요청하지 않는다
    if (SENSITIVE_RE.test(t)) return null;
    if (/(이메일|전자우편|e-?mail)/i.test(t)) return 'email';
    if (/(성\s*명|이름)/.test(t)) return 'name';
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
    var nudged = false, pdvAuto = false, fields = [], drawSig = '', pdvReq = null, pdvStatus = '', chatOpen = false;

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
      $('back').href = 'mydocs.html';
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
        if (st.md && st.kind !== 'issued' && !findAc()) simFill();
      }
    }

    function save() {
      st.pid = pid;
      if (st.md && st.kind !== 'issued') fields = scanBlanks(st.md);
      var keep = {}, snap = {}, k, sens = {}, i;
      for (i = 0; i < fields.length; i++) if (fields[i].sensitive) sens[fields[i].key] = 1;
      for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) snap[k] = st[k];
      for (k in st.vals) if (!sens[k]) keep[k] = st.vals[k];   // 주민등록번호 등은 이 화면을 닫으면 사라지게 저장하지 않는다
      snap.vals = keep;
      storeSet('navilaw_write_last', snap);
      if (st.md && st.kind !== 'issued') {   // 초안이 있으면 내 서류 목록에도 올린다
        if (!st.id) st.id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        snap.id = st.id;
        var nm = fields.filter(function (f) { return f.kind === 'name'; })[0];
        myDocPut({ id: st.id, title: st.title || st.doc, client: (nm && valOf(nm)) || '', at: st.at || Date.now(), step: PHASES[phaseOf(st.w || 1) - 1], state: snap });
      }
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
      var wants = pdvWants().filter(function (f) { return f.kind !== 'rrn'; }), ac = findAc();
      $('pdvBtn').hidden = !(ac && wants.length);
      $('pdvNote').textContent = pdvStatus || (ac ? (wants.length ? '내 AI 비서의 PDV에 있는 성명·연락처·주소를 가져올 수 있습니다.' : '') : (fillCount() ? '' : '혼디 이용자가 아니면 빈 칸에 직접 입력해 주십시오.'));
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
    var AC_ORIGINS = [HONDI, 'https://www.hondi.net'], PDV_NAME = { name: '이름', phone: '연락처', address: '주소', email: '이메일' };
    /* 시험용(시뮬레이션) 의뢰인 — 실제로는 의뢰인의 PDV 에서 가져온다. 비서가 연 창이 아닐 때 이 값으로 채운다. */
    function simFill() {
      var n = 0;
      pdvWants().forEach(function (f) { var v = SIM_CLIENT[f.kind]; if (v) { st.vals[f.key] = v; st.pdv[f.key] = 1; n++; } });
      pdvStatus = n ? '의뢰인의 PDV에서 ' + n + '개 항목을 채웠습니다. 맞는지 확인해 주십시오.' : '';
      if (n) { drawSig = ''; save(); render(); }
    }
    function findAc() {
      var o = ''; try { o = sessionStorage.getItem('navilaw_ac') || ''; } catch (e) { o = ''; }
      try { if (!o || !window.opener || window.opener.closed) return ''; } catch (e) { return ''; }
      return AC_ORIGINS.indexOf(o) >= 0 ? o : '';
    }
    function pdvWants() { return fields.filter(function (f) { return f.kind && !valOf(f); }); }
    function pdvFill(auto) {
      var ac = findAc(), want = pdvWants().filter(function (f) { return f.kind !== 'rrn'; }), names = [];
      if (!ac) { simFill(); return; }
      if (!want.length || pdvReq) return;
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
      if (!ex && !st.md && !nudged) {   // 초안 대신 인사·질문이 왔으면 묻지 않고 바로 쓰라고 한 번 더 요청한다
        nudged = true; st.rest = ''; save();
        send(NUDGE(st.doc));
        return;
      }
      save(); setBusy(false);
      if (ex) {
        if (!chatOpen) $('chatDot').hidden = false;
        $('draftPane').scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!pdvAuto || !findAc()) { pdvAuto = true; pdvFill(true); }   // 처음 초안이 나오면 한 번만 AI 비서에게 인적사항을 요청한다
      }
    }

    function startMessage(doc, memo, q) { return draftStartMessage(doc, memo, q); }
    function begin(doc, memo, q) {
      var N = window.NaviLawDocs, it = !q && doc && N.findIssued ? N.findIssued(docsDb, doc) : (q && N.findIssuedAsk ? N.findIssuedAsk(docsDb, q) : null);   // 받아서 첨부하는 서류는 초안이 아니라 발급 안내로 시작한다 — 서류명만 고른 경우와 "…떼는 법" 같은 발급 문의 문장
      st = { w: 1, doc: it ? it.t : (doc || (q ? q.slice(0, 40) : '')), md: '', title: '', at: 0, rest: '', pid: pid, kind: it ? 'issued' : '', vals: {}, pdv: {} }; drawSig = ''; pdvStatus = ''; nudged = false; pdvAuto = false;
      var att = takeAttach(), extra = att ? ' 의뢰인이 첨부한 자료: ' + att.names.join(', ') + '.' + (att.text ? '\n\n' + att.text : '') : '';
      save(); render(); send(it ? N.issuedAsk(it, memo, q) : startMessage(doc, memo, q) + extra);
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
      document.addEventListener('click', function (e) { if (chatOpen && !$('chatPanel').contains(e.target) && !$('chatFab').contains(e.target) && e.target !== $('connOpen')) setChat(false); });
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
    document.addEventListener('click', function (e) { if (el.classList.contains('open') && !el.contains(e.target) && !tab.contains(e.target)) setOpen(false, false); });   // 패널 바깥을 누르면 밀어 넣는다
    var tb = $('towerBtn'), tip = $('towerTip');
    if (tb && tip) tb.addEventListener('click', function () { var o = tip.hidden; tip.hidden = !o; tb.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  }

  /* 사용법 패널 — 특징 패널과 같은 방식으로 밀어 넣고 빼며, 한쪽을 열면 다른 쪽은 바깥 클릭 처리로 닫힌다. */
  function initHowto() {
    var el = $('howPanel'), tab = $('howTab'), x = $('howX'); if (!el || !tab || !x) return;
    function setOpen(open, focus) {
      el.classList.toggle('open', open);
      el.setAttribute('aria-hidden', open ? 'false' : 'true');
      tab.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (focus) { try { (open ? x : tab).focus(); } catch (e) { /* 무시 */ } }
    }
    tab.addEventListener('click', function (e) { e.stopPropagation(); var p = $('promo'); if (p && p.classList.contains('open')) { p.classList.remove('open'); p.setAttribute('aria-hidden', 'true'); var pt = $('promoTab'); if (pt) pt.setAttribute('aria-expanded', 'false'); } setOpen(true, true); });
    x.addEventListener('click', function () { setOpen(false, true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('open')) setOpen(false, true); });
    document.addEventListener('click', function (e) { if (el.classList.contains('open') && !el.contains(e.target) && !tab.contains(e.target)) setOpen(false, false); });
  }

  /* 나만의 AI 비서(hondi.net)가 ?gwp=1&origin=… 로 연 창이면 그 출처를 기억한다 — 이후 다른 쪽으로 이동해도 window.opener 로 비서와 이야기할 수 있다. */
  (function captureAc() {
    try { var o = qs.get('origin') || ''; if (qs.get('gwp') === '1' && (o === HONDI || o === 'https://www.hondi.net')) sessionStorage.setItem('navilaw_ac', o); } catch (e) { /* 무시 */ }
  })();
  var page = document.body.getAttribute('data-page');
  initPromo(); initHowto(); initChat();
  if (page === 'home') initHome();
  else if (page === 'docs') initDocs();
  else if (page === 'mydocs') initMyDocs();
  else if (page === 'write') initWrite();
  window.NaviLaw = { scanBlanks: scanBlanks, fillBlanks: fillBlanks, pdvKind: pdvKind, go: function (u) { location.href = u; }, route: route, pickEngine: pickEngine, attachSuggest: attachSuggest, extractDoc: extractDoc, mdToHtml: mdToHtml, cleanRest: cleanRest, phaseOf: phaseOf, STATUS_RE: STATUS_RE };
})();
