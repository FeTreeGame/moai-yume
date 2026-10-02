// 진행 표 — 게이지 단계마다 달성 조건과 보상을 카드로 (구상: docs/STRUCTURE-ROADMAP.md F-5, 명세: docs/index/field-gauge.md)
//   게이지(field-gauge.js)는 그릇: 지금 단계 조건의 양으로 차고, 다 차면 알린다 ('appear' | 'full')
//   여기서: 알림을 받아 지금 단계의 보상 카드를 주고, 단계가 끝나면 다음 단계로 넘기며 그 단계의 조건(양)을 게이지에 건다
//   단계 칸: condition = { card | pool, need, patterns? } · reward = 카드 id | { card | pool, else? } · bonus (선택, 같은 형식) · repeat = 횟수 | 'untilEmpty'
//     pool = 그 단계에 도달했을 때 can()이 참인 후보 중 하나를 뽑는다 ("이번에는 이 중 하나" — 다음 것을 미리 정하지 않음)
//     else = 그 카드(들)를 줄 수 없을 때 대신 줄 것 (같은 형식 — 예: 파트가 밀려나 남지 않았으면 'none')
//     patterns = 그 단계의 필드 평가 패턴 (PATTERNS 이름 목록 — 하나면 그 패턴만 루프마다 반복). 없으면 조건 카드의 기본 목록
//   카드: 보상 { name, can(), give() } / 조건 { name, source, … } — 단계에 들어가면 조건 카드가 게이지의 입력원·필요량을 정한다
//     hold = 뚜~ 누르는 동안의 시간 (게이지가 직접) / loopClear = 필드 평가(js/field-rhythm.js)의 루프 성공마다 1 — 그 단계 동안 평가를 켬(패턴)
//   쉼 = 다음 조건을 준비하는 구간 (루프 단위 소강): **다 찬 순간** 보상을 주고, 쉼의 끝 시각 T를 정해 게이지에 걸고(restUntil),
//     다음 조건(패턴)을 T에 시작하도록 함께 예약한다 (필드 평가 start(spec, { at: T })) — 쉼이 끝나는 프레임에 기대지 않음
//     T = 비트가 있으면 다음 루프 첫 박 규칙 (G.core.startBoundary — 남은 tick + REST.loops루프, 인정 비율 REST.credit — 세션 진입 대기와 같은 규칙),
//         없으면(바 생성 — 타임라인 없음) 필드 템포 REST.loops루프. 첫 BGM 보상은 보상을 준 그 자리에서 곡 타임라인이 생겨 tick 0에서 시작 → T = 두 번째 루프 첫 박
//     쉼 동안은 하단에 패턴 없는 막대만, 쉼의 연출은 T를 보고 따라감. 같은 단계 반복도 같은 흐름
//     조건 칸도 { card } 지정 또는 { pool } 뽑기 (그 단계에 들어갈 때). 시간에 따라·패턴 히트 등은 같은 자리
//   지금 단계 표: 바 생성 → 메인 BGM 시작(첫 파트 — 나머지는 곡 연출로 쌓임) → 패턴 미션 셋(루프 성공 1번씩, 보상 none) → 미니 모아이 (패턴 미션 = 시험 구성)
//   알림: document 'moai:field-event' { kind: 'reward', actor: 'progress', card, level } — 효과음·연출을 붙일 자리
//   게이지 미션을 받는 상태 (receiving — 처음 켜짐): 꺼진 동안 게이지는 숨고 채우지 않으며 필드 평가도 끔. 단계·받은 보상 수는 그대로
//     다시 켜면 그 단계의 채움은 처음부터 (게이지가 알림을 듣고 비움). 알림: { kind: 'receive', actor: 'progress', on }
//     바꾸는 쪽: 연결표 js/field-events.js (BGM 정지·재생, 세션 시작·끝에 붙인 역할) · 조작 탭 버튼 (#missionToggle · M 키 — 시험용 순수 전환)
(function() {
  const M = window.Moai;

  // ── 보상 카드 (공용 등록부 js/rewards.js — 세션 보상·배경 보상 카드와 같은 곳) ──
  const REWARDS = M.rewards ? M.rewards.cards : {};
  Object.assign(REWARDS, {
    bar:  { name: '게이지 바', can: function() { return true; }, give: function() {} },   // 바 생성은 게이지 자체 ('appear')
    bgm:  { name: '메인 BGM 시작',      // 첫 파트를 주고 곡을 시작 — 나머지 파트는 곡 연출로 저절로 쌓임 (bgm.js 드럼 쌓기)
      can: function() { const p = M.fieldBgm && M.fieldBgm.parts && M.fieldBgm.parts(); return !!p && p.on === 0; },
      give: function() { M.fieldBgm.addPart(); } },
    part: { name: '메인 BGM 파트',
      can: function() { const p = M.fieldBgm && M.fieldBgm.parts && M.fieldBgm.parts(); return !!p && p.on < p.total; },
      give: function() { M.fieldBgm.addPart(); } },
    mini: { name: '미니 모아이',
      can: function() { return !!(M.fieldActors && M.fieldActors.nextMini && M.fieldActors.nextMini()); },
      give: function() { M.fieldActors.raiseMini(); } },
    none: { name: '없음', can: function() { return true; }, give: function() {} },   // 주는 것 없음 — 알림('reward')만 (점수·연출을 붙일 자리)
  });
  // ── 조건 카드 ──
  // 필드 미션 패턴 (1루프 16칸 — 0 쉼 · 1 떽 · 2 뚜~ 유지) = 데이터 파일 patterns.field { 이름: '16자' } (편집기: 패턴 메이커 ?patterns). 이름으로 단계 칸이 고른다 (patterns)
  //   규칙: 마지막 한 틱(15번 칸)은 쓰지 않는다 — 15번 = 0 (떽·어택·릴리즈 없음), 14번 ≠ 2 (15번에 릴리즈가 생기거나 뚜~가 경계를 넘지 않게)
  //     판정 창이 다음 루프 경계로 넘어가지 않아 성공이 늘 그 루프 안에서 확정 (2칸 > barely 창 — 약 240 BPM 아래).
  //     매 루프가 같은 쪽의 응답이라 세션의 "마지막 한 박 비움"(턴이 바뀌는 경계)보다 덜 보수적. 어기면 경고하고 쓰지 않음
//   원칙: 마지막 음표(떽·어택·릴리즈)가 루프 앞 25% 안에서 끝나지 않는다 — 마지막 음표 칸 ≥ PATTERN_LAST_MIN (5 — 4칸 = 25%, 판정 창으로 일찍 맞힐 여유 1칸)
//     성공(= 마지막 음표의 판정)이 늘 루프의 25% 뒤 → 다 찬 순간 남은 양 < 0.75 → 쉼의 끝 T = 다음 경계 + 1루프 → 쉼 안에 통째인 루프가 있어
//     다음 패턴을 그 루프에서 미리 드러냄 (js/field-rhythm.js 드러내는 루프). 루프 안 일부 재현 점수화를 들이기 전까지 유지
  const DATA = window.MoaiData || {};
  const PATTERNS = {};
  const rawPatterns = (DATA.patterns && DATA.patterns.field) || {};
  Object.keys(rawPatterns).forEach(function(k) { const v = rawPatterns[k]; PATTERNS[k] = typeof v === 'string' ? v.split('').map(Number) : v; });
  const PATTERN_LAST_MIN = 5;
  function lastNote(p) {                // 마지막 음표 칸 (떽·어택 = 그 칸, 릴리즈 = 뚜~ 다음 칸). 없으면 -1
    let last = -1;
    for (let c = 0; c <= p.length; c++) {
      const v = c < p.length ? p[c] : 0, pv = c > 0 ? p[c - 1] : 0;
      if (v === 1 || (v === 2 && pv !== 2) || (v !== 2 && pv === 2)) last = c;
    }
    return last;
  }
  function validPattern(p) { return !!p && p.length === 16 && p[15] === 0 && p[14] !== 2 && lastNote(p) >= PATTERN_LAST_MIN; }
  Object.keys(PATTERNS).forEach(function(k) {
    if (validPattern(PATTERNS[k])) return;
    console.warn('필드 패턴 규칙 위반 (길이 16, 15번 = 0, 14번 ≠ 2, 마지막 음표 ≥ ' + PATTERN_LAST_MIN + '번) — 쓰지 않음:', k);
    delete PATTERNS[k];
  });
  const FIELD_PATTERNS = Object.keys(PATTERNS).map(function(k) { return PATTERNS[k]; });   // 루프 성공 카드의 기본 목록
  const CONDITIONS = {
    hold: { name: '홀드 (뚜~ 누르는 동안)', source: 'hold' },
    loopClear: { name: '루프 성공 (필드 평가 — 떠 있는 패턴대로)', source: 'rhythm', on: 'loopClear', pool: FIELD_PATTERNS },
  };
  // ── 단계 표 = 데이터 파일 missions.field (편집기: 미션 ?missions) ──
  //   [{ condition: { card: 'hold' | 'loopClear', need: { loops: n } (홀드 — 필드 템포 루프) | { points: n } (루프 성공 n번), patterns: [이름…] },
  //      reward: 보상 카드 id (또는 { pool } · 아래 칸 형식), bonus?, else?, repeat?: 'untilEmpty' }]
  //   지금 값 (2026-10-02 데이터로 옮김): 바 생성(홀드) → 메인 BGM(홀드) → 패턴 미션 뚜우엉 · 정박 떽 · 뚜엉 + 떽 (루프 성공 1번, 보상 없음) → 미니 모아이(홀드, 다 세울 때까지)
  const LEVELS = (DATA.missions && DATA.missions.field) || [];

  let level = 0, given = 0;
  let rng = Math.random;                // 풀에서 뽑기 (시험용으로 바꿀 수 있음)

  function ids(spec) {                  // 보상·조건 칸 → 후보 id 목록
    if (!spec) return [];
    if (typeof spec === 'string') return [spec];
    if (spec.card) return [spec.card];
    return (spec.pool || []).slice();
  }
  function pick(spec) {                 // 지정이면 그것, 풀이면 can()이 참인 것 중 하나 — 없으면 else
    const list = ids(spec).filter(function(id) { return REWARDS[id] && REWARDS[id].can(); });
    if (!list.length) return spec && typeof spec === 'object' && spec.else ? pick(spec.else) : null;
    return typeof spec === 'object' && spec.pool ? list[Math.floor(rng() * list.length)] : list[0];
  }
  function exhausted(L) {               // 이 단계가 끝났나
    if (!L) return true;
    if (L.repeat === 'untilEmpty') return !pick(L.reward);
    return given >= (L.repeat || 1);
  }
  let condition = null;                 // 지금 단계의 조건 카드
  function enter(i) {                   // 단계 들어가기: 조건 카드 → 게이지의 입력원·필요량, 필드 평가 켜고 끄기
    level = i; given = 0;
    const L = LEVELS[level];
    const ids2 = L ? ids(L.condition) : [];
    const cid = ids2.length ? (L.condition.pool ? ids2[Math.floor(rng() * ids2.length)] : ids2[0]) : null;
    condition = cid ? CONDITIONS[cid] : null;
    if (L && M.fieldGauge) {
      M.fieldGauge.setNeed(level === 0 ? 'appear' : 'fill', L.condition.need);
      if (M.fieldGauge.setSource) M.fieldGauge.setSource(condition ? condition.source : 'hold');
    }
    applyRhythm();
  }
  function resting() { return !!(M.fieldGauge && M.fieldGauge.state().rest); }
  // 쉼(루프 단위 소강): 다음 루프 첫 박 규칙의 루프 수 · 인정 비율 (G.core.startBoundary)
  const REST = { loops: 1, credit: 0.75 };
  function restEnd() {                  // 쉼의 끝 시각 T (오디오 시계)
    const G = window.G, tl = M.fieldBgm && M.fieldBgm.timeline ? M.fieldBgm.timeline() : null;
    if (tl && G && G.core) return G.core.startBoundary(tl, { every: 16, loops: REST.loops, credit: REST.credit });
    return M.fieldGauge.clock() + REST.loops * M.fieldGauge.loopSec();
  }
  function patternsFor(L) {             // 단계 칸의 패턴 이름 → 패턴 (없으면 조건 카드의 기본 목록)
    const names = L && L.condition && L.condition.patterns;
    if (!names) return condition.pool;
    return names.map(function(n) { return PATTERNS[n]; }).filter(Boolean);
  }
  function applyRhythm(at) {            // 필드 평가: 받는 중이고 지금 조건이 그 결과를 쓸 때만 — at = 시작 시각 (쉼의 끝 — 다 찬 순간의 예약), 없으면 쉼이 아닐 때 다음 루프 첫 박
    if (!M.fieldRhythm) return;
    const want = receiving && condition && condition.source === 'rhythm';
    if (want && at != null) M.fieldRhythm.start({ pool: patternsFor(LEVELS[level]) }, { at: at });
    else if (want && !resting()) M.fieldRhythm.start({ pool: patternsFor(LEVELS[level]) });
    else M.fieldRhythm.stop();
  }

  // ── 게이지 미션을 받는 상태 ──
  let receiving = true;
  const toggleBtn = document.getElementById('missionToggle');
  function label() { if (toggleBtn) toggleBtn.textContent = '게이지 미션: ' + (receiving ? '받음' : '안 받음') + ' (M)'; }
  function setReceiving(on) {
    on = !!on;
    if (on === receiving) return;
    receiving = on;
    label();
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: 'receive', actor: 'progress', on: on } }));
    applyRhythm();                      // 게이지가 먼저 정리한 뒤 (다시 켜면 쉼도 비워짐)
  }
  function toggleReceiving() { setReceiving(!receiving); }
  if (toggleBtn) {
    let touched = false;
    toggleBtn.addEventListener('touchend', function(e) { e.preventDefault(); touched = true; toggleReceiving(); }, { passive: false });
    toggleBtn.addEventListener('click', function() { if (touched) { touched = false; return; } toggleReceiving(); });
  }
  document.addEventListener('keydown', function(e) {
    if (e.repeat || e.code !== 'KeyM') return;
    e.preventDefault(); toggleReceiving();
  });
  function advance() {                  // 끝난 단계는 지나감 (줄 것이 없는 단계 포함)
    while (level < LEVELS.length && exhausted(LEVELS[level])) enter(level + 1);
  }
  function award() {
    const L = LEVELS[level];
    if (!L) return;
    [L.reward, L.bonus].forEach(function(spec) {
      const id = pick(spec);
      if (!id) return;
      REWARDS[id].give();
      document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: 'reward', actor: 'progress', card: id, level: level } }));
    });
    given++;
    advance();
  }

  document.addEventListener('moai:field-event', function(e) {
    const d = e.detail;
    // 필드 평가의 결과 → 지금 조건 카드가 그 결과를 쓰면 게이지에 1
    if (d.actor === 'rhythm') { if (condition && condition.on === d.kind && M.fieldGauge) M.fieldGauge.add(1); return; }
    if (d.actor !== 'gauge' || (d.kind !== 'appear' && d.kind !== 'full')) return;
    if (d.kind === 'appear' && level !== 0) return;
    if (d.kind === 'full') advance();   // 다른 경로로 보상이 바닥났을 수 있음
    award();                            // 보상 (첫 BGM이면 여기서 곡 타임라인이 생김) · 다음 단계
    const T = restEnd();                // 쉼의 끝 = 다음 조건의 시작 (한 시각으로 예약)
    if (M.fieldGauge) M.fieldGauge.restUntil(T);
    applyRhythm(T);
  });

  enter(0);
  label();

  M.fieldProgress = {
    state: function() { const L = LEVELS[level]; return { level: level, given: given, reward: L ? ids(L.reward) : null, condition: condition ? condition.name : null, done: !L, receiving: receiving }; },
    receiving: function() { return receiving; },
    setReceiving: setReceiving,        // 게이지 미션을 받는 상태 켜고 끄기 (연결표의 역할 · 조작 탭 버튼)
    toggleReceiving: toggleReceiving,
    goto: function(i) { enter(i); },   // 시험용 — 그 단계로 바로
    rewards: REWARDS, conditions: CONDITIONS, levels: LEVELS, patterns: PATTERNS, rest: REST,   // 카드·단계 표·패턴·쉼 (조정·시험용)
    validPattern: validPattern,        // 필드 패턴 규칙 (마지막 한 틱 비움 · 마지막 음표가 앞 25% 안에서 끝나지 않음)
    setRandom: function(fn) { rng = fn || Math.random; },
  };
})();
