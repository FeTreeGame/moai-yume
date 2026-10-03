// ========== Config ==========
// dur = 녹음 뼈대 길이 (초) — 녹음 시간·자르기·파형 폭의 기준
// file = 현재 게임 음성 (샘플 탭의 원본 파형·▶ 원본·▶ 비교 기준)
var SAMPLES = [
  { name: 'doo',    file: 'assets/voice/doo.wav', label: 'Doo', role: '뚜~ (홀드 지속음)', loop: true,  dur: 1.1 },
  { name: 'pah',    file: 'assets/voice/pah.wav', label: 'Pah', role: '떽! (숏 릴리즈)',    loop: false, dur: 0.5 },
  { name: 'wop',    file: 'assets/voice/wop.wav', label: 'Wop', role: '웡~ (롱 릴리즈)',    loop: false, dur: 0.3 },
];
function sampleDur(name) {
  for (var i = 0; i < SAMPLES.length; i++) if (SAMPLES[i].name === name) return SAMPLES[i].dur;
  return 1;
}

var EXTRA_SEC = 0.5;       // 뒤 여유분
var DEFAULT_FADE_MS = 30;  // XF 기본값
var BPM = 120;
var BEAT_SEC = 60 / BPM;   // 0.5s
var COUNT_IN_BEATS = 3;
var COUNT_IN_SEC = COUNT_IN_BEATS * BEAT_SEC;  // 1.5s

// ========== State ==========
var actx = null;
var micStream = null;
var origBuffers = {};   // name → AudioBuffer (원본)
var recBuffers = {};    // name → AudioBuffer (녹음 결과, 컷 완료)
var recRawBuffers = {}; // name → AudioBuffer (녹음 결과, 컷 전 전체)
var adoptedBuffers = {}; // name → AudioBuffer (채택, Doo는 XF 베이크 포함)
var loopPoints = {};    // name → { start, end } (Doo만)
var currentRecording = null;  // { name, mediaRecorder, chunks, analyser, animFrame }
var activeSource = null;
var activeSources = [];  // playBoth용 — stopActive에서 일괄 정리
var recOffsets = {};     // name → offsetMs (탭별 시작 지점 보정)
var activePlayBtn = null; // 현재 재생 중인 버튼 { id, origText }

