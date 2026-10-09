// ========== Tab ==========
// 전역 의존: SAMPLES, adoptedBuffers, recBuffers (recorder.js)
var activeTab = null;

// 개발 공간(?dev)인가 — 비교 · 루프 · 굽기 버튼과 분석 값은 거기서만 (js/state.js M.dev)
function recDev() { return !!(window.Moai && window.Moai.dev); }
// 소리 이름 (탭 버튼): 역할의 첫 낱말 — 뚜~ · 떽! · 웡~
function sampleWord(sample) { return String(sample.role || sample.label).split(' ')[0]; }
function isLoopSample(name) { return SAMPLES.some(function(s) { return s.name === name && s.loop; }); }
// 게임이 쓰는 반복 구간 (데이터 파일 voice — 굽기가 저장한 지점). 없으면 null
function gameLoopOf(name) {
  var d = window.MoaiData && window.MoaiData.voice, v = d && d[name];
  return v && v.loopStart != null ? { start: v.loopStart, end: v.loopEnd } : null;
}
// 루프 선의 이름표 (뚜~): 파형 위 두 선에 붙은 '시작' · '끝' — 선에 붙어 있어 따로 범례 줄이 없다 (소리마다 줄 수가 같음)
//   루프 = 게임에서 누르는 동안 이 구간이 이어지다가, 떼면 웡~으로 넘어간다
//   둘 다 구간 안쪽에: 시작 = 선의 오른쪽 · 위, 끝 = 선의 왼쪽 · 아래 (바깥쪽에 두면 파형 가장자리에서 잘리고, 위아래로 갈라 서로 겹치지 않게)
//   자리 = 파형 폭에 대한 비율 (선을 그린 곳이 넘김). 캔버스에 글자를 그리지 않는 이유: 캔버스가 가로로 눌려 글자가 찌그러진다
function setLoopLabels(name, startFrac, endFrac) {
  var ok = function(f) { return f != null && f >= 0 && f <= 1; };
  var s = document.getElementById('labS-' + name), e = document.getElementById('labE-' + name);
  if (s) { s.style.display = ok(startFrac) ? 'block' : 'none'; if (ok(startFrac)) s.style.left = (startFrac * 100) + '%'; }
  if (e) { e.style.display = ok(endFrac) ? 'block' : 'none'; if (ok(endFrac)) e.style.right = ((1 - endFrac) * 100) + '%'; }
}
// 이름표를 평소 자리로: 녹음이 있으면 내 녹음의 루프 구간(시작 보정만큼 옮긴 자리), 없으면 샘플의 구간, 루프가 없는 소리면 숨김
//   (샘플을 루프로 듣는 동안은 샘플의 구간을 임시로 띄운다 — draw.js drawLoopPlaybackIndicator marks. 멈추면 여기로 돌아옴)
function restoreLoopLabels(name) {
  if (!isLoopSample(name)) { setLoopLabels(name, null, null); return; }
  var total = sampleDur(name) + EXTRA_SEC;
  var lp = recBuffers[name] ? loopPoints[name] : null, off = (recOffsets[name] || 0) / 1000;
  if (lp) { setLoopLabels(name, (off + lp.start) / total, (off + lp.end) / total); return; }
  var gl = recBuffers[name] ? null : gameLoopOf(name);
  if (gl) setLoopLabels(name, gl.start / total, gl.end / total); else setLoopLabels(name, null, null);
}
// 루프 분석 값 (구간의 시각 · 유사도 등) — 개발 공간(?dev)에서만 파형 아래 한 줄. 평소엔 줄이 없다
function setLoopDevInfo(name, dev) {
  var el = document.getElementById('loopInfo-' + name);
  if (el) el.textContent = recDev() && dev ? dev : '';
}

function switchTab(name) {
  activeTab = name;
  // 탭 버튼 활성화
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-name') === name);
  }
  // 전 영역 표시/숨김
  SAMPLES.forEach(function(s) {
    var show = s.name === name ? '' : 'none';
    ['wave-', 'loopInfo-', 'sliders-', 'actions-'].forEach(function(prefix) {
      var el = document.getElementById(prefix + s.name);
      if (el) el.style.display = show;
    });
  });
  // 스크롤 트랙 갱신 (레이아웃 반영 후)
  requestAnimationFrame(function() {
    if (window.updateScrollTracks) window.updateScrollTracks();
  });
}

function updateTabBadges() {
  SAMPLES.forEach(function(s) {
    var badge = document.getElementById('badge-' + s.name);
    if (!badge) return;
    if (recBuffers[s.name] && adoptedTake[s.name] !== recBuffers[s.name]) {
      badge.textContent = '●';            // 아직 반영하지 않은 녹음이 있음 (채택 · 갱신 전)
      badge.className = 'badge';
    } else if (adoptedBuffers[s.name]) {
      badge.textContent = '✓';            // 채택한 소리를 쓰는 중
      badge.className = 'badge done';
    } else {
      badge.textContent = '';
      badge.className = 'badge';
    }
  });
}

