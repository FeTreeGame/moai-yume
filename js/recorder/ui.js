// ========== Tab ==========
// 전역 의존: SAMPLES, adoptedBuffers, recBuffers (recorder.js)
var activeTab = null;

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
    ['header-', 'wave-', 'loopInfo-', 'sliders-', 'actions-'].forEach(function(prefix) {
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
    if (adoptedBuffers[s.name]) {
      badge.textContent = '✓';
      badge.className = 'badge done';
    } else if (recBuffers[s.name]) {
      badge.textContent = '녹음';
      badge.className = 'badge';
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
    btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
    btn.setAttribute('data-name', sample.name);
    btn.innerHTML = sample.label + '<span class="badge" id="badge-' + sample.name + '"></span>';
    btn.onclick = function() { switchTab(sample.name); };
    tabBar.appendChild(btn);
  });

  var page = document.getElementById('drawerSample');
  var scrollContent = document.getElementById('sampleScrollContent');
  var slidersContainer = document.getElementById('sampleSliders');
  var actionsContainer = document.getElementById('sampleActions');

  // 이전 동적 요소 제거
  var old = scrollContent.querySelectorAll('.slot-header, .slot-wave, .loop-info');
  for (var oi = 0; oi < old.length; oi++) old[oi].remove();
  if (slidersContainer) slidersContainer.innerHTML = '';
  if (actionsContainer) actionsContainer.innerHTML = '';

  SAMPLES.forEach(function(sample, idx) {
    var show = idx === 0 ? '' : 'none';
    var orig = origBuffers[sample.name];   // 원본 참고 음원 (없을 수 있음)
    var durText = sample.dur.toFixed(1) + 's';

    // 헤더 → slidersContainer 앞에 삽입
    var header = document.createElement('div');
    header.className = 'slot-header';
    header.id = 'header-' + sample.name;
    header.style.display = show;
    header.innerHTML =
      '<span class="slot-name">' + sample.label + '<span class="role">' + sample.role + '</span></span>' +
      '<span class="slot-meta">' + durText + (sample.loop ? ' 🔁루프' : '') + '</span>';
    scrollContent.insertBefore(header, slidersContainer);

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
      actions.innerHTML =
        (orig ? '<button class="btn-listen" id="btnListen-' + sample.name + '" onclick="listenOriginal(\'' + sample.name + '\')">▶ 원본</button>' : '') +
        '<button class="btn-record" id="btnRec-' + sample.name + '" onclick="toggleRecord(\'' + sample.name + '\')">🎙 녹음</button>' +
        '<button class="btn-play" id="btnPlay-' + sample.name + '" onclick="playRecorded(\'' + sample.name + '\')" disabled>▶ 내 녹음</button>' +
        (orig ? '<button class="btn-play" id="btnBoth-' + sample.name + '" onclick="playBoth(\'' + sample.name + '\')" disabled style="background:#8e6b2e;">▶ 비교</button>' : '') +
        (sample.loop ? '<button class="btn-play" id="btnLoop-' + sample.name + '" onclick="playLoop(\'' + sample.name + '\')" disabled style="background:#6a4c93;">🔁 루프</button>' : '') +
        '<button class="btn-adopt" id="btnAdopt-' + sample.name + '" onclick="adopt(\'' + sample.name + '\')" disabled>✅ 채택</button>' +
        '<button class="btn-adopt" id="btnBake-' + sample.name + '" onclick="bakeVoice(\'' + sample.name + '\')" disabled title="채택본을 게임 목소리 파일로 (assets/voice/)">💾 굽기</button>' +
        '<span class="slot-status" id="status-' + sample.name + '"></span>';
      actionsContainer.appendChild(actions);
    }

    // 카운트 바 초기 렌더 (박 위치 표시)
    drawCountBarStatic(document.getElementById('cvCount-' + sample.name));

    if (orig) {
      // 원본 참고 파형 (카운트인 제외, 뼈대 길이 + 뒤 여유)
      var cv = document.getElementById('cvOrig-' + sample.name);
      clearCanvas(cv);
      var recTargetDur = sample.dur + EXTRA_SEC;
      drawWaveform(cv, orig, '#555', 0.7, recTargetDur);

      // loop 샘플이면 원본에 루프 분석 적용 + 마커 렌더 + 결과 표시
      if (sample.loop) {
        var origData = orig.getChannelData(0);
        var origResult = analyzeLoopPoint(origData, orig.sampleRate);
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
        cvCtx.fillStyle = '#4caf50';
        cvCtx.font = 'bold 11px sans-serif';
        cvCtx.fillText('S', lsX + 3, 12);
        // loopEnd 마커 (빨강)
        var leX = Math.round(cvW * origResult.loopEnd / totalSec);
        cvCtx.strokeStyle = '#f44336';
        cvCtx.lineWidth = 2;
        cvCtx.beginPath();
        cvCtx.moveTo(leX, 0);
        cvCtx.lineTo(leX, cvH);
        cvCtx.stroke();
        cvCtx.fillStyle = '#f44336';
        cvCtx.font = 'bold 11px sans-serif';
        cvCtx.fillText('E', leX + 3, 12);
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
        var infoEl = document.getElementById('loopInfo-' + sample.name);
        infoEl.textContent = '원본 루프: ' + origResult.loopStart.toFixed(4) + 's → ' +
          origResult.loopEnd.toFixed(4) + 's';
        if (origResult.peaks.length > 0) {
          var best = origResult.peaks[origResult.peaks.length - 1];
          infoEl.textContent += ' | sim=' + best.height.toFixed(3);
        }
      }
    }
  });

  activeTab = SAMPLES[0].name;
}
