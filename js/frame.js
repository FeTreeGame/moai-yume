// 프레임 루프 — 움직이는 것이 있을 때만 rAF를 돌리고, 프레임마다 갱신 후 한 번 다시 그린다 (구조 로드맵 D-1 최소판)
//   M.frame.add(fn) / remove(fn): fn(t초, dt초) — false를 돌려주면 빠진다. 등록이 모두 빠지면 루프가 멈춘다
//   시계 = rAF 타임스탬프 (벽시계). 흐르는 시간용 — 첫 제스처 전(오디오 시계 정지)에도 돈다. 박에 맞춘 표시는 D-1 본판에서 Conductor 시각을 싣는다
//   dt는 0.05초로 자른다 (숨김 탭에서 돌아온 첫 프레임이 순간 이동하지 않게)
//   기존의 직접 그리기(모아이 시퀀스·높이 조정·로드)는 그대로 — 나중에 여기로 옮길 후보
(function() {
  var M = window.Moai;
  var tasks = [];
  var raf = null, last = null;

  function tick(ms) {
    var t = ms / 1000;
    var dt = last === null ? 0 : Math.min(0.05, t - last);
    last = t;
    tasks.slice().forEach(function(fn) { if (fn(t, dt) === false) remove(fn); });
    if (M.spriteRedraw) M.spriteRedraw();
    if (tasks.length) raf = requestAnimationFrame(tick);
    else { raf = null; last = null; }
  }
  function remove(fn) { tasks = tasks.filter(function(f) { return f !== fn; }); }

  M.frame = {
    add: function(fn) {
      if (tasks.indexOf(fn) < 0) tasks.push(fn);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    remove: remove,
    running: function() { return raf !== null; },
  };
})();
