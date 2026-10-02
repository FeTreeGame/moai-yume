// ================================================
// rhythm/bridge.js — index 입력·표시 ↔ 리듬(판정·세션) 연결
// 로드 순서: main.js → rhythm/(init·audio·judge·hud) → rhythm/bridge.js → rhythm/(conductor·voices·session)
//   - 입력: original.js 노트 입력 통지(M.onNoteInput) → G.recordNoteInput (세션 중에만)
//   - 단일 입력: 박자 기반 떽/엉 소리 분기 기준 (판정은 누름·뗌 그대로 — judge.js)
//   - 홀드 유지 판정: 플레이어 뚜~ 루프 재생 여부 (수동·AUTO 공통 — AUTO도 original.js 경로)
//   - 가이드 막대 오버레이 렌더 (M.renderBars)
//   - 디버그: N(AUTO) 대리조작 토글 (드로어 버튼과 1:1, 세션 밖에서도 토글·상태 유지)
// 명세: docs/INDEX-MVP-SPEC.md
// ================================================
(function() {
  var M = window.Moai;
  var G = window.G;

  var bars = document.getElementById('encBars');
  var barsCtx = bars ? bars.getContext('2d') : null;
  var autoBtn = document.getElementById('encAuto');

  // ── 입력 → 판정 ──
  //   판정할 패턴이 있을 때 = 리듬 코어(rhythm/core.js)에 쓰는 쪽(세션 — 이후 필드)이 붙어 있을 때
  //   붙은 쪽이 지금 판정하지 않으면(필드 — 패턴 없는 루프) 친 위치만 표시 (rhythm/core.js inputMode)
  function judging() { return !!(G.core && G.core.inputMode() === 'judge'); }
  M.onNoteInput = function(type, time) {
    if (M.sessionWaitInput && M.sessionWaitInput(type, time)) return;   // 진입 대기 중 — 표시·컨티뉴 (session.js)
    var mode = G.core ? G.core.inputMode() : null;
    if (mode === 'judge') { if (G.recordNoteInput) G.recordNoteInput(type, time); }
    else if (mode === 'mark') G.core.mark(type, time);
  };

  // AUTO 중 수동 누름 무시 (input.js)
  M.isAutoplay = function() { return !!M.sessionActive && G.noteAutoplay; };

  // ── 단일 입력 떽/엉 소리 분기 기준: min(기본 150ms, 1칸 × 2/3) ──
  // 소리만 가른다 (떽으로 들리려면 이 시간 안에 떼야 함 — 감수). 판정은 누름·뗌 그대로라 무관 (judge.js)
  // (100 BPM: 150ms → 100ms, 130 BPM: 115ms → 77ms). 판정할 패턴이 없을 때(자유 연주·진입 대기)는 기본값
  var TAP_RATIO = 2 / 3;
  M.getTapThreshold = function() {
    var base = M.tapThreshold / 1000;
    if (!judging()) return base;
    return Math.min(base, (G.BEAT_SEC / 4) * TAP_RATIO);
  };

  // ── 홀드 유지 판정: 플레이어 뚜~ 루프 재생 중 (수동·AUTO 공통) ──
  // 원본 judge.js는 대리조작 전용 상태(원본 note.js playerHolding)를 요구해 수동 홀드는 항상 holdMiss였음
  G.getPlayerHolding = function() {
    return !!(M.originalIsHolding && M.originalIsHolding());
  };

  // ── 판정 팝업 자리 (judge.js가 호출 — 현재 별도 표시 없음, 판정 수는 세션 HUD) ──
  G.showJudge = function() {};

  // ── 가이드 막대: 오버레이 캔버스에 1280×960 논리 좌표로 렌더 (원본: render.js DPR 변환) ──
  M.renderBars = function(show, alpha) {   // alpha = 막대 전체 불투명도 (생략 = 1 — 필드 루프 막대가 게이지 바를 따를 때)
    if (!barsCtx) return;
    var dpr = window.devicePixelRatio || 1;
    var w = bars.clientWidth, h = bars.clientHeight;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (bars.width !== pw || bars.height !== ph) { bars.width = pw; bars.height = ph; }
    barsCtx.setTransform(1, 0, 0, 1, 0, 0);
    barsCtx.clearRect(0, 0, pw, ph);
    if (!show) return;
    var s = (w / G.W) * dpr; // 4:3 동일 비율 → 균일 축소
    barsCtx.setTransform(s, 0, 0, s, 0, 0);
    barsCtx.globalAlpha = alpha != null ? alpha : 1;
    G.renderGuideBars(barsCtx);
    if (G.renderReveal) G.renderReveal(barsCtx);   // 패턴 드러내기 (막대 위 — rhythm/reveal.js)
    barsCtx.globalAlpha = 1;
  };

  // ── AUTO (대리조작) 토글 ──
  function toggleAuto() {
    G.noteAutoplay = !G.noteAutoplay;
    // 해제 시 세션 대리조작이 잡고 있던 홀드 정리
    if (!G.noteAutoplay && M.sessionAutoRelease) M.sessionAutoRelease();
    if (autoBtn) autoBtn.textContent = 'AUTO: ' + (G.noteAutoplay ? 'ON' : 'OFF') + ' (N)';
  }

  if (autoBtn) {
    var autoTouched = false;
    autoBtn.addEventListener('touchend', function(e) {
      e.preventDefault();
      autoTouched = true;
      toggleAuto();
    }, { passive: false });
    autoBtn.addEventListener('click', function() {
      if (autoTouched) { autoTouched = false; return; }
      toggleAuto();
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.repeat) return;
    if (e.code === 'KeyN') { e.preventDefault(); toggleAuto(); }
  });
})();
