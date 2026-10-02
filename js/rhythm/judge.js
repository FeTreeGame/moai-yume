// rhythm/judge.js — 판정 시스템 (관찰형, HS PlayerActionEvent 패턴)
// 출처: reference/ra/judge.js — index 변경: 판정 통지 훅 G.onJudgeStat, 입력 시각 인자(recordNoteInput),
//   매칭 → 폐기 순서, 단일 버튼 누름/뗌(press·release — 종류 무관 터치 다운 판정), 단위 길이 G.noteInputLen, 입력 표시 G.noteInputMarks(칸 배열 대신),
//   인카운터 동그라미·applyBlockLevel 제거
// 의존: G.actx, G.noteTargetObj, G.showJudge·G.getPlayerHolding (bridge.js)
//
// 기대 이벤트를 NPC 패턴에서 사전 생성하고,
// 매 프레임 입력 버퍼와 기대 이벤트를 매칭하여 HIT/MISS 판정.
// 윈도우를 아무 입력 없이 지나치면 자동 MISS.
(function(){
'use strict';
var G = window.G;

// ── 유닛 타입: 판정 윈도우 크기 (난이도) ──
// ace/good/barely: 각 등급의 윈도우 크기 (초)
// HIT = ace + good (전 레벨 공통), BARELY 이하 = MISS
// index: 레벨 = 프리셋일 뿐 — 판정 창은 명시적 설정(judgeCfg)이 기준 (설정 탭 js/judge-config.js)
var UNIT_TYPES = {
  easy:   { label: 'EASY',   ace: 0.050, good: 0.120, barely: 0.160 },
  normal: { label: 'NORMAL', ace: 0.030, good: 0.080, barely: 0.120 },
  hard:   { label: 'HARD',   ace: 0.015, good: 0.040, barely: 0.070 }
};
var HIT_GRADES = { ace: true, good: true }; // 고정: ace+good = HIT

// ── index: 판정 창 설정 ──
// mode 'abs' = 절대치: 값 = 반폭 (초), BPM과 무관
// mode 'rel' = 상대치: 값 = 창 전체 폭 ÷ 칸 (1 = 칸에 꽉 참, 1 초과 허용) — 칸 길이(16분음표)는 현재 BPM
// preset = 값이 프리셋 그대로면 그 이름, 값을 직접 바꾸면 null
// 기본 = 상대치 50 / 100 / 150 % (GOOD 100% = 구멍이 칸에 꽉 참 — 100 BPM ±37.5 / 75 / 112.5 ms)
var JUDGE_DEFAULT = { mode: 'rel', preset: null, ace: 0.5, good: 1.0, barely: 1.5 };
var judgeCfg = Object.assign({}, JUDGE_DEFAULT);
var jw = null;                                  // 현재 판정 창 (초, 반폭) — 매 프레임 판정 시작 때 갱신
function slotSec() { return G.BEAT_SEC / 4; }
function cfgToSec(v, mode) { return mode === 'rel' ? v * slotSec() / 2 : v; }
function secToCfg(sec, mode) { return mode === 'rel' ? sec * 2 / slotSec() : sec; }
// 현재 판정 창 조회 (초, 반폭) — 판정과 가이드 막대(hud.js 구멍·ace 띠·barely 끝선)가 같은 값을 쓴다
G.getJudgeWindows = function() {
  var m = judgeCfg.mode;
  return { ace: cfgToSec(judgeCfg.ace, m), good: cfgToSec(judgeCfg.good, m), barely: cfgToSec(judgeCfg.barely, m) };
};
G.getJudgeConfig = function() { return Object.assign({}, judgeCfg); };
// 값 하나 바꾸기 (현재 모드 단위) — ace ≤ good ≤ barely 순서는 나머지를 밀어서 지킨다
G.setJudgeValue = function(key, v) {
  if (['ace', 'good', 'barely'].indexOf(key) < 0) return;
  v = Math.max(0, v);
  judgeCfg[key] = v;
  if (key === 'ace')    { judgeCfg.good = Math.max(judgeCfg.good, v); judgeCfg.barely = Math.max(judgeCfg.barely, judgeCfg.good); }
  if (key === 'good')   { judgeCfg.ace = Math.min(judgeCfg.ace, v); judgeCfg.barely = Math.max(judgeCfg.barely, v); }
  if (key === 'barely') { judgeCfg.good = Math.min(judgeCfg.good, v); judgeCfg.ace = Math.min(judgeCfg.ace, judgeCfg.good); }
  judgeCfg.preset = null;
};
// 모드 전환 — 현재 BPM에서 같은 창이 되도록 값을 환산 (전환 순간 판정 불변)
G.setJudgeMode = function(mode) {
  if ((mode !== 'abs' && mode !== 'rel') || mode === judgeCfg.mode) return;
  ['ace', 'good', 'barely'].forEach(function(k) { judgeCfg[k] = secToCfg(cfgToSec(judgeCfg[k], judgeCfg.mode), mode); });
  judgeCfg.mode = mode;
};
// 저장값 복원 (설정 탭) — 잘못된 값이면 무시
G.loadJudgeConfig = function(c) {
  if (!c || (c.mode !== 'abs' && c.mode !== 'rel')) return;
  if (!(c.ace >= 0 && c.good >= c.ace && c.barely >= c.good)) return;
  judgeCfg = { mode: c.mode, preset: UNIT_TYPES[c.preset] ? c.preset : null, ace: c.ace, good: c.good, barely: c.barely };
};
G.resetJudgeConfig = function() { judgeCfg = Object.assign({}, JUDGE_DEFAULT); };

// ── 기대 이벤트 큐 ──
// {type:'tap'|'hold-start'|'hold-end'|'hold', time:AudioContext시각, tick:절대tick, consumed:bool}
var expectedEvents = [];
var judgeStats = { ace: 0, good: 0, barely: 0, miss: 0, whiff: 0, hit: 0, holdHit: 0, holdMiss: 0 };

// ── [비활성] 홀드 구간 방식 (f63405d에서 보존) ──
// var expectedHolds = [];
// 구간 방식은 scheduleJudgeHold/recordNoteInput started/processJudgeEvents 2단계로 구성
// 개별 기대 노트 방식으로 대체됨 — hold 타입 이벤트를 expectedEvents에 직접 추가

// ── 입력 버퍼 ──
// {type:'tap'|'hold-start'|'hold-end'|'press'|'release', time:AudioContext시각}
//   index: press / release = 단일 버튼 — 누름은 떽·어택 구분 없이 터치 다운 시각으로 판정,
//          뗌은 그 누름이 어택에 매칭됐을 때만 엉(hold-end)으로 판정 (떽·헛침 누름의 뗌은 판정 안 함)
//          떽/엉 소리 분기(누른 길이)는 original.js 그대로 — 판정과 무관
var inputBuffer = [];
var lastPress = null;   // 마지막 단일 누름 (뗌이 어느 누름의 뗌인지)

// ── 슬롯별 히트 데이터 (INPUT 막대 렌더용) ──
// 각 슬롯: null(미입력) 또는 {delta:ms, grade:문자열}

// index: 판정 통지 — 통계 증가마다 (종류, 절대 tick) 전달. 루프 단위 집계(루프 테스트)용
// kind: 'hit' | 'miss' | 'whiff' | 'holdHit' | 'holdMiss'
function notifyStat(kind, tick) {
  // index: 칸 결과 기록 (가이드 막대 채우기 톤 — hud.js). 헛침은 칸이 아니라 입력이라 제외, 한 칸에 둘이면 MISS 우선
  //   자동 MISS·건너뜀처럼 입력 원이 없는 결과도 여기서 막대에 남는다
  if (kind !== 'whiff' && G.noteSlotResults && G.noteSlotResults[tick] !== 'miss')
    G.noteSlotResults[tick] = (kind === 'hit' || kind === 'holdHit') ? 'hit' : 'miss';
  if (G.onJudgeStat) G.onJudgeStat(kind, tick);
}

// 기대 이벤트 생성: NPC 스케줄러와 동기화
// scheduleNoteSounds에서 호출 — NPC가 사운드를 예약할 때 판정 이벤트도 함께 생성
G.scheduleJudgeEvent = function(type, schedTime, absTick) {
  // 이미 같은 tick+type이 있으면 중복 방지
  for (var i = 0; i < expectedEvents.length; i++) {
    var ev = expectedEvents[i];
    if (ev.tick === absTick && ev.type === type) return;
  }
  expectedEvents.push({
    type: type,
    time: schedTime,
    tick: absTick,
    consumed: false
  });
};

// index: 아직 오지 않은 기대 이벤트 버리기 (fromTime 이후 — 선행 예약분). 붙은 채로 패턴이 바뀔 때 (필드 — js/field-rhythm.js)
G.dropJudgeEvents = function(fromTime) {
  for (var i = expectedEvents.length - 1; i >= 0; i--) {
    if (!expectedEvents[i].consumed && expectedEvents[i].time >= fromTime) expectedEvents.splice(i, 1);
  }
};

// [비활성] 구간 방식 scheduleJudgeHold — f63405d 참조
// G.scheduleJudgeHold = function(startTick, endTick, startTime, endTime) { ... };

// 입력 기록: 조작 함수(doTap/startDoo/playWop)에서 호출
// index: time = 입력 시각 (생략 시 지금). 단일 버튼은 누름(press)·뗌(release) 그대로 (original.js)
G.recordNoteInput = function(type, time) {
  var c = G.actx;
  if (!c) return;
  if (!G.noteTargetObj) return;
  var t = (time != null) ? time : c.currentTime;
  var inp = { type: type, time: t, mark: null };
  inputBuffer.push(inp);
  // 단일 버튼 뗌: 누름의 매칭 결과를 기다렸다가 엉으로 판정하거나 버린다 (표시도 그때)
  if (type === 'release') { inp.press = lastPress; lastPress = null; return; }
  if (type === 'press') lastPress = inp;

  // ── 입력 표시 기록 (대리/실 입력 공통 단일 진입점) — index: 칸 배열 대신 입력 하나당 표시 하나 ──
  //   절대 칸 위치 (입력 시각 그대로) — 단위 경계를 넘어도 이어진다. 오래된 표시는 세션이 정리 (session.js)
  if (type === 'hold-start') G.noteInputHolding = true;
  else if (type === 'hold-end') {
    if (!G.noteInputHolding) return;       // 시작 없는 릴리즈 무시
    G.noteInputHolding = false;
  }
  inp.mark = { abs: G.timeToBeat(t) * 4, type: type, res: null };
  G.noteInputMarks.push(inp.mark);
};

// 입력 종류 ↔ 기대 이벤트 종류 — index: 단일 버튼 누름(press)은 떽·어택 모두와 맞는다
function typeMatches(evType, inType) {
  return inType === 'press' ? (evType === 'tap' || evType === 'hold-start') : evType === inType;
}

// 매칭할 기대 이벤트 찾기 — index: HIT 우선, 같은 부류 안에서는 가장 이른 미소비 (시간순 소비)
//   HIT 후보(±good 안)가 있으면 그중 가장 이른 것, 없으면 barely 후보 중 가장 이른 것 (ace·good 구분 없음)
//   → 창이 겹칠 때 앞의 미처리 음표 barely가 뒤 음표의 HIT 입력을 가로채지 않는다 (음표 N개 겹침에도 동일)
function findMatchEvent(type, inputTime) {
  var hit = null, barely = null;
  for (var i = 0; i < expectedEvents.length; i++) {
    var ev = expectedEvents[i];
    if (ev.consumed) continue;
    if (!typeMatches(ev.type, type)) continue;
    var dist = Math.abs(inputTime - ev.time);
    if (dist > jw.barely) continue;
    if (dist <= jw.good) { if (!hit || ev.time < hit.time) hit = ev; }
    else if (!barely || ev.time < barely.time) barely = ev;
  }
  return hit || barely;
}

// 건너뜀 확정 — index: 매칭된 음표보다 앞선, 같은 입력이 맞출 수 있던 미처리 음표는 즉시 오답 (소비 순서 = 시간순 유지)
//   뒤이은 엉뚱한 입력이 그 음표를 barely로 소비하지 않고 헛침이 된다
function skipEarlier(matched, inType) {
  for (var i = 0; i < expectedEvents.length; i++) {
    var ev = expectedEvents[i];
    if (ev.consumed || !typeMatches(ev.type, inType) || ev.time >= matched.time) continue;
    ev.consumed = true;
    judgeStats.miss++;
    notifyStat('miss', ev.tick);
    G.showJudge('MISS', 'miss');
  }
}

// 등급 판정 + 통계 기록
function gradeAndRecord(ev, inputTime, mark) {
  var delta = inputTime - ev.time; // 양수=늦음, 음수=빠름
  var absDelta = Math.abs(delta);

  var grade;
  if (absDelta <= jw.ace)        grade = 'ace';
  else if (absDelta <= jw.good)  grade = 'good';
  else                                 grade = 'barely';

  ev.consumed = true;
  judgeStats[grade]++;

  // 그룹핑: ace+good = HIT, barely = MISS (레벨 불문)
  var isHit = !!HIT_GRADES[grade];
  var group = isHit ? 'hit' : 'miss';
  notifyStat(group, ev.tick);
  if (isHit) {
    judgeStats.hit++;
    G.showJudge('HIT', 'ace');
  } else {
    judgeStats.miss++;
    G.showJudge('MISS', 'miss');
  }

  // 입력 표시에 판정 결과 기록 (hud.js 원 색)
  if (mark) mark.res = grade;
}

// ── 매 프레임 판정 처리 (관찰형) ──
function processJudgeEvents() {
  var c = G.actx;
  if (!c) return;
  var now = c.currentTime;
  jw = G.getJudgeWindows();                     // index: 설정·BPM 변경을 매 프레임 반영

  // 1) 입력 버퍼 → 기대 이벤트 매칭
  var j = 0;
  while (j < inputBuffer.length) {
    var inp = inputBuffer[j];
    // index: 단일 버튼 뗌 — 누름이 어택에 매칭됐으면 엉(hold-end)으로 바꿔 같은 자리에서 판정, 아니면 버림
    if (inp.type === 'release') {
      var pr = inp.press;
      if (pr && !pr.resolved && inputBuffer.indexOf(pr) >= 0) { j++; continue; }   // 누름 매칭 대기
      inputBuffer.splice(j, 1);
      if (!pr || pr.resolved !== 'hold-start') continue;                            // 떽·헛침 누름의 뗌
      G.noteInputHolding = false;
      var rel = { type: 'hold-end', time: inp.time, mark: { abs: G.timeToBeat(inp.time) * 4, type: 'hold-end', res: null } };
      G.noteInputMarks.push(rel.mark);
      inputBuffer.splice(j, 0, rel);
      continue;
    }
    // index: 매칭을 먼저 시도 — 과거 시각으로 기록된 입력이 매칭 전에 폐기되지 않도록
    //        (매칭은 입력 시각 기준 판정 창 안의 노트끼리만 되므로 결과는 동일)
    var ev = findMatchEvent(inp.type, inp.time);
    if (ev) {
      skipEarlier(ev, inp.type);
      gradeAndRecord(ev, inp.time, inp.mark);
      // 단일 버튼 누름: 매칭된 종류로 확정 — 어택이면 누르고 있음(유지 칸 판정·홀드 선 표시)
      if (inp.type === 'press') {
        inp.resolved = ev.type;
        if (inp.mark) inp.mark.type = ev.type;
        if (ev.type === 'hold-start') G.noteInputHolding = true;
      }
      inputBuffer.splice(j, 1);
      continue;
    }
    // 아직 매칭 안 됨 — 미래의 기대 이벤트가 올 수 있으므로 유보
    // 단, 윈도우를 완전히 지난 입력은 whiff
    // index: 오래된 입력(최대 윈도우폭보다 과거)도 폐기 대신 whiff — 매칭 못 한 입력은 모두 whiff로 집계
    var hasUpcoming = false;
    if (now - inp.time <= jw.barely + 0.050) {
      for (var k = 0; k < expectedEvents.length; k++) {
        var ek = expectedEvents[k];
        if (ek.consumed) continue;
        if (!typeMatches(ek.type, inp.type)) continue;
        if (inp.time >= ek.time - jw.barely) {
          hasUpcoming = true;
          break;
        }
      }
    }
    if (!hasUpcoming) {
      judgeStats.whiff++;
      notifyStat('whiff', Math.floor(G.timeToBeat(inp.time) * 4));
      if (inp.mark) inp.mark.res = 'whiff';
      inp.resolved = 'whiff';
      inputBuffer.splice(j, 1);
      continue;
    }
    j++;
  }

  // 2) 홀드 유지 판정 (개별 기대 노트 — 상태 기반)
  // hold 타입 이벤트: schedTime 도래 시 started(noteInputHolding) && holding(playerHolding) 체크
  var holding = G.getPlayerHolding ? G.getPlayerHolding() : false;
  var hi = 0;
  while (hi < expectedEvents.length) {
    var hev = expectedEvents[hi];
    if (hev.type !== 'hold' || hev.consumed) { hi++; continue; }
    if (now < hev.time) { hi++; continue; } // 아직 도래하지 않음
    hev.consumed = true;
    if (G.noteInputHolding && holding) {
      judgeStats.holdHit++;
      notifyStat('holdHit', hev.tick);
    } else {
      judgeStats.holdMiss++;
      notifyStat('holdMiss', hev.tick);
    }
    expectedEvents.splice(hi, 1);
    continue;
  }

  // 3) 윈도우를 지난 미소비 기대 이벤트 → 자동 MISS
  var i = 0;
  while (i < expectedEvents.length) {
    var ev2 = expectedEvents[i];
    if (ev2.consumed) {
      expectedEvents.splice(i, 1);
      continue;
    }
    if (now > ev2.time + jw.barely) {
      ev2.consumed = true;
      if (ev2.type === 'hold') {
        judgeStats.holdMiss++; // 홀드 유지 노트 미판정 → holdMiss
        notifyStat('holdMiss', ev2.tick);
      } else {
        judgeStats.miss++;
        notifyStat('miss', ev2.tick);
        G.showJudge('MISS', 'miss');
      }
      expectedEvents.splice(i, 1);
      continue;
    }
    i++;
  }
}

// 판정 통계 조회
G.getJudgeStats = function() {
  return { ace: judgeStats.ace, good: judgeStats.good,
           barely: judgeStats.barely, miss: judgeStats.miss,
           whiff: judgeStats.whiff, hit: judgeStats.hit,
           holdHit: judgeStats.holdHit, holdMiss: judgeStats.holdMiss };
};

// 판정 통계 리셋
G.resetJudgeStats = function() {
  judgeStats.ace = 0;
  judgeStats.good = 0;
  judgeStats.barely = 0;
  judgeStats.miss = 0;
  judgeStats.whiff = 0;
  judgeStats.hit = 0;
  judgeStats.holdHit = 0;
  judgeStats.holdMiss = 0;
  expectedEvents.length = 0;
  inputBuffer.length = 0;
  lastPress = null;
  G.noteSlotResults = {};
  G.noteInputMarks = [];
};

// 유닛 타입 변경 — index: 프리셋 적용 (값을 현재 모드 단위로 환산해 채운다)
G.setUnitType = function(name) {
  var p = UNIT_TYPES[name];
  if (!p) return null;
  ['ace', 'good', 'barely'].forEach(function(k) { judgeCfg[k] = secToCfg(p[k], judgeCfg.mode); });
  judgeCfg.preset = name;
  return p.label;
};

// index: 표시 이름 — 프리셋 그대로면 그 이름, 직접 바꾼 값이면 CUSTOM (상대치면 %)
G.getUnitType = function() {
  return (judgeCfg.preset ? UNIT_TYPES[judgeCfg.preset].label : 'CUSTOM') + (judgeCfg.mode === 'rel' ? ' %' : '');
};

// 매 프레임 판정 처리 (세션 프레임 루프에서 호출)
G.updateJudge = function() {
  processJudgeEvents();
};

})();
