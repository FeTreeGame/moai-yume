// rhythm/guide.js — 가이드 비주얼: 리듬 쪽이 주는 값(패턴 · 지금 위치)을 어떻게 보일지 정하는 곳. 예전 루프 막대(rhythm/hud.js)와는 따로 선다
//   받아 쓰는 값: 지금 패턴 (G.noteTargetObj.patternAt) · 지금 위치 (G.currentBeat × 4 — 절대 칸). 막대의 모양 · 배치는 물려받지 않는다
//   모양 (GUIDE.style):
//     'line' = 중심선 — 음표 원의 중심을 지나는 흰 선분 + 정박(한 박 = 4칸)마다 눈금 + 진행 마커. 자기 배치(lineLayout)를 갖는다
//       배치: 줄 머리 없음 — 선분이 화면 가운데에 좌우 대칭으로 놓이고, 한 줄 = 16칸이 선분 전체를 쓴다
//         칸 c의 음표 자리 = 선분의 왼쪽 끝 + c × 칸 폭 (첫 칸이 왼쪽 끝 눈금, 오른쪽 끝 눈금 = 다음 줄의 첫 박)
//       진행 마커 (지금 어디인가): 선 위를 시간 그대로 지나가는 큰 원(윤곽) + 그 중심의 맥박 하트 (박마다 뛴다 — 마디의 첫 박은 더 크게)
//         맨 위에 그린다 (음표 원 위를 지날 때도 보이게). 줄 끝에서 다음 줄 처음으로 넘어간다
//         홀드 중에는 그 자리를 홀드의 꼬리 하트가 맡는다 (rhythm/feedback.js — 같은 박으로 뛴다: G.guideBeat). 화면 구석의 맥박 하트(js/pulse.js)는 마커가 보이는 동안 쉰다
//       줄 부각 (두 줄 이상 — 세션): 진행 마커가 있는 줄은 그대로, 나머지 줄은 어둡게 (GUIDE.rowDim). 어두운 줄을 먼저 다 그리고 그 위에 지금 줄을 그린다
//         (위아래로 겹쳐도 지금 줄이 위) — rhythm/bridge.js가 줄마다 한 번씩 그리게 한다: G.guideRows · G.guidePass · G.guideRowOK(줄) · G.guideA(불투명도)
//     'bar' = 예전 루프 막대 (rhythm/hud.js G.renderGuideBars — 디버그용 보기: 판정 띠 · 입력 위치 등. 자기 배치 G.barLayout)
//   G.guideLayout(len) = 지금 모양의 배치 — 그 위에 얹히는 층(음표 원 rhythm/reveal.js · 수렴 윤곽 rhythm/approach.js)이 이것을 읽는다
//     돌려주는 모양은 두 배치가 같다: { bgX, bgW, slotW, rowH, gap, rows, lead, row, noteR, rowY(r) } — 칸 c의 x = bgX + (lead + c − 줄 × row) × slotW
//   그리기 = rhythm/bridge.js M.renderBars: G.renderGuide → 드러내기 → 수렴 윤곽 → G.renderGuideMarker
//   값은 GUIDE 한 곳 (잠정). 모양 바꾸기: G.guideStyle('line' | 'bar') — 개발 탭 버튼
(function() {
  'use strict';
  var G = window.G;
  var ROW = 16;
  var GUIDE = {
    style: 'line',
    layout: { width: 0.7, maxWidth: 840, rowH: 22, gap: 6, bottom: 32 },   // 선분의 폭 (화면 폭의 비 · 상한) · 줄 높이 · 줄 사이 · 아래 여백 (1280×960 논리 좌표 — 예전 14: 진행 마커가 테두리 띠에 걸리지 않게 올림 — 38 · 28을 거쳐 32. 세션의 기회 · 단계 표시는 이 배치를 읽어 따라온다 — rhythm/session.js)
    line: { color: 'rgba(255,255,255,0.9)', width: 4, tick: 16, tickWidth: 3 },   // width = 선 굵기, tick = 눈금 길이 (선을 가로지르는 세로), tickWidth = 눈금 굵기
    // 진행 마커: 바깥 = 분홍 원의 윤곽 (두께가 있는 선), 안 = 흰 하트 (음표 · 판정에 색이 있으니 마커의 하트는 흰색). 둘이 같은 박에 같이 뛴다 (바깥은 bounce만큼만)
    //   (예전: 바깥은 흰 원의 얇은 윤곽 · 안은 연두 하트 — 줄 · 눈금 · 음표 테두리가 다 흰색이라 마커가 잘 보이지 않았다. 분홍 = 위쪽 HUD 문구의 색. 바깥을 하트 윤곽으로도 해 봤다 — 원으로 돌아옴)
    //   big = 바깥 원의 반지름 (음표 원의 몇 배) · bigWidth = 윤곽의 두께 (예전 2.5 — 그보다 두껍되 지저분하지 않게) · bounce = 안쪽 하트가 뛰는 정도의 몇 배로 바깥이 뛰나
    //   pulse = 뛰는 박의 기준: 'beat' 정박 (4분음표 — 마디의 첫 박은 더 크게) | 'kick' 곡의 킥 (킥이 없으면 정박으로). 홀드의 꼬리 하트도 같은 박을 쓴다 (G.guideBeat)
    marker: { big: 2.0, bigWidth: 3.5, color: 'rgb(255,170,190)', edge: 'rgba(0,0,0,0.75)', bounce: 0.6, pulse: 'beat',
      tap: { len: 1.2, squeeze: 0.22, swell: 0.5 },     // 입력이 들어온 순간의 움찔 (자체 애니메이션): 길이 (칸) · 바깥이 줄어드는 정도 · 안쪽 하트가 커지는 정도
      heart: { size: 0.9, amp: 0.35, first: 0.6, fall: 0.55, color: 'pink', colors: { white: '#ffffff', pink: 'rgb(255,60,110)', green: '#39ff14' } } },   // 안쪽 하트: 크기 (음표 원 반지름의 배수) · 박 · 첫 박에 커지는 정도 · 가라앉는 길이 (박의 비) · 색
    rowDim: 0.45,                                      // 지금 줄이 아닌 줄의 불투명도 (두 줄 이상일 때)
  };

  function lineLayout(len) {
    var P = GUIDE.layout;
    var bgW = Math.min(G.W * P.width, P.maxWidth), bgX = G.W / 2 - bgW / 2;
    var rows = Math.max(1, Math.ceil(len / ROW)), slotW = bgW / ROW;
    var top0 = G.H - P.bottom - rows * P.rowH - (rows - 1) * P.gap;
    // noteR = 음표 원의 반지름: 이웃과 겹치지 않는 가장 큰 원 (옆 칸 · 위아래 줄과 맞닿을 뿐 포개지지 않는다)
    return { bgX: bgX, bgW: bgW, slotW: slotW, rowH: P.rowH, gap: P.gap, rows: rows, lead: 0, row: ROW, noteR: Math.min(slotW, P.rowH + P.gap) / 2,
      rowY: function(r) { return top0 + r * (P.rowH + P.gap); } };
  }
  var barLayout = G.guideLayout;                 // 예전 막대의 배치 (rhythm/hud.js가 먼저 로드된다)
  G.barLayout = barLayout;
  G.guideLayout = function(len) { return GUIDE.style === 'line' || !barLayout ? lineLayout(len) : barLayout(len); };
  G.guideStyle = function(v) { if (v === 'line' || v === 'bar') GUIDE.style = v; return GUIDE.style; };

  // 지금 패턴의 길이 (칸) — 없으면 입력 표시 길이
  function lenNow(P) {
    var tb = G.noteTargetObj, pat = tb && tb.patternAt ? tb.patternAt(Math.floor(P)) : null;
    return pat ? pat.length : G.noteInputLen;
  }

  // ── 줄 부각 (rhythm/bridge.js가 쓴다) ──
  G.guidePass = null;                            // 지금 그리는 줄 { row } — 없으면 전부
  G.guideBase = 1;                               // 지금 그리는 것의 바탕 불투명도 (막대 전체 × 줄)
  G.guideRowOK = function(row) { return !G.guidePass || G.guidePass.row === row; };
  G.guideA = function(v) { return v * G.guideBase; };   // 층이 불투명도를 직접 넣을 때 바탕을 곱한다
  // 줄 수와 진행 마커가 있는 줄 — 중심선 모양에서 두 줄 이상일 때만 (아니면 null = 한 번에 그린다)
  G.guideRows = function() {
    if (GUIDE.style !== 'line' || G.guideStill || G.currentBeat == null) return null;
    var P = G.currentBeat * 4, len = lenNow(P);
    if (!len) return null;
    var L = lineLayout(len);
    if (L.rows < 2) return null;
    var c = ((P % len) + len) % len;
    return { rows: L.rows, active: Math.min(L.rows - 1, Math.floor(c / L.row)), dim: GUIDE.rowDim };
  };

  // ── 박 (맥박 하트 · 홀드의 꼬리 하트가 같이 쓴다): v = 0(가라앉음) ~ 1(박의 순간), first = 마디의 첫 박 ──
  G.guideBeat = function() {
    var H = GUIDE.marker.heart, b = G.currentBeat == null ? 0 : G.currentBeat, k = Math.floor(b), since = b - k, first = ((k % 4) + 4) % 4 === 0;
    if (GUIDE.marker.pulse === 'kick' && G.guideFx && G.guideFx.kickNow) {      // 킥 기준: 마지막 킥에서 지난 박 (킥이 끊겼으면 — 간격의 2.5배 — 정박으로)
      var kk = G.guideFx.kickNow();
      if (kk && b * 4 >= kk.P && b * 4 - kk.P < kk.gap * 2.5) { since = (b * 4 - kk.P) / 4; first = kk.accent; }
    }
    var t = Math.min(1, since / H.fall), v = 1 - (1 - (1 - t) * (1 - t) * (1 - t));
    return { v: v, first: first, scale: 1 + (first ? H.first : H.amp) * v };
  };
  // 하트 모양 (s = 반 폭쯤, 가운데 = (x, y)) — 판정 피드백(rhythm/feedback.js)과 같은 모양
  G.guideHeart = function(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.15, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  };
  G.guideHeartSize = function() { return GUIDE.marker.heart.size; };   // 맥박 하트의 크기 (음표 원 반지름의 배수) — 홀드 중의 꼬리 하트도 이 크기 (같은 하트가 등급 색으로 물드는 것처럼)
  G.guideHeartColor = function(v) { var H = GUIDE.marker.heart; if (H.colors[v]) H.color = v; return H.color; };

  G.renderGuide = function(ctx) {
    if (GUIDE.style !== 'line') { if (G.renderGuideBars) G.renderGuideBars(ctx); return; }
    var len = lenNow(G.guideStill || G.currentBeat == null ? 0 : G.currentBeat * 4);
    if (!len) return;
    var L = lineLayout(len), S = GUIDE.line, x0 = L.bgX, x1 = L.bgX + L.row * L.slotW;
    ctx.save();
    ctx.fillStyle = S.color;
    for (var r = 0; r < L.rows; r++) {
      if (!G.guideRowOK(r)) continue;
      var cy = L.rowY(r) + L.rowH / 2;
      ctx.fillRect(x0, cy - S.width / 2, x1 - x0, S.width);
      for (var c = 0; c <= L.row; c += 4) ctx.fillRect(x0 + c * L.slotW - S.tickWidth / 2, cy - S.tick / 2, S.tickWidth, S.tick);
    }
    ctx.restore();
  };

  // 진행 마커 — 중심선 모양일 때만. 지금 위치(절대 칸, 소수)의 자리에
  //   첫 박 전 (P < 0 — 곡은 조금 뒤의 시각에 첫 박이 오도록 예약된다): 자리를 막대 길이로 돌려 감으면 막대의 끝이 된다
  //     앞에서 이어지던 것이면 (곡이 도는 중에 세션의 박으로 넘어감 — 마커가 끝을 향해 가던 중) 그 끝이 맞는 자리 → 그린다
  //     새로 시작하는 것이면 (곡이 없다가 시작 · 멈췄다 다시 시작) 끝에서 나타났다가 첫 박에 맨 앞으로 튄다 → 첫 박까지 그리지 않는다
  //     '이어지던 것' = 방금까지 마커를 그리고 있었다 (markerAt — 마지막으로 그린 때에서 MARK_GAP 안)
  var markerAt = -1e9, MARK_GAP = 200;   // ms
  G.renderGuideMarker = function(ctx) {
    if (GUIDE.style !== 'line' || G.guideStill || G.currentBeat == null) return;
    var P = G.currentBeat * 4, len = lenNow(P);
    if (!len) return;
    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (P < 0 && now - markerAt > MARK_GAP) return;
    markerAt = now;
    var L = lineLayout(len), M = GUIDE.marker, H = M.heart;
    var c = ((P % len) + len) % len, row = Math.min(L.rows - 1, Math.floor(c / L.row));
    var x = L.bgX + (c - row * L.row) * L.slotW, y = L.rowY(row) + L.rowH / 2;
    // 마지막 입력에서 얼마나 지났나 → 움찔 (0 = 가라앉음 ~ 1 = 입력의 순간)
    var ms = G.noteInputMarks || [], last = ms.length ? ms[ms.length - 1] : null, age = last ? P - last.abs : Infinity;
    var k = age >= 0 && age < M.tap.len ? Math.pow(1 - age / M.tap.len, 2) : 0;
    ctx.save();
    // 바깥 원의 중심은 줄 위에 (원이 줄에 걸쳐 지나간다). 안쪽 하트는 기준점을 줄의 높이에 그대로 — 입력 순간의 흰 하트 · 홀드의 꼬리 하트(rhythm/feedback.js)와 같은 높이
    var bt = G.guideBeat();
    ctx.beginPath(); ctx.arc(x, y, L.noteR * M.big * (1 - M.tap.squeeze * k) * (1 + (bt.scale - 1) * M.bounce), 0, Math.PI * 2);   // 입력의 움찔 · 박의 바운스
    ctx.strokeStyle = M.edge; ctx.lineWidth = M.bigWidth + 2; ctx.stroke();        // 어두운 받침 (밝은 배경 위에서도 보이게)
    ctx.strokeStyle = M.color; ctx.lineWidth = M.bigWidth; ctx.stroke();
    if (!G.guideHoldLive) {                        // 안쪽 하트 (홀드 중에는 꼬리 하트가 이 자리)
      var si = L.noteR * H.size * bt.scale * (1 + M.tap.swell * k);
      G.guideHeart(ctx, x, y, si);
      ctx.fillStyle = H.colors[H.color]; ctx.fill();
      ctx.strokeStyle = M.edge; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  };
})();
