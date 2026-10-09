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

  var STYLE = { hold: '#22a045', holdStub: 0.5, stroke: 'rgba(255,255,255,0.85)', ring: 1 };   // 자리 표시 값 (줄 높이 22 기준) · ring = 나타날 때 퍼지는 고리 길이 (tick). 원의 크기 = 배치의 noteR (G.guideLayout — rhythm/guide.js)
  // 맞힘 표시 (리듬 코어 판정 통지 → mark): 그 루프에서 맞힌 음표는 밝게, 놓친 음표는 어둡게 — 쓰는 쪽마다 무엇을 보일지
  //   필드 = 성공만 (실패 개념보다 성공 여부 — 입력 장려), 세션 = 실패 포함
  var MARKS = { field: { hit: true, miss: false }, session: { hit: true, miss: true } };
  var marks = {};     // 절대 tick → 'hit' | 'miss'
  // 램프 (차례의 표시 — 판정과 무관): 음표 원은 자기 차례일 때 밝고 아닐 때는 어둡다
  //   차례 = 그 음표의 시각부터 다음 음표의 시각 전까지 (화면에는 늘 '지금의 음표'가 밝다) — 그 시각에 켜지고 다음 음표의 시각에 꺼진다
  //     fade = 차례 앞 lead칸 동안 서서히 밝아지기 — 꺼 둠: '곧 온다'는 수렴 윤곽이 말하고 램프는 '지금이다'만 말한다 (켜면 둘이 같은 말을 한다)
  //     뚜~ = 어택의 차례가 릴리즈까지 — 누르고 있어야 하는 동안 어택과 그 사이의 띠가 밝다
  //   dim = 차례가 아닐 때의 밝기 (원래 색의 비율), glow = 차례일 때 흰색 쪽으로 밝히는 정도 · blur = 차례일 때 번지는 빛
  var LAMP = { dim: 0.38, glow: 0.4, blur: 12, fade: false, lead: 4 };
  function lampLead() { return G.approach && G.approach.policy ? G.approach.policy.lead : LAMP.lead; }   // 수렴 윤곽과 같은 길이
  function shade(hex, v) {     // v: 0 = 차례 아님 → 1 = 차례
    var n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255], k = LAMP.dim + (1 - LAMP.dim) * v;
    return 'rgb(' + c.map(function(x) { x *= k; return Math.round(x + (255 - x) * LAMP.glow * v); }).join(',') + ')';
  }
  function mark(kind, tick) {
    var m = kind === 'hit' ? 'hit' : kind === 'miss' ? 'miss' : null;
    if (!m) return;
    if (!(m === 'miss' && marks[tick] === 'hit')) marks[tick] = m;
    Object.keys(marks).forEach(function(k) { if (+k < tick - 96) delete marks[k]; });
  }
  // 새 격자 (tick을 다시 셈 — 세션 시작·필드 다시 묶기): 옛 격자의 표시는 버린다. 리듬 코어가 자리에 붙을 때 부름 (rhythm/core.js attach)
  function resetMarks() { marks = {}; }

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
      owner: e.owner, from: e.from, len: e.pattern.length, done: t >= e.pattern.length, all: nh.notes,
      notes: nh.notes.filter(function(x) { return x.c <= t; }),
      holds: nh.holds.filter(function(h) { return h.a <= t; }).map(function(h) { return { a: h.a, b: Math.min(h.b, t), end: h.b }; }),   // end = 릴리즈의 칸 (b는 지금까지 자란 끝)
    };
  }

  var COLOR = { tap: [1, 0], attack: [2, 0], release: [0, 2] };   // 막대 패턴 색 (값, 직전 값)
  function render(ctx) {
    if (G.guideStill || !G.guideLayout || !G.guideNoteColor || G.currentBeat == null) return;
    var st = state(G.currentBeat * 4);
    if (!st) return;
    var L = G.guideLayout(st.len), R = L.row;
    var NR = L.noteR;                                  // 음표 원의 반지름 (지금 가이드 모양의 배치가 정한다 — rhythm/guide.js)
    function rowOf(c) { return Math.min(L.rows - 1, Math.floor(c / R)); }
    function xIn(r, c) { return L.bgX + (L.lead + c - r * R) * L.slotW; }
    function cy(r) { return L.rowY(r) + L.rowH / 2; }
    // 램프: 칸 c의 음표가 지금 얼마나 '차례'인가 (0 ~ 1). u = 그 단위 안의 지금 위치
    var u0 = G.currentBeat * 4 - st.from, u = ((u0 % st.len) + st.len) % st.len, lead = lampLead();
    var cs = st.all.map(function(n) { return n.c; }).filter(function(c, i, a) { return a.indexOf(c) === i; }).sort(function(a, b) { return a - b; });
    function lit(c) {
      var i = cs.indexOf(c), next = i < cs.length - 1 ? cs[i + 1] : st.len + cs[0];
      if (u >= c && u < next) return 1;                                  // 차례
      if (i === cs.length - 1 && u < cs[0]) return 1;                    // 마지막 음표의 차례는 다음 바퀴의 첫 음표까지
      var d = u < c ? c - u : c + st.len - u;                            // 차례까지 남은 칸 (지났으면 다음 바퀴)
      return LAMP.fade && d <= lead ? 1 - d / lead : 0;
    }
    ctx.save();
    // 홀드 구간: 어택 원의 중심 ~ 릴리즈 원의 중심을 잇는 직사각형 (높이 = 음표 원의 지름, 색 = STYLE.hold — 두 원 뒤에 그려진다). 어택의 차례 동안 밝다
    //   줄을 넘으면 줄마다 한 토막: 윗줄은 줄 끝에서 사각으로 끝나고, 아랫줄은 줄 처음보다 STYLE.holdStub칸 앞에서 사각으로 시작한다
    //     (이어받는 토막이 늘 보이게 — 아랫줄 첫 칸이 릴리즈여도 그 원 왼쪽으로 사각형이 나와 있다: 위에서 넘어온 홀드라는 표시)
    ctx.lineWidth = 1;
    st.holds.forEach(function(h) {
      var hv = lit(h.a);
      ctx.fillStyle = shade(STYLE.hold, hv);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * hv) + ')';
      // 릴리즈가 줄의 첫 칸이면 그 줄(아랫줄)까지 — rowOf는 칸이 속한 줄이라 릴리즈 칸 기준으로 본다
      for (var r = rowOf(h.a); r <= Math.min(L.rows - 1, Math.floor(h.b / R)); r++) {
        if (G.guideRowOK && !G.guideRowOK(r)) continue;           // 줄 부각: 지금 그리는 줄만
        var cont = r > rowOf(h.a);                                   // 윗줄에서 이어받는 토막
        var s = Math.max(h.a, r * R) - (cont ? STYLE.holdStub : 0), e = Math.min(h.b, (r + 1) * R);
        if (e <= s) continue;
        var x = xIn(r, s), w = (e - s) * L.slotW, y = cy(r) - NR;
        ctx.fillRect(x, y, w, NR * 2);
        ctx.strokeRect(x, y, w, NR * 2);
      }
    });
    // 가는 중인 릴리즈 원: 홀드가 자라는 동안(어택 ~ 릴리즈 전) 직사각형의 끝에 릴리즈 원이 붙어 함께 간다 — 릴리즈의 칸에서 제자리에 놓인다
    //   (끝이 평평하게 잘려 보이지 않고, 이 홀드가 어디서 끝나는지가 원의 도착으로 보인다. 도착하면 아래의 음표 그리기가 이어받는다 — 나타남의 고리 포함)
    //   그리는 순서: 직사각형 위 · 어택 원 아래 (어택 원 뒤에서 빠져나온다)
    st.holds.forEach(function(h) {
      if (h.b >= h.end) return;                                  // 도착함
      var r = Math.min(L.rows - 1, Math.floor(h.b / R));
      if (G.guideRowOK && !G.guideRowOK(r)) return;
      var hv = lit(h.a), col = shade(G.guideNoteColor(0, 2), hv);
      ctx.beginPath(); ctx.arc(xIn(r, h.b), cy(r), NR, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * hv) + ')'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    // 원: 떽·어택·릴리즈 (+ 나타날 때 퍼지는 고리, 그 루프의 맞힘 표시)
    var P = G.currentBeat * 4, t = P - st.from, base = Math.floor(P / st.len) * st.len, show = MARKS[st.owner] || {};
    st.notes.forEach(function(n) {
      var r = rowOf(n.c), k = COLOR[n.type], x = xIn(r, n.c), y = cy(r), m = t >= st.len && !G.feedback ? marks[base + n.c] : null;   // 맞힘 · 놓침 표시는 판정 피드백(rhythm/feedback.js)이 있으면 그쪽이 맡는다
      if (G.feedback && t >= st.len && G.feedback.replaces(base + n.c)) return;   // 맞힌 음표 = 하트가 원을 대신한다
      if (G.guideRowOK && !G.guideRowOK(r)) return;               // 줄 부각: 지금 그리는 줄만
      var v = lit(n.c), col = shade(G.guideNoteColor(k[0], k[1]), v);
      ctx.beginPath();
      ctx.arc(x, y, NR, 0, Math.PI * 2);
      ctx.shadowColor = col; ctx.shadowBlur = LAMP.blur * v;        // 차례일 때 빛이 번진다
      ctx.fillStyle = col; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.6 * v) + ')'; ctx.lineWidth = 1.5; ctx.stroke();
      var age = t - n.c;
      if (age >= 0 && age < STYLE.ring) {               // 나타남: 고리가 퍼지며 사라짐
        ctx.beginPath(); ctx.arc(x, y, NR * (1 + 1.6 * age / STYLE.ring), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - age / STYLE.ring)) + ')'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (m === 'hit' && show.hit) {                    // 맞힘: 밝게
        ctx.beginPath(); ctx.arc(x, y, NR + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, NR * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      } else if (m === 'miss' && show.miss) {           // 놓침: 어둡게
        ctx.beginPath(); ctx.arc(x, y, NR, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
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
    resetMarks: resetMarks,
    marks: function() { return Object.assign({}, marks); },
    style: STYLE, markPolicy: MARKS, lamp: LAMP,
  };
  G.renderReveal = render;
})();
