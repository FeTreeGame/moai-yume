// rhythm/reveal.js — 패턴 드러내기: 패턴 노출 연출을 대변하는 층 (등장 타이밍·표시 위치·모양·이후 상호작용 표현의 자리)
//   지금 = 자리 표시: 가이드 막대(rhythm/hud.js)의 패턴 위, 같은 자리에 겹쳐 그린다 (화면 층 — 카메라와 무관). 명세 docs/index/pattern-reveal.md
//   드러내는 루프: 한 루프(패턴 길이) 동안 노트가 정확히 그 tick에 하나씩 나타난다
//     떽·어택·릴리즈 = 원 (중심 = 막대가 그 음표를 그리는 자리, 색 = 막대의 패턴 색)
//     홀드 중 = 어택 원 중심 → 릴리즈 원 중심을 잇는 가는 사각형 — 재생 위치를 따라 자라 릴리즈 시각에 닿음 (어택 바로 다음 tick이 릴리즈여도 그림)
//     줄 경계를 넘는 홀드(세션 두 줄)는 줄마다 한 토막. 줄 머리에는 그리지 않음 (본문만)
//   다 드러난 뒤엔 다음 드러내기(패턴 전환)나 지우기(세션 끝·필드 평가 끔)까지 그대로
//   언제·무엇을: 쓰는 쪽이 정한다 (세션 = 발신 단위 — rhythm/session.js, 필드 = js/field-rhythm.js). 여기선 받은 것을 시계대로 그리기만
//   시계 = 리듬 코어의 박 시계 (G.currentBeat × 4 — 지금 붙은 타임라인의 절대 tick, 템포가 바뀌어도 tick 기준)
//   예약: show(owner, pattern, from) — from(절대 tick)이 오기 전엔 앞의 것이 그대로 (교체는 그 시각에 — 턴 예약이 조금 앞서 와도 옛 패턴이 일찍 사라지지 않음)
//   그리기 = 가이드 막대를 그린 바로 뒤 같은 캔버스에 (rhythm/bridge.js M.renderBars — 막대의 불투명도를 따름)
(function() {
  'use strict';
  var G = window.G;

  var STYLE = { r: 6, holdH: 4, stroke: 'rgba(255,255,255,0.85)', ring: 1 };   // 자리 표시 값 (줄 높이 22 기준) · ring = 나타날 때 퍼지는 고리 길이 (tick)
  // 맞힘 표시 (리듬 코어 판정 통지 → mark): 그 루프에서 맞힌 음표는 밝게, 놓친 음표는 어둡게 — 쓰는 쪽마다 무엇을 보일지
  //   필드 = 성공만 (실패 개념보다 성공 여부 — 입력 장려), 세션 = 실패 포함
  var MARKS = { field: { hit: true, miss: false }, session: { hit: true, miss: true } };
  var marks = {};     // 절대 tick → 'hit' | 'miss'
  function mark(kind, tick) {
    var m = kind === 'hit' ? 'hit' : kind === 'miss' ? 'miss' : null;
    if (!m) return;
    if (!(m === 'miss' && marks[tick] === 'hit')) marks[tick] = m;
    Object.keys(marks).forEach(function(k) { if (+k < tick - 96) delete marks[k]; });
  }

  var list = [];   // { owner, pattern, from } — from 오름차순

  function show(owner, pattern, from) {
    if (!pattern || !pattern.length || !(from >= 0)) return;
    list = list.filter(function(e) { return !(e.owner === owner && e.from >= from); });   // 같은 쪽의 같은·뒤 시각 예약은 대체
    list.push({ owner: owner, pattern: pattern.slice(), from: from });
    list.sort(function(a, b) { return a.from - b.from; });
  }
  function clear(owner) { list = owner ? list.filter(function(e) { return e.owner !== owner; }) : []; }
  function active(P) {             // 지금 보일 것 = 시작 시각이 지난 것 중 마지막 (그 앞의 것은 버림)
    var cur = -1;
    for (var i = 0; i < list.length; i++) if (list[i].from <= P) cur = i;
    if (cur > 0) list = list.slice(cur);
    return cur >= 0 ? list[0] : null;
  }

  // 패턴 → 음표 (떽·어택·릴리즈 = 칸 c) + 홀드 (어택 a → 릴리즈 b)
  function notesOf(p) {
    var n = p.length, notes = [], holds = [], a = null;
    for (var c = 0; c <= n; c++) {
      var v = c < n ? p[c] : 0, pv = c > 0 ? p[c - 1] : 0;
      if (v !== 2 && pv === 2) { notes.push({ type: 'release', c: c }); holds.push({ a: a, b: c }); }
      if (v === 2 && pv !== 2) { notes.push({ type: 'attack', c: c }); a = c; }
      if (v === 1) notes.push({ type: 'tap', c: c });
    }
    return { notes: notes, holds: holds };
  }
  // 절대 tick P에 보이는 것: 나타난 음표, 홀드는 어택부터 min(릴리즈, 지금)까지
  function state(P) {
    var e = active(P);
    if (!e) return null;
    var t = P - e.from, nh = notesOf(e.pattern);
    return {
      owner: e.owner, from: e.from, len: e.pattern.length, done: t >= e.pattern.length,
      notes: nh.notes.filter(function(x) { return x.c <= t; }),
      holds: nh.holds.filter(function(h) { return h.a <= t; }).map(function(h) { return { a: h.a, b: Math.min(h.b, t) }; }),
    };
  }

  var COLOR = { tap: [1, 0], attack: [2, 0], release: [0, 2] };   // 막대 패턴 색 (값, 직전 값)
  function render(ctx) {
    if (G.guideStill || !G.guideLayout || !G.guideNoteColor || G.currentBeat == null) return;
    var st = state(G.currentBeat * 4);
    if (!st) return;
    var L = G.guideLayout(st.len), R = L.row;
    function rowOf(c) { return Math.min(L.rows - 1, Math.floor(c / R)); }
    function xIn(r, c) { return L.bgX + (L.lead + c - r * R) * L.slotW; }
    function cy(r) { return L.rowY(r) + L.rowH / 2; }
    ctx.save();
    // 홀드 중: 줄마다 [어택, 릴리즈] 구간의 토막
    ctx.fillStyle = G.guideNoteColor(2, 2);
    ctx.strokeStyle = STYLE.stroke; ctx.lineWidth = 1;
    st.holds.forEach(function(h) {
      for (var r = rowOf(h.a); r <= rowOf(h.b); r++) {
        var s = Math.max(h.a, r * R), e = Math.min(h.b, (r + 1) * R);
        if (e <= s) continue;
        var x = xIn(r, s), w = (e - s) * L.slotW, y = cy(r) - STYLE.holdH / 2;
        ctx.fillRect(x, y, w, STYLE.holdH);
        ctx.strokeRect(x, y, w, STYLE.holdH);
      }
    });
    // 원: 떽·어택·릴리즈 (+ 나타날 때 퍼지는 고리, 그 루프의 맞힘 표시)
    var P = G.currentBeat * 4, t = P - st.from, base = Math.floor(P / st.len) * st.len, show = MARKS[st.owner] || {};
    st.notes.forEach(function(n) {
      var r = rowOf(n.c), k = COLOR[n.type], x = xIn(r, n.c), y = cy(r), m = t >= st.len ? marks[base + n.c] : null;
      ctx.beginPath();
      ctx.arc(x, y, STYLE.r, 0, Math.PI * 2);
      ctx.fillStyle = G.guideNoteColor(k[0], k[1]); ctx.fill();
      ctx.strokeStyle = STYLE.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      var age = t - n.c;
      if (age >= 0 && age < STYLE.ring) {               // 나타남: 고리가 퍼지며 사라짐
        ctx.beginPath(); ctx.arc(x, y, STYLE.r * (1 + 1.6 * age / STYLE.ring), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - age / STYLE.ring)) + ')'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (m === 'hit' && show.hit) {                    // 맞힘: 밝게
        ctx.beginPath(); ctx.arc(x, y, STYLE.r + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, STYLE.r * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      } else if (m === 'miss' && show.miss) {           // 놓침: 어둡게
        ctx.beginPath(); ctx.arc(x, y, STYLE.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
      }
    });
    ctx.restore();
  }

  G.reveal = {
    show: show,            // (owner, 패턴, 드러내는 루프 시작 — 절대 tick) 쓰는 쪽: 'session' | 'field'
    clear: clear,          // (owner) — 없으면 전부
    state: state,          // 시험용: 절대 tick P에 보이는 것
    notesOf: notesOf,
    mark: mark,            // (판정 종류, 절대 tick) — 리듬 코어가 부름 (rhythm/core.js)
    marks: function() { return Object.assign({}, marks); },
    style: STYLE, markPolicy: MARKS,
  };
  G.renderReveal = render;
})();
