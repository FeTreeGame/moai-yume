// ================================================
// rhythm/conductor.js — 단일 시계 (Conductor) = 이 콘텐츠의 시간 결정자
// 공유 시간축의 일정을 확정·전파하고 그에 대해 답한다. 모든 박자 기반 출력은 이 예약 루프 하나를 거친다.
//   - 시간 결정: 요청(request)의 타이밍 지정(즉시·n초 뒤·절대 시각·다음 박/마디/단위)을 실제 시각 하나로 확정해 fn(time)으로 넘긴다
//     박자에 맞출지는 요청마다 고르는 정책일 뿐, 즉시도 정당한 결정. 연주자는 받은 시각에만 예약한다
//   - 타임라인: 원점(startTime)·BPM·채널을 가진 박자 격자. 여러 개가 **동시에** 돌 수 있다 (연주자마다 템포가 달라도 된다)
//     main = 세션 타임라인 (G.conductor 자신 — 판정·HUD가 쓰는 G.BPM / G.BEAT_SEC / G.startTime은 main 값)
//     C.timeline(opts)로 따로 만든다 (예: BGM 곡 하나 = 타임라인 하나 — rhythm/bgm-player.js)
//     타임라인은 start({ bpm, unitTicks, startTime })의 시각이 tick 0 — 도중에 재동기하지 않는다. 다시 start하면 그 시각부터 새 격자
//     (이어 달리기·정적 뒤 시작 모두 가능). 새 시작이 그 타임라인이 이미 예약한 tick과 겹치면 다음 격자 자리로 미룬다
//     (예약한 소리와 겹치지 않게 — 마지막으로 예약한 tick 뒤라면 요청한 시각 그대로)
//   - 예약 루프 하나: AHEAD만큼 앞서 모든 타임라인의 tick과 요청을 **시각 순서로** 처리 — 같은 시각이면 요청이 먼저
//     tick마다 그 타임라인 채널의 onTick(tick, time), 단위(unitTicks) 첫 tick 예약 직전 onUnit(unit, time)
//   - scheduledUntil(): 아직 예약하지 않은 첫 tick — "이 단위를 아직 바꿀 수 있는가"의 정확한 기준
//   - 타임라인 알림 C.onTimeline(fn(kind, tl)): 'start'(다시 시작 — 템포 변경 등 — 포함) · 'stop' — 박 시계(rhythm/core.js)·필드 비트(js/bgm.js)가 듣는다
// 배경: docs/CONDUCTOR-INDEX.md (index 구현 기록·운영 계약), docs/TIME-ORCHESTRATION-SPEC.md (원리)
// ================================================
(function() {
  var G = window.G;

  var AHEAD = 0.1;       // 선행 예약 (초)
  var INTERVAL = 25;     // 예약 루프 주기 (ms)
  var LEAD = 0.05;       // '즉시'의 최소 여유 (초) — 오디오 예약이 제때 울리도록
  var BOUNDARY = { beat: 4, bar: 16 };

  var active = [];       // 돌고 있는 타임라인
  var tlListeners = [];  // 타임라인 알림 (C.onTimeline)
  function notifyTimeline(kind, tl) { for (var i = 0; i < tlListeners.length; i++) tlListeners[i](kind, tl); }
  var requests = [];     // { id, time, fn } — 시각 순
  var reqSeq = 0;
  var timer = null;

  // ── 타임라인 (박자 격자) ──
  function Timeline(opts) {
    opts = opts || {};
    this.name = opts.name || '';
    this.bpm = opts.bpm || 100;
    this.tickSec = 60 / this.bpm / 4;
    this.unitTicks = opts.unitTicks || 16;
    this.startTime = 0;
    this.running = false;
    this.nextTick = 0;
    this.scheduledEnd = 0;   // 아직 예약하지 않은 첫 tick 시각 (정지 시점 기준 — 겹칠 때 미룰 자리)
    this.lastScheduled = -Infinity;   // 마지막으로 예약한 tick 시각 (새 시작이 이보다 늦으면 그대로)
    this.channels = [];
    this.unitFns = [];
  }
  Timeline.prototype.addChannel = function(ch) { this.channels.push(ch); };
  // 채널 하나만 내리기 (공유 레이어에 올라탄 연주자가 퇴장할 때 — 타임라인은 주인 것이라 멈추지 않는다)
  Timeline.prototype.removeChannel = function(ch) {
    var i = this.channels.indexOf(ch);
    if (i >= 0) this.channels.splice(i, 1);
  };
  Timeline.prototype.onUnit = function(fn) { this.unitFns.push(fn); };
  Timeline.prototype.reset = function() { this.channels = []; this.unitFns = []; };
  Timeline.prototype.timeOf = function(tick) { return this.startTime + tick * this.tickSec; };
  Timeline.prototype.tickAt = function(time) { return Math.floor((time - this.startTime) / this.tickSec); };
  Timeline.prototype.scheduledUntil = function() { return this.nextTick; };
  // 시작 — opts: { bpm, unitTicks, startTime(생략 = 즉시) }. 도는 중이면 그 시각부터 새 격자 (이미 예약한 tick과 겹치면 다음 격자 자리로)
  Timeline.prototype.start = function(opts) {
    opts = opts || {};
    this.stop(true);
    if (opts.bpm) { this.bpm = opts.bpm; this.tickSec = 60 / this.bpm / 4; }
    if (opts.unitTicks) this.unitTicks = opts.unitTicks;
    var t = opts.startTime != null ? opts.startTime : G.actx.currentTime + LEAD;
    if (t <= this.lastScheduled + 1e-9) t = Math.max(t, this.scheduledEnd);
    this.startTime = t;
    this.nextTick = 0;
    this.running = true;
    active.push(this);
    if (this.onStart) this.onStart();
    notifyTimeline('start', this);
    ensureLoop();
    schedule();
  };
  // 정지 — 이미 예약한 tick은 그대로 울린다 (그 뒤로 예약하지 않음)
  Timeline.prototype.stop = function(restarting) {
    var was = this.running;
    if (this.running) this.scheduledEnd = this.timeOf(this.nextTick);
    this.running = false;
    var i = active.indexOf(this);
    if (i >= 0) active.splice(i, 1);
    if (!active.length && !requests.length) stopLoop();
    if (was && !restarting) notifyTimeline('stop', this);   // 다시 시작(start 안의 정지)은 'start'로만 알림
  };

  // main 타임라인 = 세션 (G.conductor). 판정·HUD 호환 값(박 시계 G.BPM·G.BEAT_SEC·G.startTime)을 공유한다
  //   리듬 코어(rhythm/core.js)가 있으면 코어가 박 시계를 맡는다 (묶은 타임라인에서 — 기본 main). 아래 onStart는 코어가 없을 때(단위 시뮬레이션)
  var C = G.conductor = new Timeline({ name: 'main', bpm: 100, unitTicks: 32 });
  C.onStart = function() {
    G.BPM = C.bpm;
    G.BEAT_SEC = 60 / C.bpm;
    G.startTime = C.startTime;
    G.currentBeat = G.timeToBeat(G.actx.currentTime);
  };
  C.timeline = function(opts) { return new Timeline(opts); };
  C.onTimeline = function(fn) { tlListeners.push(fn); };

  // UI 동기: time에 fn 실행 (선행 예약 시점에서 부른 UI 변경을 실제 시각에 맞춤)
  C.at = function(time, fn) {
    var delay = time - G.actx.currentTime;
    if (delay <= 0) fn(); else setTimeout(fn, delay * 1000);
  };

  // ── 타이밍 지정 → 실제 시각 ──
  //   'now'(또는 생략) = 즉시 (지금 + LEAD) / { after: 초 } = 지금부터 / { at: 오디오 시각 } = 그 시각 (지났으면 즉시)
  //   'beat' | 'bar' | 'unit' = 타임라인 tl(생략 = main)의 다음 경계 (4 / 16 / unitTicks tick) — 이미 예약한 tick 이후,
  //   { every: N } = 그 타임라인 시작부터 N tick마다의 다음 경계 (예: 세션 루프 32 tick을 BGM 격자 위에서)
  //   그 타임라인이 돌고 있지 않으면 즉시
  C.when = function(spec, tl) {
    var soon = G.actx.currentTime + LEAD;
    if (spec == null || spec === 'now') return soon;
    var step;
    if (typeof spec === 'object') {
      if (spec.at != null) return Math.max(spec.at, soon);
      if (spec.after != null) return Math.max(G.actx.currentTime + spec.after, soon);
      if (!spec.every) return soon;
      step = spec.every;
    }
    tl = tl || C;
    step = step || (spec === 'unit' ? tl.unitTicks : BOUNDARY[spec]);
    if (!step || !tl.running) return soon;
    var t = Math.max(tl.nextTick, Math.ceil((soon - tl.startTime) / tl.tickSec));
    return tl.timeOf(Math.ceil(t / step) * step);
  };

  // ── 요청: spec 시각에 fn(time) (박 경계 spec은 타임라인 tl 기준, 생략 = main) ──
  //   예약 루프가 tick과 같은 방식으로 AHEAD만큼 앞서 실행 — 오디오는 time으로 예약하고, UI 변경은 C.at(time, …)
  //   확정 시각이 이미 예약 범위 안이면 request가 반환되기 전에 fn이 실행될 수 있다 (예약 루프 밖에서 부를 때 — 루프 안의 콜백에서 부르면
  //   바깥 루프가 시각 순서대로 이어서 실행). 반환값 = 취소용 id
  C.request = function(spec, fn, tl) {
    var r = { id: ++reqSeq, time: C.when(spec, tl), fn: fn };
    var i = requests.length;
    while (i > 0 && requests[i - 1].time > r.time) i--;
    requests.splice(i, 0, r);
    ensureLoop();
    schedule();
    return r.id;
  };
  C.cancel = function(id) {
    requests = requests.filter(function(r) { return r.id !== id; });
    if (!active.length && !requests.length) stopLoop();
  };

  function ensureLoop() { if (!timer) timer = setInterval(schedule, INTERVAL); }
  function stopLoop() { if (timer) { clearInterval(timer); timer = null; } }

  // 예약 루프: 모든 타임라인의 tick과 요청을 시각 순서로 (같은 시각이면 요청 먼저)
  //   재진입 막음: 루프 안의 콜백(tick·onUnit·요청)이 C.request 등으로 다시 부르면 그냥 돌아옴 — 새 요청은 이미 목록에 있어
  //   바깥 루프가 시각 순서대로 처리 (안 막으면 아직 끝나지 않은 tick을 안쪽 루프가 다시 실행 → 같은 콜백이 되풀이·재귀)
  var scheduling = false;
  function schedule() {
    if (scheduling) return;
    scheduling = true;
    try { runSchedule(); } finally { scheduling = false; }
  }
  function runSchedule() {
    var horizon = G.actx.currentTime + AHEAD;
    for (;;) {
      var tl = null, tickTime = Infinity;
      for (var a = 0; a < active.length; a++) {
        var tt = active[a].timeOf(active[a].nextTick);
        if (tt < tickTime) { tickTime = tt; tl = active[a]; }
      }
      var r = requests[0];
      if (r && r.time < horizon && r.time <= tickTime) {
        requests.shift();
        r.fn(r.time);
        continue;
      }
      if (!tl || tickTime >= horizon) break;
      var k = tl.nextTick;
      if (k % tl.unitTicks === 0) {
        for (var u = 0; u < tl.unitFns.length; u++) tl.unitFns[u](k / tl.unitTicks, tickTime);
        if (!tl.running) continue;     // onUnit에서 정지했으면 이 단위는 예약하지 않는다
      }
      for (var i = 0; i < tl.channels.length; i++) tl.channels[i].onTick(k, tickTime);
      tl.lastScheduled = tickTime;
      tl.nextTick++;
    }
    if (!active.length && !requests.length) stopLoop();
  }
})();
