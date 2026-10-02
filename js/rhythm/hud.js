// rhythm/hud.js — 가이드 막대: 마디당 한 줄 + 줄 머리(이전 한 박 거울)
// 출처: reference/ra/hud.js G.renderHud 중 막대 부분 (LANE·판정 팝업·동심원·통계 제외)
// 1280×960 논리 좌표 기준. 호출부(bridge.js M.renderBars)가 오버레이 캔버스 변환을 설정한다.
// index 변경:
//   - 패턴 32칸 = 16칸 2줄, tick별 패턴 조회(patternAt — 절대 칸)
//   - 압축 (기능 유지): 비트 가이드 · NPC · INPUT 막대를 한 줄로 합침
//       NPC(상수) = 구멍 — 음표 시각(칸 경계 좌측)을 중심으로 그린다 (떽 / 어택 / 유지 / 릴리즈 색 그대로)
//         → 재생 막대가 구멍 한가운데를 지나는 순간이 정확한 타이밍, 입력 원이 구멍을 채운다
//         구멍 너비 = min(칸, HIT 창) — HIT 창(±good)이 칸보다 좁으면 구멍 = HIT 범위 (구멍 안 = HIT), 넓으면 칸 너비
//         판정 창 (떽·어택·릴리즈): ace 가운데 밝은 띠 · barely 끝선 (G.getJudgeWindows, ms 고정 → BPM 따라 비율 변함)
//         뚜~엉 몸통은 어택 중심 → 릴리즈 중심 칸 너비로 이어 그림, 양 끝 구멍만 HIT 창 너비
//         쉼(0) = 빈 공간 (칠하지 않음). 구멍은 틈 없이 채우고 칸 구분은 격자선이 위에 덮는다
//         칸 결과 톤 (G.noteSlotResults): 판정이 나면 구멍·유지 칸을 HIT = 밝게 / MISS = 어둡게 — 입력 원이 없는 자동 MISS·유지 칸 결과도 보인다
//       격자선 = 칸 경계 (음표 시각 ± ½칸, 두 겹: 어두운 선 + 옅은 선) — 어느 칸의 음표인지
//       비트 가이드 = 정박선(음표 시각 = 구멍 중심, 금색) + 재생 막대 (시간 그대로 지나감)
//       INPUT(변수) = 입력 시각 위치의 작은 원 (G.noteInputMarks, 절대 칸) — 같은 칸 충돌 없음, 위치 = 이르다/늦다
//         원: 떽·어택 = 찬 원, 릴리즈 = 빈 원, 홀드 = 누름~뗌(누르는 중이면 재생 위치까지) 선
//         색: 판정 결과 ace 금 · good 초록 · barely 주황 · 헛침 빨강 · 판정 전 흰색
//   - 경계 연속성: 줄 앞에 머리 구간(한 박 = 4칸) — 앞줄 마지막 한 박을 비춘다 (구멍·재생 막대·입력 원)
//       재생 막대가 앞줄 마지막 박을 지나는 동안 다음 줄 머리에서도 흘러 첫 음표로 다가간다
//       1줄 머리는 순환: 단위 마지막 박을 지나는 중이면 그 박(다음 단위로 이어짐 — 응답은 발신과 같은 패턴),
//       아니면 이전 단위의 마지막 박. 경계 직전에 일찍 친 입력이 사라지지 않는다
//       재생 막대·입력 원은 줄 안에서 그 위치가 보이는 곳마다 (본문·머리 — 한 줄이면 마지막 박 동안 둘 다: 경계에서 본문 끝의 것은 끝나고 머리의 것이 첫 박으로 이어짐)
//       한 줄(필드 1루프)이면 머리는 같은 줄의 칸을 비추므로 판정 결과 톤을 칠하지 않는다 (패턴만 — 비추는 대상이 바뀔 때 톤이 깜빡이지 않게)
(function(){
'use strict';
var G = window.G;

var ROW = 16;                                 // 한 줄 = 16칸 (1마디)
var LEAD = 4;                                 // 줄 머리 = 한 박
var RES_COLOR = { ace: '#ffd700', good: '#39ff14', barely: '#ff9500', whiff: '#ff4757' };
// 칸 결과 톤 (G.noteSlotResults): HIT = 밝게, MISS = 어둡게 — 판정 전은 원래 색 (자동 MISS·유지 칸 결과도 보인다)
var SLOT_TONE = { hit: 'rgba(255,255,255,0.30)', miss: 'rgba(0,0,0,0.55)' };

// NPC 칸 색 (값·직전 값)
function npcColor(v, prevV) {
  if (v === 1) return '#b8960a';                                   // 떽
  if (v === 2) return prevV === 2 ? '#005868' : '#0090a8';          // 유지 / 어택
  if (prevV === 2) return '#5a3880';                                // 릴리즈
  return '#2a2640';                                                  // 빈칸
}

// 막대 자리 (칸 수 len → 줄 수·줄 위치·칸 너비) — 막대와 그 위에 겹쳐 그리는 층(rhythm/reveal.js)이 같은 값을 쓴다
//   본문 칸 c(줄 안 0~15)의 음표 시각 x = bgX + (LEAD + c) × slotW, 줄 r의 세로 = rowY(r) ~ + rowH
function layout(len) {
  var bgW = Math.min(G.W * 0.7, 840);
  var bgX = G.W / 2 - bgW / 2;
  var rowH = 22, gap = 6, bottom = G.H - 14;
  var rows = Math.max(1, Math.ceil(len / ROW));
  var top0 = bottom - rows * rowH - (rows - 1) * gap;
  return { bgX: bgX, bgW: bgW, slotW: bgW / (LEAD + ROW), rowH: rowH, gap: gap, rows: rows, lead: LEAD, row: ROW,
    rowY: function(r) { return top0 + r * (rowH + gap); } };
}
G.guideLayout = layout;
G.guideNoteColor = npcColor;

G.renderGuideBars = function(ctx) {

  var still = !!G.guideStill;                 // 박 시계 없음 (필드 — BGM 전): 재생 막대 없이 빈 막대 (js/field-rhythm.js)
  var P = still ? 0 : G.currentBeat * 4;      // 현재 절대 칸 (소수)
  var tickNow = Math.floor(P);

  var tb = G.noteTargetObj;
  function valAt(abs) {                       // 절대 칸의 패턴 값
    if (!tb) return 0;
    var pat = tb.patternAt ? tb.patternAt(abs) : (tb.notePattern || null);
    if (!pat) return 0;
    var n = pat.length;
    return pat[((abs % n) + n) % n] || 0;
  }
  var pat0 = tb && tb.patternAt ? tb.patternAt(tickNow) : null;
  var len = pat0 ? pat0.length : G.noteInputLen;
  var L = layout(len);
  var bgW = L.bgW, bgX = L.bgX, slotW = L.slotW, rowH = L.rowH, rows = L.rows, rowY = L.rowY;
  var U = Math.floor(tickNow / len) * len;    // 표시 단위 시작 (절대 칸)

  // 줄 r의 창: 본문 [S, S+ROW) + 머리 [A, A+LEAD) (A = 비추는 한 박의 시작, 절대 칸)
  function rowWin(r) {
    var S = U + r * ROW, A = S - LEAD;
    if (r === 0 && P >= U + len - LEAD) A = U + len - LEAD;   // 1줄 머리 순환: 단위 마지막 박
    return { S: S, A: A };
  }
  // 절대 위치 → 줄 r 안의 x들 (본문·머리 중 보이는 곳마다 — 한 줄이면 마지막 박은 둘 다)
  function xsIn(w, abs) {
    var out = [];
    if (abs >= w.S && abs < w.S + ROW) out.push(bgX + (LEAD + abs - w.S) * slotW);
    if (abs >= w.A && abs < w.A + LEAD) out.push(bgX + (abs - w.A) * slotW);
    return out;
  }
  // 절대 구간 [a, b) → 줄 r 안의 x 구간들 (본문·머리에 걸친 부분)
  function spansIn(w, a, b) {
    var out = [];
    [[w.S, w.S + ROW, bgX + LEAD * slotW], [w.A, w.A + LEAD, bgX]].forEach(function(seg) {
      var s = Math.max(a, seg[0]), e = Math.min(b, seg[1]);
      if (e > s) out.push([seg[2] + (s - seg[0]) * slotW, seg[2] + (e - seg[0]) * slotW]);
    });
    return out;
  }

  var marks = G.noteInputMarks || [];
  // 판정 창 → 픽셀 (1칸 = 16분음표 = BEAT_SEC/4 초)
  var JW = G.getJudgeWindows ? G.getJudgeWindows() : null;
  var pxPerSec = slotW / (G.BEAT_SEC / 4);
  // 구멍 너비 = min(칸, HIT 창 폭) — HIT 창(±good)이 칸보다 넓으면 칸 너비 (넓게 그리면 이웃과 겹침)
  //   틈 없이 채우고 칸 구분은 위에 덮는 격자선이 맡는다
  var holeW = Math.min(slotW, JW ? JW.good * 2 * pxPerSec : slotW);

  for (var r = 0; r < rows; r++) {
    var y = rowY(r), w = rowWin(r);
    ctx.save();
    ctx.beginPath(); ctx.rect(bgX, y, bgW, rowH); ctx.clip();
    ctx.fillStyle = 'rgba(16,14,36,0.85)';
    ctx.fillRect(bgX, y, bgW, rowH);

    // 구멍 (NPC): 음표 시각 = 칸 경계 좌측을 중심으로 한 칸 폭
    var toneOn = true;                          // 머리(한 줄)에서는 끔
    function tone(abs, x, w) {                  // 칸 결과 톤 덧칠
      if (!toneOn) return;
      var r = G.noteSlotResults && G.noteSlotResults[abs];
      if (!r) return;
      ctx.fillStyle = SLOT_TONE[r]; ctx.fillRect(x, y + 1, w, rowH - 2);
    }
    function holes(from, count, x0) {
      for (var k = -1; k <= count; k++) {       // 양옆 반 칸이 걸치는 이웃까지
        var abs = from + k;
        var cx = x0 + k * slotW;
        var v = valAt(abs), pv = valAt(abs - 1), nv = valAt(abs + 1);
        var sustainCol = npcColor(2, 2);
        // 뚜~엉 몸통: 어택 중심 → 릴리즈 중심까지 칸 너비로 끊김 없이 (유지 칸 전체, 어택 오른쪽 반, 릴리즈 왼쪽 반)
        if (v === 2 && pv === 2) { ctx.fillStyle = sustainCol; ctx.fillRect(cx - slotW / 2, y + 1, slotW, rowH - 2); tone(abs, cx - slotW / 2, slotW); }
        if (v === 2 && pv !== 2 && nv === 2) { ctx.fillStyle = sustainCol; ctx.fillRect(cx, y + 1, slotW / 2, rowH - 2); }
        if (v !== 2 && pv === 2) { ctx.fillStyle = sustainCol; ctx.fillRect(cx - slotW / 2, y + 1, slotW / 2, rowH - 2); }
        if (v === 2 && pv === 2) continue;      // 유지 칸은 구멍 없음
        if (v === 0 && pv !== 2) continue;      // 쉼 = 빈 공간 (칠하지 않음 — 칸 위치는 격자선)
        // 구멍: 너비 = min(칸, HIT 창) — HIT 창이 칸보다 좁으면 구멍 = HIT 범위 (구멍 안 = HIT)
        ctx.fillStyle = npcColor(v, pv);
        ctx.fillRect(cx - holeW / 2, y + 1, holeW, rowH - 2);
        tone(abs, cx - holeW / 2, holeW);
        // 판정 창 (입력이 필요한 음표 = 떽·어택·릴리즈): ace 가운데 띠 · barely 끝선 (구멍 바깥일 수 있음)
        if (JW && (v === 1 || v === 2 || pv === 2)) {
          var bw = JW.barely * pxPerSec, aw = JW.ace * pxPerSec;
          ctx.fillStyle = 'rgba(255,255,255,0.32)';
          ctx.fillRect(cx - aw, y + 3, aw * 2, rowH - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(cx - bw, y + 3, 1, rowH - 6);
          ctx.fillRect(cx + bw - 1, y + 3, 1, rowH - 6);
        }
      }
    }
    toneOn = rows > 1;
    holes(w.A, LEAD, bgX);                      // 머리
    toneOn = true;
    // 머리·본문 사이 경계를 기준으로 본문을 다시 그린다 (본문 첫 구멍의 왼쪽 반이 머리 끝에 걸침)
    ctx.save();
    ctx.beginPath(); ctx.rect(bgX + LEAD * slotW - slotW / 2, y, bgW, rowH); ctx.clip();
    holes(w.S, ROW, bgX + LEAD * slotW);
    ctx.restore();

    // 격자선: 칸 경계 (음표 시각 ± ½칸) — 구멍이 자기 칸 한가운데에 놓인다. 막대 높이 전체 (barely 끝선은 위아래 여백으로 구분)
    //   두 겹: 어두운 선(맞닿은 구멍 사이) + 옅은 선(빈 배경 위)
    for (var gx = 1; gx <= LEAD + ROW; gx++) {
      var gX = Math.round(bgX + (gx - 0.5) * slotW);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';       ctx.fillRect(gX - 1, y, 1, rowH);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(gX, y, 1, rowH);
    }

    // 박자선: 정박(4칸마다)만, 음표 시각 = 구멍 중심. 금색
    for (var t = 0; t < LEAD + ROW; t++) {
      var absT = t < LEAD ? w.A + t : w.S + t - LEAD;
      if (absT % 4 !== 0) continue;
      ctx.fillStyle = 'rgba(255,200,50,0.55)';
      ctx.fillRect(bgX + t * slotW, y, 1, rowH);
    }
    // 머리 구간: 어둡게 (첫 구멍의 왼쪽 가장자리까지)
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(bgX, y, LEAD * slotW - slotW / 2, rowH);

    // 재생 막대 (창 안에 있으면 — 앞줄 마지막 박이면 머리에서도)
    (still ? [] : xsIn(w, P)).forEach(function(px) {
      ctx.fillStyle = '#39ff14';
      ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 8;
      ctx.fillRect(px - 1, y, 3, rowH);
      ctx.shadowBlur = 0;
    });

    // 홀드 선: 누름 → 뗌 (뗌이 없고 누르는 중이면 재생 위치까지)
    var cy = y + rowH / 2;
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].type !== 'hold-start') continue;
      var endAbs = null;
      for (var k2 = i + 1; k2 < marks.length; k2++) {
        if (marks[k2].type === 'hold-end') { endAbs = marks[k2].abs; break; }
        if (marks[k2].type === 'hold-start') break;
      }
      if (endAbs === null && G.noteInputHolding && k2 >= marks.length) endAbs = P;
      if (endAbs === null || endAbs <= marks[i].abs) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      spansIn(w, marks[i].abs, endAbs).forEach(function(sp) {
        ctx.beginPath(); ctx.moveTo(sp[0], cy); ctx.lineTo(sp[1], cy); ctx.stroke();
      });
    }
    // 원: 떽·어택 = 찬 원, 릴리즈 = 빈 원, 색 = 판정 결과
    for (var m = 0; m < marks.length; m++) {
      var mk = marks[m], xs = xsIn(w, mk.abs);
      var col = RES_COLOR[mk.res] || '#ffffff';
      for (var q = 0; q < xs.length; q++) {
        ctx.beginPath();
        ctx.arc(xs[q], cy, 3.5, 0, Math.PI * 2);
        if (mk.type === 'hold-end') {
          ctx.fillStyle = 'rgba(16,14,36,0.9)'; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(bgX, y, bgW, rowH);
  }
  ctx.textAlign = 'start';
};

})();
