// 필드 시계 — 필드 인스턴스의 흐르는 시간(가상 시간). 배속(rate)이 바뀌면 떠다니는 이동과 등장 주기가 함께 빨라진다
//   바람: 모아이의 뚜~(누름)를 바람 불기로 재해석 — 누르는 동안 배속이 올라가고(WIND.rate까지 rise초), 떼면(떽·엉) 서서히 돌아온다(fall초)
//     사용자에게 필드의 제어권을 준다 (입력 장려·지루함 개선. 원작 필드의 바람으로 블럭 밀고 당기기의 연장선). 스테이지와는 무관
//     소리 알림 'moai:voice' (original.js) { sound: 'doo'(누름 시작) | 'pah' | 'wop' | 'stop'(강제 정리) }을 듣는다
//   M.fieldClock: rate() 지금 배속 / after(sec, fn) 필드 시간 타이머 → id / cancel(id)
//     타이머: 배속 1이고 바람이 없으면 setTimeout (프레임 루프를 깨우지 않음), 바람이 불면 프레임마다 필드 시간으로 센다
//   시계 = 벽시계 기반 가상 시간 (rAF·setTimeout). 오디오 시각(Conductor)과 무관 — 흐르는 시간이라 Conductor 대상 아님
//   구조: CONDUCTOR-INDEX A-8 "가상(게임) 시간"의 첫 사용처 (필드 한정)
(function() {
  const M = window.Moai;

  // 바람 정책 (디테일): 최대 배속, 오르는·돌아오는 시간(초), 세션(스테이지) 중에도 부는가
  const WIND = { rate: 3, rise: 0.3, fall: 1.5, inSession: false };

  let rate = 1, target = 1;
  let running = false;          // 프레임 루프에 시계 작업이 올라가 있는가 (바람이 불거나 돌아오는 중)
  let nextId = 1;
  let timers = [];              // { id, left(필드 초), fn, handle(setTimeout), since(벽시계 초) }

  function wallNow() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }

  // ── 타이머 ──
  function armIdle(tm) {        // 배속 1: 벽시계 타이머
    tm.since = wallNow();
    tm.handle = setTimeout(function() { fire(tm); }, tm.left * 1000);
  }
  function toFrame(tm) {        // 바람 시작: 남은 시간을 필드 시간으로 넘겨 프레임에서 센다
    if (tm.handle === null) return;
    clearTimeout(tm.handle);
    tm.handle = null;
    tm.left = Math.max(0, tm.left - (wallNow() - tm.since));
  }
  function fire(tm) {
    timers = timers.filter(function(x) { return x !== tm; });
    tm.fn();
  }
  function after(sec, fn) {
    const tm = { id: nextId++, left: sec, fn: fn, handle: null, since: 0 };
    timers.push(tm);
    if (!running) armIdle(tm);
    return tm.id;
  }
  function cancel(id) {
    timers = timers.filter(function(tm) {
      if (tm.id !== id) return true;
      if (tm.handle !== null) clearTimeout(tm.handle);
      return false;
    });
  }

  // ── 바람 (프레임마다) ──
  function tick(t, dt) {
    // 배속을 목표로 선형 이동 (오를 땐 rise초, 돌아올 땐 fall초에 전체 폭)
    const span = WIND.rate - 1;
    const up = target > rate;
    const speed = span / (up ? WIND.rise : WIND.fall);
    rate = up ? Math.min(target, rate + speed * dt) : Math.max(target, rate - speed * dt);
    const fdt = dt * rate;
    timers.slice().forEach(function(tm) {
      tm.left -= fdt;
      if (tm.left <= 0) fire(tm);
    });
    if (rate === 1 && target === 1) {   // 바람이 멎음 → 벽시계 타이머로 되돌림
      running = false;
      timers.forEach(armIdle);
      return false;
    }
    return true;
  }
  function blow(on) {
    target = on ? WIND.rate : 1;
    if (!running && (target !== 1 || rate !== 1)) {
      running = true;
      timers.forEach(toFrame);
      M.frame.add(tick);
    }
  }

  document.addEventListener('moai:voice', function(e) {
    if (e.detail.sound === 'doo') { if (!M.sessionActive || WIND.inSession) blow(true); }
    else blow(false);
  });
  document.addEventListener('moai:session', function(e) { if (e.detail.active && !WIND.inSession) blow(false); });

  M.fieldClock = {
    rate: function() { return rate; },
    after: after,
    cancel: cancel,
    policy: WIND,   // 조정·시험용
  };
})();
