// 클릭·터치 이펙트 — 화면 어디서든 모든 누름에 원 (UI 피드백 — 게임 판정과 무관, 골라내지 않음)
//   누르는 동안 포인터를 따라가고(캔버스 밖으로 나갔다 들어와도 그대로), 떼면 확대하며 사라진다. 포인터마다 하나 (멀티터치)
//   화면 위 오버레이(pointer-events: none — 입력을 가로채지 않음), 모습은 style.css .touch-fx
//   입력 관문(gate.js) 뒤에 로드 — 잠금 중(녹음 등) 막힌 누름에는 이펙트도 없다
//   인스턴스 상호작용은 따로 (field-actors.js — 캔버스 위에서 뗐고 떽이면 그 지점)
(function() {
  const layer = document.createElement('div');
  layer.className = 'touch-fx-layer';
  document.body.appendChild(layer);
  const live = {};   // pointerId → 원 요소

  function place(el, e) { el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; }
  function end(e) {
    const el = live[e.pointerId];
    if (!el) return;
    delete live[e.pointerId];
    place(el, e);
    el.classList.add('up');
    setTimeout(function() { el.remove(); }, 400);   // 확대·사라짐 애니메이션(0.3초) 뒤
  }

  window.addEventListener('pointerdown', function(e) {
    if (live[e.pointerId]) live[e.pointerId].remove();
    const el = document.createElement('div');
    el.className = 'touch-fx';
    place(el, e);
    layer.appendChild(el);
    live[e.pointerId] = el;
  }, true);
  window.addEventListener('pointermove', function(e) { if (live[e.pointerId]) place(live[e.pointerId], e); }, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
})();
