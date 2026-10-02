// ================================================
// rhythm/core.js — 리듬 코어: 판정·가이드 막대의 자리 하나를 쓰는 쪽(세션 rhythm/session.js · 필드 평가 js/field-rhythm.js)이 같은 방식으로 붙고 뗀다
// 로드 순서: rhythm/(init·audio·judge·hud) → rhythm/bridge.js → rhythm/conductor.js → rhythm/core.js → rhythm/(voices·session)
//   자리 = 판정 대상 패턴(G.noteTargetObj.patternAt) · 막대 길이(G.noteInputLen) · 입력 표시·칸 결과 · 판정 통지(G.onJudgeStat)
//   한 번에 하나 (세션과 필드 평가는 동시에 돌지 않는다 — 세션이 시작되면 필드 평가가 떨어지고 끝나면 다시 붙음)
//   박 시계 (G.BPM · G.BEAT_SEC · G.startTime — 판정·막대·떽/엉 기준이 쓰는 격자): 묶은 타임라인에서 (clock(tl) — 기본 main).
//     그 타임라인이 (다시) 시작하면 다시 읽는다 (conductor.js C.onTimeline 'start'). 진입 대기는 기준 타임라인(BGM·무음)에, 세션 진행은 main에 묶는다
//   프레임마다 (쓰는 쪽의 루프가 부름 — 사이에 자기 일을 끼울 수 있게 셋으로): beat(now) 박 시계 갱신 → tick /
//     advance(tick, judging) 판정 진행(judging일 때) + 지난 표시 정리 / draw() 가이드 막대 그리기 (bridge.js M.renderBars)
//   패턴 사건 규칙 (단일 원천): eventsAt(tick, patternAt?) — 칸 값 2 & 직전≠2 → 'hold-start' / 2 & 직전=2 → 'hold'(유지) /
//     직전=2 & 지금≠2 → 'hold-end' / 1 → 'tap'. patternAt(tick) → 그 tick이 속한 패턴 (생략 = 지금 쓰는 쪽의 것). 시작 전(tick < 0) = 0
//   판정 사건 공급: judgeFeed(judged?) → Conductor 채널 — tick마다 사건을 판정에 등록 (judged(tick)가 거짓인 tick은 건너뜀 — 예: 발신 단위)
//   단위별 집계: 판정 통지(G.onJudgeStat)를 받아 그 tick의 단위(쓰는 쪽 len)에 HIT·MISS·헛침을 세고, 단위의 노트를 모두 맞히면
//     done → 쓰는 쪽 onClear(unit, 집계). 기대 수 = 쓰는 쪽 expect(unit) (생략 = 그 단위의 사건 수). 헛침은 확정 전/후(whiffAfter)로 나눠 셈
//     stats(unit) 읽기 / dropStats(unit) 그 단위 이전 버림. 붙을 때 비움
//   쓰는 쪽 = { patternAt(tick), len, expect?(unit), onClear?(unit, st), onStat?(kind, tick, st), judges?(), marks?(), drawAt?(tick) }
//     drawAt = 막대에 그릴 패턴 (생략 = patternAt — 판정과 같음). 예: 필드 — 시작 전인 새 패턴이 경계 앞에 새어 보이지 않게
//     judges() = 지금 입력을 판정하나 (생략 = 늘), 아니면 marks() = 친 위치만 표시하나 — inputMode() (bridge.js 입력 연결)
//   판정 일반 부품을 세션에서 꺼내 모음 (2026-10-01, 단계 8개 — 명세 docs/index/judgment.md "리듬 코어"): 자리 · 박 시계 · 프레임 일 ·
//     사건 규칙·공급 · 단위별 집계 · 입력 연결 기준(bridge.js) · 타임라인 알림(conductor.js C.onTimeline) · 필드 평가(js/field-rhythm.js)
// ================================================
(function() {
  var G = window.G;
  var owner = null;          // 지금 자리를 쓰는 쪽
  var bound = G.conductor;   // 박 시계를 묶은 타임라인 (기본 main)
  var boundBpm = 0;          // 묶을 때 준 템포 (0 = 타임라인의 bpm)

  // 박 시계 다시 읽기 — 코어가 맡으므로 main의 기본 onStart는 끈다 (같은 값을 여기서)
  function refresh() {
    if (!bound) return;
    var bpm = boundBpm || bound.bpm;
    G.BPM = bpm;
    G.BEAT_SEC = 60 / bpm;
    G.startTime = bound.startTime;
    if (G.actx) G.currentBeat = G.timeToBeat(G.actx.currentTime);
  }
  if (G.conductor) G.conductor.onStart = null;
  if (G.conductor && G.conductor.onTimeline) G.conductor.onTimeline(function(kind, tl) { if (kind === 'start' && tl === bound) refresh(); });

  // 표시 초기화: 입력 표시·칸 결과·지난 표시 정리 기준
  function resetMarks() { G.noteInputMarks = []; G.noteSlotResults = {}; G.noteInputLastMeasure = -1; }
  // 지난 표시 정리: 단위(막대 길이)가 넘어가면 이전 단위의 마지막 한 박(줄 머리에 비침)보다 오래된 입력 표시·칸 결과를 버린다
  //   (표시는 judge.js recordNoteInput — 절대 칸, 홀드 중 선은 hud.js가 재생 위치까지)
  function prune(tickNow) {
    var measure = Math.floor(tickNow / G.noteInputLen);
    if (measure > G.noteInputLastMeasure) {
      G.noteInputLastMeasure = measure;
      var keep = measure * G.noteInputLen - 4 - 1;
      G.noteInputMarks = G.noteInputMarks.filter(function(m) { return m.abs >= keep; });
      Object.keys(G.noteSlotResults).forEach(function(k) { if (+k < keep) delete G.noteSlotResults[k]; });
    }
  }

  // 칸 값 (패턴 길이로 돌려 읽음)
  function slot(tick, patternAt) {
    if (tick < 0 || !patternAt) return 0;
    var p = patternAt(tick);
    if (!p) return 0;
    var n = p.length;
    return p[((tick % n) + n) % n] || 0;
  }
  function eventsAt(tick, patternAt) {
    patternAt = patternAt || (owner && owner.patternAt);
    var v = slot(tick, patternAt), prev = slot(tick - 1, patternAt), ev = [];
    if (v === 2) ev.push(prev === 2 ? 'hold' : 'hold-start');
    else {
      if (prev === 2) ev.push('hold-end');
      if (v === 1) ev.push('tap');
    }
    return ev;
  }

  // 단위별 집계
  var stats = {};
  function expectFor(unit) {
    if (owner.expect) return owner.expect(unit);
    var n = 0;
    for (var t = unit * owner.len; t < (unit + 1) * owner.len; t++) n += eventsAt(t, owner.patternAt).length;
    return n;
  }
  function statsFor(unit) {
    return stats[unit] || (stats[unit] = { hit: 0, miss: 0, whiff: 0, whiffAfter: 0, holdHit: 0, holdMiss: 0, expect: expectFor(unit), done: false });
  }
  function onStat(kind, tick) {
    if (!owner) return;
    var unit = Math.floor(tick / owner.len), st = statsFor(unit);
    // 헛침은 성공 확정 전(whiff) / 후(whiffAfter)로 나눠 센다 — 확정 뒤 헛침은 끝난 단위를 뒤집지 않음
    if (kind === 'whiff' && st.done) st.whiffAfter++;
    else st[kind]++;
    if (!st.done && st.expect > 0 && st.miss === 0 && st.holdMiss === 0 && st.hit + st.holdHit === st.expect) {
      st.done = true;
      if (owner.onClear) owner.onClear(unit, st);
    }
    if (owner && owner.onStat) owner.onStat(kind, tick, st);
    if (G.reveal && G.reveal.mark) G.reveal.mark(kind, tick);   // 드러내기 층의 맞힘 표시 (rhythm/reveal.js)
  }

  G.core = {
    // 패턴 없이 막대만 (입력만 표시 — 예: 진입 대기의 루프 막대). 쓰는 쪽은 그대로
    clear: function(len) {
      G.noteTargetObj = null;
      G.noteInputLen = len;
      resetMarks();
    },
    // 자리에 붙기: 이 패턴으로 판정·막대, 판정 통지는 onStat으로
    attach: function(user) {
      owner = user;
      resetMarks();
      G.noteTargetObj = { patternAt: user.drawAt || user.patternAt };   // 막대 (hud.js) — 판정은 patternAt
      G.noteInputLen = user.len;
      G.resetJudgeStats();
      stats = {};
      G.onJudgeStat = onStat;
    },
    // 자리에서 떼기: 판정 대상·통지를 비우고 막대 길이는 기본(16)
    detach: function(user) {
      if (user && owner && owner !== user) return;   // 다른 쪽이 쓰고 있으면 건드리지 않음 (붙기 전에 멈춘 경우 — 예: 진입 대기 중 이탈 — 는 되돌림)
      owner = null;
      G.noteTargetObj = null;
      G.onJudgeStat = null;
      G.noteInputLen = 16;
      G.noteInputLastMeasure = -1;
      G.resetJudgeStats();
    },
    owner: function() { return owner; },
    // 입력을 어떻게: 'judge' 판정 / 'mark' 친 위치만 / null 없음 (붙은 쪽이 없거나 둘 다 아님)
    inputMode: function() {
      if (!owner) return null;
      if (!owner.judges || owner.judges()) return 'judge';
      return owner.marks && owner.marks() ? 'mark' : null;
    },
    // 박 시계를 이 타임라인에 묶음 (bpm을 주면 그 템포로 — 예: 고정된 필드 템포). 지금 값으로 바로 읽는다
    clock: function(tl, bpm) { bound = tl; boundBpm = bpm || 0; refresh(); },
    clockTimeline: function() { return bound; },
    // 시작 경계 (세션 진입 대기에서 옮김 — 같은 규칙을 쓰는 쪽이 정책 값만 넘긴다): 타임라인 tl의 다음 줄 경계 + 남은 루프 n
    //   { every: 한 줄 tick, loops: n, credit: 비율 } — n ≤ 0이면 다음 줄 경계 (Conductor when — 아직 예약하지 않은 tick).
    //   1 이상이면 진행 중 줄의 남은 tick이 credit 이상일 때 그것을 1루프로 인정하고 n−1줄을 더, 모자라면 n줄을 더
    startBoundary: function(tl, p) {
      var next = G.conductor.when({ every: p.every }, tl);
      if (!(p.loops > 0)) return next;
      var rowSec = p.every * tl.tickSec;
      var remain = (next - G.actx.currentTime) / rowSec;          // 진행 중 줄의 남은 비율
      return next + (remain >= p.credit ? p.loops - 1 : p.loops) * rowSec;
    },
    // 프레임 일 (쓰는 쪽의 루프에서): 박 시계 갱신 → 지금 tick / 판정 진행 + 지난 표시 정리 / 막대 그리기
    beat: function(now) { G.currentBeat = G.timeToBeat(now); return Math.floor(G.currentBeat * 4); },
    advance: function(tick, judging) { if (judging) G.updateJudge(); prune(tick); },
    draw: function(alpha) { var M = window.Moai; if (M && M.renderBars) M.renderBars(true, alpha); },
    // 판정 없이 친 위치만 표시 (패턴 없는 막대 — 진입 대기 · 필드 루프 막대): 누름·떽·뚜~ 시작을 지금 박 시계의 절대 칸에
    mark: function(type, time) {
      if (type !== 'press' && type !== 'tap' && type !== 'hold-start') return;
      var t = time != null ? time : G.actx.currentTime;
      G.noteInputMarks.push({ abs: G.timeToBeat(t) * 4, type: type === 'press' ? 'tap' : type, res: null });
    },
    eventsAt: eventsAt,
    stats: function(unit) { return stats[unit]; },
    dropStats: function(unit) { Object.keys(stats).forEach(function(k) { if (+k <= unit) delete stats[k]; }); },
    // 판정 사건 공급 채널 (Conductor 타임라인에 붙임): judged(tick)가 참인 tick의 사건을 판정에 등록 ('hold' 유지 포함 — judge.js가 다룸)
    judgeFeed: function(judged, patternAt) {
      return {
        onTick: function(tick, time) {
          if (judged && !judged(tick)) return;
          var ev = eventsAt(tick, patternAt);
          for (var i = 0; i < ev.length; i++) G.scheduleJudgeEvent(ev[i], time, tick);
        },
      };
    },
  };
})();
