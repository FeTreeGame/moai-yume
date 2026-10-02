// 모아이 애니메이터 — 동작(대기·떽·뚜 시작·엉) → 프레임 시퀀스. 경과 시간으로 지금 프레임을 정한다 (메인 모아이·미니 모아이 공용)
//   M.MOAI_SEQ: 동작 → { frames: 프레임 이름들, ms: 앞 프레임들의 지속(ms) } — 마지막 프레임은 다음 동작까지 유지
//     (원래 sprite.js의 setTimeout 시퀀스와 같은 값: 떽 tap-1 → tap-4 → idle / 뚜 hold-1 → hold-2 → hold-3 유지 / 엉 hold-4 → hold-5 → idle)
//   M.moaiAnimator(seqs) → { play(동작, t), frame(t), busy(t), action() } — t = 초 (프레임 루프·performance.now 기준)
//     시퀀스 표는 모습 쪽 것 — 이후 전용 에셋은 자기 표(장수·시간이 달라도)를 넘기면 된다
//   M.MOAI_FRAMES: 모아이 에셋 프레임 이름들 (assets/<이름>.png)
(function() {
  const M = window.Moai;

  M.MOAI_FRAMES = ['idle', 'hold-1', 'hold-2', 'hold-3', 'hold-4', 'hold-5', 'tap-1', 'tap-2', 'tap-3', 'tap-4'];
  M.MOAI_SEQ = {
    idle:    { frames: ['idle'], ms: [] },
    tap:     { frames: ['tap-1', 'tap-2', 'tap-3', 'tap-4', 'idle'], ms: [50, 50, 50, 60] },
    hold:    { frames: ['hold-1', 'hold-2', 'hold-3'], ms: [60, 80] },
    release: { frames: ['hold-4', 'hold-5', 'idle'], ms: [60, 100] },
  };

  M.moaiAnimator = function(seqs) {
    seqs = seqs || M.MOAI_SEQ;
    let name = 'idle', seq = seqs.idle, t0 = 0;
    function index(t) {                  // 지금 보일 프레임 번호
      let e = (t - t0) * 1000, i = 0;
      while (i < seq.ms.length && e >= seq.ms[i]) { e -= seq.ms[i]; i++; }
      return Math.min(i, seq.frames.length - 1);
    }
    return {
      play: function(action, t) { name = seqs[action] ? action : 'idle'; seq = seqs[name]; t0 = t; },
      frame: function(t) { return seq.frames[index(t)]; },
      busy: function(t) { return index(t) < seq.frames.length - 1; },   // 아직 넘어갈 프레임이 있는가 (프레임 루프 유지)
      action: function() { return name; },
    };
  };
})();
