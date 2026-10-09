// 메인 모아이 = 상호작용 개체: 끌기 (필드 · 세션 모두) · 탭 (필드에서만 — 세션에서는 캔버스 누름이 그대로 연주일 뿐)
//   끌기 = 높이 바꾸기: 모아이 위에서 누른 채 위아래로 TOUCH.start(px)보다 더 움직이면 끌기 — 그때부터 손가락을 따라 높이가 바뀐다 (키 ↑ ↓와 같은 높이: sprite.js M.setMoaiHeight)
//     연주 입력은 건드리지 않는다 — 누르면 평소처럼 뚜~가 이어지고 떼면 평소처럼 끝난다 (키 ↑ ↓로 높이를 바꾸며 홀드하는 것과 같다: 끌어도 소리 · 동작이 끊기지 않는다)
//     끌고 난 뒤의 뗌은 탭이 아니다 — 치장 탭을 열지 않는다 (dragged)
//     손가락이 간 만큼 모아이가 간다: 높이 0 ~ 1 = 세로 이동 폭 (layout.js M.MOAI_HEIGHT up ~ down — 캔버스 높이 비), 카메라 배율만큼 나눈다
//   탭 = 치장 탭 열기: 누른 자리가 아니라 '뗀 자리 + 떽' 규칙 (다른 필드 개체와 같다) — js/field-actors.js가 'moai:field-event' { kind: 'tap', actor: 'moai' }로 알리고 js/dress.js가 듣는다
//   모아이 위인가 = 모아이 판정 사각형 (layout.js MOAI_HIT — 머리 ~ 어깨), 화면 → 장면 좌표는 카메라 (줌해도 보이는 곳 = 눌리는 곳)
(function() {
  const M = window.Moai;
  const TOUCH = { start: 14 };       // 이만큼 (px) 위아래로 움직여야 끌기 — 손가락이 떨리는 정도보다 크게 (누르고 가만히 = 연주 · 홀드)
  const box = M.el && M.el.spriteBox ? M.el.spriteBox : document.querySelector('.sprite-box');
  if (!box) return;

  function onMoai(clientX, clientY) {
    if (!M.LAYOUT || !M.MOAI_HIT || !M.quadOn || !M.inPolygon) return false;
    const w = M.camera ? M.camera.toWorld(clientX, clientY) : null;
    if (!w || !w.inside) return false;
    const W = M.CANVAS_ASPECT, H = 1;
    const quad = M.quadOn(M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, W, H, M.moaiDy ? M.moaiDy() : 0), M.MOAI_HIT, M.LAYOUT.moai.flip);
    return M.inPolygon(quad, w.x * W, w.y * H);
  }
  M.onMainMoai = onMoai;             // (clientX, clientY) → 메인 모아이 위인가 (field-actors.js가 뗀 자리에 쓴다)

  let cand = null;                   // { id, y0, h0, drag }
  let draggedAt = -1e9;              // 마지막으로 끌기를 끝낸 시각 (ms)
  box.addEventListener('pointerdown', function(e) {
    if (cand || !e.isPrimary) return;
    if (!onMoai(e.clientX, e.clientY)) return;
    cand = { id: e.pointerId, y0: e.clientY, h0: 0, drag: false };
  });
  window.addEventListener('pointermove', function(e) {
    if (!cand || e.pointerId !== cand.id) return;
    if (!cand.drag) {
      if (Math.abs(e.clientY - cand.y0) < TOUCH.start) return;
      cand.drag = true; cand.y0 = e.clientY; cand.h0 = M.moaiHeightNow ? M.moaiHeightNow() : 1;   // 여기서부터 손가락을 따라간다 (튀지 않게)
      if (M.moaiHeightMove) M.moaiHeightMove(true);
    }
    const c = M.el && M.el.spriteCanvas ? M.el.spriteCanvas.getBoundingClientRect() : box.getBoundingClientRect();
    const zoom = M.camera && M.camera.view ? M.camera.view('world').zoom : 1;
    const travel = Math.abs(M.MOAI_HEIGHT.down - M.MOAI_HEIGHT.up) * c.height * zoom;   // 높이 0 ~ 1의 세로 폭 (화면 px)
    if (M.setMoaiHeight) M.setMoaiHeight(cand.h0 - (e.clientY - cand.y0) / Math.max(1, travel));   // 아래로 끌면 내려간다
  });
  function end(e) {
    if (!cand || e.pointerId !== cand.id) return;
    if (cand.drag) { draggedAt = performance.now(); if (M.moaiHeightMove) M.moaiHeightMove(false); }
    cand = null;
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  M.moaiTouch = { policy: TOUCH, dragging: function() { return !!(cand && cand.drag); },
    dragged: function() { return !!(cand && cand.drag) || performance.now() - draggedAt < 400; } };   // 방금 것이 끌기였는가 (뗀 직후 포함 — 그 뗌은 탭이 아니다)   // 지금 누름이 메인 모아이 위에서 시작됐는가 (탭 · 끌기 후보 — 카메라 규칙이 이 동안은 홀드 줌을 걸지 않는다)
})();
