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
  // 모든 재생 오버레이 클리어 + 루프 이름표를 평소 자리로 (샘플 루프 재생이 임시로 옮겼을 수 있음)
  SAMPLES.forEach(function(s) {
    var cv = document.getElementById('cvPlay-' + s.name);
    if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    if (typeof restoreLoopLabels === 'function') restoreLoopLabels(s.name);
  });
  // 재생 버튼 텍스트 복원
  if (activePlayBtn) {
    var el = document.getElementById(activePlayBtn.id);
    if (el) { el.textContent = activePlayBtn.origText; el.classList.remove('active'); }
    activePlayBtn = null;
  }
}

// 재생 버튼 활성화 표시 (토글용) — 재생 중 = 켜진 모양(.active) + 정지 글자
function markPlayBtn(btnId, stopText) {
  var el = document.getElementById(btnId);
  if (!el) return;
  activePlayBtn = { id: btnId, origText: el.textContent };
  el.textContent = stopText || '■ 정지';
  el.classList.add('active');
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

// 그 소리의 시작 보정 (초) — 재생 표시가 프레임마다 읽는다 (draw.js offsetNow)
function offsetOf(name) { return function() { return (recOffsets[name] || 0) / 1000; }; }

// 순수 재생: BufferSource 생성 + start
function startSource(buf) {
  var src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(sampleOut());
  src.start();
  setTimeout(announceBusy, 0);   // 부른 쪽이 activeSource에 넣은 뒤 — 듣기 시작을 바로 알린다 (recorder.js)
  return src;
}

// 단독 재생 공통: 재생 + 인디케이터 + activeSource 관리
function playSingle(name, buf, color) {
  stopActive();
  var src = startSource(buf);
  activeSource = src;
  var recTargetDur = sampleDur(name) + EXTRA_SEC;   // 뼈대 길이 기준 파형 폭
  drawPlaybackIndicator(name, actx.currentTime, buf.duration, recTargetDur, color, offsetOf(name));
  src.onended = function() {
    if (activeSource === src) {
      activeSource = null;
      // 버튼 텍스트 복원
      if (activePlayBtn) {
        var el = document.getElementById(activePlayBtn.id);
        if (el) { el.textContent = activePlayBtn.origText; el.classList.remove('active'); }
        activePlayBtn = null;
      }
      // 재생 오버레이 클리어
      var cv = document.getElementById('cvPlay-' + name);
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    }
  };
}

// 반복 재생 (뚜~): 처음부터 재생하다가 반복 구간에 들어가면 그 구간을 이어 돈다 — 게임에서 누르고 있는 동안과 같은 소리. 다시 누르면 정지
function playLooped(name, buf, loopStart, loopEnd, color, offsetSec, marks) {
  stopActive();
  var src = actx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = loopStart;
  src.loopEnd = loopEnd;
  src.connect(sampleOut());
  src.start();
  activeSource = src;
  drawLoopPlaybackIndicator(name, actx.currentTime, loopStart, loopEnd, sampleDur(name) + EXTRA_SEC, color, offsetSec, marks);
}

// 기본 소리 듣기: 뚜~는 게임이 쓰는 반복 구간을 이어서 (ui.js gameLoopOf), 나머지는 한 번
function listenOriginal(name) {
  var btnId = 'btnListen-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }
  var buf = origBuffers[name];
  if (!buf) return;
  var gl = loopPreview && isLoopSample(name) ? gameLoopOf(name) : null;   // 루프 토글이 켜져 있을 때
  if (gl) playLooped(name, buf, gl.start, gl.end, 'rgba(45, 106, 79, 0.25)', offsetOf(name), true);   // 샘플 파형은 시작 보정만큼 옮겨 그려진다 — 표시도 같이. 샘플의 루프 선 · 이름표를 임시로
  else playSingle(name, buf, 'rgba(45, 106, 79, 0.25)');
  markPlayBtn(btnId);
}

// 내 녹음 듣기 (가운데 버튼 — 들어보기 ↔ 그만 듣기): 뚜~는 루프 토글이 켜져 있으면 찾은 구간을 이어서 (playRecLoop), 아니면 한 번
function playRecorded(name) {
  var btnId = 'btnRec-' + name;
  if (isPlayingBtn(btnId)) { stopActive(); return; }
  var buf = recBuffers[name];
  if (!buf) return;
  if (loopPreview && isLoopSample(name) && loopPoints[name]) { playRecLoop(name, btnId, '그만 듣기'); return; }
  playSingle(name, buf, 'rgba(231, 76, 60, 0.2)');
  markPlayBtn(btnId, '그만 듣기');
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
  drawPlaybackIndicator(name, actx.currentTime, origBuf.duration, recTargetDur, 'rgba(45, 106, 79, 0.25)', offsetOf(name));

  var done = 0;
  function onEnd() {
    done++;
    if (done >= 2) {
      activeSource = null;
      activeSources = [];
      if (activePlayBtn) {
        var el = document.getElementById(activePlayBtn.id);
        if (el) { el.textContent = activePlayBtn.origText; el.classList.remove('active'); }
        activePlayBtn = null;
      }
      var cv = document.getElementById('cvPlay-' + name);
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    }
  }
  srcOrig.onended = onEnd;
  srcRec.onended = onEnd;
  markPlayBtn(btnId);
}

// 내 녹음의 루프 구간을 이어 붙여(XF) 반복 재생 — 들어보기(뚜~, 루프 토글 켬)
function playRecLoop(name, btnId, stopText) {
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
  var best = lp.peaks && lp.peaks.length > 0 ? lp.peaks[lp.peaks.length - 1] : null;
  setLoopDevInfo(name, '내 녹음 ' + lp.start.toFixed(2) + '~' + xfBuf._loopEnd.toFixed(2) + ' · XF ' + fadeMs + 'ms' + (best ? ' · sim=' + best.height.toFixed(3) : ''));

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
  drawLoopPlaybackIndicator(name, actx.currentTime, lp.start, lp.end, recTargetDur, 'rgba(106, 76, 147, 0.2)', offsetOf(name));

  markPlayBtn(btnId, stopText);
}
