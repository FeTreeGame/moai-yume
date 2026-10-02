// 목소리 효과 체인 — 몸별 목소리 프로필(js/possess.js VOICE)을 Web Audio 노드로 잇는다 (소리마다 하나, 소리와 함께 켜고 끔)
//   M.voiceFx(ctx, 프로필, 소스) → { input, output, stop(꼬리 초) } | null (효과 없음). 원본 재생 속도(반음)는 재생 쪽(original.js)이 맡는다
//   순서: 음색(밴드패스·저음 쉘프) → 찌그러짐 → 링 모듈레이션 → 짧은 되먹임(금속성) → 코러스 → 메아리 → 음량 보정(trim)
//   프로필 항목 (있는 것만):
//     vibrato { hz, cents }            — 소스의 detune을 흔듦 (떨림)
//     band { freq, q }                 — 밴드패스 (무전기)
//     lowshelf { freq, db }            — 저음 두께
//     drive (0~1)                      — tanh 찌그러짐 세기
//     ring { hz, mix }                 — 사인파와 곱함 (기계음), mix = 젖은 소리 비율
//     comb { ms, fb }                  — 짧은 되먹임 지연 (금속성 울림)
//     chorus { ms: [ms…], depth(ms), hz, mix } — 지연을 천천히 흔든 사본들 (여럿이 같이)
//     echo { beats, fb, mix }          — 박에 맞춘 메아리 (필드 템포 — bgm.js M.fieldBgm.tempo, 없으면 100 BPM)
//     trim (dB)                        — 효과 뒤 음량 보정 (프리셋마다 렌더해 맞춘 값)
//   목록·느낌: docs/VOICE-PROCESSING-RESEARCH.md §5
(function() {
  const M = window.Moai;

  function driveCurve(amount) {
    const k = 1 + amount * 12, n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
    return c;
  }
  function beatSec() {
    const bpm = M.fieldBgm && M.fieldBgm.tempo ? M.fieldBgm.tempo() : 100;
    return 60 / (bpm || 100);
  }

  M.voiceFx = function(ctx, p, src) {
    if (!p) return null;
    const keys = ['vibrato', 'band', 'lowshelf', 'drive', 'ring', 'comb', 'chorus', 'echo', 'trim'];
    if (!keys.some(function(k) { return p[k] !== undefined; })) return null;
    const oscs = [], nodes = [];
    function node(n) { nodes.push(n); return n; }
    function osc(hz) { const o = ctx.createOscillator(); o.frequency.value = hz; oscs.push(o); return o; }
    // 원음(dry)과 젖은 소리(wet)를 mix 비율로 섞는 한 단계
    function mixStage(inp, wetFn, mix) {
      const out = node(ctx.createGain()), dry = node(ctx.createGain()), wet = node(ctx.createGain());
      dry.gain.value = 1 - mix; wet.gain.value = mix;
      inp.connect(dry); dry.connect(out);
      wetFn(inp).connect(wet); wet.connect(out);
      return out;
    }

    const input = node(ctx.createGain());
    let cur = input;

    if (p.vibrato && src && src.detune) {
      const o = osc(p.vibrato.hz), g = node(ctx.createGain());
      g.gain.value = p.vibrato.cents;
      o.connect(g); g.connect(src.detune);
    }
    if (p.band) {
      const f = node(ctx.createBiquadFilter());
      f.type = 'bandpass'; f.frequency.value = p.band.freq; f.Q.value = p.band.q;
      cur.connect(f); cur = f;
    }
    if (p.lowshelf) {
      const f = node(ctx.createBiquadFilter());
      f.type = 'lowshelf'; f.frequency.value = p.lowshelf.freq; f.gain.value = p.lowshelf.db;
      cur.connect(f); cur = f;
    }
    if (p.drive) {
      const w = node(ctx.createWaveShaper());
      w.curve = driveCurve(p.drive); w.oversample = '2x';
      cur.connect(w); cur = w;
    }
    if (p.ring) {
      cur = mixStage(cur, function(inp) {
        const m = node(ctx.createGain());
        m.gain.value = 0;                                  // 게인 = 사인파 → 소리 × 사인파
        osc(p.ring.hz).connect(m.gain);
        inp.connect(m);
        return m;
      }, p.ring.mix);
    }
    if (p.comb) {
      const sum = node(ctx.createGain()), d = node(ctx.createDelay(0.1)), fb = node(ctx.createGain());
      d.delayTime.value = p.comb.ms / 1000; fb.gain.value = p.comb.fb;
      cur.connect(sum); cur.connect(d); d.connect(fb); fb.connect(d); d.connect(sum);
      cur = sum;
    }
    if (p.chorus) {
      const c = p.chorus;
      cur = mixStage(cur, function(inp) {
        const out = node(ctx.createGain());
        out.gain.value = 1 / c.ms.length;
        c.ms.forEach(function(ms, i) {
          const d = node(ctx.createDelay(0.1)), lfo = osc(c.hz * (1 + i * 0.37)), depth = node(ctx.createGain());
          d.delayTime.value = ms / 1000; depth.gain.value = c.depth / 1000;
          lfo.connect(depth); depth.connect(d.delayTime);
          inp.connect(d); d.connect(out);
        });
        return out;
      }, c.mix);
    }
    if (p.echo) {
      const e = p.echo;
      cur = mixStage(cur, function(inp) {
        const d = node(ctx.createDelay(4)), fb = node(ctx.createGain());
        d.delayTime.value = Math.min(4, e.beats * beatSec()); fb.gain.value = e.fb;
        inp.connect(d); d.connect(fb); fb.connect(d);
        return d;
      }, e.mix);
    }
    const output = node(ctx.createGain());
    output.gain.value = Math.pow(10, (p.trim || 0) / 20);
    cur.connect(output);

    const t = ctx.currentTime;
    oscs.forEach(function(o) { o.start(t); });
    return {
      input: input,
      output: output,
      // 소리가 끝나면: 메아리 꼬리만큼 기다린 뒤 오실레이터를 멈추고 연결을 푼다
      stop: function(tail) {
        setTimeout(function() {
          oscs.forEach(function(o) { try { o.stop(); } catch (e) {} });
          nodes.forEach(function(n) { try { n.disconnect(); } catch (e) {} });
        }, (tail || 0) * 1000);
      },
      tail: p.echo ? Math.min(4, p.echo.beats * beatSec()) * 8 : (p.comb ? 0.3 : 0.05),
    };
  };
})();
