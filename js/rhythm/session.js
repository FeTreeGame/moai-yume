// ================================================
// rhythm/session.js — 리듬 세션 (Conductor 기반)
// 로드 순서: rhythm/(init·audio·judge·hud) → rhythm/bridge.js → rhythm/conductor.js → rhythm/voices.js → rhythm/session.js
//
// 모드 ①: 루프 테스트 (T키 / 드로어 버튼) — 모든 단위가 응답(respond) 단위
// 모드 ②: 핑퐁 (P키 / 드로어 버튼) — 발신(listen) → 응답(respond) 한 세트, 짝수 단위 = 발신
//   성공 → 다음 세트를 다음 단계로 / 실패(다음 발신 예약 직전까지 성공 못함) → 기회 -1, 같은 단계 발신부터
//   최상위 단계 성공 또는 기회 소진 → 종료, 평가 = 도달한 단계
//   패턴 = 두 줄(2마디, 32칸) 고정 = 한 단위. 판정은 judge.js, 성공 = 단위의 기대 노트 전부 HIT (정답지 기반 즉시 식별)
//   스테이지 = 데이터 파일 (계열 × 3단계, 단계마다 패턴 풀 — 아래 "스테이지"), 성공 → 같은 계열 다음 단계, 실패 → 그대로,
//     계열 최상위 성공 → 종료. 드로어 패턴 버튼 = 수동 선택 예약 (항상 우선)
//
// 구조: 단일 시계(G.conductor)에 채널을 붙인다 — 모든 출력이 같은 tick·같은 시각을 공유
//   메트로놈 / 판정 등록(응답 단위) / NPC 목소리(역할별 on·off) / 대리조작 AUTO(응답 단위)
//   이벤트 규칙은 eventsAt(tick) 하나 — 판정 등록·목소리·AUTO·기대 노트 수가 모두 이 함수를 쓴다
//   패턴 전환·종료는 "컨덕터가 그 단위를 아직 예약하지 않았는가"(scheduledUntil)로 판단 — 시간 여유값 없음
// 명세: docs/index/modes.md · docs/index/stages.md (허브 docs/INDEX-MVP-SPEC.md)
// ================================================
(function() {
  var M = window.Moai;
  var G = window.G;
  var C = G.conductor;
  var V = G.voices;

  // ── 설정 ──
  var BPM = 100;
  var LEN = 32;                // 패턴 길이 = 두 줄(2마디) = 단위 (tick)
  var ROW = 16;                // 한 줄 = 1마디 = 독립 루프 — 시작 경계의 단위 (진행 중인 줄의 남은 tick만 채우고 다음 줄에서 시작)
  // NPC 목소리 출력: 역할별 on/off (고정하지 않음 — 세션 구성에 따라 바꾼다)
  var VOICE = { listen: true, respond: false };
  var CHANCES = 3;             // 핑퐁 기회 (하트)
  var RATINGS = ['-', 'Easy', 'Normal', 'Hard'];   // 도달 단계별 평가 (0단계 = 없음)

  // ── 스테이지 = 데이터 파일 (콘텐츠 — 편집기: 패턴 메이커 ?patterns · 미션 ?missions, docs/index/content.md) ──
  //   missions.session = [{ family, stages: [[패턴 이름…] × STAGE_COUNT] }] — 배열 순서 = 계열 순서 (드로어 행·필드 미니 모아이 색·순서)
  //   patterns.mini = { 이름: '32자 0·1·2' } — 미니 모아이 2루프(두 줄) 패턴. 단계에 패턴이 여럿이면 그 단계를 예약할 때마다 하나 뽑음
  //   규칙 (어기면 경고하고 쓰지 않음): 32칸, 2줄째 마지막 한 박(28~31칸) = 버리는 박 — 떽·어택·릴리즈 모두 없음 (홀드는 27칸까지 떼져야 함)
  //   지금 값 = 이전 코드의 구성 (완성형 TAP·DOO·MIX × 덜어내기 3단계 + 복합 CPA~CPD — 2026-10-02 데이터로 옮김)
  var DEFAULT_ID = 'TAP1';
  var STAGE_COUNT = 3;
  var POOL = [];                     // [{ id: 계열+단계, patterns: [32칸…] }]
  function cellsOf(v) { return typeof v === 'string' ? v.split('').map(Number) : (v || []).slice(); }
  function validStage(name, pattern) {
    if (pattern.length !== LEN) { console.warn('세션 패턴 길이 오류 (' + LEN + '칸 고정):', name, pattern.length); return false; }
    for (var i = LEN - 4; i < LEN; i++) {
      var prev = pattern[i - 1];
      if (pattern[i] === 1 || (pattern[i] === 2 && prev !== 2) || (pattern[i] === 0 && prev === 2)) {
        console.warn('세션 패턴 마지막 박 동작 (버리는 박):', name, '칸', i);
        return false;
      }
    }
    return true;
  }
  function buildPool() {
    POOL = [];
    var D = window.MoaiData || {}, pats = (D.patterns && D.patterns.mini) || {}, fams = (D.missions && D.missions.session) || [];
    fams.forEach(function(f) {
      var stages = f.stages || [];
      if (stages.length !== STAGE_COUNT) console.warn('스테이지 단계 수 오류 (' + STAGE_COUNT + '단계):', f.family, stages.length);
      stages.slice(0, STAGE_COUNT).forEach(function(names, s) {
        var list = [];
        (names || []).forEach(function(n) {
          if (!pats[n]) { console.warn('스테이지 패턴 없음:', f.family + (s + 1), n); return; }
          var cells = cellsOf(pats[n]);
          if (validStage(n, cells)) list.push(cells);
        });
        if (list.length) POOL.push({ id: f.family + (s + 1), patterns: list });
      });
    });
  }
  // 그 단계의 예약 항목 { id, pattern } — 패턴이 여럿이면 하나 뽑음
  function poolEntry(id) {
    for (var i = 0; i < POOL.length; i++) {
      var e = POOL[i];
      if (e.id === id) return { id: e.id, pattern: e.patterns[Math.floor(Math.random() * e.patterns.length)] };
    }
    return null;
  }
  // 식별자: 패턴 내용으로 풀 대조 → 해당 단계 { id, pattern } (없으면 null)
  function identify(pattern) {
    for (var i = 0; i < POOL.length; i++) {
      for (var k = 0; k < POOL[i].patterns.length; k++) {
        var q = POOL[i].patterns[k], same = q.length === pattern.length;
        for (var j = 0; same && j < q.length; j++) same = q[j] === pattern[j];
        if (same) return { id: POOL[i].id, pattern: q };
      }
    }
    return null;
  }
  // 종료 직전 다음 단위에 예약하는 빈 패턴
  var END_ENTRY = { id: 'END', pattern: (function() { var z = []; for (var i = 0; i < LEN; i++) z.push(0); return z; })() };

  var btn = document.getElementById('trialToggle');
  var ppBtn = document.getElementById('pingpongToggle');
  var patBox = document.getElementById('trialPatterns');
  var hud = document.getElementById('encHud');
  var lives = document.getElementById('sessionLives');
  var status = document.getElementById('sessionStatus');
  var steps = document.getElementById('sessionSteps');
  var renderedSteps = null;
  var renderedChances = null;

  var loopId = null;
  var schedule = [];          // 패턴 전환 예약 [{ from: 단위 번호, entry, manual }] — from 오름차순
  var selectedId = DEFAULT_ID;
  var successes = 0;
  var idCounts = {};          // 식별된 패턴 id → 횟수
  var lastIdentified = '-';
  var completeUnit = null;    // 계열 최상위 성공 시 종료할 단위 (null = 없음)
  var completedFamily = '';
  var mode = 'loop';          // 'loop' (루프 테스트) | 'pingpong' (발신 → 응답)
  var chances = CHANCES;      // 핑퐁 남은 기회
  var cleared = {};           // 핑퐁: 성공한 단계 id → true
  var endReason = '';         // 'clear' (최상위 성공) | 'fail' (기회 소진)

  M.sessionActive = false;

  // ── 단위 / 패턴 조회 ──
  function unitOf(tick) { return Math.floor(tick / LEN); }
  function entryAt(unit) {
    var e = schedule[0].entry;
    for (var i = 1; i < schedule.length; i++) { if (schedule[i].from <= unit) e = schedule[i].entry; else break; }
    return e;
  }
  function patternAt(tick) { return entryAt(unitOf(tick)).pattern; }   // 그 tick이 속한 단위의 패턴 (32칸)
  // 단위의 역할 — 루프 테스트는 전부 응답, 핑퐁은 짝수 단위 발신 / 홀수 단위 응답 (한 세트 = 발신 + 응답)
  function roleOf(unit) {
    if (mode !== 'pingpong') return 'respond';
    return unit % 2 === 0 ? 'listen' : 'respond';
  }
  // 패턴 전환 가능 단위를 세트 시작(발신 단위)에 맞춤 — 발신과 응답의 패턴이 달라지지 않게
  function alignToSet(u) { return (mode === 'pingpong' && u % 2 === 1) ? u + 1 : u; }

  // ── 이벤트 규칙 (단일 원천 — 리듬 코어 rhythm/core.js eventsAt): 떽 / 어택 / 유지 / 릴리즈 ──
  function eventsAt(tick) { return G.core.eventsAt(tick, patternAt); }
  // 단위의 기대 노트 수 (정답지) — 판정 등록과 같은 규칙
  function expectedFor(unit) {
    var n = 0;
    for (var t = unit * LEN; t < (unit + 1) * LEN; t++) n += eventsAt(t).length;
    return n;
  }

  // ── 채널 ──
  var metronome = {
    onTick: function(tick, time) {
      if (tick % 4 !== 0) return;
      if (tick % 16 === 0) V.kick(time); else V.hihat(time);
    }
  };

  // 판정 사건 공급 (리듬 코어 채널) — 응답 단위만
  var judgeFeed = G.core.judgeFeed(function(tick) { return roleOf(unitOf(tick)) === 'respond'; }, patternAt);

  // NPC 몸 정책: 'mini' = 발신 턴을 그 계열 미니 모아이가 (동작 + 몸의 목소리 — 연주자 'npc'), 없으면 합성음 / 'synth' = 늘 합성음
  var NPC_BODY = 'mini';
  var sessionFamily = null;      // 지금 세션의 계열 (발신 턴의 NPC 몸)
  function npcBody() {
    return NPC_BODY === 'mini' && sessionFamily && M.fieldActors && M.fieldActors.hasMini && M.fieldActors.hasMini(sessionFamily) && M.voicePlay
      ? sessionFamily : null;
  }

  // 합성음 NPC 목소리 (발신 턴을 NPC 몸이 맡으면 끔)
  var npcDoo = null;
  var npcVoice = {
    onTick: function(tick, time) {
      var role = roleOf(unitOf(tick));
      var on = VOICE[role] && !(role === 'listen' && npcBody());
      var ev = eventsAt(tick);
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        if (e === 'hold-end') {
          if (npcDoo) { V.dooStop(npcDoo, time); npcDoo = null; if (on) V.wop(time); }
        } else if (e === 'hold-start') {
          if (on) npcDoo = V.dooStart(time);
        } else if (e === 'tap') {
          if (on) V.pah(time);
        }
      }
    }
  };

  // ── 연주자 (performer): 패턴 사건(떽 'tap' / 어택 'hold-start' / 릴리즈 'hold-end')을 시각에 맞춰 수행 — AUTO와 NPC 몸이 같은 장치
  //   wants(역할): 이 단위를 맡는가 (사건을 받을 때·수행할 때 둘 다 확인) / schedule(사건, 시각): 받을 때 미리 (오디오 예약 — 선택) /
  //   act[사건]: 시각이 되면 (프레임) / stop(): 정지·해제 때 (선택). 홀드는 장치가 짝을 맞춘다 (어택 없이 릴리즈 없음)
  //   이후 같은 자리: 이펙트, 발신 턴에 막대를 타이밍마다 드러내기 등
  function performer(spec) { spec.buffer = []; spec.holding = false; return spec; }
  var npcHandles = { doo: null, all: [] };         // NPC 몸 목소리 (예약된 것 — 정지 때 끊음)
  function npcVoiceAt(type, time) {
    var v = M.body && M.body.voiceFor ? M.body.voiceFor(sessionFamily) : null, h = null;
    if (type === 'tap') h = M.voicePlay('pah', { voice: v, when: time });
    else if (type === 'hold-start') h = npcHandles.doo = M.voicePlay('doo', { voice: v, when: time, loop: true });
    else if (type === 'hold-end') {
      if (npcHandles.doo) { M.voiceStop(npcHandles.doo, time); npcHandles.doo = null; }
      h = M.voicePlay('wop', { voice: v, when: time });
    }
    if (h) { npcHandles.all.push(h); if (npcHandles.all.length > 32) npcHandles.all.shift(); }
  }
  var performers = [
    // 플레이어 AUTO: 응답 턴 — 플레이어 입력 경로 (판정·입력 알림까지)
    performer({ id: 'auto',
      wants: function(role) { return G.noteAutoplay && role === 'respond'; },
      act: { 'tap': function() { M.originalTapPress(); }, 'hold-start': function() { M.originalHoldPress(); }, 'hold-end': function() { M.originalHoldRelease(); } } }),
    // NPC 몸: 발신 턴 — 그 계열 미니 모아이 (목소리는 예약 시각에 몸의 목소리로, 동작은 시각이 되면). 판정 없음
    performer({ id: 'npc',
      wants: function(role) { return role === 'listen' && !!npcBody(); },
      schedule: npcVoiceAt,
      act: { 'tap': function() { npcAct('tap'); }, 'hold-start': function() { npcAct('hold'); }, 'hold-end': function() { npcAct('release'); } },
      stop: function() {
        npcHandles.all.forEach(function(h) { M.voiceStop(h, 0); });
        npcHandles.all.length = 0; npcHandles.doo = null;
        npcAct('idle');
      } }),
  ];
  function npcAct(action) { if (sessionFamily && M.fieldActors) M.fieldActors.act(sessionFamily, action); }
  var performFeed = {
    onTick: function(tick, time) {
      var role = roleOf(unitOf(tick)), ev = eventsAt(tick);
      performers.forEach(function(p) {
        if (!p.wants(role)) return;
        for (var i = 0; i < ev.length; i++) {
          if (ev[i] === 'hold') continue;
          if (p.schedule) p.schedule(ev[i], time);
          p.buffer.push({ type: ev[i], time: time, role: role });
        }
      });
    }
  };
  function perform(p, type) {
    if (type === 'hold-start') { if (p.holding) return; p.holding = true; }
    else if (type === 'hold-end') { if (!p.holding) return; p.holding = false; }
    p.act[type]();
  }
  function consumePerformers(now) {
    performers.forEach(function(p) {
      while (p.buffer.length && p.buffer[0].time <= now) {
        var e = p.buffer.shift();
        if (p.wants(e.role)) perform(p, e.type);
      }
    });
  }
  // 연주자 정리: 버퍼 비우고 잡고 있던 홀드를 놓음 (id를 주면 그 연주자만)
  function releasePerformers(id) {
    performers.forEach(function(p) {
      if (id && p.id !== id) return;
      p.buffer.length = 0;
      if (p.holding) { p.holding = false; p.act['hold-end'](); }
      if (p.stop) p.stop();
    });
  }
  // AUTO 해제·정지 시 잡고 있던 홀드 정리 (bridge.js toggleAuto가 호출)
  M.sessionAutoRelease = function() { releasePerformers('auto'); };

  // 리듬 코어(rhythm/core.js)의 자리를 쓰는 쪽으로서의 세션: 패턴 = 그 단위의 패턴, 단위 집계는 코어 (기대 수 — 발신 단위는 판정 대상이 아님 → 0, 헛침만)
  var coreUser = {
    len: LEN, patternAt: patternAt,
    expect: function(unit) { return roleOf(unit) === 'respond' ? expectedFor(unit) : 0; },
    onClear: function(unit) { onUnitClear(unit); },
  };

  // ── 단위를 모두 맞힘 (코어 집계 — HIT가 기대 수에 닿는 순간) → 성공 식별 + 자동 진행 ──
  function onUnitClear(unit) {
    if (!M.sessionActive) return;
    successes++;
    var found = identify(entryAt(unit).pattern);
    lastIdentified = found ? found.id : '?';
    idCounts[lastIdentified] = (idCounts[lastIdentified] || 0) + 1;
    if (found) cleared[found.id] = true;
    var fm = found && /^([A-Z]+)(\d+)$/.exec(found.id);
    if (fm) announce('moai:stage-step', { family: fm[1], stage: +fm[2], mode: mode, unit: unit });   // 단계 성공 (세션 보상 — js/rewards.js)
    autoAdvance(unit, found);
  }

  // 컨덕터가 아직 예약하지 않은 첫 단위 = 지금 바꿀 수 있는 가장 이른 단위
  function nextSwitchUnit() {
    var u = unitOf(Math.floor(G.timeToBeat(G.actx.currentTime) * 4)) + 1;
    return alignToSet(C.scheduledUntil() <= u * LEN ? u : u + 1);
  }

  // ── 스테이지 자동 진행 (성공 시에만 — 실패는 그대로) ──
  // 수동 선택 예약 우선: 이미 미래 단위에 예약(수동·자동)이 있으면 건드리지 않는다 (이중 전진도 방지)
  function autoAdvance(unit, found) {
    if (!found) return;
    if (schedule[schedule.length - 1].from > unit) return;
    var m = /^([A-Z]+)(\d+)$/.exec(found.id);
    if (!m) return;
    var family = m[1], stage = +m[2];
    if (stage >= STAGE_COUNT) {
      // 계열 최상위 성공 → 판정은 이미 끝남(버리는 박 이전). 다음 단위에 빈 패턴 예약 + 그 단위 예약 직전에 종료
      var from = nextSwitchUnit();
      schedule.push({ from: from, entry: END_ENTRY, manual: false });
      completeUnit = from;
      completedFamily = family;
      endReason = 'clear';
      return;
    }
    var next = poolEntry(family + (stage + 1));
    if (!next) return;
    schedule.push({ from: nextSwitchUnit(), entry: next, manual: false });
    selectedId = next.id;
    renderPatternButtons();
  }

  // ── 패턴 전환 (드로어 버튼 = 수동 선택 예약) ──
  // 수동 선택은 항상 우선: 같은/이후 단위의 예약(자동 포함)과 예정된 종료를 덮어쓴다
  function selectPattern(id) {
    var entry = poolEntry(id);
    if (!entry) return;
    selectedId = id;
    if (M.sessionActive) {
      var from = nextSwitchUnit();
      while (schedule.length > 1 && schedule[schedule.length - 1].from >= from) schedule.pop();
      schedule.push({ from: from, entry: entry, manual: true });
      completeUnit = null;
    }
    renderPatternButtons();
  }

  // 단위 예약 직전 (컨덕터 onUnit): 종료 단위면 이 단위를 예약하지 않고 멈춘 뒤, 단위 경계에 결과 표시
  function onUnit(unit, time) {
    if (completeUnit != null && unit >= completeUnit) {
      C.stop();
      C.at(time, complete);
      return;
    }
    // 핑퐁: 다음 발신 예약 직전 = 직전 응답 단위의 결과 확정 시점 (버리는 박 덕분에 판정은 이미 끝남)
    if (mode === 'pingpong' && unit > 0 && roleOf(unit) === 'listen') {
      var st = G.core.stats(unit - 1);
      if (!(st && st.done)) {                    // 성공하지 못함 = 실패 → 기회 -1, 같은 단계 발신부터
        chances--;
        announce('moai:stage-miss', { family: familyOf(entryAt(unit - 1).id), chances: chances, mode: mode });   // 기회 -1 (연출 — js/fx-rules.js)
        if (chances <= 0) {
          completedFamily = familyOf(entryAt(unit - 1).id);
          endReason = 'fail';
          C.stop();
          C.at(time, complete);
          return;
        }
      }
    }
    // 패턴 드러내기 (rhythm/reveal.js): 발신 단위 = 드러내는 루프 — 그 패턴이 이 단위 동안 tick마다 드러나고, 응답 턴 동안 그대로.
    //   실패하면 다음 발신에서 같은 패턴을 빈 상태부터 다시, 성공하면 다음 단계 발신에서 새 패턴 (교체는 그 단위 시작 시각에)
    if (roleOf(unit) === 'listen' && G.reveal) G.reveal.show('session', entryAt(unit).pattern, unit * LEN);
    // 턴 알림: 이 단위의 역할을 시작 시각(Conductor — 선행 예약이라 그 시각보다 조금 앞서 옴)과 함께, 다음 단위의 역할·시작 시각(핑퐁은 발신·응답이 번갈아
    //   정해져 있음)과 한 박 길이도 — 듣는 쪽이 다음 턴을 미리 준비 (카메라: 이 턴의 마지막 한 박 동안 다음 턴으로). 듣는 쪽: js/camera-rules.js
    announce('moai:turn', { unit: unit, role: roleOf(unit), time: time, mode: mode, family: sessionFamily,
      next: { role: roleOf(unit + 1), time: time + LEN * C.tickSec }, beat: 4 * C.tickSec, length: LEN * C.tickSec });
  }
  function familyOf(id) { var m = /^([A-Z]+)/.exec(id); return m ? m[1] : id; }

  function renderPatternButtons() {
    if (!patBox) return;
    var btns = patBox.querySelectorAll('.beat-pattern-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-id') === selectedId);
    }
  }

  function buildPatternButtons() {
    buildPool();
    if (!poolEntry(selectedId) && POOL.length) selectedId = POOL[0].id;   // 기본 패턴이 데이터에 없으면 첫 계열 1단계
    if (!patBox) return;
    var rows = {};              // 스테이지(계열) 단위로 한 행
    POOL.forEach(function(entry) {
      var fam = familyOf(entry.id);
      if (!rows[fam]) {
        rows[fam] = document.createElement('div');
        rows[fam].className = 'beat-pattern-row';
        patBox.appendChild(rows[fam]);
      }
      var b = document.createElement('button');
      b.className = 'beat-pattern-btn';
      b.textContent = entry.id;
      b.setAttribute('data-id', entry.id);
      b.setAttribute('tabindex', '-1');
      var touched = false;
      b.addEventListener('touchend', function(e) { e.preventDefault(); touched = true; selectPattern(entry.id); }, { passive: false });
      b.addEventListener('click', function() { if (touched) { touched = false; return; } selectPattern(entry.id); });
      rows[fam].appendChild(b);
    });
    renderPatternButtons();
  }

  // ── HUD ──
  // 디버그 판정 수 (단위 = 두 줄): HIT / MISS / WHIFF 확정 전/후(헛침 — 집계만, 성공 조건 무관) / HOLD(유지 HIT/MISS) / (HIT 합 / 기대 수)
  // 평가용 MISS 합 (도입 대비 — 지금 성공 조건은 Perfect): MISS + 홀드 유지 MISS + 성공 확정 전 헛침
  //   원작(HS MoaiDooWop)도 판정 창 밖 누름을 미스로 친다 (ScoreMiss(0.5) + CallMiss) — 같은 문법
  function missTotal(st) { return st.miss + st.holdMiss + st.whiff; }
  function statLine(label, st) {
    if (!st) return label + '  -';
    return label + '  HIT ' + st.hit + '  MISS ' + st.miss + '  WHIFF ' + st.whiff + '/' + st.whiffAfter + '  HOLD ' + st.holdHit + '/' + st.holdMiss +
      '  (' + (st.hit + st.holdHit) + '/' + st.expect + ')  ΣMISS ' + missTotal(st);
  }

  // 핑퐁: 계열의 단계별 클리어 현황 (예: TAP1 ✓  TAP2 ✓  TAP3 -)
  function clearLine(family) {
    var parts = [];
    for (var s = 1; s <= STAGE_COUNT; s++) parts.push(family + s + (cleared[family + s] ? ' ✓' : ' -'));
    return parts.join('  ');
  }
  function highestCleared(family) {
    var h = 0;
    for (var s = 1; s <= STAGE_COUNT; s++) if (cleared[family + s]) h = s;
    return h;
  }
  function hearts() {
    var t = '';
    for (var i = 0; i < CHANCES; i++) t += i < chances ? '♥' : '♡';
    return t;
  }
  function renderLives() {
    if (!lives) return;
    var visible = M.sessionActive && mode === 'pingpong';
    if (status) status.classList.toggle('hidden', !visible);
    if (!visible) { renderedChances = null; renderedSteps = null; return; }
    if (renderedChances !== chances) {
      while (lives.firstChild) lives.removeChild(lives.firstChild);
      for (var i = 0; i < CHANCES; i++) {
        var heart = document.createElement('span');
        heart.className = 'session-heart ' + (i < chances ? 'full' : 'empty');
        heart.textContent = '♥';
        heart.setAttribute('aria-hidden', 'true');
        lives.appendChild(heart);
      }
      renderedChances = chances;
    }
    lives.setAttribute('aria-label', '남은 기회: ' + chances);
  }

  function renderSteps() {
    if (!steps || !status) return;
    var visible = M.sessionActive && mode === 'pingpong';
    if (!visible) { renderedSteps = null; return; }
    var family = familyOf(selectedId), progress = '';
    for (var i = 1; i <= STAGE_COUNT; i++) progress += cleared[family + i] ? '1' : '0';
    var key = family + ':' + progress;
    if (key === renderedSteps) return;
    while (steps.firstChild) steps.removeChild(steps.firstChild);
    var completed = 0;
    for (var j = 1; j <= STAGE_COUNT; j++) {
      var done = !!cleared[family + j];
      if (done) completed++;
      var mark = document.createElement('span');
      mark.className = 'session-step ' + (done ? 'done' : 'pending');
      mark.textContent = done ? '✓' : '□';
      mark.setAttribute('aria-hidden', 'true');
      steps.appendChild(mark);
    }
    steps.setAttribute('aria-label', '완료 단계: ' + completed + ' / ' + STAGE_COUNT);
    renderedSteps = key;
  }
  function renderHud(unit) {
    if (!hud) return;
    if (unit < 0) unit = 0;               // 시계 시작 전(시작 지연 50ms) = 첫 단위로 표시
    if (mode === 'pingpong') {
      var cur = entryAt(unit).id, fam = familyOf(cur === 'END' ? entryAt(unit - 1).id : cur);
      var role = roleOf(unit);
      hud.textContent = (G.noteAutoplay ? '[AUTO] ' : '') + 'PINGPONG  ' + fam + '  [' + G.getUnitType() + ']  ' + hearts() +
        '\n' + (role === 'listen' ? 'LISTEN  ' : 'RESPOND ') + cur +
        '\nCLEAR  ' + clearLine(fam) +
        '\n' + statLine('NOW ', G.core.stats(unit)) +       // 발신 단위도 표시 (헛침 집계)
        '\n' + statLine('PREV', G.core.stats(role === 'respond' ? unit - 2 : unit - 1));
      hud.classList.remove('hidden');
      return;
    }
    var curId = entryAt(unit).id;
    var next = schedule[schedule.length - 1];
    var pending = (next.from > unit && next.entry.id !== curId) ? ' → ' + next.entry.id : '';
    var counts = Object.keys(idCounts).map(function(k) { return k + '×' + idCounts[k]; }).join(' ');
    hud.textContent = (G.noteAutoplay ? '[AUTO] ' : '') + 'LOOP TEST  [' + G.getUnitType() + ']' +
      '\nPATTERN ' + curId + pending + '  SUCCESS ' + successes +
      '\nIDENTIFIED ' + lastIdentified + (counts ? '  (' + counts + ')' : '') +
      '\n' + statLine('NOW ', G.core.stats(unit)) +
      '\n' + statLine('PREV', G.core.stats(unit - 1));
    hud.classList.remove('hidden');
  }

  // 진입 대기 표시: 기준 격자로 흐르는 루프 막대(패턴 없음, 입력만) + 안내
  function renderWait() {
    G.core.advance(G.core.beat(G.actx.currentTime), false);   // 박 시계·지난 표시 정리 (판정 없음 — rhythm/core.js)
    if (hud) {
      hud.textContent = (mode === 'pingpong' ? 'PINGPONG  ' : 'LOOP TEST  ') + familyOf(selectedId) +
        '\n' + (waitGo ? 'READY — 다음 루프에서 시작' : 'TAP TO START');
      hud.classList.remove('hidden');
    }
    G.core.draw();
  }

  // ── 프레임 루프 ──
  function frame() {
    if (!M.sessionActive) { renderLives(); loopId = null; return; }
    renderLives();
    renderSteps();
    if (phase === 'wait') { renderWait(); loopId = requestAnimationFrame(frame); return; }   // 진입 대기 · 시작 경계 대기
    if (startReq) { loopId = requestAnimationFrame(frame); return; }   // 시작 시각 대기 중
    var now = G.actx.currentTime;
    var tick = G.core.beat(now);                       // 박 시계 (rhythm/core.js)
    consumePerformers(now);                            // 연주자(AUTO·NPC 몸)가 판정 진행보다 먼저
    G.core.advance(tick, true);                        // 판정 진행 + 지난 표시 정리
    var unit = unitOf(tick);
    G.core.dropStats(unit - 3);  // 지난 단위 정리 (표시는 이번/직전만)
    renderHud(unit);
    G.core.draw();
    loopId = requestAnimationFrame(frame);
  }

  // ── 시작 / 정지 ──
  // 필드 ↔ 스테이지 타이밍 (Conductor 타이밍 지정 — conductor.js C.when). 필드 BGM = js/bgm.js M.fieldBgm
  //   템포: 시작할 때 필드 템포(bgm.js — BPM 슬라이더, 처음 100)를 고정하고 그 템포로 돈다. 끝나면 고정 해제
  //   필드 BGM이 울리면 STAGE_BGM:
  //     'continue' = 끊지 않고 반주로 이어진다 — BGM 격자(곡이 시작된 시점부터 ROW tick = 1마디)의 다음 루프 경계에서 세션 시작 (템포·위상 같음)
  //     'fade' = 이전 방식 — STAGE_ENTER에 시작하며 필드 BGM 페이드아웃, 끝나면 복귀 (아래)
  //   진입(fade): STAGE_ENTER에 세션 시작 (박 경계 지정이면 필드 곡 타임라인 기준). 필드 BGM은 그 시각부터 FIELD_OUT초 동안
  //         자기 템포로 계속 연주하며 페이드아웃 (세션과 겹침 — 템포가 달라도 공존). 대기 중에는 판정·막대를 멈춰 둔다
  //   종료: FIELD_BACK에 필드 BGM을 처음부터 FIELD_IN초 페이드인 — 켜짐일 때만
  var STAGE_ENTER = 'now', FIELD_OUT = 0.4, FIELD_BACK = 'now', FIELD_IN = 0.5;
  var STAGE_BGM = 'continue';
  var startReq = null;        // 대기 중인 시작 요청 id

  // ── 진입 대기 (필드 인스턴스에서 들어올 때 — M.session.enter, 예: 새싹) ──
  //   들어오면 템포 고정 + 루프 막대(패턴 없이 입력만). **자동 컨티뉴** (WAIT_AUTO — 2026-10-02): 들어온 순간(누른 순간)이 곧 컨티뉴 → "READY"
  //     (WAIT_AUTO false = 예전 방식 — "TAP TO START", 떽(모아이 소리 알림 'moai:voice' pah — 방식·위치 무관)이 컨티뉴) →
  //   시작 경계 = 막대의 한 줄(1마디) 경계 (두 줄은 각각 독립 루프 — Conductor when({ every: ROW }, 기준)) — 목적은 핑퐁 시작과 BGM의 마디 정렬
  //   대기 루프 WAIT_LOOPS = n: 0이면 다음 줄 경계. 1 이상이면 진행 중 줄의 남은 tick이 LOOP_CREDIT 이상일 때(줄 시작 후 한 박 이내 컨티뉴)
  //     그것을 1루프로 인정하고 n−1줄을 더, 모자라면 남은 tick은 셈에 넣지 않고 n줄을 더 기다린다
  //     (이른 컨티뉴에 "남은 tick + n줄"을 기다리게 하면 사실상 n+1루프 — 사용감이 나쁨)
  //   기준 타임라인 = 필드 BGM의 것(울리면 — 그 격자를 이어받음) / 없으면 무음 타임라인(들어온 순간부터, 필드 템포)
  //   (떽 컨티뉴일 때) 들어온 뒤 WAIT_GUARD초 동안의 떽은 무시 (연타로 곧바로 시작되는 것 방지). 뚜우엉(엉)은 컨티뉴가 아님
  //   대기 중 입력은 표시만 (판정 없음). 언제든 이탈 가능 — Esc·T/P·드로어 버튼 (대기 중 포함, BGM은 그대로 이어짐)
  var WAIT_AUTO = true;        // 자동 컨티뉴: 들어온 순간 = 컨티뉴 (누른 시점에 따라 위 대기 루프 규칙대로 기다림) / false = 떽을 기다림
  var WAIT_GUARD = 0.1;
  var WAIT_LOOPS = 1;          // 대기 루프 수 (0 = 다음 줄 경계)
  var LOOP_CREDIT = 0.75;      // 남은 tick이 한 줄의 이 비율 이상이면 1루프로 인정 (= 줄 시작 후 25% = 한 박 이내 컨티뉴)
  // 시작 시각: 기준 타임라인 tl의 다음 줄 경계 + 대기 루프 (위 규칙 — 계산은 리듬 코어 G.core.startBoundary, 필드 패턴 시작과 공유).
  //   템포 고정이라 숫자 하나로 확정, 늘 마디 경계 위
  function startBoundary(tl) { return G.core.startBoundary(tl, { every: ROW, loops: WAIT_LOOPS, credit: LOOP_CREDIT }); }
  var phase = 'idle';         // 'idle' | 'wait' (진입 대기 — 컨티뉴 전·후 시작 경계까지) | 'play'
  var entered = false;        // 필드 인스턴스로 들어온 스테이지 (대기 중 컨티뉴 = 떽)
  var waitRef = null;         // 대기 중 기준 타임라인 (루프 막대 · 시작 경계)
  var waitSilent = null;      // BGM이 없을 때 만든 무음 타임라인
  var waitGo = false;         // 컨티뉴 받음 (시작 경계 대기 중)
  var waitSince = 0;          // 대기에 들어온 오디오 시각 (WAIT_GUARD 기준)
  // 표시 기준: 가이드 막대가 이 타임라인의 격자로 흐른다 (세션 시작 전 — 시작하면 main이 onStart에서 덮어씀)
  function showOn(tl, tempo) {
    G.core.clock(tl, tempo);                           // 박 시계 = 기준 타임라인 (rhythm/core.js)
    G.core.clear(LEN);                                 // 패턴 없이 막대만
  }
  function enter(family, m) {
    if (M.sessionActive || !poolEntry(family + '1')) return false;
    G.ensureCtx();
    selectPattern(family + '1');
    mode = m || 'pingpong';
    entered = true; phase = 'wait'; waitGo = false; waitSince = G.actx.currentTime;
    M.sessionActive = true;
    var tempo = M.fieldBgm ? M.fieldBgm.lockTempo('stage') : BPM;
    var bgmTl = M.fieldBgm && M.fieldBgm.timeline ? M.fieldBgm.timeline() : null;
    if (bgmTl) waitRef = bgmTl;
    else { waitSilent = C.timeline({ name: 'wait', bpm: tempo, unitTicks: LEN }); waitSilent.start(); waitRef = waitSilent; }
    showOn(waitRef, tempo);
    announce('moai:session', { active: true, mode: mode, family: family, phase: 'wait' });
    updateButton();
    if (!loopId) loopId = requestAnimationFrame(frame);
    if (WAIT_AUTO) go();               // 자동 컨티뉴 — 누른 순간 기준으로 시작 경계 (대기 루프 규칙)
    return true;
  }
  function go() {                    // 컨티뉴
    if (phase !== 'wait' || waitGo) return;
    waitGo = true;
    start(mode, true);
  }
  // 대기 중 입력 (bridge.js가 먼저 묻는다): 표시만. 대기 중이면 true (판정으로 보내지 않음)
  M.sessionWaitInput = function(type, time) {
    if (phase !== 'wait') return false;
    G.core.mark(type, time);                          // 친 위치만 (rhythm/core.js — 필드 루프 막대와 같은 표시)
    return true;
  };
  // 컨티뉴 = 떽 (들어온 뒤 WAIT_GUARD초가 지난 것만)
  document.addEventListener('moai:voice', function(e) {
    if (phase !== 'wait' || !entered || waitGo || e.detail.sound !== 'pah') return;
    if (G.actx.currentTime - waitSince < WAIT_GUARD) return;
    go();
  });
  function start(m, fromWait) {
    if (M.sessionActive && !fromWait) return;
    G.ensureCtx();
    mode = m || 'loop';
    schedule = [{ from: 0, entry: poolEntry(selectedId), manual: true }];
    completeUnit = null;
    chances = CHANCES; cleared = {}; endReason = '';
    successes = 0; idCounts = {}; lastIdentified = '-';   // 단위 집계는 코어에 붙을 때 비움
    releasePerformers(); npcDoo = null;
    sessionFamily = familyOf(selectedId);
    if (M.originalEnsureLoaded) M.originalEnsureLoaded();   // NPC 몸 목소리용 음원
    if (!fromWait) {
      M.sessionActive = true;
      announce('moai:session', { active: true, mode: mode, family: familyOf(selectedId) });
    }
    // 템포 = 고정된 필드 템포. 시작 시각은 Conductor가 정한다 — 대기에서 오면 기준 타임라인의 다음 루프 경계,
    //   아니면 필드 곡이 울리면 그 격자의 다음 루프 경계(이어짐 — 그동안 루프 막대를 그 격자로) 또는 페이드아웃
    var tempo = M.fieldBgm ? M.fieldBgm.lockTempo('stage') : BPM;
    var at = C.when('now');
    if (fromWait) at = startBoundary(waitRef);
    else if (M.fieldBgm && M.fieldBgm.isPlaying()) {
      if (STAGE_BGM === 'continue') {
        var bgmTl = M.fieldBgm.timeline();
        at = startBoundary(bgmTl);                       // 누른 순간 = 컨티뉴 (드로어·키 — 발아 상호작용의 대역)
        phase = 'wait'; waitGo = true; showOn(bgmTl, tempo);
      } else { at = M.fieldBgm.when(STAGE_ENTER); M.fieldBgm.suspend(at, FIELD_OUT); }
    }
    // 시작 시각이 정해짐 → 턴 알림 (지금 = 대기, 다음 = 첫 단위의 역할·시작 시각) — 듣는 쪽이 미리 준비 (카메라: 대기의 마지막 한 박 동안 첫 턴으로)
    announce('moai:turn', { unit: -1, role: 'wait', time: G.actx.currentTime, mode: mode, family: sessionFamily,
      next: { role: roleOf(0), time: at }, beat: 60 / tempo, length: LEN * 60 / tempo / 4 });
    // 그 시각에 판정 대상·채널을 붙이고 구간 시작
    //   요청이 곧바로 실행될 수 있다(시각이 예약 범위 안) — 대기 표시를 먼저 두고, 실행되지 않았을 때만 id로
    startReq = -1;
    var reqId = C.request({ at: at }, function(time) {
      startReq = null;
      if (waitSilent) { waitSilent.stop(); waitSilent = null; }
      waitRef = null; phase = 'play';
      // 판정·막대 자리에 붙기 (rhythm/core.js) — 대기 중 표시(기준 격자의 절대 칸)는 버리고, hud.js는 patternAt으로 현재 단위 패턴을 그림
      G.core.attach(coreUser);
      G.noteSfxOut.gain.value = 1;
      C.reset();
      C.addChannel(metronome);
      C.addChannel(judgeFeed);
      C.addChannel(npcVoice);
      C.addChannel(performFeed);
      C.onUnit(onUnit);
      G.core.clock(C);                                 // 박 시계 = main (시작하면 그 값으로 다시 읽음)
      C.start({ bpm: tempo, unitTicks: LEN, startTime: time });
    });
    if (startReq !== null) startReq = reqId;
    updateButton();
    if (!loopId) loopId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!M.sessionActive) return;
    if (startReq) { C.cancel(startReq); startReq = null; }   // 시작 전에 멈춤
    if (waitSilent) { waitSilent.stop(); waitSilent = null; }
    waitRef = null; phase = 'idle'; entered = false; waitGo = false;
    C.stop();
    C.reset();
    M.sessionActive = false;
    renderLives();
    if (npcDoo) { V.dooStop(npcDoo, C.when('now')); npcDoo = null; }
    releasePerformers();
    sessionFamily = null;
    G.core.detach(coreUser);     // 판정·막대 자리에서 떼기 (막대 길이 기본 복구)
    if (G.reveal) G.reveal.clear('session');
    if (M.renderBars) M.renderBars(false);
    if (hud) { hud.textContent = ''; hud.classList.add('hidden'); }
    if (M.fieldBgm) {
      M.fieldBgm.unlockTempo('stage');
      M.fieldBgm.resume(FIELD_BACK, FIELD_IN);   // 필드 BGM 복귀 (켜짐이고 멈춰 있을 때만 — 이어진 BGM은 그대로)
    }
    updateButton();
    announce('moai:session', { active: false, mode: mode, family: familyOf(selectedId) });
    if (!completing) announceResult(familyOf(selectedId), 'stop');   // 중단 (완수·기회 소진은 complete가 알림)
  }

  // 계열 최상위 성공 → 종료: 결과 표시를 남기고, 다음 시작은 그 계열 1단계부터
  function complete() {
    var fam = completedFamily, total = successes, counts = idCounts;
    completeUnit = null;
    completing = true;
    stop();
    completing = false;
    selectedId = fam + '1';
    renderPatternButtons();
    // 스테이지 클리어(최상위 단계 성공) → 친구 합류 (friends.js)
    if (endReason === 'clear' && M.friendJoin) M.friendJoin(fam);
    announceResult(fam, endReason);
    if (hud) {
      if (mode === 'pingpong') {
        var h = highestCleared(fam);
        hud.textContent = 'PINGPONG  ' + fam + '  ' + (endReason === 'clear' ? 'COMPLETE' : 'OUT') +
          '\nRESULT  ' + RATINGS[h] + '  (' + h + '/' + STAGE_COUNT + ')' +
          '\nCLEAR  ' + clearLine(fam);
      } else {
        var list = Object.keys(counts).map(function(k) { return k + '×' + counts[k]; }).join(' ');
        hud.textContent = 'LOOP TEST  COMPLETE ' + fam + '\nSUCCESS ' + total + (list ? '  (' + list + ')' : '');
      }
      hud.classList.remove('hidden');
    }
  }

  function toggle(m) {
    if (M.sessionActive) { stop(); return; }   // 언제든 이탈 (대기 중 포함 — 대기 중 컨티뉴는 떽만)
    start(m);
  }

  // ── 알림 (상태만 — 해석은 듣는 쪽: field-actors.js 새싹 성장·숨김 등) ──
  //   'moai:session' { active, mode, family } — 세션 시작·끝
  //   'moai:turn' { unit, role: 'listen'(발신 — NPC가 부름)|'respond'(응답 — 플레이어)|'wait'(시작 전 — 시작 시각이 정해진 순간 한 번), time (그 단위 시작 — 오디오 시계),
  //                 mode, family, next: { role, time } (다음 단위), beat (한 박 초), length (한 단위 초) } — 단위마다 (진행 중) + 시작 시각이 정해질 때
  //   'moai:stage-result' { family, mode, reason: 'clear'|'fail'|'stop', highest: 도달 단계(0~STAGE_COUNT) } — 끝날 때마다 (Esc 중단 포함)
  //   'moai:stage-step' { family, stage, mode, unit } — 단계 성공 (단위를 모두 맞힌 순간 — 세션 보상 js/rewards.js)
  //   'moai:stage-miss' { family, chances (남은 기회), mode } — 핑퐁 실패로 기회 −1 (0이면 곧 끝 — stage-result fail)
  var completing = false;
  function announce(type, detail) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;   // 알림을 받을 곳이 없는 환경(시뮬레이션 등)
    document.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }
  function announceResult(family, reason) {
    announce('moai:stage-result', { family: family, mode: mode, reason: reason, highest: highestCleared(family) });
  }

  function updateButton() {
    var on = M.sessionActive;
    if (btn) btn.textContent = (on && mode === 'loop') ? '■ 루프 테스트 중단 (T)' : '▶ 루프 테스트 (T)';
    if (ppBtn) ppBtn.textContent = (on && mode === 'pingpong') ? '■ 핑퐁 중단 (P)' : '▶ 핑퐁 (P)';
  }

  function bindToggle(el, m) {
    if (!el) return;
    var touched = false;
    el.addEventListener('touchend', function(e) { e.preventDefault(); touched = true; toggle(m); }, { passive: false });
    el.addEventListener('click', function() { if (touched) { touched = false; return; } toggle(m); });
  }

  bindToggle(btn, 'loop');
  bindToggle(ppBtn, 'pingpong');

  document.addEventListener('keydown', function(e) {
    if (e.repeat) return;
    if (e.code === 'KeyT') { e.preventDefault(); toggle('loop'); }
    else if (e.code === 'KeyP') { e.preventDefault(); toggle('pingpong'); }
    else if (e.code === 'Escape' && M.sessionActive) { e.preventDefault(); stop(); }
  });

  // 세션 설정 API (역할별 NPC 목소리 on/off 등)
  M.session = {
    // 계열 순서 = 조작 탭 스테이지 행 순서 (풀 순서 — 쉬운 것부터). 필드 새싹 순서·색의 원천 (field-actors.js)
    families: function() {
      var out = [];
      POOL.forEach(function(e) { var f = familyOf(e.id); if (out.indexOf(f) < 0) out.push(f); });
      return out;
    },
    // 계열 진입 (필드 인스턴스 등 — field-events.js): 진입 대기 → 컨티뉴 → 다음 루프 경계에서 그 계열 1단계로 시작.
    //   세션 중이거나 없는 계열이면 false
    enter: enter,
    phase: function() { return phase; },
    isWaiting: function() { return phase === 'wait'; },
    setVoice: function(role, on) { VOICE[role] = !!on; },
    getVoice: function(role) { return !!VOICE[role]; }
  };

  buildPatternButtons();
  updateButton();
})();
