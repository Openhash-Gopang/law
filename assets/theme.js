/* 나비로 화면 테마 — <head>에서 먼저 불러 깜빡임 없이 적용하고, 설정 페이지(settings.html)에서 고르게 한다. */
(function () {
  'use strict';
  var KEY = 'navilaw_theme';
  var DEFAULT = 'e';
  var THEMES = [
    { id: 'a', name: 'A 글라스', desc: '투명감과 입체감' },
    { id: 'b', name: 'B 머티리얼', desc: 'Material 3 기본형' },
    { id: 'c', name: 'C 에어리', desc: '큰 글자, 한 화면 한 가지 일' },
    { id: 'd', name: 'D 워크스페이스', desc: '왼쪽 메뉴가 있는 작업대' },
    { id: 'e', name: 'E TDS 글라스', desc: '격자 바탕과 눌린 입력칸' }
  ];
  function valid(id) { return THEMES.some(function (t) { return t.id === id; }); }
  function load() {
    var q = '';
    try { q = new URLSearchParams(location.search).get('theme') || ''; } catch (e) {}
    if (valid(q)) { save(q); return q; }
    try { var s = localStorage.getItem(KEY); if (valid(s)) return s; } catch (e) {}
    return DEFAULT;
  }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  function apply(id) { document.documentElement.setAttribute('data-theme', id); }

  var current = load();
  apply(current);

  /* 설정 페이지의 '화면 디자인' 목록 */
  function build() {
    var list = document.getElementById('themeList');
    if (!list || list.firstChild) return;
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'theme-card'; b.setAttribute('data-theme-id', t.id);
      b.setAttribute('aria-pressed', t.id === current ? 'true' : 'false');
      b.innerHTML = '<span class="theme-sw ' + t.id + '" aria-hidden="true"></span><span class="theme-card-t"><b>' + t.name + '</b><small>' + t.desc + '</small></span><span class="theme-card-on" aria-hidden="true">사용 중</span>';
      list.appendChild(b);
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-theme-id]') : null;
      if (!b) return;
      current = b.getAttribute('data-theme-id');
      apply(current); save(current);
      Array.prototype.forEach.call(list.querySelectorAll('button[data-theme-id]'), function (x) {
        x.setAttribute('aria-pressed', x.getAttribute('data-theme-id') === current ? 'true' : 'false');
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.navilawTheme = { themes: THEMES, get: function () { return current; }, set: function (id) { if (valid(id)) { current = id; apply(id); save(id); } } };
})();
