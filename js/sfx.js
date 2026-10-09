// 칩튠 효과음 — 이름 붙인 소리 표 (그릇: 이름은 연출 연결표 js/fx-rules.js가 부르고, 소리 모양은 여기 SFX에서만 바꾼다). 명세 docs/index/fx.md
//   출력 = 믹서 채널 'sfx' (효과음 — 음량·음색 보정은 설정 탭·?soundtune). 오디오 시계 예약: M.sfx.play(이름, { at, step, dur })
//   이어지는 소리(떨어지는 휘파람·솟는 우르릉·돌 가는 소리)는 핸들을 돌려준다: { stop(at), set(값) }
//   이후 녹음·에셋 소리로 바꿀 자리: 같은 이름에 다른 재생 함수를 넣으면 됨 (부르는 쪽은 그대로)
(function() {
  const M = window.Moai;
  const GAIN = 0.9;                       // 효과음 전체 (채널 음량 전 — 아직 측정 전 임시값)
  let out = null;
  function ctx() { return M.ensureCtx(); }
  function bus() {
    const c = ctx();
    if (!out || out.context !== c) { out = c.createGain(); out.gain.value = GAIN; out.connect(M.mixer ? M.mixer.bus('sfx') : c.destination); }
    return out;
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 음 하나: type, f0 → f1 (지수 미끄럼), 길이, 크기, 어택
  function tone(t, o) {
    const c = ctx(), osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(o.to || bus());
    osc.start(t); osc.stop(t + o.dur + 0.02);
    return { osc: osc, g: g };
  }
  let noiseBuf = null;
  function noise(t, o) {
    const c = ctx();
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0 || 2000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    if (!o.hold) g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(bus());
    src.start(t);
    if (!o.hold) src.stop(t + o.dur + 0.02);
    return { src: src, f: f, g: g };
  }
  function arp(t, notes, o) {            // [[midi, 길이]…] 차례로
    let x = t;
    notes.forEach(function(n) { tone(x, { type: o.type, f0: hz(n[0]), dur: n[1] * (o.ring || 1.4), gain: o.gain, attack: 0.003 }); x += n[1]; });
  }
  function fadeStop(h, t, sec) {
    const g = h.g.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.exponentialRampToValueAtTime(0.0001, t + (sec || 0.08));
    (h.src || h.osc).stop(t + (sec || 0.08) + 0.02);
  }
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];   // 게이지 눈금 음계 (장음계)

  // ── 소리 표 (이름 → 재생) — 바꿀 곳은 여기 ──
  const SFX = {
    gaugeUp:     function(t, o) { tone(t, { type: 'square', f0: hz(79 + SCALE[Math.min(8, o.step || 0)]), dur: 0.06, gain: 0.07 }); },
    gaugeDown:   function(t, o) { tone(t, { type: 'triangle', f0: hz(74 + SCALE[Math.min(8, o.step || 0)]), f1: hz(70 + SCALE[Math.min(8, o.step || 0)]), dur: 0.07, gain: 0.06 }); },
    barAppear:   function(t) { tone(t, { type: 'square', f0: 300, f1: 1200, dur: 0.3, gain: 0.07, attack: 0.02 }); arp(t + 0.26, [[88, 0.05], [91, 0.05], [96, 0.12]], { type: 'triangle', gain: 0.1 }); },
    missionClear: function(t) { arp(t, [[72, 0.07], [76, 0.07], [79, 0.07], [84, 0.22]], { type: 'square', gain: 0.08 }); },
    ready:       function(t) { arp(t, [[79, 0.08], [84, 0.14]], { type: 'triangle', gain: 0.12 }); },
    tapHit:      function(t) { tone(t, { type: 'square', f0: 1400, f1: 2100, dur: 0.05, gain: 0.07 }); },
    pop:         function(t) { noise(t, { f0: 2500, q: 0.8, dur: 0.07, gain: 0.25 }); tone(t, { type: 'square', f0: 1800, f1: 900, dur: 0.06, gain: 0.06 }); },
    fall:        function(t, o) { const h = tone(t, { type: 'triangle', f0: 1400, f1: 300, dur: (o && o.dur) || 0.9, gain: 0.07, attack: 0.03 }); return { stop: function(at) { fadeStop(h, at, 0.04); } }; },
    land:        function(t) { tone(t, { type: 'triangle', f0: 160, f1: 55, dur: 0.18, gain: 0.3 }); noise(t, { filter: 'lowpass', f0: 600, dur: 0.12, gain: 0.18 }); },
    rise:        function(t, o) {
      const d = (o && o.dur) || 1.2, n = noise(t, { filter: 'lowpass', f0: 180, f1: 420, q: 0.7, dur: d, gain: 0.16, attack: 0.15 });
      const h = tone(t, { type: 'triangle', f0: 70, f1: 140, dur: d, gain: 0.08, attack: 0.15 });
      return { stop: function(at) { fadeStop(n, at, 0.15); fadeStop(h, at, 0.15); } };
    },
    risen:       function(t) { arp(t, [[88, 0.06], [93, 0.16]], { type: 'triangle', gain: 0.1 }); },
    reward:      function(t) { arp(t, [[96, 0.04], [100, 0.04], [103, 0.04], [108, 0.12]], { type: 'triangle', gain: 0.07 }); },
    // 음표 하나의 판정 (연출 연결표 JUDGE) — 찰지게: 소리마다 세 겹 (때리는 순간의 딱 + 몸통 + 꼬리). 짧게 끊어 목소리(떽 · 뚜~)를 덮지 않는다
    //   맞힘: 딱(높은 잡음) + 톡(낮게 떨어지는 몸통) + 반짝(두 음의 종소리 — ACE는 한 옥타브 위 음이 하나 더 붙어 더 밝다). o.grade = 'ace' | 'good'
    noteHit:     function(t, o) {
      const ace = !o || o.grade !== 'good';
      noise(t, { filter: 'highpass', f0: 4500, q: 0.7, dur: 0.03, gain: 0.2, attack: 0.001 });
      tone(t, { type: 'sine', f0: 260, f1: 120, dur: 0.07, gain: 0.2, attack: 0.002 });
      arp(t, ace ? [[91, 0.035], [96, 0.035], [103, 0.11]] : [[88, 0.04], [93, 0.1]], { type: 'triangle', gain: 0.13, ring: 1.6 });
    },
    //   놓침: 툭(낮은 잡음) + 뿌—(거친 두 음이 살짝 어긋나 떨며 내려간다 — 틀렸다는 버저)
    noteMiss:    function(t) {
      noise(t, { filter: 'lowpass', f0: 600, q: 0.8, dur: 0.1, gain: 0.5, attack: 0.002 });
      tone(t, { type: 'sawtooth', f0: 196, f1: 104, dur: 0.24, gain: 0.24, attack: 0.004 });
      tone(t, { type: 'square', f0: 185, f1: 98, dur: 0.24, gain: 0.12, attack: 0.004 });
    },
    //   헛침: 휙(위에서 아래로 훑는 바람) + 톡(힘없이 떨어지는 작은 음)
    noteWhiff:   function(t) {
      noise(t, { f0: 3200, f1: 500, q: 2, dur: 0.14, gain: 0.7, attack: 0.01 });
      tone(t, { type: 'triangle', f0: 620, f1: 300, dur: 0.07, gain: 0.14 });
    },
    stepClear:   function(t) { arp(t, [[84, 0.07], [88, 0.16]], { type: 'square', gain: 0.08 }); },
    stepMiss:    function(t) { tone(t, { type: 'square', f0: 233, f1: 110, dur: 0.28, gain: 0.08 }); tone(t, { type: 'square', f0: 220, f1: 104, dur: 0.28, gain: 0.05 }); },
    complete:    function(t) { arp(t, [[72, 0.06], [76, 0.06], [79, 0.06], [84, 0.06], [88, 0.06], [91, 0.06], [96, 0.4]], { type: 'square', gain: 0.08 }); },
    out:         function(t) { arp(t, [[67, 0.18], [64, 0.18], [60, 0.45]], { type: 'triangle', gain: 0.13, ring: 1.1 }); },
    whooshIn:    function(t) { noise(t, { f0: 400, f1: 3200, q: 1.2, dur: 0.35, gain: 0.1, attack: 0.12 }); },
    whooshOut:   function(t) { noise(t, { f0: 3200, f1: 400, q: 1.2, dur: 0.35, gain: 0.1, attack: 0.05 }); },
    grind:       function(t, o) {         // 돌 가는 소리 (모아이 높이 이동) — set(높이 0~1)로 음높이
      const n = noise(t, { f0: 300 + 500 * ((o && o.height) || 0), q: 3, dur: 1, gain: 0.07, attack: 0.04, hold: true });
      return { set: function(h) { n.f.frequency.setTargetAtTime(300 + 500 * h, ctx().currentTime, 0.03); }, stop: function(at) { fadeStop(n, at, 0.06); tone(at, { type: 'square', f0: 260, f1: 180, dur: 0.04, gain: 0.08 }); } };
    },
  };

  M.sfx = {
    play: function(name, o) {
      const f = SFX[name];
      if (!f || M.audioHold) return null;   // 일시 정지 중에는 울리지 않는다 (쌓였다가 돌아올 때 한꺼번에 나오지 않게)
      const c = ctx(), t = o && o.at != null ? Math.max(o.at, c.currentTime) : c.currentTime + 0.005;
      return f(t, o || {}) || null;
    },
    table: SFX,          // 소리 표 (바꾸기·시험용)
    hz: hz,
  };
})();
