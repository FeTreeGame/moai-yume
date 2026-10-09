// rhythm/guide-fx.js — 비트 막대의 이펙트 층: 줄 · 음표 · 진행 마커 · 판정 피드백(rhythm/guide.js · reveal.js · feedback.js)은 그대로 두고 그 위에 얹는다
//   받아 쓰는 값: 지금 패턴 (G.noteTargetObj.patternAt — 없으면 드러내는 중인 패턴 G.reveal.state) · 지금 위치 (G.currentBeat × 4) · 칸 결과 (G.noteSlotResults) ·
//     입력 기록 (G.noteInputMarks) · 지금 배치 (G.guideLayout). 시간의 단위 = 칸 (16분음표) — 템포가 바뀌어도 모양이 같다
//   박 = 킥 ('moai:drum' — 필드의 곡): 주기적으로 움직이는 것은 전부 킥에 건다 (정박이 아니다)
//   1) 기본 리듬 모션 (입력과 무관)
//        줄의 물결 (wave)    킥마다 줄의 가운데에서 양 끝으로 불룩한 것이 한 번 지나간다
//        점선 테 (next)      수렴 윤곽(rhythm/approach.js)에 얹힌다 — 윤곽과 같이 생기고 같이 좁혀 들어, 닿는 순간 음표 둘레에 선다. 킥마다 숨 쉰다
//                            (처음에는 '다음에 칠 음표'에 따로 붙박아 두었다 — 칠 때와 무관한 포커스가 하나 더 생겨 윤곽과 겹쳤다. 포커스는 윤곽 하나)
//        콜 (call)           부르는 음표가 울릴 때 ('moai:call') 그 자리에서 고리 — 막대 위에서 콜이 보인다
//   2) 입력 피드백
//        빛기둥 (pillar)     맞힌 음표 자리에서 위로 솟는다 (색 · 높이 = 등급)
//        줄의 파문 (ripple)  맞힌 자리에서 줄을 타고 양쪽으로
//        어긋남 (offset)     누른 자리와 음표 사이를 잇는 짧은 선 — 어느 쪽으로 얼마나 어긋났나 (ACE는 없다)
//        홀드 (hold)         누르는 동안 꼬리 위로 빛이 흐른다. 킥마다 굵어졌다 돌아온다
//        헛침 (whiff)        진행 마커 좌우로 떨리는 겹원 — 세션만
//   3) 마지막 음표 (last) — 성공을 가르는 음표
//        앞의 것을 다 맞혀 이것만 남으면 금색의 겹고리 + 네 갈래 테가 나타나 빛나며 킥마다 크게 뛴다 (armed — 마지막임을 알리는 추가 효과. 수렴 윤곽과는 따로)
//        맞혀서 패턴이 성공하면 (G.guideFx.finale — 연출 연결표가 부른다): 그 자리에서 줄이 양쪽으로 금색으로 쓸려 나가고 (sweep),
//          맞힌 음표들이 왼쪽부터 차례로 한 번씩 튀고 (hop), 캔버스 위쪽 끝까지 빛기둥이 솟는다
//        놓치면 (세션만) 그 표시가 조각나 흩어진다 (shatter). 필드는 조용히
//   그리기 = rhythm/bridge.js M.renderBars: 판정 피드백 뒤 (G.renderGuideFx — 줄마다) · 진행 마커 앞 (G.renderGuideFxTop — 한 번)
//   값은 GF 한 곳 (잠정). 항목마다 on — false면 그 항목만 빠진다. G.guideFx.set(false)면 전부
(function() {
  'use strict';
  var G = window.G;
  var GF = {
    on: true,
    wave:   { on: true, len: 0.7, h: 7, half: 1.3, alpha: 0.95 },          // 길이 (킥 간격의 비) · 불룩한 높이 (논리 px) · 반 길이 (칸) · 불투명도
    notes:  { on: true, next: { r: 1.5, amp: 0.3, alpha: 0.6 } },   // 수렴 윤곽에 얹는 점선 테: 닿았을 때의 반지름 (음표 원의 배수) · 킥에 커지는 정도 · 불투명도 (윤곽의 것에 곱한다)
    call:   { on: true, len: 2.4, ring: [1, 2.8], width: 3 },
    pillar: { on: true, len: 2.8, w: 1.5, h: { ace: 240, good: 160, barely: 85 } },   // 길이 (칸) · 폭 (음표 원 지름의 배수) · 높이 (논리 px)
    ripple: { on: true, len: 3.2, reach: 5.5, h: 9, half: 0.9 },            // 길이 (칸) · 가는 거리 (칸) · 높이 · 반 길이 (칸)
    offset: { on: true, len: 7, width: 3 },
    hold:   { on: true, dash: 1.1, speed: 2.2, width: 2.5, kick: 5 },       // 흐르는 빛의 간격 (칸) · 빠르기 (칸당 칸) · 굵기 · 킥에 굵어지는 양
    whiff:  { on: true, len: 1.6, amp: 0.55 },
    last:   { on: true, ring: 1.45, star: 2.15, armed: { glow: 16, kick: 0.55 },
      sweep: { len: 6, width: 9 }, hop: { step: 0.4, len: 1.6, ring: [1, 2.6] }, pillar: { len: 7, w: 2.6 }, shatter: { len: 3.5, n: 12, reach: 4.5 } },
    color: { ace: '#ffd700', good: '#39ff14', barely: '#ffffff', gold: '#ffd700', miss: '#ff4757' },
  };
  var kick = null;                       // 마지막 킥 { P (절대 칸), gap (칸), accent }
  var events = [];                       // 한 번 터지는 것들 { kind, at (절대 칸), x, y, row, r, ... } — 자리를 만들 때 재어 둔다 (패턴이 걷혀도 끝까지)
  var lastHit = null, armedKey = null;
  function Mo() { return window.Moai || {}; }
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function out(u) { u = clamp(u); return 1 - (1 - u) * (1 - u); }
  function bump(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); }
  function rgba(hex, a) { var m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

  // 지금의 판: 패턴 · 단위의 시작 · 음표 · 배치
  function scene() {
    if (!GF.on || G.guideStill || !G.guideLayout || G.currentBeat == null || !G.reveal) return null;
    var P = G.currentBeat * 4, tb = G.noteTargetObj, pat = tb && tb.patternAt ? tb.patternAt(Math.floor(P)) : null, judged = !!pat, U, notes, len;
    if (pat) { len = pat.length; U = Math.floor(Math.floor(P) / len) * len; notes = G.reveal.notesOf(pat).notes; }
    else { var st = G.reveal.state(P); if (!st) return null; len = st.len; U = st.from + Math.floor((P - st.from) / len) * len; notes = st.all; }
    notes = notes.filter(function(n) { return n.c < len; });
    var L = G.guideLayout(len);
    function pos(c) { var row = Math.max(0, Math.min(L.rows - 1, Math.floor(c / L.row))); return { row: row, x: L.bgX + (L.lead + c - row * L.row) * L.slotW, y: L.rowY(row) + L.rowH / 2 }; }
    // 내 차례인가 (리듬 코어 — 수렴 윤곽과 같은 기준) · 듣는 차례에 이미 나타난 음표 (드러내기)
    var mine = judged && (!(G.core && G.core.judgedAt) || !!G.core.judgedAt(Math.floor(P))), shown = {}, rs = G.reveal.state(P);
    if (rs) rs.notes.forEach(function(n) { shown[n.c] = true; });
    return { P: P, U: U, u: P - U, len: len, notes: notes, L: L, pos: pos, judged: judged, mine: mine, shown: shown, res: G.noteSlotResults || {} };
  }
  function placeOf(tick) { var s = scene(); if (!s) return null; var p = s.pos(Math.max(0, tick - s.U)); p.r = s.L.noteR; p.s = s; return p; }
  function push(e) { if (G.currentBeat == null) return; e.at = G.currentBeat * 4; events.push(e); if (events.length > 48) events.shift(); }
  function gradeOf(tick) { var ms = G.noteInputMarks || []; for (var i = ms.length - 1; i >= 0; i--) if (ms[i].tick === tick && GF.color[ms[i].res]) return ms[i]; return null; }
  function kickAge(P) { return kick && P >= kick.P ? (P - kick.P) / kick.gap : 9; }   // 0 = 킥의 순간 ~ 1 = 다음 킥

  // ── 줄마다 그리는 것 (판정 피드백 뒤): 줄의 물결 · 음표 둘레 · 마지막 음표 ──
  function render(ctx) {
    var s = scene(); if (!s) return;
    var L = s.L, NR = L.noteR, A = G.guideA || function(v) { return v; }, rowOK = G.guideRowOK || function() { return true; }, ka = kickAge(s.P);
    var cur = s.pos(s.u % s.len);
    ctx.save();
    // 줄의 물결
    if (GF.wave.on && ka < GF.wave.len && rowOK(cur.row)) {
      var W = GF.wave, k = ka / W.len, x0 = L.bgX, x1 = L.bgX + L.row * L.slotW, mid = (x0 + x1) / 2, d = out(k) * (x1 - x0) / 2, half = W.half * L.slotW, h = W.h * (1 - k) * (kick.accent ? 1.5 : 1);
      ctx.strokeStyle = 'rgba(255,255,255,' + A(W.alpha * (1 - k)) + ')'; ctx.lineCap = 'round'; ctx.lineWidth = 4 + h;
      [-1, 1].forEach(function(sg) { var x = mid + sg * d; ctx.beginPath(); ctx.moveTo(Math.max(x0, x - half), cur.y); ctx.lineTo(Math.min(x1, x + half), cur.y); ctx.stroke(); });
    }
    // (킥마다 남은 음표 전부에서 퍼지던 고리는 뺐다 — 차례가 오지 않은 음표에도 떴다. 음표 자리에 뜨는 것은 그 음표의 차례가 됐을 때만: 수렴 윤곽 + 점선 테)
    // 마지막 음표
    if (GF.last.on && s.notes.length > 1) {
      var LS = GF.last, ln = s.notes[s.notes.length - 1], abs = s.U + ln.c, lp = s.pos(ln.c);
      var armed = !s.res[abs] && s.mine && s.notes.every(function(n) { return n === ln || s.res[s.U + n.c] === 'hit'; });   // 앞의 것을 다 맞혀 이것만 남았는가
      armedKey = armed ? abs : null;
      if (armed && rowOK(lp.row)) {      // 그때만 그린다 — 금색 스코프 (처음부터 흰색으로 붙박아 두던 것은 뺐다: 자기 차례가 오기 전부터 떠 있었다)
        var kk = ka < 1 ? 1 + LS.armed.kick * (1 - ka) * (1 - ka) : 1, col = GF.color.gold;
        ctx.shadowColor = GF.color.gold; ctx.shadowBlur = LS.armed.glow * (0.6 + 0.4 * Math.sin(s.P * 1.6));
        ctx.strokeStyle = rgba(col, A(1)); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(lp.x, lp.y, NR * LS.ring * kk, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(lp.x, lp.y, NR * (LS.ring + 0.32) * kk, 0, Math.PI * 2); ctx.stroke();
        for (var i = 0; i < 4; i++) {                                  // 네 갈래 (비스듬히 — 줄 · 눈금과 겹치지 않게)
          var ang = Math.PI / 4 + i * Math.PI / 2 + s.P * 0.25, r0 = NR * (LS.ring + 0.5) * kk, r1 = NR * LS.star * kk;
          ctx.beginPath(); ctx.moveTo(lp.x + Math.cos(ang) * r0, lp.y + Math.sin(ang) * r0); ctx.lineTo(lp.x + Math.cos(ang) * r1, lp.y + Math.sin(ang) * r1); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  // ── 수렴 윤곽에 얹는 점선 테 (rhythm/approach.js가 다가오는 윤곽마다 부른다): p = 자리 { x, y, r }, scale = 윤곽의 지금 크기 (1 = 음표에 닿음), alpha = 윤곽의 불투명도 ──
  //   윤곽보다 (next.r − 1)만큼 바깥에서 같이 좁혀 든다 → 닿는 순간 음표 원의 next.r배 자리에 선다
  function contour(ctx, p, scale, alpha) {
    if (!GF.on || !GF.notes.on || !GF.notes.next || G.currentBeat == null) return;
    var X = GF.notes.next, ka = kickAge(G.currentBeat * 4);
    ctx.save();
    ctx.globalAlpha = alpha * X.alpha; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (scale + X.r - 1) * (1 + X.amp * (ka < 1 ? 1 - ka : 0)), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── 한 번만 그리는 것 (진행 마커 앞): 잔상 · 홀드의 빛 · 터지는 것들 ──
  function renderTop(ctx) {
    if (!GF.on || G.currentBeat == null) return;
    var P = G.currentBeat * 4, s = scene(), ka = kickAge(P);
    ctx.save();
    if (s) {
      var L = s.L, NR = L.noteR, cu = s.u % s.len;
      // (진행 마커 뒤의 잔상 고리는 뺐다 — 지저분했다)
      // 홀드: 꼬리 위로 흐르는 빛
      if (GF.hold.on && G.guideHoldLive) {
        var H = GF.hold, ms = G.noteInputMarks || [], st = null;
        for (var j = ms.length - 1; j >= 0; j--) if (ms[j].type === 'hold-start') { st = ms[j]; break; }
        if (st && st.abs <= P) {
          var from = Math.max(st.abs - s.U, 0), a = s.pos(from), b = s.pos(cu);
          if (a.row === b.row && b.x > a.x) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = H.width + (ka < 1 ? H.kick * (1 - ka) : 0); ctx.lineCap = 'round';
            ctx.setLineDash([L.slotW * 0.3, L.slotW * (H.dash - 0.3)]); ctx.lineDashOffset = -P * H.speed * L.slotW;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }
    }
    events = events.filter(function(e) { return P - e.at < e.len && P >= e.at - 1; });
    events.forEach(function(e) {
      var k = clamp((P - e.at - (e.delay || 0)) / (e.len - (e.delay || 0)));
      if (P - e.at < (e.delay || 0)) return;
      ctx.save();
      if (e.kind === 'pillar') {                                       // 빛기둥
        var h = e.h * (0.35 + 0.65 * out(k * 3)), w = e.w * (1 - 0.5 * k), g = ctx.createLinearGradient(0, e.y, 0, e.y - h);
        g.addColorStop(0, rgba(e.color, 0.9 * (1 - k))); g.addColorStop(0.5, rgba(e.color, 0.4 * (1 - k))); g.addColorStop(1, rgba(e.color, 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(e.x - w / 2, e.y - h, w, h);
        ctx.fillStyle = 'rgba(255,255,255,' + 0.85 * (1 - k) + ')'; ctx.fillRect(e.x - w * 0.12, e.y - h * 0.9, w * 0.24, h * 0.9);
      } else if (e.kind === 'ripple') {                                // 줄의 파문
        var d = out(k) * e.reach, hh = e.h * (1 - k);
        ctx.strokeStyle = rgba(e.color, 0.95 * (1 - k)); ctx.lineWidth = 4 + hh; ctx.lineCap = 'round';
        [-1, 1].forEach(function(sg) { var x = e.x + sg * d; if (x < e.x0 - 2 || x > e.x1 + 2) return; ctx.beginPath(); ctx.moveTo(Math.max(e.x0, x - e.half), e.y); ctx.lineTo(Math.min(e.x1, x + e.half), e.y); ctx.stroke(); });
      } else if (e.kind === 'offset') {                                // 어긋남
        ctx.strokeStyle = rgba(e.color, 0.95 * (1 - k * k)); ctx.lineWidth = e.width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.x, e.y - e.r * 1.7); ctx.lineTo(e.x2, e.y - e.r * 1.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.x2, e.y - e.r * 2.3); ctx.lineTo(e.x2, e.y - e.r * 1.1); ctx.stroke();
      } else if (e.kind === 'ring') {                                  // 고리 (콜 · 차례로 튀기)
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (e.ring[0] + (e.ring[1] - e.ring[0]) * out(k)), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(e.color, 0.95 * (1 - k)); ctx.lineWidth = e.width || 3; ctx.stroke();
      } else if (e.kind === 'whiff') {                                 // 헛침: 좌우로 떨리는 겹원
        var cuw = s ? s.pos(s.u % s.len) : e, dx = Math.sin(k * Math.PI * 6) * e.r * GF.whiff.amp * (1 - k);
        ctx.strokeStyle = rgba(GF.color.miss, 0.8 * (1 - k)); ctx.lineWidth = 2.5;
        [-1, 1].forEach(function(sg) { ctx.beginPath(); ctx.arc(cuw.x + sg * dx * 2, cuw.y, e.r * 2, 0, Math.PI * 2); ctx.stroke(); });
      } else if (e.kind === 'sweep') {                                 // 줄이 금색으로 쓸려 나간다
        var kk = out(k * 1.8), a0 = e.x - (e.x - e.x0) * kk, a1 = e.x + (e.x1 - e.x) * kk;
        ctx.shadowColor = GF.color.gold; ctx.shadowBlur = 14 * (1 - k);
        ctx.strokeStyle = rgba(GF.color.gold, 1 - k * k); ctx.lineWidth = e.width * (1 - 0.5 * k); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a0, e.y); ctx.lineTo(a1, e.y); ctx.stroke();
      } else if (e.kind === 'shatter') {                               // 조각나 흩어진다
        e.parts.forEach(function(q) {
          var dd = e.r * e.reach * out(k) * (0.4 + 0.6 * q.d), x = e.x + Math.cos(q.a) * dd, y = e.y + Math.sin(q.a) * dd + e.r * 2 * k * k;
          ctx.strokeStyle = 'rgba(255,255,255,' + 0.9 * (1 - k) + ')'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(q.a + q.t) * e.r * 0.9, y + Math.sin(q.a + q.t) * e.r * 0.9); ctx.stroke();
        });
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // ── 알림 ──
  function fieldKick(d) { var M = Mo(); return !(M.fieldBgm && M.fieldBgm.timeline && d.tl && M.fieldBgm.timeline() !== d.tl); }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('moai:drum', function(e) {
      var d = e.detail || {}; if (d.drum !== 'kick' || G.currentBeat == null || !fieldKick(d)) return;
      var tickSec = 60 / (G.BPM || 100) / 4;
      kick = { P: G.currentBeat * 4, gap: Math.max(1, (d.gap || 0.5) / tickSec), accent: !!d.accent };
    });
    document.addEventListener('moai:call', function(e) {
      if (!GF.on || !GF.call.on || (e.detail || {}).type === 'release') return;
      var s = scene(); if (!s) return;
      var p = s.pos(Math.round(s.u % s.len) % s.len);
      push({ kind: 'ring', len: GF.call.len, x: p.x, y: p.y, r: s.L.noteR, ring: GF.call.ring, width: GF.call.width, color: '#ffffff' });
    });
    document.addEventListener('moai:judge', function(e) {
      var d = e.detail || {}, M = Mo();
      if (!GF.on) return;
      if (d.kind === 'hit') {                 // ('hold' = 홀드를 유지하는 동안 칸마다 오는 확인 — 여기에는 붙이지 않는다: 예전에는 칸마다 빛기둥이 솟았다)
        var p = placeOf(d.tick); if (!p) return;
        var mk = gradeOf(d.tick), grade = mk ? mk.res : 'good', col = GF.color[grade], L = p.s.L, x0 = L.bgX, x1 = L.bgX + L.row * L.slotW;
        lastHit = { tick: d.tick, x: p.x, y: p.y, row: p.row, r: p.r, x0: x0, x1: x1, U: p.s.U, slotW: L.slotW };
        if (GF.pillar.on) push({ kind: 'pillar', len: GF.pillar.len, x: p.x, y: p.y, w: p.r * 2 * GF.pillar.w, h: GF.pillar.h[grade], color: col });
        if (GF.ripple.on) push({ kind: 'ripple', len: GF.ripple.len, x: p.x, y: p.y, x0: x0, x1: x1, reach: GF.ripple.reach * L.slotW, h: GF.ripple.h, half: GF.ripple.half * L.slotW, color: col });
        if (GF.offset.on && mk && mk.abs != null && grade !== 'ace' && Math.abs(mk.abs - d.tick) > 0.05)
          push({ kind: 'offset', len: GF.offset.len, x: p.x, x2: Math.max(x0, Math.min(x1, p.x + (mk.abs - d.tick) * L.slotW)), y: p.y, r: p.r, width: GF.offset.width, color: col });
      } else if (d.kind === 'whiff' && M.sessionActive && GF.whiff.on) {
        var s = scene(); if (s) { var q = s.pos(s.u % s.len); push({ kind: 'whiff', len: GF.whiff.len, x: q.x, y: q.y, r: s.L.noteR }); }
      } else if (d.kind === 'miss' && M.sessionActive && GF.last.on) {       // 마지막 음표를 놓침 — 세션만
        var s2 = scene(); if (!s2 || s2.notes.length < 2) return;
        var ln = s2.notes[s2.notes.length - 1]; if (s2.U + ln.c !== d.tick) return;
        var lp = s2.pos(ln.c), parts = [], SH = GF.last.shatter;
        for (var i = 0; i < SH.n; i++) parts.push({ a: (i + Math.random() * 0.7) / SH.n * Math.PI * 2, d: Math.random(), t: Math.random() * 2 - 1 });
        push({ kind: 'shatter', len: SH.len, x: lp.x, y: lp.y, r: s2.L.noteR, reach: SH.reach, parts: parts });
      }
    });
  }
  // 패턴 성공 (연출 연결표가 부른다): 줄이 쓸려 나가고 · 맞힌 음표들이 차례로 튀고 · 큰 빛기둥
  function finale() {
    if (!GF.on || !GF.last.on || !lastHit || G.currentBeat == null) return;
    var h = lastHit, LS = GF.last, s = scene(), res = G.noteSlotResults || {};
    push({ kind: 'sweep', len: LS.sweep.len, x: h.x, y: h.y, x0: h.x0, x1: h.x1, width: LS.sweep.width });
    push({ kind: 'pillar', len: LS.pillar.len, x: h.x, y: h.y, w: h.r * 2 * LS.pillar.w, h: h.y + 20, color: GF.color.gold });
    if (s && s.U === h.U) s.notes.filter(function(n) { return res[s.U + n.c] === 'hit'; }).forEach(function(n, i) {
      var p = s.pos(n.c); push({ kind: 'ring', len: LS.hop.len + i * LS.hop.step, delay: i * LS.hop.step, x: p.x, y: p.y, r: s.L.noteR, ring: LS.hop.ring, width: 3.5, color: GF.color.gold });
    });
  }

  G.renderGuideFx = render;
  G.renderGuideFxTop = renderTop;
  G.guideFx = { policy: GF, finale: finale, contour: contour, kickNow: function() { return kick; },   // kickNow = 마지막 킥 { P (절대 칸), gap (칸), accent } — 진행 마커가 킥에 뛸 때 읽는다
    set: function(on) { GF.on = !!on; if (!on) events = []; },
    state: function() { return { kick: kick, events: events.map(function(e) { return e.kind; }), armed: armedKey, lastHit: lastHit ? lastHit.tick : null }; },
    lastX: function() { return lastHit && G.W ? lastHit.x / G.W : 0.5; } };   // 마지막으로 맞힌 자리 (캔버스 폭의 비 — 테두리의 물결이 시작할 곳)
})();
