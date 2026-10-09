// rhythm/approach.js — 수렴 윤곽: 음표마다 칠 때를 '윤곽에 닿는 순간'으로 알린다 (시험 — 실제로 어떻게 보이는지 확인하는 단계)
//   음표가 오기 APPROACH.lead칸 전에 그 음표 자리에 큰 윤곽이 생기고, 서서히 작아져 음표 원의 가장자리에 닿는 순간 = 그 음표의 시각
//     음표 원 = 드러내기(rhythm/reveal.js)가 그리는 원 — 크기는 배치의 noteR (이웃과 겹치지 않는 가장 큰 원). 닿는 곳이 곧 그 원의 가장자리
//   닿는 순간: 짧은 이펙트 (hit — 원 안이 번쩍이고 고리 하나가 밖으로 퍼지며 사라진다. 음표가 나타날 때의 퍼지는 고리와 짝)
//   닿은 뒤: 그 원의 가장자리가 '닿은 테두리'(landed — 수렴하던 윤곽과 다른 색 · 굵기)로 남는다 — 그 단위(패턴 한 바퀴)가 끝날 때까지
//     (같은 자리에 다음 단위의 윤곽이 다가오기 시작하면 그 자리의 닿은 테두리는 먼저 지운다 — 새로 닿는 순간이 보이게)
//   사각 모양이면 닿는 곳 = 칸 그 자체 (음표 원이 아니라 — 비교용)
//   자리 = 지금 가이드 모양의 배치가 그 음표에 주는 곳 (G.guideLayout — rhythm/guide.js. 줄 머리가 있는 배치여도 본문 자리만)
//     다음 단위의 첫 음표도 그 단위의 본문 자리에 미리 생긴다 → 루프가 도는 순간의 첫 박이 예고된다
//   대상 = 플레이어가 칠 차례의 음표만 (G.core.judgedAt — 세션의 듣는 차례 · 필드의 드러내는 루프처럼 패턴을 제시하는 동안에는 그리지 않는다:
//     음표가 아직 나타나지도 않았는데 윤곽이 먼저 좁혀 드는 일이 없게). 닿은 테두리도 같다
//   꾸밈: 다가오는 윤곽마다 G.guideFx.contour(ctx, 자리, 지금 크기의 배수, 불투명도)를 부른다 — 윤곽과 같이 생기고 같이 좁혀 드는 점선 테 (rhythm/guide-fx.js. 없으면 윤곽만)
//   모양 = APPROACH.shape: 'circle' | 'square' | 'off'
//   그리기 = 가이드 막대 · 드러내기 뒤 같은 캔버스에 (rhythm/bridge.js M.renderBars). 시계 = 리듬 코어의 박 시계 (G.currentBeat × 4)
//   값은 APPROACH 한 곳 (잠정). 바꾸기: G.approach.set('circle' | 'square' | 'off') — 개발 탭 버튼
(function() {
  'use strict';
  var G = window.G;
  var APPROACH = {
    shape: 'circle',
    lead: 4,          // 몇 칸 전에 생기는가 (4칸 = 한 박)
    grow: 1.4,        // 생길 때의 크기 = 닿을 윤곽의 (1 + grow)배
    width: 3,         // 수렴하는 윤곽의 선 굵기
    alpha: [0.4, 1],  // 생길 때 → 닿을 때의 불투명도
    landed: { color: '#ffffff', width: 3, alpha: 0.9 },   // 닿은 테두리 (수렴하는 윤곽과 구별되게 — 흰색)
    hit: { len: 1.5, spread: 0.7, flash: 0.6 },           // 닿는 순간의 이펙트: len = 길이 (칸), spread = 고리가 퍼지는 정도 (원의 몇 배만큼 더), flash = 번쩍임의 세기
  };
  var COLOR = { tap: '#ffe680', attack: '#7fe8ff', release: '#d0a8ff' };   // 수렴하는 윤곽 = 막대의 음표 색(금 · 청록 · 보라)을 밝게

  function render(ctx) {
    if (APPROACH.shape === 'off' || G.guideStill || !G.guideLayout || G.currentBeat == null) return;
    var tb = G.noteTargetObj;
    if (!tb || !tb.patternAt) return;
    var P = G.currentBeat * 4;
    var A = G.guideA || function(v) { return v; }, rowOK = G.guideRowOK || function() { return true; };   // 줄 부각 (rhythm/guide.js)
    // 패턴 = 판정용 (G.core.judgePatternAt) — 한 박 앞을 내다보므로, 아직 시작하지 않은 루프도 읽어야 한다 (그리기용은 그 루프를 비워 준다: 필드의 평가 첫 루프 — 쉼 뒤 첫 박)
    function patOf(abs) { return (G.core && G.core.judgePatternAt ? G.core.judgePatternAt(abs) : null) || tb.patternAt(abs) || null; }
    function valAt(abs) { var p = patOf(abs); if (!p) return 0; var n = p.length; return p[((abs % n) + n) % n] || 0; }
    function typeAt(abs) {
      if (G.core && G.core.judgedAt && !G.core.judgedAt(abs)) return null;   // 내가 칠 차례가 아님
      var v = valAt(abs), pv = valAt(abs - 1);
      return (v !== 2 && pv === 2) ? 'release' : (v === 2 && pv !== 2) ? 'attack' : v === 1 ? 'tap' : null;
    }
    // 절대 칸 → 그 음표의 자리 (그 단위의 본문) + 닿을 윤곽의 크기
    function place(abs, pat) {
      var len = pat.length, L = G.guideLayout(len);
      var c = ((abs % len) + len) % len, row = Math.min(L.rows - 1, Math.floor(c / L.row));
      return { row: row, key: row + ':' + (c - row * L.row), x: L.bgX + (L.lead + c - row * L.row) * L.slotW, y: L.rowY(row) + L.rowH / 2,
        w: L.slotW, h: L.rowH, r: L.noteR };   // r = 음표 원의 반지름
    }
    function outline(p, s) {
      ctx.beginPath();
      if (APPROACH.shape === 'square') ctx.rect(p.x - p.w / 2 * s, p.y - p.h / 2 * s, p.w * s, p.h * s);
      else ctx.arc(p.x, p.y, p.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    // 다가오는 윤곽 (먼저 모아 둔다 — 그 자리의 닿은 테두리를 지우려고)
    var coming = [], busy = {};
    for (var abs = Math.ceil(P); abs < P + APPROACH.lead; abs++) {
      var pat = patOf(abs), type = pat ? typeAt(abs) : null;
      if (!type) continue;
      var p = place(abs, pat);
      busy[p.key] = true;
      if (rowOK(p.row)) coming.push({ p: p, type: type, k: (abs - P) / APPROACH.lead });   // k: 1 = 막 생김 → 0 = 닿음
    }
    // 닿은 테두리: 지금 단위에서 이미 지나간 음표
    var cur = patOf(Math.floor(P));
    if (cur) {
      var U = Math.floor(Math.floor(P) / cur.length) * cur.length, LD = APPROACH.landed;
      ctx.strokeStyle = LD.color; ctx.lineWidth = LD.width; ctx.globalAlpha = A(LD.alpha);
      var fresh = [];                                // 방금 닿은 것 (이펙트)
      for (var a = U; a < Math.ceil(P) && a <= P; a++) {
        var ty = typeAt(a);
        if (!ty) continue;
        var q = place(a, cur);
        if (busy[q.key] || !rowOK(q.row)) continue;
        if (G.feedback && G.feedback.replaces(a)) continue;   // 맞힌 음표 = 하트가 그 자리 (rhythm/feedback.js)
        ctx.strokeStyle = LD.color; ctx.lineWidth = LD.width; ctx.globalAlpha = A(LD.alpha);
        outline(q, 1);
        if (P - a < APPROACH.hit.len) fresh.push({ p: q, type: ty, t: (P - a) / APPROACH.hit.len });   // t: 0 = 닿은 순간 → 1 = 끝
      }
      // 닿는 순간: 원 안 번쩍임 + 밖으로 퍼지는 고리 (둘 다 빠르게 사라진다)
      fresh.forEach(function(e) {
        var fade = (1 - e.t) * (1 - e.t);
        ctx.globalAlpha = A(APPROACH.hit.flash * fade);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (APPROACH.shape === 'square') ctx.rect(e.p.x - e.p.w / 2, e.p.y - e.p.h / 2, e.p.w, e.p.h); else ctx.arc(e.p.x, e.p.y, e.p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = A(fade); ctx.strokeStyle = COLOR[e.type]; ctx.lineWidth = APPROACH.width;
        outline(e.p, 1 + APPROACH.hit.spread * (1 - (1 - e.t) * (1 - e.t)));
      });
    }
    ctx.lineWidth = APPROACH.width;
    coming.forEach(function(e) {
      ctx.globalAlpha = A(APPROACH.alpha[1] + (APPROACH.alpha[0] - APPROACH.alpha[1]) * e.k);
      ctx.strokeStyle = COLOR[e.type];
      outline(e.p, 1 + APPROACH.grow * e.k);
      if (G.guideFx && G.guideFx.contour) G.guideFx.contour(ctx, e.p, 1 + APPROACH.grow * e.k, ctx.globalAlpha);   // 윤곽에 얹는 꾸밈 (점선 테 — rhythm/guide-fx.js)
    });
    ctx.restore();
  }

  G.approach = {
    set: function(shape) { if (['circle', 'square', 'off'].indexOf(shape) >= 0) APPROACH.shape = shape; },
    shape: function() { return APPROACH.shape; },
    policy: APPROACH,
  };
  G.renderApproach = render;
})();
