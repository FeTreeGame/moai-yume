// 꾸미기 탭: 메인 모아이 양옆에 뜨는 오버레이 둘 (드로어가 아니라 캔버스 위). 시험 — 구현이 되는지 보는 단계
//   칸의 자리는 미리 정해져 있다 (데이터의 목록 순서 — 좌상 → 우상 → 좌하 → 우하). 아직 얻지 않은 것은 실루엣 (검정 + 반투명 — 누를 수 없다)
//   오른쪽 = 치장: 메인 모아이의 악세사리 (js/accessories.js). 칸을 누르면 씌우고 벗긴다 (한 번에 하나만 — 다른 것을 누르면 바뀐다. 정책은 accessories.js)
//   켜고 끄는 것은 둘 다 짧은 페이드 (각 모듈의 TOGGLE — 연타해도 지금 투명도에서 이어 간다)
//   왼쪽 = 배경: 보상으로 얻은 배경 요소 (js/scenery.js — 얻은 것만 칸에 나온다. 얻은 직후에는 켜져 있다). 칸을 누르면 그 요소를 켜고 끈다 (바꾸는 것이 아니라 보이기 · 숨기기)
//     묶음(받침 + 물체 세트 · 무지개 띠)은 한 칸 — 그 칸의 그림을 겹쳐 보이고 같이 켜고 끈다 (scenery.js cells)
//   여는 법 = 메인 모아이를 탭 (js/field-actors.js 'moai:field-event' { kind: 'tap', actor: 'moai' } — 뗀 자리 + 떽, 필드에서만) → 둘이 같이 열린다
//   두 탭 모두 PANEL.cells칸 (3행 2열). 배경 = 여섯 칸 전부 요소 / 치장 = 앞의 네 칸이 악세사리, 마지막 PANEL.buttons칸 자리에 선택 · 취소 버튼
//     모자란 칸은 빈 칸. 누르면 그 자리에서 바로 반영된다 (필드에 바로 보임)
//   선택 · 취소 (치장 탭에 한 쌍 — 두 탭을 같이): 선택 = 지금 고른 대로 두고 닫기 (확정) / 취소 = 열기 전 상태로 되돌리고 닫기 (드로어의 예 · 아니오와 같은 버튼 — 파랑 · 빨강)
//   오버레이 위의 누름은 캔버스 입력(연주 · 모아이 끌기)으로 새지 않는다
(function() {
  const M = window.Moai;
  const box = M.el && M.el.spriteBox ? M.el.spriteBox : document.querySelector('.sprite-box');
  if (!box) return;
  const PANEL = { cells: 6, buttons: 2 };

  // 탭 하나: src = { title, side: 'left' | 'right', buttons: 선택 · 취소를 이 탭의 마지막 칸들에 두나,
  //   items() → [{ id, own: 얻었나 (하나라도), imgs: [{ src, own, box? }], aspect? }], on(id) → 켜져 있나, set(id, bool) }
  //     aspect · box가 있으면 (묶음 — 그림마다 따로 잘린 것) 그 상자 안에 그림을 제자리 · 제 크기로 놓는다, 없으면 그림을 칸에 꽉 채운다
  function panel(src) {
    const el = document.createElement('div');
    el.className = 'dress dress-' + src.side + ' hidden';
    el.innerHTML = '<div class="dress-title">' + src.title + '</div><div class="dress-grid"></div>';
    const slots = PANEL.cells - (src.buttons ? PANEL.buttons : 0);   // 요소 칸의 수
    box.appendChild(el);
    const grid = el.querySelector('.dress-grid');
    ['mousedown', 'touchstart', 'pointerdown', 'click'].forEach(function(t) { el.addEventListener(t, function(e) { e.stopPropagation(); }); });

    let before = null;               // 열기 전에 켜져 있던 것 (id 목록) — 취소가 되돌릴 곳
    function list() { return src.items().slice(0, slots); }
    function render() {
      const L = list();
      let h = L.map(function(it) {
        const on = it.own && src.on(it.id);
        return '<button class="dress-cell' + (on ? ' on' : '') + (it.own ? '' : ' locked') + '" type="button"' + (it.own ? ' data-id="' + it.id + '"' : ' disabled') +
          ' aria-pressed="' + on + '" aria-label="' + it.id + '">' +
          art(it) + '</button>';
      }).join('');
      for (let i = L.length; i < slots; i++) h += '<div class="dress-cell empty" aria-hidden="true"></div>';
      if (src.buttons) h += '<button class="ctrl-btn ask-yes dress-ok" type="button">선택</button><button class="ctrl-btn ask-no dress-cancel" type="button">취소</button>';
      grid.innerHTML = h;
    }
    function art(it) {
      const pct = function(v) { return (v * 100).toFixed(2) + '%'; };
      const placed = it.aspect && it.imgs.every(function(p) { return p.box; });
      const imgs = it.imgs.map(function(p) {
        const st = placed ? ' style="left:' + pct(p.box[0]) + ';top:' + pct(p.box[1]) + ';width:' + pct(p.box[2]) + ';height:' + pct(p.box[3]) + (p.flip ? ';transform:scaleX(-1)' : '') + '"' : '';
        return '<img' + (p.own ? '' : ' class="lock"') + st + ' src="' + p.src + '" alt="" draggable="false">';
      }).join('');
      return placed ? '<span class="dress-art" style="aspect-ratio:' + it.aspect.toFixed(4) + ';' + (it.aspect >= 1 ? 'width' : 'height') + ':100%">' + imgs + '</span>' : imgs;
    }
    function isOpen() { return !el.classList.contains('hidden'); }
    function open() {
      if (isOpen()) { render(); return; }
      before = list().filter(function(it) { return it.own && src.on(it.id); }).map(function(it) { return it.id; });
      render();
      el.classList.remove('hidden');
    }
    function close(keep) {
      if (!isOpen()) return;
      if (!keep && before) list().forEach(function(it) { if (!it.own) return; const want = before.indexOf(it.id) >= 0; if (want !== src.on(it.id)) src.set(it.id, want); });   // 취소: 열기 전 상태로
      before = null;
      el.classList.add('hidden');
    }
    grid.addEventListener('click', function(e) {
      if (e.target.closest('.dress-ok')) { closeAll(true); return; }
      if (e.target.closest('.dress-cancel')) { closeAll(false); return; }
      const b = e.target.closest('.dress-cell');
      if (!b || !b.getAttribute('data-id')) return;
      const id = b.getAttribute('data-id');
      src.set(id, !src.on(id));
      render();
    });
    return { el: el, open: open, close: close, isOpen: isOpen, render: function() { if (isOpen()) render(); } };
  }

  const panels = {};
  const A = M.accessories, S = M.scenery;
  if (A) panels.acc = panel({ title: '치장', side: 'right', buttons: true,
    items: function() { return A.items().map(function(it) { const own = A.owned(it.id); return { id: it.id, own: own, imgs: [{ src: it.img, own: own }] }; }); },
    on: function(id) { return A.worn(id); },
    set: function(id, v) { if (v) A.wear(id, { toggle: true }); else A.unwear(id, { toggle: true }); } });
  if (S && S.owned) panels.scn = panel({ title: '배경', side: 'left',
    items: function() { return S.slots(); },
    on: function(id) { return S.cellShown(id); },
    set: function(id, v) { S.showCell(id, v); } });

  function each(fn) { Object.keys(panels).forEach(function(k) { fn(panels[k]); }); }
  function open() { each(function(p) { p.open(); }); }
  function close(keep) { each(function(p) { p.close(keep); }); }
  function closeAll(keep) { close(keep); }   // 선택 · 취소 = 두 탭을 같이
  document.addEventListener('moai:field-event', function(e) {
    const d = e.detail || {};
    if (d.kind === 'tap' && d.actor === 'moai') open();
    else if (d.kind === 'reward') each(function(p) { p.render(); });      // 열려 있는 동안 보상을 받으면 칸에 바로 나온다
  });
  document.addEventListener('moai:session', function(e) { if (e.detail.active) close(true); });   // 세션에 들어가면 닫는다 (고른 것은 그대로)

  M.dress = { open: open, close: close, panels: panels, isOpen: function() { return Object.keys(panels).some(function(k) { return panels[k].isOpen(); }); }, policy: PANEL };
})();