// ========== Audio Init ==========
function initAudio() {
  if (!actx) {
    // index.html에서 Moai.ctx가 이미 있으면 공유
    if (window.Moai && window.Moai.ctx) {
      actx = window.Moai.ctx;
    } else {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
}

// 메트로놈 클릭 합성 (짧은 사인파 버스트)
function playClick(when, isAccent) {
  var osc = actx.createOscillator();
  var gain = actx.createGain();
  osc.frequency.value = isAccent ? 1200 : 800;
  osc.connect(gain);
  gain.connect(actx.destination);
  gain.gain.setValueAtTime(isAccent ? 0.5 : 0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  osc.start(when);
  osc.stop(when + 0.06);
}

// 현재 게임 음성 참고 파일 — 없거나 실패해도 녹음은 뼈대 길이로 동작
function loadOriginal(sample) {
  return fetch(sample.file)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(function(buf) { return actx.decodeAudioData(buf); })
    .then(function(decoded) {
      origBuffers[sample.name] = decoded;
      return decoded;
    })
    .catch(function(err) {
      console.info('[recorder] 원본 참고 음원 없음 (' + sample.file + '): ' + err.message);
      return null;
    });
}

// Tab, UI Build, setSlotStatus → ui.js

// ========== Offset ==========
function onOffsetChange(name, val) {
  var ms = parseInt(val);
  recOffsets[name] = ms;
  document.getElementById('offsetLabel-' + name).textContent = ms + 'ms';
  redrawWithOffset(name, true);  // skipLoopAnalysis=true (드래그 중 렉 방지)
}

function onOffsetCommit(name, val) {
  var ms = parseInt(val);
  recOffsets[name] = ms;
  document.getElementById('offsetLabel-' + name).textContent = ms + 'ms';
  redrawWithOffset(name, false);  // 드래그 종료 → 루프 재분석 포함
}

function redrawWithOffset(name, skipLoopAnalysis) {
  var orig = origBuffers[name];          // 원본 참고 음원 (없을 수 있음)
  var raw = recRawBuffers[name];
  if (!raw) return;

  var dur = sampleDur(name);
  var sr = raw.sampleRate;
  var offsetMs = recOffsets[name] || 0;
  var offsetSec = offsetMs / 1000;
  var offsetSamples = Math.round(offsetSec * sr);
  var targetSamples = Math.round(dur * sr);
  var recTargetDur = dur + EXTRA_SEC;

  // 원본 파형 (오프셋만큼 동기화 이동) — 원본이 있을 때만
  var cvOrig = document.getElementById('cvOrig-' + name);
  clearCanvas(cvOrig);
  if (orig) drawWaveform(cvOrig, orig, '#555', 0.7, recTargetDur, true, offsetSec);

  // 녹음 파형: 전체를 그대로 그림 (고정)
  var cvRec = document.getElementById('cvRec-' + name);
  var ctxRec = cvRec.getContext('2d');
  ctxRec.clearRect(0, 0, cvRec.width, cvRec.height);
  drawWaveform(cvRec, raw, '#e74c3c', 0.8, recTargetDur, false);

  var cvW = cvRec.width, cvH = cvRec.height;

  // 시작 마커 (Start 라인) — 오프셋 위치에 실선
  var startX = Math.round(cvW * offsetSec / recTargetDur);
  if (startX > 0) {
    ctxRec.strokeStyle = 'rgba(76, 175, 80, 0.8)';
    ctxRec.lineWidth = 2;
    ctxRec.beginPath();
    ctxRec.moveTo(startX, 0);
    ctxRec.lineTo(startX, cvH);
    ctxRec.stroke();

    // 시작 마커 이전 구간 어둡게 (잘려나갈 영역)
    ctxRec.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctxRec.fillRect(0, 0, startX, cvH);
  }

  // 뼈대 길이 끝 경계 점선 — 시작 마커로부터 뼈대 길이만큼 뒤
  var dotSec = offsetSec + dur;
  var dotX = Math.round(cvW * dotSec / recTargetDur);
  if (dotX >= 0 && dotX <= cvW) {
    ctxRec.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctxRec.lineWidth = 1;
    ctxRec.setLineDash([4, 4]);
    ctxRec.beginPath();
    ctxRec.moveTo(dotX, 0);
    ctxRec.lineTo(dotX, cvH);
    ctxRec.stroke();
    ctxRec.setLineDash([]);
  }

  // 점선 이후 구간도 어둡게 (잘려나갈 영역)
  if (dotX < cvW) {
    ctxRec.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctxRec.fillRect(dotX, 0, cvW - dotX, cvH);
  }

  // recBuffers 갱신 — 오프셋 적용 컷
  var srcData = raw.getChannelData(0);
  var cutData = new Float32Array(targetSamples);
  var copyStart = Math.min(offsetSamples, srcData.length);
  var copyLen = Math.min(srcData.length - copyStart, targetSamples);
  for (var i = 0; i < copyLen; i++) cutData[i] = srcData[copyStart + i];
  var cutBuffer = actx.createBuffer(1, targetSamples, sr);
  cutBuffer.getChannelData(0).set(cutData);
  recBuffers[name] = cutBuffer;

  // Doo(loop)면 컷 버퍼로 루프 재분석 + XF loopEnd 산출
  // skipLoopAnalysis=true이면 기존 loopPoints 유지 (드래그 중 렉 방지)
  var sample = SAMPLES.filter(function(s) { return s.name === name; })[0];
  if (sample && sample.loop && !skipLoopAnalysis) {
    var loopData = cutBuffer.getChannelData(0);
    var loopResult = analyzeLoopPointForRecording(loopData, sr);
    // XF loopEnd 산출 (실제 루프 구간)
    var xfEl = document.getElementById('xfSlider-' + name);
    var fadeMs = xfEl ? parseInt(xfEl.value) : DEFAULT_FADE_MS;
    var fadeSamples = Math.round(fadeMs / 1000 * sr);
    var endSample = Math.round(loopResult.loopEnd * sr);
    var xfLoopEnd = (endSample - fadeSamples) / sr;
    loopPoints[name] = { start: loopResult.loopStart, end: loopResult.loopEnd, xfEnd: xfLoopEnd, peaks: loopResult.peaks };
    var infoEl = document.getElementById('loopInfo-' + name);
    infoEl.textContent = '루프: ' + loopResult.loopStart.toFixed(3) + 's → ' + xfLoopEnd.toFixed(3) + 's (XF ' + fadeMs + 'ms) | sim=' + loopResult.debug.maxSim.toFixed(3);
  }

  // 루프 포인트 표시 (컷 버퍼 기준, 캔버스에는 오프셋 더해서 렌더)
  if (loopPoints[name]) {
    var lp = loopPoints[name];
    var lsX = Math.round(cvW * (offsetSec + lp.start) / recTargetDur);
    var leX = Math.round(cvW * (offsetSec + lp.end) / recTargetDur);
    // 루프 구간 반투명 오버레이
    ctxRec.fillStyle = 'rgba(106, 76, 147, 0.15)';
    ctxRec.fillRect(lsX, 0, leX - lsX, cvH);
    // loopStart 마커 (초록)
    ctxRec.strokeStyle = '#4caf50';
    ctxRec.lineWidth = 2;
    ctxRec.beginPath();
    ctxRec.moveTo(lsX, 0);
    ctxRec.lineTo(lsX, cvH);
    ctxRec.stroke();
    ctxRec.fillStyle = '#4caf50';
    ctxRec.font = 'bold 11px sans-serif';
    ctxRec.fillText('S', lsX + 3, 12);
    // loopEnd 마커 (빨강)
    ctxRec.strokeStyle = '#f44336';
    ctxRec.lineWidth = 2;
    ctxRec.beginPath();
    ctxRec.moveTo(leX, 0);
    ctxRec.lineTo(leX, cvH);
    ctxRec.stroke();
    ctxRec.fillStyle = '#f44336';
    ctxRec.font = 'bold 11px sans-serif';
    ctxRec.fillText('E', leX + 3, 12);
  }

  // 상태 갱신
  var cutInfo = (copyLen / sr).toFixed(3) + 's';
  if (offsetMs > 0) cutInfo += ' (보정 ' + offsetMs + 'ms)';
  setSlotStatus(name, '녹음 완료 (' + cutInfo + ')');
}

// ========== Recording ==========
function toggleRecord(name) {
  if (currentRecording) {
    if (currentRecording.name === name) {
      stopRecording();
    }
    return;
  }
  startRecording(name);
}

// 녹음 중 잠금 (마이크 요청 ~ 끝·취소·실패): 그 슬롯의 녹음(⏹ 중지) 버튼 말고는 모든 입력을 막는다 — 입력 관문(gate.js)
//   드로어 닫기·탭 전환·모아이 캔버스·키 모두. 녹음은 길어야 3초 남짓이고 자동으로 끝난다 (잘린 녹음은 직전 녹음을 덮어쓰므로 기다리는 편이 잃는 게 없다)
//   막힌 입력이 있으면 슬롯 상태에 잠깐 안내
var LOCKED_MSG = '🔒 녹음 중 — 중지 버튼만 누를 수 있습니다';
function lockForRecording(name) {
  var gate = window.Moai && window.Moai.gate;
  if (!gate) return;
  var btn = document.getElementById('btnRec-' + name);
  gate.lock('record', {
    allow: function(t) { return !!(btn && t && btn.contains(t)); },
    onBlocked: function() {
      var el = document.getElementById('status-' + name);
      var prev = el.textContent;
      if (prev === LOCKED_MSG) return;
      el.textContent = LOCKED_MSG;
      setTimeout(function() { if (el.textContent === LOCKED_MSG) el.textContent = prev; }, 1500);   // 그사이 상태가 바뀌었으면 그대로
    }
  });
}
function unlockRecording() {
  if (window.Moai && window.Moai.gate) window.Moai.gate.unlock('record');
}
// 안전장치: 막지 못한 이탈로 샘플 탭이 가려지면(main.js 'moai:drawer') 진행 중인 녹음을 중지 —
//   녹음 중이면 거기까지 채택, 카운트인 중이면 취소. 드로어 밖에서 녹음은 이어지지 않는다
var sampleVisible = true;   // 알림이 없으면(독립 실행) 늘 보이는 것으로
document.addEventListener('moai:drawer', function(e) {
  sampleVisible = !!(e.detail.open && e.detail.page === 'sample');
  if (!sampleVisible && currentRecording) stopRecording();
});

function startRecording(name) {
  var sample = SAMPLES.filter(function(s) { return s.name === name; })[0];
  var targetDur = sampleDur(name) + EXTRA_SEC;

  setSlotStatus(name, '마이크 접근 중...');
  var btnRec = document.getElementById('btnRec-' + name);
  lockForRecording(name);

  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
  }).then(function(stream) {
    if (!sampleVisible) {                        // 마이크 허용을 기다리는 사이 탭을 벗어남 → 시작하지 않음
      stream.getTracks().forEach(function(t) { t.stop(); });
      setSlotStatus(name, '녹음 취소');
      unlockRecording();
      return;
    }
    micStream = stream;

    // AudioContext가 suspended면 resume
    if (actx.state === 'suspended') actx.resume();

    // AnalyserNode for realtime waveform
    var micSource = actx.createMediaStreamSource(stream);
    var analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    micSource.connect(analyser);

    var mediaRecorder = new MediaRecorder(stream);
    var chunks = [];

    currentRecording = {
      name: name,
      mediaRecorder: mediaRecorder,
      chunks: chunks,
      analyser: analyser,
      micSource: micSource,
      animFrame: null
    };

    mediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = function() {
      unlockRecording();
      processRecording(name, chunks);
      // Cleanup
      stream.getTracks().forEach(function(t) { t.stop(); });
      micSource.disconnect();
      micStream = null;
      if (currentRecording) {
        if (currentRecording.animFrame) cancelAnimationFrame(currentRecording.animFrame);
        if (currentRecording.countFrame) cancelAnimationFrame(currentRecording.countFrame);
      }
      currentRecording = null;
      btnRec.classList.remove('recording');
      btnRec.textContent = '🎙 녹음';
      // 카운트 바 정적 복원
      drawCountBarStatic(document.getElementById('cvCount-' + name));
    };

    // Clear rec canvas
    var cvRec = document.getElementById('cvRec-' + name);
    var ctxRec = cvRec.getContext('2d');
    ctxRec.clearRect(0, 0, cvRec.width, cvRec.height);

    btnRec.classList.add('recording');
    btnRec.textContent = '⏹ 중지';

    // 카운트인 시작 — 카운트 바에서 진행
    var cvCount = document.getElementById('cvCount-' + name);
    var countStartTime = actx.currentTime;
    for (var b = 0; b < COUNT_IN_BEATS; b++) {
      playClick(countStartTime + b * BEAT_SEC, b === 0);
    }
    setSlotStatus(name, '카운트인... (' + COUNT_IN_BEATS + '박)');

    currentRecording.countStartTime = countStartTime;
    drawCountBarProgress(cvCount, countStartTime);

    // 카운트인 종료 후 녹음 시작
    setTimeout(function() {
      if (!currentRecording || currentRecording.name !== name) return;

      mediaRecorder.start();
      currentRecording.recStartTime = actx.currentTime;
      setSlotStatus(name, '녹음 중... (' + targetDur.toFixed(1) + 's 후 자동 정지)');

      // 파형 캔버스에서 실시간 녹음 파형 (카운트인 오프셋 없음, 파형 전체 폭 = targetDur)
      drawRealtimeWaveform(cvRec, analyser, currentRecording.recStartTime, targetDur, 0, targetDur);

      // Auto-stop after target duration
      setTimeout(function() {
        if (currentRecording && currentRecording.name === name && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, targetDur * 1000);
    }, COUNT_IN_SEC * 1000);

  }).catch(function(err) {
    setSlotStatus(name, '마이크 접근 실패: ' + err.message);
    currentRecording = null;
    unlockRecording();
  });
}

function stopRecording() {
  if (!currentRecording) return;
  var rec = currentRecording;
  if (rec.mediaRecorder.state === 'recording') {
    // 녹음 중 → 정상 중지 (onstop에서 processRecording 호출)
    rec.mediaRecorder.stop();
  } else {
    // 카운트인 중 (아직 start 안됨) → 전체 정리
    if (rec.animFrame) cancelAnimationFrame(rec.animFrame);
    if (rec.countFrame) cancelAnimationFrame(rec.countFrame);
    if (micStream) {
      micStream.getTracks().forEach(function(t) { t.stop(); });
      micStream = null;
    }
    if (rec.micSource) rec.micSource.disconnect();
    var btnRec = document.getElementById('btnRec-' + rec.name);
    if (btnRec) {
      btnRec.classList.remove('recording');
      btnRec.textContent = '🎙 녹음';
    }
    drawCountBarStatic(document.getElementById('cvCount-' + rec.name));
    setSlotStatus(rec.name, '녹음 취소');
    currentRecording = null;
    unlockRecording();
  }
}

function processRecording(name, chunks) {
  setSlotStatus(name, '처리 중...');

  var blob = new Blob(chunks, { type: 'audio/webm' });
  var reader = new FileReader();
  reader.onload = function() {
    actx.decodeAudioData(reader.result).then(function(decoded) {
      var sr = decoded.sampleRate;
      var targetSamples = Math.round(sampleDur(name) * sr);   // 뼈대 길이 (초 기준 — 마이크 샘플레이트와 무관)
      var srcData = decoded.getChannelData(0);

      // 녹음 후처리: 로우컷 → 노멀라이즈
      applyHighPass(srcData, sr, 150);
      normalizeRMS(srcData);

      // Precise cut to original length
      var cutData = new Float32Array(targetSamples);
      var copyLen = Math.min(srcData.length, targetSamples);
      for (var i = 0; i < copyLen; i++) cutData[i] = srcData[i];
      // Rest stays 0 (silence padding if short)

      var cutBuffer = actx.createBuffer(1, targetSamples, sr);
      cutBuffer.getChannelData(0).set(cutData);

      recBuffers[name] = cutBuffer;
      recRawBuffers[name] = decoded;

      // 오프셋 슬라이더 활성화 + 초기값 리셋
      recOffsets[name] = 0;
      var offsetSlider = document.getElementById('offsetSlider-' + name);
      offsetSlider.disabled = false;
      offsetSlider.value = 0;
      document.getElementById('offsetLabel-' + name).textContent = '0ms';

      // 파형 그리기 (오프셋 0 상태 — 컷 + 루프 분석도 여기서 수행)
      redrawWithOffset(name);

      document.getElementById('btnPlay-' + name).disabled = false;
      var btnBoth = document.getElementById('btnBoth-' + name);   // 원본이 있을 때만 존재
      if (btnBoth) btnBoth.disabled = false;
      var btnLoop = document.getElementById('btnLoop-' + name);
      if (btnLoop) btnLoop.disabled = false;
      document.getElementById('btnAdopt-' + name).disabled = false;
      updateTabBadges();

    }).catch(function(err) {
      setSlotStatus(name, '디코딩 실패: ' + err.message);
    });
  };
  reader.readAsArrayBuffer(blob);
}

function adopt(name) {
  var buf = recBuffers[name];
  if (!buf) return;

  var sample = SAMPLES.filter(function(s) { return s.name === name; })[0];

  if (sample.loop) {
    // Run loop point analysis
    setSlotStatus(name, '루프 포인트 분석 중...');
    var data = buf.getChannelData(0);
    var sr = buf.sampleRate;
    var result = analyzeLoopPointForRecording(data, sr);

    loopPoints[name] = { start: result.loopStart, end: result.loopEnd };

    // XF bake
    var xfEl = document.getElementById('xfSlider-' + name);
    var fadeMs = xfEl ? parseInt(xfEl.value) : DEFAULT_FADE_MS;
    var xfBuf = buildXFBuffer(data, sr, result.loopStart, result.loopEnd, fadeMs, 'preLoop');

    if (xfBuf) {
      adoptedBuffers[name] = xfBuf;
      var infoEl = document.getElementById('loopInfo-' + name);
      infoEl.textContent = '루프: ' + result.loopStart.toFixed(4) + 's → ' +
        xfBuf._loopEnd.toFixed(4) + 's (XF ' + fadeMs + 'ms)';
      if (result.peaks.length > 0) {
        var best = result.peaks[result.peaks.length - 1];
        infoEl.textContent += ' | sim=' + best.height.toFixed(3);
      }
    } else {
      adoptedBuffers[name] = buf;
      document.getElementById('loopInfo-' + name).textContent = '루프: XF 실패, 원본 사용';
    }
  } else {
    adoptedBuffers[name] = buf;
  }

  setSlotStatus(name, '✅ 채택됨');
  var btnAdopt = document.getElementById('btnAdopt-' + name);
  btnAdopt.classList.add('adopted');
  btnAdopt.textContent = '✅ 채택됨';
  var btnBake = document.getElementById('btnBake-' + name);   // 게임 목소리 파일로 굽기 (recorder/bake.js)
  if (btnBake) btnBake.disabled = false;

  updateTabBadges();
  // 조작 탭 원본 모드 상태 갱신
  if (window.Moai && window.Moai.originalUpdateStatus) window.Moai.originalUpdateStatus();
}

// ========== Init ==========
window.addEventListener('DOMContentLoaded', function() {
  initAudio();
  // 원본 참고 음원은 선택 — 실패해도 UI는 만든다 (loadOriginal이 null로 처리)
  Promise.all(SAMPLES.map(loadOriginal)).then(function() {
    buildUI();
    if (window.initScrollTracks) window.initScrollTracks();
  });
});
