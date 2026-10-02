// ========== Waveform Drawing ==========
// totalDuration: canvas 전체 폭이 나타내는 시간 (초)
// buffer의 길이가 totalDuration보다 짧으면 해당 비율만 그림
// showBoundary: 원본 끝 점선 표시 여부 (기본 true)
// offsetSec: 그리기 시작 X 오프셋 (초, 카운트인 등)
// 전역 의존: 없음
function drawWaveform(canvas, buffer, color, alpha, totalDuration, showBoundary, offsetSec) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  if (!buffer) return;
  var data = buffer.getChannelData(0);
  var n = data.length;
  var sr = buffer.sampleRate;
  var bufDur = n / sr;
  offsetSec = offsetSec || 0;

  // totalDuration 미지정이면 buffer 길이 + offset = canvas 전체
  if (!totalDuration) totalDuration = bufDur + offsetSec;

  // 오프셋의 픽셀 위치
  var offsetX = Math.round(w * offsetSec / totalDuration);
  // buffer가 차지하는 픽셀 폭
  var drawW = Math.min(w - offsetX, Math.round(w * bufDur / totalDuration));
  var step = Math.max(1, Math.floor(n / drawW));

  ctx.globalAlpha = alpha || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 0; x < drawW; x++) {
    var px = offsetX + x;
    var idx = Math.floor(x * n / drawW);
    var min = Infinity, max = -Infinity;
    for (var j = 0; j < step && idx + j < n; j++) {
      var v = data[idx + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    var yMin = (1 - max) * h / 2;
    var yMax = (1 - min) * h / 2;
    if (x === 0) { ctx.moveTo(px, yMin); }
    ctx.lineTo(px, yMin);
    ctx.lineTo(px, yMax);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 원본 끝 경계선 (totalDuration > bufDur일 때)
  if (showBoundary !== false && totalDuration > bufDur) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(offsetX + drawW, 0);
    ctx.lineTo(offsetX + drawW, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function clearCanvas(canvas) {
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // center line
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

// ========== Count Bar ==========
// 전역 의존: COUNT_IN_BEATS, BEAT_SEC, COUNT_IN_SEC (recorder.js)
function drawCountBarStatic(canvas) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 배경
  ctx.fillStyle = '#12121f';
  ctx.fillRect(0, 0, w, h);

  // 박 위치 마커
  for (var b = 0; b < COUNT_IN_BEATS; b++) {
    var x = Math.round(w * (b * BEAT_SEC) / COUNT_IN_SEC);
    ctx.fillStyle = b === 0 ? 'rgba(255, 200, 50, 0.7)' : 'rgba(255, 200, 50, 0.35)';
    ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = b === 0 ? 'rgba(255, 200, 50, 0.9)' : 'rgba(255, 200, 50, 0.5)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('' + (b + 1), x + 5, 14);
  }
}

// 전역 의존: currentRecording, actx, COUNT_IN_SEC, BEAT_SEC, COUNT_IN_BEATS (recorder.js)
function drawCountBarProgress(canvas, countStartTime) {
  if (!currentRecording) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;

  var elapsed = actx.currentTime - countStartTime;
  if (elapsed >= COUNT_IN_SEC) {
    // 카운트인 끝 — 바 전체를 녹색으로 플래시
    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // 진행 채우기
  var progress = elapsed / COUNT_IN_SEC;
  var fillX = Math.floor(progress * w);
  ctx.fillStyle = 'rgba(255, 200, 50, 0.15)';
  ctx.fillRect(0, 0, fillX, h);

  // 진행선
  ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fillX, 0);
  ctx.lineTo(fillX, h);
  ctx.stroke();

  // 현재 박 하이라이트
  var currentBeat = Math.floor(elapsed / BEAT_SEC);
  if (currentBeat < COUNT_IN_BEATS) {
    var beatX = Math.round(w * (currentBeat * BEAT_SEC) / COUNT_IN_SEC);
    var nextX = currentBeat < COUNT_IN_BEATS - 1
      ? Math.round(w * ((currentBeat + 1) * BEAT_SEC) / COUNT_IN_SEC)
      : w;
    ctx.fillStyle = 'rgba(255, 200, 50, 0.1)';
    ctx.fillRect(beatX, 0, nextX - beatX, h);
  }

  currentRecording.countFrame = requestAnimationFrame(function() {
    drawCountBarStatic(canvas);
    drawCountBarProgress(canvas, countStartTime);
  });
}

// ========== Realtime Waveform (recording) ==========
// 전역 의존: currentRecording, actx (recorder.js)
function drawRealtimeWaveform(canvas, analyser, recStartTime, recDuration, offsetSec, totalCanvasDur) {
  if (!currentRecording || currentRecording.analyser !== analyser) return;

  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var bufferLen = analyser.frequencyBinCount;
  var dataArray = new Uint8Array(bufferLen);
  analyser.getByteTimeDomainData(dataArray);

  var elapsed = actx.currentTime - recStartTime;
  // 캔버스 상 위치: (offsetSec + elapsed) / totalCanvasDur
  var progress = Math.min((offsetSec + elapsed) / totalCanvasDur, 1);
  var drawX = Math.floor(progress * w);

  // Draw a vertical slice at current position
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  var amplitude = 0;
  for (var i = 0; i < bufferLen; i++) amplitude += Math.abs(dataArray[i] - 128);
  amplitude /= bufferLen;

  var yCenter = h / 2;
  var yTop = yCenter - (amplitude / 128) * (h / 2);
  var yBot = yCenter + (amplitude / 128) * (h / 2);
  ctx.moveTo(drawX, yTop);
  ctx.lineTo(drawX, yBot);
  ctx.stroke();

  // Progress indicator
  ctx.strokeStyle = 'rgba(231, 76, 60, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(drawX, 0);
  ctx.lineTo(drawX, h);
  ctx.stroke();

  currentRecording.animFrame = requestAnimationFrame(function() {
    drawRealtimeWaveform(canvas, analyser, recStartTime, recDuration, offsetSec, totalCanvasDur);
  });
}

// ========== Playback Indicator ==========
// 전역 의존: activeSource, actx (recorder.js)
var playbackAnim = null;

function drawPlaybackIndicator(name, startTime, duration, totalCanvasDur, color, offsetSec) {
  var cv = document.getElementById('cvPlay-' + name);
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var w = cv.width, h = cv.height;
  var offSec = offsetSec || 0;
  var startPx = Math.floor(w * offSec / totalCanvasDur);

  function frame() {
    if (!activeSource) {
      ctx.clearRect(0, 0, w, h);
      playbackAnim = null;
      return;
    }

    var elapsed = actx.currentTime - startTime;
    var progress = Math.min((offSec + elapsed) / totalCanvasDur, 1);
    var px = Math.floor(progress * w);

    ctx.clearRect(0, 0, w, h);

    // 재생된 구간 반투명 채우기 (시작 마커부터)
    ctx.fillStyle = color;
    ctx.fillRect(startPx, 0, px - startPx, h);

    // 인디케이터 라인
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();

    if (progress < 1) {
      playbackAnim = requestAnimationFrame(frame);
    } else {
      playbackAnim = null;
    }
  }

  if (playbackAnim) cancelAnimationFrame(playbackAnim);
  frame();
}

function drawLoopPlaybackIndicator(name, startTime, loopStart, loopEnd, totalCanvasDur, color, offsetSec) {
  var cv = document.getElementById('cvPlay-' + name);
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var w = cv.width, h = cv.height;
  var offSec = offsetSec || 0;
  var loopLen = loopEnd - loopStart;

  function frame() {
    if (!activeSource) {
      ctx.clearRect(0, 0, w, h);
      playbackAnim = null;
      return;
    }

    var elapsed = actx.currentTime - startTime;
    var pos;
    if (elapsed <= loopEnd) {
      pos = elapsed;
    } else {
      pos = loopStart + ((elapsed - loopEnd) % loopLen);
    }

    var px = Math.floor(w * (offSec + pos) / totalCanvasDur);

    ctx.clearRect(0, 0, w, h);

    // 루프 구간 반투명 표시
    var lsPx = Math.floor(w * (offSec + loopStart) / totalCanvasDur);
    var lePx = Math.floor(w * (offSec + loopEnd) / totalCanvasDur);
    ctx.fillStyle = color;
    ctx.fillRect(lsPx, 0, lePx - lsPx, h);

    // 인디케이터 라인
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();

    playbackAnim = requestAnimationFrame(frame);
  }

  if (playbackAnim) cancelAnimationFrame(playbackAnim);
  frame();
}