function setSlotStatus(name, msg) {
  document.getElementById('status-' + name).textContent = msg;
}

// ========== UI Build ==========
// 전역 의존: SAMPLES, EXTRA_SEC, DEFAULT_FADE_MS, origBuffers (recorder.js)
//            drawCountBarStatic, clearCanvas, drawWaveform (draw.js)
//            analyzeLoopPoint (dsp.js)
function buildUI() {
  // 탭 바 생성
  var tabBar = document.getElementById('tabBar');
  tabBar.innerHTML = '';

  SAMPLES.forEach(function(sample, idx) {
    var btn = document.createElement('button');
    btn.className = 'tab-btn beat-pattern-btn' + (idx === 0 ? ' active' : '');
    btn.setAttribute('data-name', sample.name);
    btn.innerHTML = sampleWord(sample) + '<span class="badge" id="badge-' + sample.name + '"></span>';
    btn.onclick = function() { switchTab(sample.name); };
    tabBar.appendChild(btn);
  });

  var page = document.getElementById('drawerSample');
  var scrollContent = document.getElementById('sampleScrollContent');
  var slidersContainer = document.getElementById('sampleSliders');
  var actionsContainer = document.getElementById('sampleActions');

  // 이전 동적 요소 제거
  var old = scrollContent.querySelectorAll('.slot-wave, .loop-info');
  for (var oi = 0; oi < old.length; oi++) old[oi].remove();
  if (slidersContainer) slidersContainer.innerHTML = '';
  if (actionsContainer) actionsContainer.innerHTML = '';

  SAMPLES.forEach(function(sample, idx) {
    var show = idx === 0 ? '' : 'none';
    var orig = origBuffers[sample.name];   // 원본 참고 음원 (없을 수 있음)

    // 파형 → slidersContainer 앞에 삽입
    var wave = document.createElement('div');
    wave.className = 'slot-wave';
    wave.id = 'wave-' + sample.name;
    wave.style.display = show;
    wave.innerHTML =
      '<div class="count-bar-wrap">' +
        '<canvas id="cvCount-' + sample.name + '" width="600" height="20"></canvas>' +
      '</div>' +
      '<div class="waveform-wrap">' +
        '<canvas id="cvOrig-' + sample.name + '" width="600" height="80"></canvas>' +
        '<canvas id="cvRec-' + sample.name + '" width="600" height="80" style="pointer-events:none;"></canvas>' +
        '<canvas id="cvPlay-' + sample.name + '" width="600" height="80" style="pointer-events:none;"></canvas>' +
        '<span class="wave-lab lab-start" id="labS-' + sample.name + '">시작</span>' +
        '<span class="wave-lab lab-end" id="labE-' + sample.name + '">끝</span>' +
      '</div>';
    scrollContent.insertBefore(wave, slidersContainer);

    // 정보 → slidersContainer 앞에 삽입
    var info = document.createElement('div');
    info.className = 'loop-info';
    info.id = 'loopInfo-' + sample.name;
    info.style.display = show;
    scrollContent.insertBefore(info, slidersContainer);

    // 슬라이더 → 고정 영역 (스크롤 밖)
    if (slidersContainer) {
      var sliders = document.createElement('div');
      sliders.className = 'slot-sliders';
      sliders.id = 'sliders-' + sample.name;
      sliders.style.display = idx === 0 ? '' : 'none';
      sliders.innerHTML =
        '<div class="xf-row offset-row" id="offsetRow-' + sample.name + '">' +
          '<span>시작 보정:</span>' +
          '<input type="range" id="offsetSlider-' + sample.name + '" min="0" max="500" value="0" disabled ' +
            'oninput="onOffsetChange(\'' + sample.name + '\', this.value)" ' +
            'onchange="onOffsetCommit(\'' + sample.name + '\', this.value)">' +
          '<span id="offsetLabel-' + sample.name + '">0ms</span>' +
        '</div>';
      slidersContainer.appendChild(sliders);
    }

    // 버튼 → 고정 영역 (스크롤 밖)
    if (actionsContainer) {
      var actions = document.createElement('div');
      actions.className = 'slot-controls';
      actions.id = 'actions-' + sample.name;
      actions.style.display = idx === 0 ? '' : 'none';
      // 버튼 (2열): [▶ 샘플][루프] / [녹음하기 — 한 줄 전체, 가장 큰 버튼] / [채택][다시]
      //   아래 둘은 누르면 한 번 더 묻는다 — 가운데가 "…할까요?" 말풍선, 아래 둘이 예 / 아니오 (recorder.js askSlot)
      //   글자·켜짐은 녹음 칸과 채택 상태에서 한 곳이 정한다 (recorder.js refreshSlot). 비교 · 굽기는 개발 공간(?dev)에서만
      var dev = recDev();
      var q = "'" + sample.name + "'";
      actions.innerHTML =
        (orig ? '<button class="ctrl-btn btn-listen" id="btnListen-' + sample.name + '" onclick="listenOriginal(' + q + ')">▶ 샘플</button>' : '<span></span>') +
        '<button class="ctrl-btn btn-loop" id="btnLoopSw-' + sample.name + '" onclick="toggleLoopPreview()">루프</button>' +
        '<button class="ctrl-btn btn-record slot-main" id="btnRec-' + sample.name + '" onclick="slotMain(' + q + ')">녹음하기</button>' +
        '<button class="ctrl-btn btn-adopt" id="btnAdopt-' + sample.name + '" onclick="slotLeft(' + q + ')" disabled>채택</button>' +
        '<button class="ctrl-btn btn-redo" id="btnRedo-' + sample.name + '" onclick="slotRight(' + q + ')" disabled>다시</button>' +
        (dev && orig ? '<button class="ctrl-btn btn-play" id="btnBoth-' + sample.name + '" onclick="playBoth(' + q + ')" disabled>비교</button>' : '') +
        (dev ? '<button class="ctrl-btn btn-adopt" id="btnBake-' + sample.name + '" onclick="bakeVoice(' + q + ')" disabled title="채택본을 게임 목소리 파일로 (assets/voice/)">굽기</button>' : '') +
        '<span class="slot-status" id="status-' + sample.name + '"></span>';
      actionsContainer.appendChild(actions);
    }

    // 카운트 바 초기 렌더 (박 위치 표시)
    drawCountBarStatic(document.getElementById('cvCount-' + sample.name));

    drawSampleWave(sample);
    if (typeof refreshSlot === 'function') refreshSlot(sample.name);
  });

  activeTab = SAMPLES[0].name;
}

