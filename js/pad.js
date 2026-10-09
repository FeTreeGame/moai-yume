// 조작 버튼: 분리 버튼 둘(떽! · 뚜~웡)은 드로어가 아니라 화면 위(#padOverlay)에 산다. 처음부터 보이고, 숨기기 · 보이기 = #padToggle (드로어 버튼 ☰와 좌우 대칭 자리 · 같은 크기)
//   (조작 탭은 없앴다 — 단일 입력은 캔버스 자체와 키 C, 분리 입력은 이 버튼 둘과 키 Z · X: js/input.js)
//   화면 배치(캔버스 크기 · 자리)는 바꾸지 않는다 — 위에 겹쳐 뜰 뿐. 자리 · 크기는 style.css (:root --pad-*)
//   층: 캔버스보다 위, 드로어보다 아래 — 드로어가 열리면 드로어가 덮는다 (비켜 서지 않는다. 드로어는 플레이 중에 여는 것이 아니다)
//   보이는 조건 = PAD.when (지금은 언제나 — 가로 · 세로 모두). 조건을 벗어나면 끈다
//   화면 배치 소식 = 'moai:layout' { landscape, drawerOpen } (js/main.js calcLayout)
// 나가기(#sessionExit)도 이 틀(#padOverlay) 안에 산다 — 떽! 위. 보이는 때(세션 중)와 누름(길게)은 js/rhythm/session.js가 맡고, 조작 버튼을 숨기면 같이 숨는다
(function() {
  var M = window.Moai;
  var toggle = document.getElementById('padToggle');
  var overlay = document.getElementById('padOverlay');
  if (!toggle || !overlay) return;
  // 보일 수 있는 조건 (한 곳) — layout = 'moai:layout'의 내용
  var PAD = { when: function(layout) { return true; } };

  var on = false, allowed = false, want = true;   // want = 사람이 고른 것 (처음 = 보이기 — 켜진 것을 끄는 쪽이 낫다). 조건(allowed)이 풀리면 이 값으로 돌아간다
  function set(v) {
    v = !!v && allowed;
    if (on && !v && M.releaseAllInput) M.releaseAllInput();   // 누른 채 숨겨지는 일이 없게 (눌려 있던 입력은 소리 없이 놓는다)
    on = v;
    overlay.classList.toggle('hidden', !on);
    toggle.classList.toggle('active', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  document.addEventListener('moai:layout', function(e) {
    allowed = PAD.when(e.detail || {});
    toggle.classList.toggle('hidden', !allowed);
    if (!allowed && on) set(false);
    else if (allowed && want && !on) set(true);
  });

  var touched = false;
  toggle.addEventListener('touchend', function(e) { e.preventDefault(); touched = true; want = !on; set(want); }, { passive: false });
  toggle.addEventListener('click', function() { if (touched) { touched = false; return; } want = !on; set(want); });

  M.pad = { set: function(v) { want = !!v; set(want); }, isOn: function() { return on; } };
  set(false);
})();
