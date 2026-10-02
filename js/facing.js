// 메인 모아이 방향 — 제자리에서 누른 쪽을 바라본다 (좌우 반전 — layout.js M.LAYOUT.moai.flip)
//   원천 우선순위: 세션 고정 > 터치(포인터) > 방향키
//     세션 고정: 세션이 시작되면(진입 대기부터) 계열 표 FACING.session의 방향으로 고정 — 세션 동안 포인터·키 무시, 끝나면 풀림
//     터치(포인터): 누르는 순간과 누른 채 끄는 동안 — 마우스는 클릭·드래그, 터치는 대기·끌기 (마우스를 올려두기만 하면 아무 일 없음 — 이 프로젝트의 규칙). 떼면 마지막 위치 유지
//     방향키 ←/→: 다음 포인터 입력 전까지만 (포인터가 들어오면 늘 포인터 — 같은 순간이면 포인터가 이김)
//   기준선 = 메인 모아이 반전 축 (그림 상자 기준 pivot → 캔버스 x). 축 ± FACING.dead 안에서는 지금 방향 유지 (넘나들 때 깜빡임 방지)
//   캔버스 밖·입력 관문 잠금(녹음 중) 동안의 포인터는 따르지 않음. 방향이 실제로 바뀔 때만 다시 그림
//   M.lastPointer = 마지막 포인터 위치 { x, y } (캔버스 비 — 카메라 등도 쓸 자리) / M.facing = { side(), lock(방향|null), policy }
//   미니 모아이의 바라보는 방향은 따르지 않음 (field-actors.js — 자리 기준 규칙 그대로)
(function() {
  const M = window.Moai;

  // 세션 고정 방향 (계열 → 'right'|'left'): 오른쪽 = 초록 ~ 보라, 왼쪽 = 빨강 ~ 노랑 (발아 클릭 시점에 고정)
  const FACING = {
    dead: 0.03,
    session: { TAP: 'right', DOO: 'right', MIX: 'right', CPA: 'right', CPB: 'left', CPC: 'left', CPD: 'left' },
  };

  let locked = null;                 // 세션 고정 방향 (null = 풀림)
  let free = 'right';                // 포인터·키가 정한 방향 (마지막 입력)
  M.lastPointer = null;

  function axisX() { const L = M.LAYOUT.moai; return L.x + (L.pivot - 0.5) * L.w; }   // 반전 축 (캔버스 폭 비)
  function side() { return locked || free; }
  function apply() {
    const L = M.LAYOUT && M.LAYOUT.moai;
    if (!L) return;
    const flip = side() === 'left';  // 에셋은 오른쪽을 봄 → 왼쪽 = 반전
    if (L.flip === flip) return;
    L.flip = flip;
    if (M.spriteRedraw) M.spriteRedraw();
  }

  // 포인터 (누르는 순간 · 누른 채 끌기)
  function onPointer(e) {
    if (e.type === 'pointermove' && !e.buttons) return;   // 누르지 않은 이동(마우스 올려두기)은 무시
    const c = M.el && M.el.spriteCanvas;
    if (!c || (M.gate && M.gate.locked())) return;
    const box = M.el.spriteBox;                     // 캔버스 상자 위의 포인터만 (서랍 등 다른 UI 위는 제외)
    if (box && box.contains && e.target && e.target !== box && !box.contains(e.target)) return;
    const w = M.camera ? M.camera.toWorld(e.clientX, e.clientY) : null;   // 화면 → 월드 (카메라 역변환)
    const r = w ? null : c.getBoundingClientRect();
    const inside = w ? w.inside : null;
    const x = w ? w.x : (e.clientX - r.left) / r.width, y = w ? w.y : (e.clientY - r.top) / r.height;
    if (w ? !inside : (x < 0 || x > 1 || y < 0 || y > 1)) return;   // 캔버스 밖 (화면 기준)
    M.lastPointer = { x: x, y: y };
    const d = x - axisX();                          // 캔버스 폭 비끼리
    if (Math.abs(d) < FACING.dead) return;          // 축 근처 — 지금 방향 유지
    free = d < 0 ? 'left' : 'right';
    apply();
  }
  window.addEventListener('pointermove', onPointer, true);
  window.addEventListener('pointerdown', onPointer, true);

  // 방향키 (다음 포인터 입력 전까지)
  document.addEventListener('keydown', function(e) {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    free = e.code === 'ArrowLeft' ? 'left' : 'right';
    apply();
  });

  // 세션 고정
  document.addEventListener('moai:session', function(e) {
    const d = e.detail;
    locked = d.active ? (FACING.session[d.family] || null) : null;
    apply();
  });

  M.facing = {
    side: side,
    lock: function(s) { locked = s || null; apply(); },   // 시험·이후 사건용
    policy: FACING,
  };
})();
