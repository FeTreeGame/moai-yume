// 입력 관문 — 모든 원시 입력이 앱의 어떤 처리보다 먼저 지나는 한 곳 (window 캡처 단계, state.js 바로 뒤에 로드)
//   잠금: 이유가 하나라도 있으면 허용 요소 밖의 입력을 막는다 — 전파 중단 + 기본 동작 취소 (슬라이더 끌기·스크롤 포함)
//     M.gate.lock(이유, { allow: function(target) → true면 통과 (포인터 계열만 — 키는 늘 막음), onBlocked: function(e) })
//     M.gate.unlock(이유) / M.gate.locked(). 이유가 여럿이면 모두 풀려야 열린다
//   막는 것 = 누름·동작 (pointerdown·mousedown·touchstart·touchmove·touchend·click·dblclick·contextmenu·wheel·keydown)
//   통과 = 뗌 (pointerup·mouseup·touchcancel·keyup) — 잠그기 전부터 누르던 것이 끼지 않게 (각 처리기가 자기 상태로 가드)
//   잠그는 순간 눌려 있던 입력을 무음으로 놓는다 (M.releaseAllInput — input.js): 다른 손가락의 홀드 소리가 섞이지 않게
//   구조 로드맵 I-1 (docs/STRUCTURE-ROADMAP.md) — 행동 표·입력 시각은 I-2·I-3에서 이 관문 위에
(function() {
  var M = window.Moai;
  var BLOCK = ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick', 'contextmenu', 'wheel', 'keydown'];
  var NOTIFY = { pointerdown: true, keydown: true };   // 막힌 입력 안내는 동작 하나에 한 번 (터치·마우스 모두 pointerdown이 먼저 온다)
  var locks = {};   // 이유 → { allow, onBlocked } (등록 순서 유지)

  function reasons() { return Object.keys(locks); }

  function guard(e) {
    var rs = reasons();
    if (!rs.length) return;
    var isKey = e.type.indexOf('key') === 0;
    // 모든 이유가 허용해야 통과 (키는 허용 대상이 아님)
    var pass = !isKey && rs.every(function(r) { return locks[r].allow && locks[r].allow(e.target); });
    if (pass) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    if (NOTIFY[e.type] && !e.repeat) rs.forEach(function(r) { if (locks[r].onBlocked) locks[r].onBlocked(e); });
  }
  BLOCK.forEach(function(t) { window.addEventListener(t, guard, { capture: true, passive: false }); });

  M.gate = {
    lock: function(reason, opts) {
      var first = !reasons().length;
      locks[reason] = { allow: opts && opts.allow, onBlocked: opts && opts.onBlocked };
      if (first && M.releaseAllInput) M.releaseAllInput();
    },
    unlock: function(reason) { delete locks[reason]; },
    locked: function() { return reasons().length > 0; },
  };
})();
