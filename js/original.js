// 게임 목소리: assets/voice/<doo|pah|wop>.wav 로드 (사용자 녹음 — 녹음 탭 채택 → 💾 굽기, 원작 음원 쓰지 않음) + press/release → 사운드 + 메인 스프라이트 동기화
//   파일·뚜~ 루프 지점 = 데이터 파일 voice (js/data/voice.js — 굽기가 씀). 이 페이지에서 채택한 소리가 있으면 그것이 먼저
// 전역 의존: Moai (state.js), sprite.js API
(function() {
  var M = window.Moai;

  // ── 에셋 버퍼 ──
  var origSndBufs = {};  // { rightDoo, rightPah, rightWop }
  var origLoaded = false;

  function voiceMeta(role) { var d = window.MoaiData && window.MoaiData.voice; return (d && d[role]) || { file: 'assets/voice/' + role + '.wav' }; }

  // ── 로드 ──
  function loadOrigSound(name, url) {
    var ctx = M.ensureCtx();
    return fetch(url)
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function(buf) { return ctx.decodeAudioData(buf); })
      .then(function(decoded) { origSndBufs[name] = decoded; })
      .catch(function(e) { console.warn('[voice] 목소리 파일 없음 — 녹음 탭에서 채택 → 💾 굽기:', url, e.message); });
  }

  function ensureLoaded() {
    if (origLoaded) return Promise.resolve();
    var promises = [];
    if (!origSndBufs['rightDoo']) promises.push(loadOrigSound('rightDoo', voiceMeta('doo').file));
    if (!origSndBufs['rightPah']) promises.push(loadOrigSound('rightPah', voiceMeta('pah').file));
    if (!origSndBufs['rightWop']) promises.push(loadOrigSound('rightWop', voiceMeta('wop').file));
    if (promises.length === 0) { origLoaded = true; return Promise.resolve(); }
    return Promise.all(promises).then(function() {
      // 음량 측정은 로드 때 한 번 (첫 탭에서 측정 지연이 생기지 않게)
      ['rightDoo', 'rightPah', 'rightWop'].forEach(function(n) { if (origSndBufs[n]) voiceLevel(origSndBufs[n]); });
      origLoaded = true;
      updateStatus();
    });
  }

  // ── 상태 표시 ──
  function updateStatus() {
    var adopted = window.adoptedBuffers || {};
    var map = [
      { key: 'doo', id: 'origSnd-doo' },
      { key: 'pah', id: 'origSnd-pah' },
      { key: 'wop', id: 'origSnd-wop' },
    ];
    for (var i = 0; i < map.length; i++) {
      var row = document.getElementById(map[i].id);
      if (!row) continue;
      var statusEl = row.querySelector('.original-sound-status');
      var origBuf = origSndBufs['right' + map[i].key.charAt(0).toUpperCase() + map[i].key.slice(1)];
      if (adopted[map[i].key]) {
        var va = voiceLevel(adopted[map[i].key]);   // 채택 시점에 측정 (updateStatus = 채택 직후 호출)
        statusEl.textContent = '✓ 녹음본' + (va ? ' (' + fmtDb(va.gainDb) + ')' : '');
        statusEl.style.color = '#4caf50';
      } else if (origBuf) {
        var vo = voiceLevel(origBuf);
        statusEl.textContent = '게임 목소리' + (vo ? ' (' + fmtDb(vo.gainDb) + ')' : '');
        statusEl.style.color = '#888';
      } else {
        statusEl.textContent = '—';
        statusEl.style.color = '';
      }
    }
  }

  // ── 목소리 음량 맞춤 (재생 볼륨만 — 파형은 건드리지 않음) ──
  //   소리마다 한 번 측정해 순간 최대(400ms)를 기준 -14 LUFS로 맞추는 볼륨을 정한다 (버퍼에 캐시)
  //   올릴 때는 트루 피크 -1 dBTP를 넘지 않는 만큼만 → 찌그러짐·리미팅 없음
  //   녹음 채택본·임시 음원·게시용 음성 모두 같은 기준 → 목소리를 바꿔도 믹스 균형 유지
  //   근거: docs/AUDIO-LOUDNESS-RESEARCH.md (측정 = js/loudness.js, ffmpeg ebur128과 대조 검증)
  var VOICE_TARGET = -14;   // LUFS (순간 최대)
  var VOICE_CEIL = -1;      // dBTP
  function voiceLevel(buf) {
    if (!buf) return null;
    if (!buf._voice && M.loudness) {
      var r = M.loudness.measureBuffer(buf);
      var g = isFinite(r.momentaryMax) ? Math.min(VOICE_TARGET - r.momentaryMax, VOICE_CEIL - r.truePeak) : 0;
      buf._voice = { gainDb: g, gain: Math.pow(10, g / 20), lufs: r.momentaryMax, truePeak: r.truePeak };
    }
    return buf._voice || null;
  }
  function voiceGain(buf) { var v = voiceLevel(buf); return v ? v.gain : 1; }
  function fmtDb(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB'; }

  // ── 사운드 재생 (채택 우선 → 원본 폴백) ──
  //   opts: loop / voice = 목소리 프로필 (없으면 지금 몸의 것 — js/possess.js) / when = 예약 시각 (오디오 시각, 없으면 바로)
  function playSound(role, opts) {
    opts = opts || {};
    var adopted = window.adoptedBuffers || {};
    var buf = null;
    var loopPts = null;

    if (role === 'doo') {
      if (adopted['doo']) {
        buf = adopted['doo'];
        if (buf._loopStart !== undefined) {
          loopPts = { start: buf._loopStart, end: buf._loopEnd };
        }
      } else {
        buf = origSndBufs['rightDoo'];
        var vm = voiceMeta('doo');
        loopPts = vm.loopStart != null ? { start: vm.loopStart, end: vm.loopEnd } : null;   // 굽기가 저장한 루프 지점 (없으면 통째로 반복)
      }
    } else if (role === 'pah') {
      buf = adopted['pah'] || origSndBufs['rightPah'];
    } else if (role === 'wop') {
      buf = adopted['wop'] || origSndBufs['rightWop'];
    }

    if (!buf) return null;

    var ctx = M.ensureCtx();
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    src.buffer = buf;
    src.loop = !!opts.loop;
    if (opts.loop && loopPts) {
      src.loopStart = loopPts.start;
      src.loopEnd = loopPts.end;
    }
    gain.gain.value = voiceGain(buf);   // 목소리 음량 맞춤 (소리별 페이드도 이 게인에서 시작)
    // 몸의 목소리 (빙의 — js/possess.js): 재생 속도(반음) + 효과 체인(js/voice-fx.js). 효과는 페이드 뒤 — 끊어도 메아리 꼬리는 남음
    var voice = opts.voice || (M.body ? M.body.voice() : null);
    if (voice && src.playbackRate) src.playbackRate.value = voice.rate || 1;
    var fx = voice && M.voiceFx ? M.voiceFx(ctx, voice, src) : null;
    src.connect(gain);
    if (fx) { gain.connect(fx.input); fx.output.connect(voiceBus(ctx)); }
    else gain.connect(voiceBus(ctx));
    src.start(opts.when || 0);

    var handle = { source: src, gain: gain, level: gain.gain.value, playing: true };
    src.onended = function() { handle.playing = false; if (fx) fx.stop(fx.tail); };
    return handle;
  }

  function bodyHeight() { return M.body ? M.body.height() : M.moaiHeight; }   // 지금 몸의 높이 (빙의 — js/possess.js)
  // 모아이 목소리 공용 버스: 소리별 gain(페이드용) → 버스 → 출력. 버스 게인 = 모아이 높이 감쇠 (layout.js M.moaiGain)
  var bus = null;
  function voiceBus(ctx) {
    if (!bus || bus.context !== ctx) {
      bus = ctx.createGain();
      bus.gain.value = M.moaiGain ? M.moaiGain(bodyHeight()) : 1;
      bus.connect(M.mixer ? M.mixer.bus('moai') : ctx.destination);   // 믹서 모아이 채널
    }
    return bus;
  }
  // 높이 변화 시 호출 — 15ms 선형 램프로 지퍼 잡음 방지 (재생 중인 뚜~ 홀드에도 즉시 반영)
  //   조용할 때 바꾼 값도 다음 소리부터 정확히 적용 (mixer.js M.rampGain 주석 참고)
  M.updateVoiceGain = function() {
    if (!bus || !M.moaiGain) return;
    M.rampGain(bus.gain, M.moaiGain(bodyHeight()));
  };

  function killSound(handle, fadeTime) {
    if (!handle || !handle.playing) return;
    var ctx = M.ensureCtx();
    if (!fadeTime || fadeTime <= 0) {
      try { handle.source.stop(); } catch(e) {}
      handle.playing = false;
    } else {
      var now = ctx.currentTime;
      handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
      handle.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
      try { handle.source.stop(now + fadeTime + 0.01); } catch(e) {}
      setTimeout(function() { handle.playing = false; }, fadeTime * 1000 + 20);
    }
  }

  // ── 소리만 (입력과 무관): 몸의 목소리로 예약 시각에 — 판정·게이지·바람 등 입력 알림 없음 (세션 NPC 몸 — rhythm/session.js 연주자)
  //   M.voicePlay('pah'|'doo'|'wop', { voice, when, loop }) → 핸들 | null (음원 로드 전) / M.voiceStop(핸들, when) = 그 시각부터 짧게 페이드
  M.voicePlay = function(role, opts) { return playSound(role, opts); };
  M.voiceStop = function(handle, when) {
    if (!handle || !handle.playing) return;
    var t = Math.max(when || 0, M.ensureCtx().currentTime);
    handle.gain.gain.setValueAtTime(handle.level, t);
    handle.gain.gain.linearRampToValueAtTime(0, t + LOOP_FADE);
    try { handle.source.stop(t + LOOP_FADE + 0.01); } catch (e) {}
  };

  // ── 노트 입력 통지: 판정 시스템 연결점 (rhythm/bridge.js가 M.onNoteInput 설정) ──
  // type: 'tap' | 'hold-start' | 'hold-end' (분리 버튼) | 'press' | 'release' (단일 버튼), time: 입력 시각 (AudioContext, 생략 = 지금)
  function emitNoteInput(type, time) {
    if (M.onNoteInput) M.onNoteInput(type, time);
  }
  // ── 소리 알림 (상태만 — 해석은 듣는 쪽: field-clock.js 바람 등) ──
  //   'moai:voice' { sound: 'doo'(누름 시작 — 뚜~) | 'pah'(떽) | 'wop'(엉) | 'stop'(강제 정리) }
  // 동작: 지금 몸(빙의 — js/possess.js)이 수행. 몸 모듈이 없으면 메인 모아이 스프라이트 직접 (시뮬레이션 등)
  var SPRITE_ACT = { tap: 'spritePlayTap', hold: 'spriteStartHold', release: 'spritePlayRelease' };
  function act(a) {
    if (M.body) M.body.act(a);
    else if (M[SPRITE_ACT[a]]) M[SPRITE_ACT[a]]();
  }
  function emitVoice(sound) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;   // 알림을 받을 곳이 없는 환경(시뮬레이션 등)
    document.dispatchEvent(new CustomEvent('moai:voice', { detail: { sound: sound } }));
  }

  // ── Press / Release (input.js에서 호출) ──
  var loopHandle = null;
  var pressTime = 0;
  // 단일 버튼 판정: 누름(press)·뗌(release)을 그대로 통지 — 판정은 떽·뚜~ 구분 없이 터치 다운 시각 (judge.js)
  //   소리는 원본 그대로: 누르면 뚜~, 기준 시간 안에 떼면 떽 / 넘기면 엉 (소리 분기일 뿐 판정과 무관)
  var pressThreshold = 0.15;   // 누를 때 확정한 소리 분기 기준 (초)
  // 떽/엉 소리 분기 기준 (초): 박자 구간(인카운터·루프 테스트)에서는 rhythm/bridge.js가 박자 기반 값 제공,
  // 그 외 자유 연주는 기본값 (state.js tapThreshold 150ms)
  function tapThreshold() {
    return M.getTapThreshold ? M.getTapThreshold() : M.tapThreshold / 1000;
  }
  var LOOP_FADE = 0.05;

  M.originalOnPress = function() {
    ensureLoaded().then(function() {
      pressTime = M.ensureCtx().currentTime;
      pressThreshold = tapThreshold();
      loopHandle = playSound('doo', { loop: true });
      emitNoteInput('press', pressTime);
      emitVoice('doo');
      act('hold');
      M.ui.showFeedback('뚜!', 'hold-fb');
    });
  };

  M.originalOnRelease = function() {
    var holdDuration = M.ensureCtx().currentTime - pressTime;

    if (holdDuration < pressThreshold) {
      // 떽 소리
      killSound(loopHandle, 0);
      loopHandle = null;
      playSound('pah');
      emitVoice('pah');
      act('tap');
      M.ui.showFeedback('떽!', 'tap-fb');
    } else {
      // 엉 소리
      killSound(loopHandle, LOOP_FADE);
      loopHandle = null;
      playSound('wop');
      emitVoice('wop');
      act('release');
      M.ui.showFeedback('엉!', 'tap-fb');
    }
    emitNoteInput('release');
  };

  // ── 분리 버튼: 떽 (즉발) ──
  M.originalTapPress = function() {
    ensureLoaded().then(function() {
      playSound('pah');
      emitNoteInput('tap');
      emitVoice('pah');
      act('tap');
      M.ui.showFeedback('떽!', 'tap-fb');
    });
  };

  // ── 분리 버튼: 뚜우~엉 (홀드) ──
  M.originalHoldPress = function() {
    ensureLoaded().then(function() {
      loopHandle = playSound('doo', { loop: true });
      emitNoteInput('hold-start');
      emitVoice('doo');
      act('hold');
      M.ui.showFeedback('뚜!', 'hold-fb');
    });
  };

  M.originalHoldRelease = function() {
    killSound(loopHandle, LOOP_FADE);
    loopHandle = null;
    playSound('wop');
    emitNoteInput('hold-end');
    emitVoice('wop');
    act('release');
    M.ui.showFeedback('엉!', 'tap-fb');
  };

  // 뚜~ 루프 재생 중 여부 (판정의 홀드 유지 체크용 — rhythm/bridge.js)
  M.originalIsHolding = function() { return !!loopHandle; };

  // 강제 정리 (모드 전환 시)
  M.originalCleanup = function() {
    if (loopHandle) {
      killSound(loopHandle, 0);
      loopHandle = null;
    }
    pressTime = 0;
    emitVoice('stop');
  };

  // 에셋 로드 + 상태 갱신 (탭 전환 시 호출)
  M.originalEnsureLoaded = ensureLoaded;
  M.originalUpdateStatus = updateStatus;
})();
