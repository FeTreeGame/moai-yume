// 볼륨 믹서: 채널 → 음색 보정 → 마스터 → 리미터 → 출력
// 음색 보정 (채널마다 — 칩튠 드럼이 찢어지게 들리는 등): 로우 셸프 → 미드 피크 → 하이 셸프 → 로우패스 → 컴프레서 → 출력 보정(dB)
//   값 = 데이터 파일 sound.tone[채널] (편집기 ?soundtune — 들으며 맞추고 저장). 없으면 평탄(보정 없음). bypass = 비교용으로 평탄
//   컴프레서 비율 1 = 꺼짐 — 노드를 거치지 않음 (지연 없음). (DynamicsCompressor는 자동 메이크업 게인이 있어 누를수록 커질 수 있음 — 출력 보정으로 맞춤)
// 채널 게인 = 슬라이더(사용자, 100% = 프리셋 목표) × 프리셋 보정(트림 = 기준 + 상대값 − 측정 LUFS)
//   측정: 헤드리스 Chrome에서 채널 출력 녹음 → ffmpeg ebur128 통합 라우드니스 (채널 100%, 2026-09-28)
//   프리셋: 플랫(기본, 모든 채널 = 목소리와 같은 크기) / 권장(차등1) / 목소리 강조(차등2) — 목소리 대비 상대값 + 마스터 게인
//   마스터 리미터: 넘칠 때만 누르는 안전장치 — AudioWorklet 룩어헤드 리미터(js/limiter-worklet.js, 트루 피크 -1 dBTP 이하, 5ms 지연)
//     모듈 로드 전에는 마스터 → 출력 직결, 준비되면 사이에 끼운다. DynamicsCompressorNode는 자동 메이크업 게인이 있어 쓰지 않음
// 설정 탭(#mixerPresets, #mixerRows)에서 프리셋·채널별 볼륨·음소거, localStorage 저장 (기기별)
// 믹서 밖: 녹음 카운트인 클릭(recorder.js)·지연 측정음(calib.js) — 녹음 도구 내부용, 볼륨이 측정에 영향 주지 않게
(function() {
  const M = window.Moai;
  const KEY = 'moai.mixer2';   // v2: 프리셋 도입 (이전 'moai.mixer'의 슬라이더 값은 트림과 겹치므로 쓰지 않음)
  const CHANNELS = [
    { id: 'master', name: '마스터' },
    { id: 'moai',   name: '모아이 목소리' },
    { id: 'npc',    name: 'NPC 목소리' },
    { id: 'metro',  name: '메트로놈' },
    { id: 'bgm',    name: 'BGM' },
    { id: 'sample', name: '샘플 재생' },
    { id: 'sfx',    name: '효과음' },   // 칩튠 효과음 (js/sfx.js — 아직 측정 전: 보정 0 dB, 소리마다 작게 합성)
  ];
  // 채널 100%일 때 측정 라우드니스 (LUFS). BGM은 곡별로 -20에 맞춘 뒤(js/bgm.js) 채널에 들어온다
  //   moai = 목소리 기준 — 소리마다 순간 최대 -14 LUFS로 맞춰 들어온다(js/original.js) → 보정 0 dB
  //   sample = 녹음본 미리듣기, 보정 0 dB
  const MEASURED = { npc: -17.1, metro: -24.3, bgm: -20 };
  // 기준(앵커) = 목소리: 음량 맞춤을 거친 모아이 목소리의 AUTO 연주 통합 라우드니스 (TAP1 -12.8 · MIX1 -13.2 · DOO1 -13.3 평균)
  const ANCHOR_LUFS = -13.1;
  // 프리셋 = 목소리 대비 채널별 상대값 (dB) + 마스터 게인 (dB, 대표 상황의 믹스 전체를 -16 LUFS로)
  //   대표 상황 = 핑퐁 세션 (NPC 발신 + 모아이 응답 + 메트로놈). 마스터 0일 때 측정 플랫 -13.2 · 권장 -14.3 · 목소리 강조 -15.1 LUFS
  const PRESETS = [
    { id: 'flat',  name: '플랫',        offset: { npc: 0,  metro: 0,   bgm: 0 },  master: -2.8 },
    { id: 'rec',   name: '권장',        offset: { npc: -1, metro: -8,  bgm: -4 }, master: -1.7 },
    { id: 'voice', name: '목소리 강조', offset: { npc: -3, metro: -11, bgm: -7 }, master: -0.9 },
  ];
  const DEFAULT_PRESET = 'flat';

  const state = {};            // id → { vol 0~1, mute }
  let preset = DEFAULT_PRESET;
  function presetOf(id) { for (let i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }
  function resetState() { CHANNELS.forEach(function(c) { state[c.id] = { vol: 1, mute: false }; }); preset = DEFAULT_PRESET; }
  resetState();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      Object.keys(saved.channels || {}).forEach(function(id) { if (state[id]) Object.assign(state[id], saved.channels[id]); });
      if (presetOf(saved.preset)) preset = saved.preset;
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ preset: preset, channels: state })); } catch (e) {} }
  // 프리셋 보정 (dB)
  //   칩튠 채널 = (기준 + 상대값) − 측정 / 목소리(moai)·샘플 = 0 (목소리가 기준) / 마스터 = 프리셋 마스터 게인
  function trimDb(id) {
    const p = presetOf(preset);
    if (id === 'master') return p.master || 0;
    if (MEASURED[id] === undefined) return 0;
    return ANCHOR_LUFS + (p.offset[id] || 0) - MEASURED[id];
  }

  // 게인 변경: 15ms 선형 램프 (지퍼 잡음 방지)
  //   setTargetAtTime은 쓰지 않는다 — Chrome은 노드가 소리를 처리하는 동안에만 목표 추종을 진행해서,
  //   조용할 때 바꾼 값이 다음 소리 첫머리에서야 옛 값부터 따라가며 새어 나온다 (음소거한 채널에서 떽 첫머리 0.34 검출)
  //   선형 램프는 시각의 함수라 노드가 쉬고 있어도 15ms 뒤에는 목표값이다
  M.rampGain = function(param, target) {
    const now = param.context ? param.context.currentTime : M.ensureCtx().currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + 0.015);
  };

  // ── 음색 보정 값 ──
  const TONE_FLAT = { low: { f: 150, g: 0 }, mid: { f: 1500, g: 0, q: 1 }, high: { f: 5000, g: 0 }, lp: 20000,
    comp: { th: 0, ratio: 1, attack: 0.003, release: 0.25 }, out: 0, bypass: false };
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  const tones = {};
  (function() {
    const d = window.MoaiData && window.MoaiData.sound && window.MoaiData.sound.tone;
    CHANNELS.forEach(function(c) {
      if (c.id === 'master') return;
      const t = copy(TONE_FLAT), v = d && d[c.id];
      if (v) Object.keys(t).forEach(function(k) { if (v[k] !== undefined) t[k] = typeof t[k] === 'object' ? Object.assign(t[k], v[k]) : v[k]; });
      tones[c.id] = t;
    });
  })();
  function applyTone(id) {
    const ch = chains && chains[id], t = tones[id];
    if (!ch || !t) return;
    const f = t.bypass ? TONE_FLAT : t, now = graphCtx.currentTime;
    function set(param, v) { param.cancelScheduledValues(now); param.setValueAtTime(v, now); }
    set(ch.low.frequency, f.low.f); set(ch.low.gain, f.low.g);
    set(ch.mid.frequency, f.mid.f); set(ch.mid.gain, f.mid.g); set(ch.mid.Q, f.mid.q);
    set(ch.high.frequency, f.high.f); set(ch.high.gain, f.high.g);
    set(ch.lp.frequency, Math.min(f.lp, graphCtx.sampleRate / 2 - 100));
    set(ch.comp.threshold, f.comp.th); set(ch.comp.ratio, Math.max(1, f.comp.ratio)); set(ch.comp.attack, f.comp.attack); set(ch.comp.release, f.comp.release);
    set(ch.out.gain, Math.pow(10, f.out / 20));
    // 컴프레서는 비율 1이면 거치지 않음 — 꺼져 있어도 노드가 미리 보기 지연(약 6ms)을 더해 연주 타이밍이 밀리므로
    const useComp = f.comp.ratio > 1;
    if (useComp !== ch.compOn) {
      ch.lp.disconnect();
      if (useComp) ch.lp.connect(ch.comp); else ch.lp.connect(ch.out);
      ch.compOn = useComp;
    }
  }

  // ── 오디오 그래프 (AudioContext가 생길 때 한 번 구성) ──
  let nodes = null, graphCtx = null, chains = null;
  function level(id) { return state[id].mute ? 0 : state[id].vol * Math.pow(10, trimDb(id) / 20); }
  function build() {
    const ctx = M.ensureCtx();
    if (nodes && graphCtx === ctx) return;
    graphCtx = ctx;
    nodes = { master: ctx.createGain() };
    nodes.master.connect(ctx.destination);
    attachLimiter(ctx);
    chains = {};
    CHANNELS.forEach(function(c) {
      if (c.id === 'master') return;
      nodes[c.id] = ctx.createGain();
      const ch = chains[c.id] = { low: ctx.createBiquadFilter(), mid: ctx.createBiquadFilter(), high: ctx.createBiquadFilter(), lp: ctx.createBiquadFilter(),
        comp: ctx.createDynamicsCompressor(), out: ctx.createGain() };
      ch.low.type = 'lowshelf'; ch.mid.type = 'peaking'; ch.high.type = 'highshelf'; ch.lp.type = 'lowpass'; ch.lp.Q.value = 0.707;
      ch.comp.knee.value = 6;
      nodes[c.id].connect(ch.low); ch.low.connect(ch.mid); ch.mid.connect(ch.high); ch.high.connect(ch.lp); ch.comp.connect(ch.out);
      ch.compOn = null;   // 로우패스 → (컴프레서) → 출력 연결은 applyTone이 정함
      ch.out.connect(nodes.master);
      applyTone(c.id);
    });
    CHANNELS.forEach(function(c) { nodes[c.id].gain.value = level(c.id); });
  }
  // 마스터 리미터 끼우기 (비동기 — 워크릿 모듈 로드 후). 실패하면 직결 유지
  function attachLimiter(ctx) {
    if (!ctx.audioWorklet) return;
    ctx.audioWorklet.addModule('js/limiter-worklet.js' + (window._v || '')).then(function() {
      if (graphCtx !== ctx) return;
      const lim = new AudioWorkletNode(ctx, 'moai-limiter', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
      });
      nodes.master.disconnect(ctx.destination);   // 출력 연결만 교체 (분석기·미터 등 다른 연결은 유지)
      nodes.master.connect(lim);
      lim.connect(ctx.destination);
      nodes.limiter = lim;
    }).catch(function(e) { console.warn('[mixer] 리미터 로드 실패 — 직결 유지', e); });
  }
  function apply(id) {
    if (!nodes) return;
    M.rampGain(nodes[id].gain, level(id));
  }

  M.mixer = {
    CHANNELS: CHANNELS,
    // 채널 입력 노드 — 소리를 여기에 연결한다
    bus: function(id) { build(); return nodes[id] || nodes.master; },
    get: function(id) { return state[id]; },
    set: function(id, vol, mute) {
      if (!state[id]) return;
      if (vol !== undefined && vol !== null) state[id].vol = Math.min(1, Math.max(0, vol));
      if (mute !== undefined && mute !== null) state[id].mute = !!mute;
      apply(id);
      save();
    },
    reset: function() {
      resetState();
      CHANNELS.forEach(function(c) { apply(c.id); });
      try { localStorage.removeItem(KEY); } catch (e) {}
    },
    PRESETS: PRESETS,
    getPreset: function() { return preset; },
    setPreset: function(id) {
      if (!presetOf(id)) return;
      preset = id;
      CHANNELS.forEach(function(c) { apply(c.id); });
      save();
    },
    trimDb: trimDb,
    // 음색 보정 (편집기 ?soundtune): tone(채널) = 지금 값(복사본), setTone(채널, 값) = 바로 적용, flat = 평탄 값
    tone: function(id) { return tones[id] ? copy(tones[id]) : null; },
    setTone: function(id, t) { if (!tones[id]) return; tones[id] = copy(t); applyTone(id); },
    toneFlat: function() { return copy(TONE_FLAT); },
    limiterReady: function() { return !!(nodes && nodes.limiter); },
  };

  // ── 설정 탭 UI ──
  const rows = document.getElementById('mixerRows');
  const presetBox = document.getElementById('mixerPresets');
  if (!rows) return;
  function renderPresets() {
    if (!presetBox) return;
    presetBox.innerHTML = PRESETS.map(function(p) {
      return '<button class="beat-pattern-btn' + (p.id === preset ? ' active' : '') + '" data-preset="' + p.id + '" tabindex="-1">' + p.name + '</button>';
    }).join('');
  }
  if (presetBox) {
    let pTouched = false;
    const pick = function(e) { const b = e.target.closest('[data-preset]'); if (b) { M.mixer.setPreset(b.getAttribute('data-preset')); renderPresets(); } };
    presetBox.addEventListener('touchend', function(e) { if (!e.target.closest('[data-preset]')) return; e.preventDefault(); pTouched = true; pick(e); }, { passive: false });
    presetBox.addEventListener('click', function(e) { if (pTouched) { pTouched = false; return; } pick(e); });
  }
  function render() {
    renderPresets();
    rows.innerHTML = CHANNELS.map(function(c) {
      const s = state[c.id], pct = Math.round(s.vol * 100);
      // [이름 값 ON/OFF] / [슬라이더]
      return '<div class="mixer-row' + (s.mute ? ' muted' : '') + '" data-id="' + c.id + '">' +
        '<div class="mixer-head"><label>' + c.name + '</label>' +
        '<span class="mixer-val">' + pct + '</span>' +
        '<button class="mixer-mute" tabindex="-1">' + (s.mute ? 'OFF' : 'ON') + '</button></div>' +
        '<input type="range" min="0" max="100" step="1" value="' + pct + '"></div>';
    }).join('');
  }
  rows.addEventListener('input', function(e) {
    const row = e.target.closest('.mixer-row');
    if (!row || e.target.type !== 'range') return;
    M.mixer.set(row.getAttribute('data-id'), e.target.value / 100);
    row.querySelector('.mixer-val').textContent = e.target.value;
  });
  function toggleMute(e) {
    const btn = e.target.closest('.mixer-mute');
    if (!btn) return;
    const id = btn.closest('.mixer-row').getAttribute('data-id');
    M.mixer.set(id, null, !state[id].mute);
    render();
  }
  let touched = false;
  rows.addEventListener('touchend', function(e) {
    if (!e.target.closest('.mixer-mute')) return;
    e.preventDefault(); touched = true; toggleMute(e);
  }, { passive: false });
  rows.addEventListener('click', function(e) { if (touched) { touched = false; return; } toggleMute(e); });
  const resetBtn = document.getElementById('mixerReset');
  if (resetBtn) resetBtn.addEventListener('click', function() { M.mixer.reset(); render(); });
  render();
})();
