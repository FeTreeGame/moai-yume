// ================================================
// rhythm/voices.js — 박자 출력용 합성 (시각 지정 예약)
//   NPC 목소리: 칩튠 떽 / 뚜~(루프) / 엉 — 출처: reference/ra/note.js (playPahSfx·startDooSfx·stopDooSfx·playWopSfx)
// 출력 버스: NPC = G.noteSfxOut (audio.js → 믹서 채널). 목소리는 마지막 인자로 다른 출력을 받을 수 있음 (필드 안내 목소리 — 작게)
// ================================================
(function() {
  var G = window.G;

  // ── NPC 목소리 ──
  function pah(t, to) {
    var c = G.actx, out = to || G.noteSfxOut;
    var o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'square';
    o1.frequency.setValueAtTime(880, t);
    o1.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    g1.gain.setValueAtTime(0.25, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o1.connect(g1).connect(out);
    o1.start(t); o1.stop(t + 0.09);

    var o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(220, t);
    o2.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o2.connect(g2).connect(out);
    o2.start(t); o2.stop(t + 0.13);

    var len = c.sampleRate * 0.02;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var ns = c.createBufferSource(), ng = c.createGain();
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1;
    ns.buffer = buf;
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    ns.connect(bp).connect(ng).connect(out);
    ns.start(t); ns.stop(t + 0.04);
  }

  // 뚜~ 시작 — 핸들 반환 (dooStop으로 정지)
  function dooStart(t, to) {
    var c = G.actx, out = to || G.noteSfxOut;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.04);
    o.connect(g).connect(out);
    o.start(t);

    var o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(220, t);
    g2.gain.setValueAtTime(0.001, t);
    g2.gain.linearRampToValueAtTime(0.12, t + 0.06);
    o2.connect(g2).connect(out);
    o2.start(t);
    return { osc: o, gain: g, osc2: o2, gain2: g2 };
  }

  // 뚜~ 정지 (t: 예약 시각, 원본 stopDooSfx의 미래 시점 경로)
  function dooStop(h, t, fade) {
    if (!h) return;
    var f = fade || 0.02;
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setValueAtTime(0.22, t);
    h.gain.gain.linearRampToValueAtTime(0.001, t + f);
    try { h.osc.stop(t + f + 0.01); } catch (e) {}
    h.gain2.gain.cancelScheduledValues(t);
    h.gain2.gain.setValueAtTime(0.12, t);
    h.gain2.gain.linearRampToValueAtTime(0.001, t + f);
    try { h.osc2.stop(t + f + 0.01); } catch (e) {}
  }

  function wop(t, to) {
    var c = G.actx, out = to || G.noteSfxOut;
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.14);

    var o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(220, t);
    o2.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    g2.gain.setValueAtTime(0.14, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o2.connect(g2).connect(out);
    o2.start(t); o2.stop(t + 0.16);
  }

  G.voices = {
    pah: pah, dooStart: dooStart, dooStop: dooStop, wop: wop
  };
})();
