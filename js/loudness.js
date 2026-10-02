// 라우드니스 측정 (오프라인, 버퍼 단위) — 목소리 음량 맞춤용 (js/original.js)
// 조사·근거: docs/AUDIO-LOUDNESS-RESEARCH.md. ffmpeg ebur128과 대조 검증 (순간 최대·통합·트루 피크 ±0.05)
//   measure(data, sr): ITU-R BS.1770 K-가중 → 순간 최대(400ms 창, 100ms 간격) · 통합(절대 -70 / 상대 -10 게이팅)
//                      + 샘플 피크 · 트루 피크(4배 오버샘플링). 모노 또는 채널 배열
//   measureBuffer(audioBuffer): 출력에서 들리는 대로 (모노 = 양쪽 스피커)
(function() {
  const M = window.Moai;

  // ── K-가중 필터 계수 (BS.1770, 샘플레이트별 계산 — libebur128 방식) ──
  function kWeightCoeffs(sr) {
    // 1단: 고역 셸프 (+4 dB, 약 1.7 kHz)
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const shelf = {
      b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
      a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0],
    };
    // 2단: 고역 통과 (약 38 Hz, RLB)
    f0 = 38.13547087602444; Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / sr);
    a0 = 1 + K / Q + K * K;
    const hp = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    return [shelf, hp];
  }
  function biquad(x, c) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = c.b[0] * x[i] + c.b[1] * x1 + c.b[2] * x2 - c.a[0] * y1 - c.a[1] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  const lk = function(ms) { return -0.691 + 10 * Math.log10(ms); };

  // ── 트루 피크: 4배 오버샘플링 (창 함수 적용 sinc 보간, 탭 32) ──
  function truePeak(x) {
    const UP = 4, HALF = 16;
    let peak = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
    const taps = [];
    for (let p = 1; p < UP; p++) {
      const t = [];
      for (let k = -HALF + 1; k <= HALF; k++) {
        const d = k - p / UP, s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
        const w = 0.5 + 0.5 * Math.cos(Math.PI * d / HALF);   // Hann
        t.push(s * w);
      }
      taps.push(t);
    }
    for (let i = 0; i < x.length; i++) {
      for (let p = 0; p < UP - 1; p++) {
        const t = taps[p];
        let v = 0;
        for (let k = 0; k < t.length; k++) {
          const j = i + k - HALF + 1;
          if (j >= 0 && j < x.length) v += x[j] * t[k];
        }
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
    }
    return peak;
  }

  function db(v) { return v > 0 ? 20 * Math.log10(v) : -Infinity; }

  // ── 측정 ──
  //   data: Float32Array(모노) 또는 채널 배열 — 채널별 K-가중 전력을 합산 (BS.1770, L·R 가중 1)
  //   반환: { momentaryMax, integrated (LUFS), samplePeak, truePeak (dBFS / dBTP) }
  //   짧은 소리도 순간 창을 채우도록 끝에 400ms 무음을 덧댄다 (순간 최대용 — 통합값은 원래 길이 안에서만)
  function measure(data, sr) {
    const chans = Array.isArray(data) ? data : [data];
    const pad = Math.round(sr * 0.4);
    const c = kWeightCoeffs(sr);
    const hop = Math.round(sr * 0.1), nHop = Math.floor((chans[0].length + pad) / hop);
    // 100ms 단위 제곱합 (채널 합산) → 400ms 창 = 연속 4칸
    const sub = new Float64Array(nHop);
    chans.forEach(function(ch) {
      const x = new Float32Array(ch.length + pad);
      x.set(ch);
      const y = biquad(biquad(x, c[0]), c[1]);
      for (let h = 0; h < nHop; h++) {
        let s = 0;
        for (let i = h * hop; i < (h + 1) * hop; i++) s += y[i] * y[i];
        sub[h] += s;
      }
    });
    const blocks = [], inBlocks = [];
    const nIn = Math.floor(chans[0].length / hop);   // 덧댄 무음을 포함하지 않는 구간 수 (통합값용)
    for (let h = 0; h + 4 <= nHop; h++) {
      const ms = (sub[h] + sub[h + 1] + sub[h + 2] + sub[h + 3]) / (4 * hop);
      blocks.push(ms);
      if (h + 4 <= nIn) inBlocks.push(ms);
    }
    let mMax = -Infinity;
    blocks.forEach(function(ms) { if (ms > 0) mMax = Math.max(mMax, lk(ms)); });
    // 통합: 원래 길이 안의 블록만 (덧댄 무음 제외) · 절대 게이트 -70 → 상대 게이트 (평균 −10 LU)
    const abs = inBlocks.filter(function(ms) { return ms > 0 && lk(ms) > -70; });
    let integrated = -Infinity;
    if (abs.length) {
      const mean1 = abs.reduce(function(a, b) { return a + b; }, 0) / abs.length;
      const rel = abs.filter(function(ms) { return lk(ms) > lk(mean1) - 10; });
      if (rel.length) integrated = lk(rel.reduce(function(a, b) { return a + b; }, 0) / rel.length);
    }
    let sp = 0, tp = 0;
    chans.forEach(function(ch) {
      for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > sp) sp = a; }
      tp = Math.max(tp, truePeak(ch));
    });
    return { momentaryMax: mMax, integrated: integrated, samplePeak: db(sp), truePeak: db(tp) };
  }

  // AudioBuffer를 출력에서 들리는 대로 측정 — 모노는 양쪽 스피커로 똑같이 나가므로 두 채널로 센다 (+3 dB)
  //   녹음본(모노)과 원본 음원(스테레오)을 같은 기준으로 비교하기 위함
  function measureBuffer(buf) {
    const chans = [];
    for (let i = 0; i < buf.numberOfChannels; i++) chans.push(buf.getChannelData(i));
    return measure(chans.length === 1 ? [chans[0], chans[0]] : chans, buf.sampleRate);
  }

  M.loudness = { measure: measure, measureBuffer: measureBuffer };
})();
