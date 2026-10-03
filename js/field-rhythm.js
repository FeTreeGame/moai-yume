// 필드 루프 막대 · 필드 평가 — 리듬 코어(rhythm/core.js)의 자리를 세션과 같은 방식으로 쓰는 필드 쪽 (세션이 아닐 때만)
//   세션처럼 한 번 붙고 패턴의 답(patternAt)만 바꾼다 — 패턴이 바뀌어도 붙고 떨어지지 않음 (막대가 끊기지 않음)
//     붙는 때: 게이지 바가 보일 때(field-gauge.js 'moai:gauge-view' — 게이지 미션을 받는 중이고 바가 있을 때) 또는 평가 중
//     떨어지는 때: 세션이 자리를 쓸 때(끝나면 다시 붙음 — 같은 비트면 같은 격자), 보여 줄 것이 없을 때(미션 꺼짐)
//   막대(하단 가이드 막대, 한 줄) = 게이지 바와 같이 보이고 같이 숨는다. 바 생성 단계는 바와 같은 불투명도 (BAR.appear)
//   박 시계 = 필드 비트(울리는 메인 곡 — js/bgm.js 'moai:beat'). 없으면(첫 파트 전 — 타임라인이 없음) 재생 막대 없는 빈 막대 (BAR.still)
//   평가 (start(spec) — 진행 표의 조건 카드가 켬): 필드에서 이미 떠 있는 기대 비트(1루프 패턴)에 맞게 동작하면 알린다 (콜 앤 리스폰스가 아님 — 모든 루프가 응답)
//     드러내는 루프 → 평가: 패턴은 먼저 한 루프 동안 드러나고 (rhythm/reveal.js — 평가 없음, 틀릴 것을 전제로 보여 주는 턴) 평가는 그 다음 루프부터
//       예약 시작 start(spec, { at }) (진행 표가 다 찬 순간 예약한 쉼의 끝 T — 그 첫 박): T 바로 앞 루프의 첫 박이 아직 안 왔으면(쉼 안)
//         그 루프에서 드러내고 평가 = T부터 (쉼의 빈 루프를 앞당겨 씀 — 쉼엔 평가가 없어 보고 바로 성공하는 일 없음)
//         쉼 안에 첫 박이 없으면 T 루프에서 드러내고 다음 루프부터 평가
//       시각 없이 켬 · 다시 묶임(미션 다시 받음 — 세션 끝·BGM 재생, 새 곡·템포 변경): 다음 루프 첫 박에서 드러내고 그 다음 루프부터 평가
//         (다음 루프 = 세션 진입 대기와 같은 시작 경계 규칙 G.core.startBoundary, START.loops = n = 0)
//       판정은 평가 첫 박의 판정 창(barely)부터 — 그 전 입력(쉼·드러내는 루프)은 친 위치만
//       시작 전인 새 패턴은 막대에 그리지 않음 (drawAt — 경계 앞에 첫 음표 반쪽이 새지 않게, 첫 박에 그려짐)
//     끄면(stop) 그 순간부터 빈 패턴 (아직 오지 않은 판정 예약은 버림). 비트가 없으면 패턴 없음
//     패턴 = spec.pool에서 루프마다 하나 (처음 물을 때 뽑아 그 루프 동안 고정). 형식은 스테이지 패턴과 같음 (0 쉼 · 1 떽 · 2 뚜~ 유지)
//   입력: 패턴이 있으면 판정, 없으면 친 위치만 표시 (코어 inputMode — bridge.js)
//   알림: document 'moai:field-event' { kind: 'loopClear' | 'loopEnd', actor: 'rhythm', unit, hit, expect } — 쓰는 쪽: 진행 표 조건 카드 (js/field-progress.js)
//     loopClear = 그 루프의 노트를 모두 맞힘 (코어 집계 done), loopEnd = 그 루프가 끝남 (맞혔든 아니든 — 집계 그대로)
//   M.fieldRhythm = { start(spec), stop(), active(), attached(), mode() }
(function() {
  const M = window.Moai;
  const G = window.G;
  const LEN = 16;                    // 1루프 = 한 줄 = 1마디

  // 막대 정책: appear = 바 생성 단계에서 'fade'(게이지 바와 같은 불투명도로 함께 드러남) | 'whole'(바가 생긴 뒤에 나타남)
  //   still = 비트(타임라인)가 없을 때 'empty'(재생 막대 없는 빈 막대 — 다른 길: 무음 타임라인은 아직 없음)
  const BAR = { appear: 'fade', still: 'empty' };
  // 패턴 시작: 진행 중 루프의 남은 tick + 루프 loops개 뒤의 첫 박 (G.core.startBoundary — 세션 진입 대기와 같은 규칙). 0 = 다음 루프 첫 박
  const START = { loops: 0, credit: 0.75 };
  // 안내 목소리: 드러내는 루프에서 패턴을 칩튠 목소리(rhythm/voices.js — NPC 채널, 작게)로 부름 — 세션의 발신과 같은 자리
  //   repeat: 'reveal' = 드러내는 루프만 (평가 루프에선 플레이어 목소리만 — 같이 울리면 덮고 대신 쳐 주는 꼴) / 'everyLoop' = 평가 루프마다도
  const CALL = { on: true, repeat: 'reveal', gain: 0.6 };

  let spec = null;                   // 평가 켜짐 — { pool: [패턴…] }
  let on = false;                    // 코어에 붙어 있음
  let tl = null;                     // 박 시계 타임라인 (필드 비트 — 없으면 null)
  let startUnit = 0;                 // 이 루프부터 패턴·평가 (그 전은 빈 칸)
  let revealUnit = 0;                // 드러내는 루프 (평가 없음 — startUnit 바로 앞 또는 쉼 안)
  let startAt = null;                // 예약된 시작 시각 (start(spec, { at })) — 다시 묶을 때(새 곡·템포 변경)는 버리고 다음 루프 첫 박
  let lastUnit = -1;                 // 끝 알림을 보낸 마지막 루프
  const picks = {};                  // 루프 → 패턴
  const EMPTY = []; for (let i = 0; i < LEN; i++) EMPTY.push(0);
  let rng = Math.random;

  function inSession() { return !!M.sessionActive; }
  function beatNow() { return M.fieldBgm && M.fieldBgm.timeline ? M.fieldBgm.timeline() : null; }
  function gaugeView() { return M.fieldGauge && M.fieldGauge.view ? M.fieldGauge.view() : { shown: false, alpha: 0, phase: null }; }
  function evaluating() { return !!(spec && tl); }
  function unitNow() { return tl ? Math.floor(tl.tickAt(G.actx.currentTime) / LEN) : 0; }
  function unitOfTime(t) { return Math.round(Math.round((t - tl.startTime) / tl.tickSec) / LEN); }
  // 드러내는 루프·평가 시작 루프 정하기 (위 머리말 규칙)
  function plan() {
    if (!tl) { revealUnit = startUnit = 0; return; }
    if (startAt != null) {
      const u = unitOfTime(startAt);
      if (tl.timeOf((u - 1) * LEN) >= G.actx.currentTime) { revealUnit = u - 1; startUnit = u; return; }   // 쉼 안의 루프에서 드러냄
      revealUnit = u; startUnit = u + 1; return;
    }
    revealUnit = unitOfTime(G.core.startBoundary(tl, { every: LEN, loops: START.loops, credit: START.credit }));
    startUnit = revealUnit + 1;
  }
  // 드러내기 층에 알림: 평가 중이면 평가 첫 루프의 패턴을 드러내는 루프에 (앞 패턴은 그 시각까지 그대로), 아니면 지움
  function syncReveal() {
    if (!G.reveal) return;
    if (!evaluating()) { G.reveal.clear('field'); return; }
    G.reveal.show('field', patternAt(startUnit * LEN), revealUnit * LEN);
  }
  function started() {                   // 판정 시작 — 평가 첫 박의 판정 창부터
    if (!tl) return false;
    const JW = G.getJudgeWindows ? G.getJudgeWindows() : null;
    return G.actx.currentTime >= tl.timeOf(startUnit * LEN) - (JW ? JW.barely : 0);
  }
  function alpha() {
    if (evaluating()) return 1;
    const v = gaugeView();
    if (v.phase === 'appear') return BAR.appear === 'fade' ? v.alpha : 0;
    return 1;
  }
  function emit(kind, unit, st) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: kind, actor: 'rhythm', unit: unit, hit: st ? st.hit + st.holdHit : 0, expect: st ? st.expect : 0 } }));
  }
  function patternAt(tick) {
    const unit = Math.floor(tick / LEN);
    if (!evaluating() || unit < startUnit || !spec.pool || !spec.pool.length) return EMPTY;
    return picks[unit] || (picks[unit] = spec.pool[Math.floor(rng() * spec.pool.length)]);
  }
  function drawAt(tick) {                // 막대: 시작 전인 새 패턴은 그리지 않음 (판정은 patternAt 그대로 — 첫 박 예약 포함)
    const unit = Math.floor(tick / LEN);
    if (unit === startUnit && unit > unitNow()) return EMPTY;
    return patternAt(tick);
  }
  function clearPicks() { Object.keys(picks).forEach(function(k) { delete picks[k]; }); }
  const user = {
    len: LEN, patternAt: patternAt, drawAt: drawAt,
    onClear: function(unit, st) { if (evaluating()) emit('loopClear', unit, st); },
    judges: function() { return evaluating() && started(); },   // 입력: 평가 중이면 판정 — 평가 첫 박의 판정 창부터 (쉼·드러내는 루프는 친 위치만)
    marks: function() { return !!tl; },                  // 아니면 친 위치만 (박 시계가 있을 때)
  };
  let callDoo = null, callOut = null, skippedCallTick = -1;
  function callStop(t) { if (callDoo && G.voices) { G.voices.dooStop(callDoo, t != null ? t : G.actx.currentTime); } callDoo = null; }
  function callAt(tick, time) {
    if (!CALL.on || !evaluating() || !G.voices) return;
    const unit = Math.floor(tick / LEN);
    if (!(unit === revealUnit || (CALL.repeat === 'everyLoop' && unit >= startUnit))) return;
    if (!callOut || callOut.context !== G.actx) { callOut = G.actx.createGain(); callOut.connect(G.noteSfxOut); }
    callOut.gain.value = CALL.gain;
    const cells = patternAt(unit === revealUnit ? startUnit * LEN : tick), c = tick - unit * LEN;
    const v = cells[c] || 0, pv = c > 0 ? cells[c - 1] || 0 : 0;
    if (v !== 2 && pv === 2 && callDoo) { callStop(time); G.voices.wop(time, callOut); }
    if (v === 2 && pv !== 2) callDoo = G.voices.dooStart(time, callOut);
    if (v === 1) G.voices.pah(time, callOut);
  }
  const callFeed = {
    onTick: function(tick, time) {
      if (!evaluating()) { skippedCallTick = tick; return; }
      skippedCallTick = -1;
      callAt(tick, time);
    },
  };
  const feed = G && G.core ? G.core.judgeFeed(function(tick) { return evaluating() && Math.floor(tick / LEN) >= startUnit; }, patternAt) : null;

  // 그리기: 박 시계가 있으면 프레임마다 (박 시계·판정 진행·막대 + 루프 끝 알림), 없으면 바뀔 때만 빈 막대
  function draw() {
    if (!on) return;
    if (tl) { G.core.beat(G.actx.currentTime); G.core.draw(alpha()); }
    else if (M.renderBars) M.renderBars(true, alpha());
  }
  function frameTask() {
    if (!on || !tl) return false;
    const tick = G.core.beat(G.actx.currentTime);
    G.core.advance(tick, true);
    G.core.draw(alpha());
    if (!evaluating()) return true;
    const unit = Math.floor(tick / LEN) - 1;           // 방금 끝난 루프
    if (unit >= startUnit && unit > lastUnit) { lastUnit = unit; emit('loopEnd', unit, G.core.stats(unit)); G.core.dropStats(unit - 2); }
    return true;
  }

  // 박 시계 묶기 (붙을 때 · 비트가 바뀔 때 — 새 곡·템포 변경(같은 곡 새 격자)·정지): 코어에 다시 붙어 표시·집계를 새 격자로
  function bind(b) {
    if (tl && feed) tl.removeChannel(feed);
    if (tl) tl.removeChannel(callFeed);
    callStop();
    skippedCallTick = -1;
    if (tl && b !== tl) startAt = null;    // 다른 타임라인 — 예약 시각은 옛 격자의 것
    tl = b;
    G.core.attach(user);
    G.guideStill = !tl;
    clearPicks();
    plan(); lastUnit = startUnit - 1;
    if (G.reveal) G.reveal.clear('field');            // 새 격자 — 옛 tick의 드러내기는 버림
    syncReveal();
    if (tl) { G.core.clock(tl); if (feed) tl.addChannel(feed); tl.addChannel(callFeed); if (M.frame) M.frame.add(frameTask); }
    draw();
  }
  function release() {
    if (tl && feed) tl.removeChannel(feed);
    if (tl) tl.removeChannel(callFeed);
    callStop();
    tl = null; on = false;
    G.guideStill = false;
    G.core.detach(user);
    if (G.reveal) G.reveal.clear('field');
    if (!inSession() && M.renderBars) M.renderBars(false);   // 세션이 이어받으면 세션이 그림
  }
  // 붙어 있어야 하나 → 붙기·떨어지기 (비트가 바뀌었으면 다시 묶기)
  function apply() {
    const b = beatNow();
    const want = !inSession() && (gaugeView().shown || !!(spec && b));
    if (!want) { if (on) release(); return; }
    if (!on) { on = true; bind(b); return; }
    if (b !== tl) { bind(b); return; }
    if (!tl) draw();                                   // 빈 막대 — 불투명도만 다시
  }
  // 평가 켜기·끄기: 붙은 채로 패턴의 답만 바꿈 (지금 루프부터)
  function setSpec(s, at) {
    spec = s;
    startAt = s && at != null ? at : null;
    clearPicks();
    if (on) G.core.dropStats(Infinity);                // 루프 집계도 새로 (지금 루프부터 — 그 루프의 기대 수는 새 패턴으로)
    if (G.dropJudgeEvents && G.actx) G.dropJudgeEvents(G.actx.currentTime);   // 옛 패턴의 선행 예약
    plan(); lastUnit = startUnit - 1;
    if (!s) callStop();
    syncReveal();
    // 공개 첫 박의 채널 콜백이 미션 활성화 전 지나갔다면, 비주얼과 같은 오디오 시각에 그 음성만 보충 예약
    const revealTick = revealUnit * LEN;
    if (s && tl && skippedCallTick === revealTick) {
      skippedCallTick = -1;
      callAt(revealTick, tl.timeOf(revealTick));
    }
    apply();
    draw();
  }

  document.addEventListener('moai:beat', apply);       // 새 곡·정지는 다른 타임라인, 템포 변경(restart)은 같은 타임라인의 새 격자
  document.addEventListener('moai:beat', function(e) { if (e.detail.kind === 'restart' && on && e.detail.timeline === tl) { startAt = null; bind(tl); } });   // 새 격자 — 예약 시각은 옛 격자의 것
  document.addEventListener('moai:session', apply);
  document.addEventListener('moai:gauge-view', apply);

  M.fieldRhythm = {
    start: function(s, opts) { setSpec(s || null, opts && opts.at); },   // 평가 켜기 (진행 표 조건 카드) — opts.at = 시작 시각 (그 루프 첫 박부터)
    stop: function() { if (spec) setSpec(null); else apply(); },
    active: function() { return !!spec; },
    attached: function() { return on && evaluating(); },   // 평가 중 (붙어 있고 패턴이 있음)
    mode: function() { return !on ? null : evaluating() ? 'eval' : 'bar'; },
    policy: BAR, startPolicy: START, callPolicy: CALL,                      // 조정·시험용
    setRandom: function(fn) { rng = fn || Math.random; },   // 시험용
  };
  apply();
})();
