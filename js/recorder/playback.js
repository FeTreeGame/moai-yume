// ========== Playback ==========
// 전역 의존: actx, SAMPLES, EXTRA_SEC, origBuffers, recBuffers, recOffsets,
//            loopPoints, activeSource, activeSources, activePlayBtn,
//            playbackAnim (draw.js), setSlotStatus (recorder.js),
//            drawPlaybackIndicator, drawLoopPlaybackIndicator (draw.js),
//            buildXFBuffer (dsp.js)

function stopActive() {
  if (activeSource) {
    try { activeSource.stop(); } catch(e) {}
    activeSource = null;
  }
  activeSources.forEach(function(s) {
    try { s.stop(); } catch(e) {}
  });
  activeSources = [];
  if (playbackAnim) {
    cancelAnimationFrame(playbackAnim);
    playbackAnim = null;
  }
  // 모든 재생 오버레이 클리어
  SAMPLES.forEach(function(s) {
    var cv = document.getElementById('cvPlay-' + s.name);
    if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  });
  // 재생 버튼 텍스트 복원
  if (activePlayBtn) {
    var el = document.getElementById(activePlayBtn.id);
    if (el) el.textContent = activePlayBtn.origText;
    activePlayBtn = null;
  }
}

// 재생 버튼 활성화 표시 (토글용)
function markPlayBtn(btnId, stopText) {
  var el = document.getElementById(btnId);
  if (!el) return;
  activePlayBtn = { id: btnId, origText: el.textContent };
  el.textContent = stopText || '⏹ 정지';
}

// 재생 토글 판정: 같은 버튼이 이미 활성이면 true (정지해야 함)
function isPlayingBtn(btnId) {
  return activePlayBtn && activePlayBtn.id === btnId;
}

// 출력: index 믹서 샘플 채널 (같은 AudioContext일 때만, 아니면 직접 출력)
function sampleOut() {
  var M = window.Moai;
  return (M && M.mixer && M.ctx === actx) ? M.mixer.bus('sample') : actx.destination;
}

// 순수 재생: BufferSource 생성 + start
function startSource(buf) {
  var src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(sampleOut());
  src.start();
  return src;
}

// 단독 재생 공통: 재생 + 인디케이터 + activeSource 관리
function playSingle(name, buf, color) {
  stopActive();
  var src = startSource(buf);
  activeSource = src;
  var recTargetDur = sampleDur(name) + EXTRA_SEC;   // 뼈대 길이 기준 파형 폭
  var offsetSec = (recOffsets[name] || 0) / 1000;
  drawPlaybackIndicator(name, actx.currentTime, buf.duration, recTargetDur, color, offsetSec);
  src.onended = function() {
    if (activeSource === src) {
      activeSource = null;
      // 버튼 텍스트 복원
      if (activePlayBtn) {
        var el = document.getElementById(activePlayBtn.id);
        if (el) el.textContent = activePlayBtn.origText;
        activePlayBtn = null;
      }
      // 재생 오버레이 클리어
      var cv = document.getElementById('cvPlay-' + name);
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    }
  };
}

function listenOriginal(name) {
  var btnId = 'btnListen-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }
  var buf = origBuffers[name];
  if (!buf) return;
  playSingle(name, buf, 'rgba(45, 106, 79, 0.25)');
  markPlayBtn(btnId, '⏹ 원본');
}

function playRecorded(name) {
  var btnId = 'btnPlay-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }
  var buf = recBuffers[name];
  if (!buf) return;
  playSingle(name, buf, 'rgba(231, 76, 60, 0.2)');
  markPlayBtn(btnId, '⏹ 녹음');
}

function playBoth(name) {
  var btnId = 'btnBoth-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }
  stopActive();
  var origBuf = origBuffers[name];
  var recBuf = recBuffers[name];
  if (!origBuf || !recBuf) return;

  var srcOrig = startSource(origBuf);
  var srcRec = startSource(recBuf);
  activeSource = srcOrig;
  activeSources = [srcOrig, srcRec];

  var recTargetDur = origBuf.duration + EXTRA_SEC;
  var offsetSec = (recOffsets[name] || 0) / 1000;
  drawPlaybackIndicator(name, actx.currentTime, origBuf.duration, recTargetDur, 'rgba(45, 106, 79, 0.25)', offsetSec);

  var done = 0;
  function onEnd() {
    done++;
    if (done >= 2) {
      activeSource = null;
      activeSources = [];
      if (activePlayBtn) {
        var el = document.getElementById(activePlayBtn.id);
        if (el) el.textContent = activePlayBtn.origText;
        activePlayBtn = null;
      }
      var cv = document.getElementById('cvPlay-' + name);
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    }
  }
  srcOrig.onended = onEnd;
  srcRec.onended = onEnd;
  markPlayBtn(btnId, '⏹ 비교');
}

function playLoop(name) {
  var btnId = 'btnLoop-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }

  var lp = loopPoints[name];
  if (!lp) return;

  var buf = recBuffers[name];
  if (!buf) return;

  stopActive();

  var data = buf.getChannelData(0);
  var sr = buf.sampleRate;
  var xfEl = document.getElementById('xfSlider-' + name);
  var fadeMs = xfEl ? parseInt(xfEl.value) : DEFAULT_FADE_MS;
  var xfBuf = buildXFBuffer(data, sr, lp.start, lp.end, fadeMs, 'preLoop');

  if (!xfBuf) {
    setSlotStatus(name, '루프 XF 실패 — 구간이 너무 짧음');
    return;
  }

  // 루프 정보 표시
  var infoEl = document.getElementById('loopInfo-' + name);
  infoEl.textContent = '루프: ' + lp.start.toFixed(4) + 's → ' +
    xfBuf._loopEnd.toFixed(4) + 's (XF ' + fadeMs + 'ms, preLoop)';
  if (lp.peaks && lp.peaks.length > 0) {
    var best = lp.peaks[lp.peaks.length - 1];
    infoEl.textContent += ' | sim=' + best.height.toFixed(3);
  }

  // 루프 재생
  var src = actx.createBufferSource();
  src.buffer = xfBuf;
  src.loop = true;
  src.loopStart = xfBuf._loopStart;
  src.loopEnd = xfBuf._loopEnd;
  src.connect(sampleOut());
  src.start();
  activeSource = src;

  var recTargetDur = sampleDur(name) + EXTRA_SEC;   // 뼈대 길이 기준 파형 폭
  var offsetSec = (recOffsets[name] || 0) / 1000;
  drawLoopPlaybackIndicator(name, actx.currentTime, lp.start, lp.end, recTargetDur, 'rgba(106, 76, 147, 0.2)', offsetSec);

  markPlayBtn(btnId, '⏹ 루프');
  setSlotStatus(name, '🔁 루프 재생 중');
}
