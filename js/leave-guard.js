// 이탈 방어 — 진행이 저장되지 않으므로(새로 열면 처음부터) 실수로 페이지를 떠나는 것을 브라우저가 지원하는 만큼 막는다
//   이 콘텐츠는 웹 페이지가 아니라 앱처럼 쓴다 (한 화면에 머무름 — 새로고침·뒤로 가기는 쓸 일이 없는 조작)
//   장치 셋 (GUARD에서 하나씩 끌 수 있음):
//     unload = 떠나기 전 확인창 (새로고침 · 탭 닫기 · 주소 이동) — 문구는 브라우저가 정함. 페이지를 한 번도 누르지 않았으면 브라우저가 띄우지 않는다
//     pull   = 화면을 당겨 새로고침 끄기 (style.css html.no-pull-refresh — 안드로이드 크롬)
//     back   = 뒤로 가기 가로채기 — 첫 조작 때 기록을 하나 쌓아 두고, 뒤로 가면 다시 쌓아 이 화면에 머무름
//               (조작 없이 쌓은 기록은 브라우저가 건너뛰므로 첫 조작을 기다림. 연달아 빠르게 누르면 통과될 수 있음)
//   막지 못하는 것: 아이폰 사파리의 새로고침(확인창 미지원), 다른 앱에 다녀온 사이 브라우저가 탭을 내린 경우, 확인창에서 나가기를 고른 경우
//   켜고 끄기 = 한 곳: M.leaveGuard.set(true|false) (셋을 한꺼번에). 처음 값 = GUARD.on — 개발 공간(?dev)이 아니면 켬
//     게임 진행과 무관 — 언제부터 잃을 것이 있는지 알 필요가 없다 (조작한 적 없으면 브라우저가 확인창을 띄우지 않음)
(function() {
  const M = window.Moai;
  const GUARD = { on: !M.dev, unload: true, pull: true, back: true };
  const MARK = { moaiLeaveGuard: true };   // 쌓아 둔 기록의 표시
  let active = false, armed = false;

  function onBeforeUnload(e) { e.preventDefault(); e.returnValue = ''; return ''; }
  function push() { try { history.pushState(MARK, ''); } catch (err) {} }
  function onPop() { if (active && GUARD.back) push(); }           // 뒤로 감 → 다시 쌓아 머무름
  function arm() {                                                // 첫 조작에 기록 하나
    if (armed || !active || !GUARD.back) return;
    armed = true;
    push();
  }
  function set(on) {
    on = !!on;
    if (on === active) return;
    active = on;
    const root = document.documentElement;
    if (on) {
      if (GUARD.unload) window.addEventListener('beforeunload', onBeforeUnload);
      if (GUARD.pull && root && root.classList) root.classList.add('no-pull-refresh');
      if (GUARD.back) {
        window.addEventListener('popstate', onPop);
        window.addEventListener('pointerdown', arm, true);
        window.addEventListener('keydown', arm, true);
      }
    } else {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (root && root.classList) root.classList.remove('no-pull-refresh');
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', arm, true);
      armed = false;                                              // 쌓아 둔 기록은 그대로 둔다 (뒤로 한 번이면 지나감)
    }
  }

  M.leaveGuard = { set: set, active: function() { return active; }, policy: GUARD };
  if (GUARD.on) set(true);
})();