// 샘플(게임의 기본 소리) 파형 + 루프 선 · 범례 — 처음 그릴 때와 '다시'(녹음 칸 비움) 뒤에
function drawSampleWave(sample) {
  var orig = origBuffers[sample.name];
  setLoopLabels(sample.name, null, null);
  if (orig) {
    // 원본 참고 파형 (카운트인 제외, 뼈대 길이 + 뒤 여유)
    var cv = document.getElementById('cvOrig-' + sample.name);
    clearCanvas(cv);
    var recTargetDur = sample.dur + EXTRA_SEC;
    drawWaveform(cv, orig, '#555', 0.7, recTargetDur);

    // loop 샘플이면 원본에 루프 분석 적용 + 마커 렌더 + 결과 표시
    if (sample.loop) {
      var origData = orig.getChannelData(0);
      // 기본 소리의 반복 구간 = 게임이 실제로 쓰는 지점 (데이터 파일 voice). 없을 때만 분석
      var gl = gameLoopOf(sample.name);
      var origResult = gl ? { loopStart: gl.start, loopEnd: gl.end, peaks: [] } : analyzeLoopPoint(origData, orig.sampleRate);
      var cvCtx = cv.getContext('2d');
      var cvW = cv.width, cvH = cv.height;
      var totalSec = recTargetDur;
      // loopStart 마커 (초록)
      var lsX = Math.round(cvW * origResult.loopStart / totalSec);
      cvCtx.strokeStyle = '#4caf50';
      cvCtx.lineWidth = 2;
      cvCtx.beginPath();
      cvCtx.moveTo(lsX, 0);
      cvCtx.lineTo(lsX, cvH);
      cvCtx.stroke();
      // loopEnd 마커 (빨강)
      var leX = Math.round(cvW * origResult.loopEnd / totalSec);
      cvCtx.strokeStyle = '#f44336';
      cvCtx.lineWidth = 2;
      cvCtx.beginPath();
      cvCtx.moveTo(leX, 0);
      cvCtx.lineTo(leX, cvH);
      cvCtx.stroke();
      setLoopLabels(sample.name, lsX / cvW, leX / cvW);
      // 피크 후보들 (노랑 점선)
      for (var pi = 0; pi < origResult.peaks.length; pi++) {
        var pk = origResult.peaks[pi];
        var pkX = Math.round(cvW * pk.time / totalSec);
        var isSelected = (pi === origResult.peaks.length - 1);
        cvCtx.strokeStyle = isSelected ? '#ffeb3b' : 'rgba(255,235,59,0.4)';
        cvCtx.lineWidth = isSelected ? 2 : 1;
        cvCtx.setLineDash(isSelected ? [] : [4, 4]);
        cvCtx.beginPath();
        cvCtx.moveTo(pkX, 0);
        cvCtx.lineTo(pkX, cvH);
        cvCtx.stroke();
        cvCtx.setLineDash([]);
      }
      // 정보 표시
      var best = origResult.peaks.length > 0 ? origResult.peaks[origResult.peaks.length - 1] : null;
      setLoopDevInfo(sample.name, '샘플 ' + origResult.loopStart.toFixed(2) + '~' + origResult.loopEnd.toFixed(2) + (best ? ' · sim=' + best.height.toFixed(3) : ''));
    }
  }
}
