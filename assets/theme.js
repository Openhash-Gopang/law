/* 나비로 화면 테마 선택 — <head>에서 먼저 불러 깜빡임 없이 적용하고, 머리말에 '디자인' 선택 단추를 단다. */
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

  function build() {
    var slot = document.querySelector('.head-right');
    if (!slot || document.getElementById('themeBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'themeBtn'; btn.className = 'theme-btn';
    btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'themePop');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 100 18c1.4 0 2-1 1.5-2.2-.5-1.3.2-2.8 1.7-2.8H17a4 4 0 004-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>디자인';
    var pop = document.createElement('ul');
    pop.id = 'themePop'; pop.className = 'theme-pop'; pop.hidden = true; pop.setAttribute('aria-label', '화면 디자인 선택');
    THEMES.forEach(function (t) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-theme-id', t.id); b.setAttribute('aria-pressed', t.id === current ? 'true' : 'false');
      b.innerHTML = '<span class="theme-sw ' + t.id + '" aria-hidden="true"></span><span><b>' + t.name + '</b><small>' + t.desc + '</small></span>';
      li.appendChild(b); pop.appendChild(li);
    });
    slot.insertBefore(pop, slot.firstChild);
    slot.insertBefore(btn, slot.firstChild);

    function open(on) {
      pop.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(pop.hidden); });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-theme-id]') : null;
      if (!b) return;
      current = b.getAttribute('data-theme-id');
      apply(current); save(current);
      Array.prototype.forEach.call(pop.querySelectorAll('button[data-theme-id]'), function (x) {
        x.setAttribute('aria-pressed', x.getAttribute('data-theme-id') === current ? 'true' : 'false');
      });
      open(false); btn.focus();
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !slot.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { open(false); btn.focus(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.navilawTheme = { themes: THEMES, get: function () { return current; }, set: function (id) { if (valid(id)) { current = id; apply(id); save(id); } } };
})();
