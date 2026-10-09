// rhythm/feedback.js — 판정 피드백: 입력이 '어디서 났는가'가 아니라 '어떤 평가를 받았는가'를 음표에 돌려준다 (시험 — 구현해 보고 고치는 단계)
//   받아 쓰는 값: 칸 결과 G.noteSlotResults (절대 칸 → 'hit' | 'miss' — rhythm/judge.js), 입력 기록 G.noteInputMarks ({ abs, type, res(등급), tick(맞은 음표) }),
//     누르는 중 G.noteInputHolding, 지금 패턴 · 위치 (G.noteTargetObj.patternAt · G.currentBeat × 4). 자리 = 지금 가이드 모양의 배치 (G.guideLayout)
//   1) 영구 하트 · X — 음표의 상태: 평가를 받은 음표는 그 단위(패턴 한 바퀴)가 끝날 때까지 그 모습으로 남는다
//        맞힘 = 음표가 하트가 된다 (색 = 등급: ACE 금 · GOOD 초록 — 기존 판정 색). 그 자리의 음표 원은 그리지 않는다 (G.feedback.replaces — rhythm/reveal.js가 묻는다)
//          하트의 크기 = 음표 원이 하트에 내접하는 크기 (모양은 그대로 — 크기와 놓는 자리만: 하트 안의 가장 큰 원이 음표 원과 겹치게). 원을 완전히 덮는다
//        놓침 = 음표 위에 X — 세션에서만 (실패를 확실히 알린다). 필드는 실패를 반영하지 않는다: 성공했을 때만 반영 (FB.miss)
//        평가를 받는 순간 한 번 튄다 (음표의 자체 애니메이션 — pop)
//   2) 휘발성 하트 — 입력이 들어왔다는 표시 (파티클): 입력한 자리에서 작은 흰 하트가 커지며 투명해져 사라진다
//   3) 홀드의 꼬리: 어택을 맞히면 그 등급의 색으로 실선이 어택에서 지금 위치까지 이어지고, 머리에 하트가 진행 마커의 중심에 놓여 함께 움직인다
//        꼬리 하트 = 릴리즈까지 하트의 선을 이어 가는 연출 — 누르는 동안에만 있다 (진행 마커의 맥박 하트 자리를 맡아 같은 박으로 뛴다)
//        떼면 실선은 뗀 자리에서 멈춘다. 릴리즈를 맞혔으면 릴리즈 음표의 판정 하트가 이어받고 (뗀 자리에 따로 남기지 않는다),
//          못 맞혔으면 뗀 자리에 어택의 색을 따르는 작은 원 (여기서 뗐다는 표시 — 실패의 X는 릴리즈 음표 한 곳에만: 세션)
//        꼬리는 자기 어택 음표에 딸린 것 — 그 음표가 화면에서 정리되면(패턴이 걷히거나 바뀜) 함께 정리된다
//        이번 바퀴의 것인가는 '입력한 시각'이 아니라 '맞힌 음표의 칸'으로 본다 (첫 칸의 어택을 조금 이르게 쳐도 앞 바퀴의 것이 되지 않게)
//   4) 맞힘의 파티클: 맞힌 음표 주변에서 작은 조각들이 사방으로 터져 나가며 사라진다 (색 = 등급 + 흰색). 부르는 쪽 = 연출 연결표 (js/fx-rules.js → G.feedback.burst)
//   5) 마지막 성공의 이펙트 (finale): 패턴을 다 맞힌 순간(필드 루프 성공 · 세션 단계 성공) 마지막으로 맞힌 음표 자리에서 평소보다 크게 —
//        큰 하트가 찰랑이며 번져 사라지고, 고리 둘이 차례로 퍼지고, 조각들이 더 멀리 튄다. 자리를 만들 때 기억해 두므로 패턴이 걷히거나 바퀴가 넘어가도 끝까지 그려진다
//        부르는 쪽 = 연출 연결표 (js/fx-rules.js → G.feedback.finale)
//   그리기 = 드러내기 · 수렴 윤곽 뒤, 진행 마커 앞 (rhythm/bridge.js M.renderBars). 값은 FB 한 곳 (잠정)
(function() {
  'use strict';
  var G = window.G;
  var FB = {
    color: { ace: '#ffd700', good: '#39ff14', miss: '#ff4757' },
    miss: { field: false, session: true },   // 실패(X)를 보이는가 — 필드는 성공만 반영한다, 세션은 실패도 확실히
    // 하트 모양(heartPath)에 내접하는 가장 큰 원: 중심 = 하트의 기준점에서 cy × s 아래, 반지름 = r × s (모양에서 계산한 값 — 모양을 바꾸면 다시 잰다)
    heartIn: { r: 0.574, cy: 0.174 },
    pop: { len: 1.5, amp: 0.45 },      // 평가를 받는 순간 튀기: 길이 (칸) · 커지는 정도
    puff: { len: 3, from: 0.5, to: 1.8, alpha: 0.9 },   // 휘발성 하트: 길이 (칸) · 크기 (음표 원 반지름의 배수, 처음 → 끝) · 처음 불투명도
    tail: { width: 5, heart: 0.9, dot: 0.38 },          // 홀드의 꼬리: 실선 굵기 · 누르는 동안의 하트 크기 (가이드가 있으면 진행 마커의 맥박 하트와 같게 — G.guideHeartSize) · 뗀 자리 작은 원의 반지름
    x: { size: 0.7, width: 4 },        // 놓침 X: 크기 (음표 원 반지름의 배수) · 굵기
    burst: { len: 2.2, reach: [1.6, 3.2], size: [0.14, 0.3] },   // 맞힘의 파티클: 길이 (칸) · 날아가는 거리 · 조각 크기 (음표 원 반지름의 배수, 최소 ~ 최대)
    finale: { len: 6, heart: [1.2, 3.4], wobble: 0.09, rings: [2.2, 4.6], n: 18, reach: [3, 6.5], size: [0.2, 0.42] },   // 마지막 성공: 길이 (칸) · 큰 하트의 크기 (내접 하트의 배수, 처음 → 끝) · 찰랑임 · 고리가 퍼지는 반지름 · 조각 수 · 거리 · 크기
  };
  var seen = {};                        // 절대 칸 → 평가를 처음 본 위치 (튀기의 시작)
  var bursts = [];                      // 맞힘의 파티클 { tick, at (시작 위치 — 절대 칸), grade, parts: [{ a (방향), d (거리 비), s (크기 비), w (흰색) }] }
  var finales = [];                     // 마지막 성공의 이펙트 { at (시작 위치 — 절대 칸), x, y, row, r (음표 원의 반지름), grade, parts }
  // 그 칸의 음표 자리 (지금 배치에서) — 만들 때 한 번 재어 둔다
  function placeOf(tick) {
    var tb = G.noteTargetObj;
    if (!tb || !tb.patternAt || !G.guideLayout || G.currentBeat == null) return null;
    var P = G.currentBeat * 4, pat = tb.patternAt(Math.floor(P));
    if (!pat) return null;
    var len = pat.length, L = G.guideLayout(len), U = Math.floor(Math.floor(P) / len) * len;
    var c = Math.max(0, tick - U), row = Math.max(0, Math.min(L.rows - 1, Math.floor(c / L.row)));
    return { row: row, x: L.bgX + (L.lead + c - row * L.row) * L.slotW, y: L.rowY(row) + L.rowH / 2, r: L.noteR };
  }
  // 마지막 성공: 마지막으로 맞힌 음표 자리에서 (tick 생략 = 마지막 파티클의 음표)
  function finale(tick) {
    var last = bursts.length ? bursts[bursts.length - 1] : null;
    if (tick == null) tick = last ? last.tick : null;
    var p = tick != null ? placeOf(tick) : null;
    if (!p) return;
    var F = FB.finale, parts = [];
    for (var i = 0; i < F.n; i++) parts.push({ a: (i + Math.random() * 0.8) / F.n * Math.PI * 2, d: Math.random(), s: Math.random(), w: Math.random() < 0.4 });
    finales.push({ at: G.currentBeat * 4, x: p.x, y: p.y, row: p.row, r: p.r, grade: last && last.tick === tick ? last.grade : gradeOf(tick), parts: parts });
    if (finales.length > 4) finales.shift();
  }
  function burst(tick, n) {
    if (G.currentBeat == null) return;
    var parts = [];
    for (var i = 0; i < (n || 8); i++) parts.push({ a: (i + Math.random() * 0.8) / (n || 8) * Math.PI * 2, d: Math.random(), s: Math.random(), w: Math.random() < 0.35 });
    bursts.push({ tick: tick, at: G.currentBeat * 4, grade: gradeOf(tick), parts: parts });
    if (bursts.length > 24) bursts.shift();
  }

  function heartPathOwn(ctx, x, y, s) { // s = 반 폭쯤. 가운데 = (x, y) — 가이드(rhythm/guide.js G.guideHeart)가 없을 때
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.15, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
  }
  function cross(ctx, x, y, s, w, color) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = w + 2; ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w;
    }
  }
  function easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - (1 - t) * (1 - t) * (1 - t); }

  // 맞은 음표(절대 칸)의 등급 — 입력 기록에서 (없으면 good)
  function gradeOf(tick) {
    var ms = G.noteInputMarks || [];
    for (var i = ms.length - 1; i >= 0; i--) if (ms[i].tick === tick && (ms[i].res === 'ace' || ms[i].res === 'good')) return ms[i].res;
    return 'good';
  }

  function render(ctx) {
    if (G.guideStill || !G.guideLayout || G.currentBeat == null) return;
    var tb = G.noteTargetObj;
    if (!tb || !tb.patternAt) return;
    var P = G.currentBeat * 4, pat = tb.patternAt(Math.floor(P));
    if (!pat) return;
    var len = pat.length, L = G.guideLayout(len), NR = L.noteR, U = Math.floor(Math.floor(P) / len) * len;
    var res = G.noteSlotResults || {}, marks = G.noteInputMarks || [];
    var showMiss = !!FB.miss[window.Moai && window.Moai.sessionActive ? 'session' : 'field'];
    function mine(m) { return (m.tick != null ? m.tick : m.abs) >= U; }   // 이번 바퀴의 입력인가 — 맞힌 음표의 칸 기준 (없으면 입력한 시각)
    function valAt(abs) { var p = tb.patternAt(abs); if (!p) return 0; var n = p.length; return p[((abs % n) + n) % n] || 0; }
    function isNote(abs) { var v = valAt(abs), pv = valAt(abs - 1); return (v !== 2 && pv === 2) || (v === 2 && pv !== 2) || v === 1; }
    var A = G.guideA || function(v) { return v; }, rowOK = G.guideRowOK || function() { return true; };   // 줄 부각 (rhythm/guide.js)
    var heartPath = G.guideHeart || heartPathOwn;
    G.guideHoldLive = false;            // 누르는 중인 홀드가 있는가 (진행 마커의 맥박 하트가 쉰다 — rhythm/guide.js)
    function pos(abs) {                 // 절대 위치 (소수 가능) → 자리
      var c = abs - U, row = Math.max(0, Math.min(L.rows - 1, Math.floor(c / L.row)));
      return { row: row, x: L.bgX + (L.lead + c - row * L.row) * L.slotW, y: L.rowY(row) + L.rowH / 2 };
    }
    Object.keys(seen).forEach(function(k) { if (+k < U) delete seen[k]; });
    ctx.save();

    // 3) 홀드의 꼬리 (음표의 하트 · X보다 아래)
    var T = FB.tail;
    marks.forEach(function(m, i) {
      if (m.type !== 'hold-start' || (m.res !== 'ace' && m.res !== 'good') || !mine(m) || m.abs > P) return;
      if (m.tick == null || !isNote(m.tick)) return;                 // 자기 어택 음표가 화면에 없으면 꼬리도 없다 (패턴이 걷히거나 바뀜)
      var from = Math.max(m.abs, U);                                 // 이르게 친 첫 칸의 어택 = 줄 처음부터
      var end = null, live = false;
      for (var j = i + 1; j < marks.length; j++) if (marks[j].type === 'hold-end') { end = marks[j]; break; } else if (marks[j].type === 'hold-start') break;
      if (!end && G.noteInputHolding && !marks.slice(i + 1).some(function(x) { return x.type === 'hold-start'; })) live = true;
      var to = end ? Math.min(end.abs, P) : live ? P : null;
      if (to == null || to <= from) return;
      var col = FB.color[m.res];
      ctx.strokeStyle = col; ctx.lineWidth = T.width; ctx.lineCap = 'round';
      for (var r = pos(from).row; r <= pos(to).row; r++) {           // 줄마다 한 토막
        var s = Math.max(from, U + r * L.row), e = Math.min(to, U + (r + 1) * L.row);
        if (e <= s || !rowOK(r)) continue;
        var y = L.rowY(r) + L.rowH / 2, x0 = L.bgX + (L.lead + s - U - r * L.row) * L.slotW, x1 = L.bgX + (L.lead + e - U - r * L.row) * L.slotW;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
      var q = pos(to), endHit = end && (end.res === 'ace' || end.res === 'good');
      if (live) G.guideHoldLive = true;
      if (!rowOK(q.row)) return;
      if (live) {                                                    // 꼬리 하트 — 누르는 동안 진행 마커의 중심에서 함께 움직인다 (어택의 색, 박으로 뛴다)
        heartPath(ctx, q.x, q.y, NR * (G.guideHeartSize ? G.guideHeartSize() : T.heart) * (G.guideBeat ? G.guideBeat().scale : 1)); ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (end && !endHit) {                                   // 릴리즈를 못 맞히고 뗀 자리 = 어택의 색을 따르는 작은 원 ('여기서 뗐다' — 맞혔으면 릴리즈 음표의 하트가 이어받는다)
        ctx.beginPath(); ctx.arc(q.x, q.y, NR * T.dot, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    });

    // 1) 영구 하트 · X
    for (var a = U; a <= Math.floor(P) && a < U + len; a++) {
      if (!isNote(a) || !res[a]) continue;
      if (seen[a] == null) seen[a] = P;
      var p = pos(a), k = 1 + FB.pop.amp * (1 - easeOut((P - seen[a]) / FB.pop.len));
      if (!rowOK(p.row)) continue;
      if (res[a] === 'hit') {
        var hs = NR / FB.heartIn.r * k;                          // 음표 원이 내접하는 크기 (× 튀기)
        heartPath(ctx, p.x, p.y - FB.heartIn.cy * hs, hs);        // 하트 안의 가장 큰 원의 중심 = 음표의 중심
        ctx.fillStyle = FB.color[gradeOf(a)]; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
      } else if (showMiss) {
        cross(ctx, p.x, p.y, NR * FB.x.size * k, FB.x.width, FB.color.miss);
      }
    }

    // 4) 맞힘의 파티클
    var B = FB.burst;
    bursts = bursts.filter(function(b) { return P - b.at < B.len && b.tick >= U; });
    bursts.forEach(function(b) {
      var t = (P - b.at) / B.len, q = pos(b.tick);
      if (t < 0 || !rowOK(q.row)) return;
      var out = easeOut(t), fade = (1 - t) * (1 - t);
      b.parts.forEach(function(pt) {
        var dist = NR * (B.reach[0] + (B.reach[1] - B.reach[0]) * pt.d) * out, r = NR * (B.size[0] + (B.size[1] - B.size[0]) * pt.s) * (1 - 0.5 * t);
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(q.x + Math.cos(pt.a) * dist, q.y + Math.sin(pt.a) * dist, r, 0, Math.PI * 2);
        ctx.fillStyle = pt.w ? '#ffffff' : FB.color[b.grade]; ctx.fill();
      });
      ctx.globalAlpha = 1;
    });

    // 5) 마지막 성공의 이펙트 (자리는 만들 때 재어 둔 것 — 패턴이 걷혀도 그린다)
    var FN = FB.finale;
    finales = finales.filter(function(f) { return P - f.at < FN.len && P >= f.at - 1; });
    finales.forEach(function(f) {
      if (!rowOK(f.row)) return;
      var t = Math.max(0, (P - f.at) / FN.len), out = easeOut(t), fade = (1 - t) * (1 - t), col = FB.color[f.grade];
      // 큰 하트: 찰랑이며 번진다
      var hs = f.r / FB.heartIn.r * (FN.heart[0] + (FN.heart[1] - FN.heart[0]) * out) * (1 + FN.wobble * Math.sin(t * 26) * (1 - t));
      ctx.globalAlpha = A(0.55 * fade);
      heartPath(ctx, f.x, f.y - FB.heartIn.cy * hs, hs); ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = A(0.95 * fade);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      // 고리 둘: 차례로 퍼진다
      [0, 0.18].forEach(function(lag, i) {
        var u = (t - lag) / (1 - lag);
        if (u <= 0) return;
        ctx.globalAlpha = A((1 - u) * (1 - u));
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + (FN.rings[i] - 1) * easeOut(u)), 0, Math.PI * 2);
        ctx.strokeStyle = i ? '#ffffff' : col; ctx.lineWidth = 3.5 - i; ctx.stroke();
      });
      // 조각: 더 멀리
      f.parts.forEach(function(pt) {
        var dist = f.r * (FN.reach[0] + (FN.reach[1] - FN.reach[0]) * pt.d) * out, r = f.r * (FN.size[0] + (FN.size[1] - FN.size[0]) * pt.s) * (1 - 0.5 * t);
        ctx.globalAlpha = A(fade);
        ctx.beginPath(); ctx.arc(f.x + Math.cos(pt.a) * dist, f.y + Math.sin(pt.a) * dist, r, 0, Math.PI * 2);
        ctx.fillStyle = pt.w ? '#ffffff' : col; ctx.fill();
      });
      ctx.globalAlpha = A(1);
    });

    // 2) 휘발성 하트 (맨 위)
    var F = FB.puff;
    marks.forEach(function(m) {
      var age = P - m.abs;
      if (age < 0 || age >= F.len || !mine(m)) return;
      var t = age / F.len, q = pos(Math.max(m.abs, U));
      if (!rowOK(q.row)) return;
      ctx.globalAlpha = A(F.alpha * (1 - t) * (1 - t));
      heartPath(ctx, q.x, q.y, NR * (F.from + (F.to - F.from) * easeOut(t)));
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.globalAlpha = A(1);
    });
    ctx.restore();
  }

  G.feedback = {
    // 그 음표(절대 칸)를 피드백이 대신 그리는가 — 맞힌 음표는 하트가 음표 원을 대신한다
    replaces: function(abs) { return !!(G.noteSlotResults && G.noteSlotResults[abs] === 'hit'); },
    burst: burst,           // (맞힌 음표의 칸, 조각 수) — 연출 연결표가 부른다
    finale: finale,         // (음표의 칸 — 생략 = 마지막으로 맞힌 음표) 마지막 성공의 큰 이펙트 — 연출 연결표가 부른다
    gradeOf: gradeOf,       // 맞힌 음표(절대 칸)의 등급 'ace' | 'good'
    policy: FB,
  };
  G.renderFeedback = render;
})();
