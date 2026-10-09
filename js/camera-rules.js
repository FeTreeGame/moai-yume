// 카메라 연출 규칙 — 사건 → 샷 (field-events.js와 같은 방식: 모듈은 상태만 알리고 여기서 해석). 카메라(js/camera.js)는 범용으로 둔다
//   명세 docs/index/camera.md §5
//   세션 (rhythm/session.js):
//     들어오면 (moai:session 시작) 레터박스(안전 영역 — 아래 띠에 루프 막대) + 대기 동안 투샷에 머묾 (SESSION.wait)
//     턴 (moai:turn — 지금 단위·다음 단위의 역할과 시작 시각): 발신(listen — NPC가 부름) = 그 계열의 미니 모아이 / 응답(respond — 플레이어) = 투샷 장면 (복사본 — 따로 조정 가능)
//       전환 = 지금 턴의 마지막 SESSION.lead박 동안 → 다음 턴의 첫 박에 도착 (Conductor 요청 — 그 시각에 샷)
//       샷마다 motion { lead, arrive } (박): 지금 턴의 마지막 lead박에 출발 → 다음 턴의 arrive박 뒤에 도착하는 한 번의 이동 (이동·확대 동시, 로그 척도 배율)
//         발신(미니)은 경계를 넘어 천천히 도착 (lead 1 · arrive 2 = 마지막 박에 출발, 다음 턴 세 번째 박에 도착 — 큰 확대가 한 박에 일어나지 않게)
//         motion이 없으면 SESSION.lead박 동안 → 다음 턴 첫 박에 도착
//       대기 → 첫 턴도 같음: 시작 시각이 정해진 순간(컨티뉴) 세션이 '대기' 턴 알림을 냄. 미리 예약하지 못한 턴(대기 없는 시작 등)은 그 턴 첫 박에 바로
//     끝나면 (moai:session 끝) 기본 샷으로 돌아오고 레터박스를 걷음
//   대상 이름: 'two' = [메인 모아이, 그 계열의 미니 모아이] 투샷 · 'mini' = 그 계열의 미니 모아이 · 'moai' = 메인 모아이 (미니가 없으면 메인 모아이)
//   샷 값: zoom · offset { x, y } (대상 가운데에서 초점을 비킴 — 캔버스 비) · fit (투샷 — false면 두 대상을 담는 자동 맞춤 없이 zoom 그대로) · maxZoom (그 샷의 상한)
//     byFamily { 계열: { zoom?, offset?, fit? } } = 그 세션의 계열(미니 모아이)마다 따로 — 있으면 그 값, 없으면 위의 공통 값 (미니마다 서 있는 자리가 달라 구도가 다름)
//     값 조정 도구: ?camtune (js/camera-tuner.js — 미니 모아이 일곱을 세우고 맞춘 뒤 이 형식으로 출력)
(function() {
  const M = window.Moai;
  const G = window.G;

  // 임시값 (사용자 스케치 2026-10-02 — 대기 = 투샷, 발신 턴 = 미니 포커스, 응답 턴 = 메인 포커스, 레터박스 포함)
  const SESSION = {
    letterbox: true,
    priority: 10,                          // 세션 샷의 우선순위 (시험 패널 샷보다 위)
    lead: 1,                               // 다음 턴으로 넘어가는 보간 = 지금 턴의 마지막 몇 박 (다음 턴 첫 박에 도착)
    // 값: 사용자가 ?camtune(미니 일곱)으로 계열마다 맞춘 것 (2026-10-02). 계열 값이 없으면 공통
    wait:    { target: 'two',  zoom: 1.6,  offset: { x: 0, y: 0 }, dur: 0.8, ease: 'inOut',
      byFamily: {
        TAP: { zoom: 1.25, offset: { x: 0.02, y: 0 }, fit: false },
        DOO: { zoom: 1.25, offset: { x: -0.01, y: 0 }, fit: false },
        MIX: { zoom: 1.2, offset: { x: 0, y: 0 }, fit: false },
        CPA: { zoom: 1.15, offset: { x: 0, y: 0 }, fit: false },
        CPB: { zoom: 1.2, offset: { x: -0.02, y: 0 }, fit: false },
        CPC: { zoom: 1.25, offset: { x: -0.02, y: 0 }, fit: false },
        CPD: { zoom: 1.25, offset: { x: -0.02, y: 0 }, fit: false },
      } },
    listen:  { target: 'mini', zoom: 2,    offset: { x: 0, y: 0 }, maxZoom: 3, ease: 'out',   // 미니 상한 3 (배경이 1.6배쯤 늘어 살짝 부드러워짐 — 미니 자체는 8배까지 선명)
      motion: { lead: 1, arrive: 2 },   // 마지막 박에 출발 → 발신 턴 세 번째 박에 도착 (3박 동안 이동·확대 동시)
      byFamily: {
        MIX: { zoom: 3, offset: { x: -0.02, y: -0.025 } },
        DOO: { zoom: 3, offset: { x: -0.02, y: -0.02 } },
        TAP: { zoom: 3, offset: { x: -0.02, y: -0.015 } },
        CPD: { zoom: 3, offset: { x: 0.02, y: -0.015 } },
        CPC: { zoom: 3, offset: { x: 0.02, y: -0.02 } },
        CPA: { zoom: 3, offset: { x: 0, y: -0.03 } },
        CPB: { zoom: 3, offset: { x: 0.02, y: -0.025 } },
      } },
    respond: { target: 'two',  zoom: 1.6,  offset: { x: 0, y: 0 }, ease: 'out',
      motion: { lead: 1, arrive: 1 },   // 마지막 박에 출발 → 응답 턴 두 번째 박에 도착 (2박 동안 이동·축소 동시)
      // 투샷(wait) 장면의 복사본 (2026-10-02 — 대상·자동 맞춤·계열 값까지 같게 시작). 복사본이라 응답만 따로 미세 조정 가능 (?camtune 3)
      byFamily: {
        TAP: { zoom: 1.25, offset: { x: 0.02, y: 0 }, fit: false },
        DOO: { zoom: 1.25, offset: { x: -0.01, y: 0 }, fit: false },
        MIX: { zoom: 1.2, offset: { x: 0, y: 0 }, fit: false },
        CPA: { zoom: 1.15, offset: { x: 0, y: 0 }, fit: false },
        CPB: { zoom: 1.2, offset: { x: -0.02, y: 0 }, fit: false },
        CPC: { zoom: 1.25, offset: { x: -0.02, y: 0 }, fit: false },
        CPD: { zoom: 1.25, offset: { x: -0.02, y: 0 }, fit: false },
      } },
    end: { dur: 1.8, ease: 'inOut' },     // 세션이 끝나 기본 샷으로 — 천천히 (빨리 돌아오면 멀미 — 사용자 확인 2026-10-02)
  };

  let on = false, family = null, shotId = null, lastRole = null, pending = [];
  let plain = false;                    // 만든 세션 (제작 탭 — 부르는 쪽이 구구): 카메라는 필드의 구도 그대로 — 샷을 걸지 않고 위쪽 띠만 (아래 띠가 구구를 가린다)
  function isPlain(fam) { return !!(M.session && M.session.custom && fam && fam === M.session.custom.family); }
  const CAMR = function() { return M.camera; };
  function targetOf(name, fam) {
    const mini = CAMR().at.mini(fam);
    const hasMini = !!mini();
    if (name === 'two') return hasMini ? ['moai', mini] : 'moai';
    if (name === 'mini') return hasMini ? mini : 'moai';
    return 'moai';
  }
  // 그 계열에 적용할 샷 값: 공통 값 위에 계열 값(byFamily) — 없으면 공통
  function specOf(kind, fam) {
    const s = SESSION[kind], o = fam && s.byFamily ? s.byFamily[fam] : null;
    if (!o) return s;
    return Object.assign({}, s, o, { offset: o.offset || s.offset });
  }
  // 샷 정의(종류 — 'wait'·'listen'·'respond') → 카메라 요청 값 (조정 도구도 같은 것으로 미리 봄)
  function shotFor(kind, fam, extra) {
    const s = specOf(kind, fam);
    return Object.assign({ target: targetOf(s.target, fam), zoom: s.zoom, offset: s.offset, fit: s.fit, maxZoom: s.maxZoom, dur: s.dur, ease: s.ease, priority: SESSION.priority }, extra || {});
  }
  function setShot(kind, at, dur, extra) {
    const prev = shotId;
    shotId = CAMR().request(shotFor(kind, family, Object.assign({ at: at, dur: dur != null ? dur : SESSION[kind].dur }, extra || {})));
    if (prev) CAMR().release(prev, { dur: 0 });   // 새 샷이 위 — 옛 샷은 조용히 뺌
  }
  function cancelPending() { pending.forEach(function(id) { G.conductor.cancel(id); }); pending = []; }
  function at(time, fn) { const id = G.conductor.request({ at: time }, function(t) { pending = pending.filter(function(x) { return x !== id; }); if (on) fn(t); }); pending.push(id); }
  // 그 샷의 움직임 (박): 출발 = 다음 턴 시작보다 lead박 앞, 도착 = 다음 턴 시작보다 arrive박 뒤
  function motionOf(kind) { const m = SESSION[kind].motion || {}; return { lead: m.lead != null ? m.lead : SESSION.lead, arrive: m.arrive || 0 }; }
  // 다음 턴 예약: lead박 앞에 출발해 (lead + arrive)박 동안 한 번에 이징 → 다음 턴의 arrive박 뒤에 도착
  function scheduleNext(next, beat) {
    cancelPending();
    if (!SESSION[next.role] || next.role === 'wait') return;
    const b = beat || 0.5, mo = motionOf(next.role);
    at(next.time - mo.lead * b, function(time) {
      if (next.role === lastRole) return;
      lastRole = next.role;
      setShot(next.role, time, Math.max(0.05, next.time + mo.arrive * b - time));
    });
  }

  document.addEventListener('moai:session', function(e) {
    if (!CAMR()) return;
    if (e.detail.active) {
      if (on) return;                      // 대기 → 진행은 같은 세션
      on = true; family = e.detail.family || null; lastRole = null; plain = isPlain(family);
      if (SESSION.letterbox) CAMR().letterbox(true, { topOnly: plain });
      if (!plain) setShot('wait', null);   // 대기 동안 투샷
    } else {
      if (!on) return;
      on = false; lastRole = null; cancelPending();   // 예약해 둔 다음 턴·밀어 들어가기 취소
      if (shotId) { CAMR().release(shotId, SESSION.end); shotId = null; }
      if (SESSION.letterbox) CAMR().letterbox(false);
    }
  });
  document.addEventListener('moai:turn', function(e) {
    if (!on || !CAMR() || !G || !G.conductor) return;
    const d = e.detail;
    if (d.family) family = d.family;
    if (plain) return;                   // 만든 세션 — 턴마다의 샷 없음
    if (d.role !== 'wait' && SESSION[d.role] && d.role !== lastRole) {   // 미리 예약하지 못한 턴 (대기 없는 시작 등) — 그 턴 첫 박에 바로
      lastRole = d.role;
      const mo = motionOf(d.role);
      setShot(d.role, d.time, mo.arrive ? mo.arrive * (d.beat || 0.5) : null);   // 도착 박이 있으면 그만큼에 걸쳐
    }
    if (d.next) scheduleNext(d.next, d.beat);
  });

  // ── 필드: 홀드 미션에서 누르는 동안 메인 모아이 쪽으로 서서히 줌인, 떼면 원래 자리로 ──
  //   대상 = 게이지를 홀드로 채우는 미션뿐 (js/field-gauge.js state().holding — 지금 누르는 뚜~가 게이지를 채우는 중). 패턴 미션에는 걸지 않는다
  //   level (0 ~ 1) = 누르는 동안 1로, 떼면 0으로 — 선형 (일정한 빠르기). 배율 = 1 + (zoom − 1) × level
  //     다가갈 때 · 도중에 떼어 물러날 때 = 같은 빠르기 (in초에 0 ↔ 1). 게이지를 다 채웠을 때(쉼)만 빠르게 돌아간다 (done초에 1 → 0 — 완수의 신호)
  //     in = 'gauge' → 게이지가 비어서 다 찰 때까지 걸리는 초 (js/field-gauge.js needSec — 미션의 필요량을 따라간다): 다 차는 순간에 다 당겨진다 (도중에 줌이 멈추지 않는다)
  //   초점 = 얼굴 쪽으로: 다 당겼을 때 얼굴(가로 = 모아이의 반전 축 · 세로 = 판정 상자의 가운데 — 에서 face만큼 비킨 점)이 화면의 at 자리에 오게 한다
  //     가는 길 = 한 점(A)이 화면에서 제자리에 머무는 줌: 초점 = A + (가운데 − A) ÷ 배율 — 배율과 초점이 한 식으로 같이 움직인다 (A는 도착 구도에서 거꾸로 센다)
  //     (대상을 그냥 모아이로 주면 초점이 경계 제한에 걸려 가로는 금방 다 가고 세로만 계속 가서, 옆으로 먼저 밀렸다가 자리를 잡는 것처럼 보인다)
  //   이 연출은 이 미션(게이지를 홀드로 채우기)의 것 — 세션 · 다른 미션에는 걸지 않는다 (미션마다 쓸 연출을 따로 먹인다)
  //   샷은 level이 있는 동안만 건다 (다 돌아오면 놓는다 — 기본 샷으로). 세션에 들어가면 바로 놓는다 (세션의 샷이 화면을 가진다 — 우선순위도 그 아래)
  //   맞힘의 펄스 · 놓침의 셰이크는 샷 위에 얹히는 것이라 그대로 동작한다
  const FIELD = { hold: { on: true, zoom: 1.4, priority: 1, in: 'gauge', done: 0.5, poll: 100, release: { dur: 0.3, ease: 'inOut' },
    face: { x: 0, y: -0.09 },            // 얼굴 = 모아이 판정 상자의 가운데에서 이만큼 (캔버스 비 — 위로)
    at: { x: 0.5, y: 0.46 } } };         // 다 당겼을 때 얼굴이 올 화면 자리 (0.5 = 가운데)
  let gShot = null, gLevel = 0, gLast = null;
  function holdingNow() { const g = M.fieldGauge && M.fieldGauge.state ? M.fieldGauge.state() : null; return !!(g && g.holding); }
  function holdZoom() {                  // 카메라가 프레임마다 읽는다 (level도 여기서 한 번 나아간다)
    const now = performance.now() / 1000, dt = gLast == null ? 0 : Math.min(0.1, now - gLast), want = holdingNow() ? 1 : 0;
    gLast = now;
    const inSec = FIELD.hold.in === 'gauge' ? (M.fieldGauge && M.fieldGauge.needSec ? M.fieldGauge.needSec() : 2) : FIELD.hold.in;
    const g = M.fieldGauge && M.fieldGauge.state ? M.fieldGauge.state() : null, outSec = g && g.rest ? FIELD.hold.done : inSec;   // 다 채운 뒤(쉼)에만 빠르게
    gLevel = want ? Math.min(1, gLevel + dt / Math.max(0.1, inSec)) : Math.max(0, gLevel - dt / Math.max(0.1, outSec));   // 선형
    return 1 + (FIELD.hold.zoom - 1) * gLevel;
  }
  function holdFocus() {                 // 다 당겼을 때 얼굴이 at 자리에 오도록 — 가는 길은 한 점이 제자리에 머무는 줌
    const P = FIELD.hold, B = CAMR().boxOf ? CAMR().boxOf('moai') : null, Z = P.zoom, z = 1 + (Z - 1) * gLevel;
    if (!B || Z <= 1) return 'moai';
    const ax = M.facing && M.facing.axis ? M.facing.axis() : B.x;                // 가로 = 모아이의 반전 축 (판정 상자의 가운데는 방향에 따라 좌우로 옮겨진다 — 누르는 도중 방향이 바뀌면 카메라가 옆으로 흔들렸다)
    const F = { x: ax + P.face.x, y: B.y + P.face.y };                           // 얼굴
    const end = { x: F.x - (P.at.x - 0.5) / Z, y: F.y - (P.at.y - 0.5) / Z };    // 다 당겼을 때의 초점
    const A = { x: (end.x - 0.5 / Z) / (1 - 1 / Z), y: (end.y - 0.5 / Z) / (1 - 1 / Z) };   // 그 구도로 가는 줌에서 제자리에 머무는 점
    return { x: A.x + (0.5 - A.x) / z, y: A.y + (0.5 - A.y) / z };
  }
  function holdDrop(opts) { if (gShot && CAMR()) CAMR().release(gShot, opts || FIELD.hold.release); gShot = null; gLast = null; gLevel = 0; }
  if (typeof setInterval === 'function') setInterval(function() {   // 주기 타이머가 없는 환경(시뮬레이션)에서는 걸지 않는다
    const P = FIELD.hold;
    if (!P.on || !CAMR() || on) { if (gShot) holdDrop(); return; }             // on = 세션 중
    if (!gShot && holdingNow()) { gLevel = 0; gLast = null; gShot = CAMR().request({ target: holdFocus, zoom: holdZoom, priority: P.priority, dur: 0, ease: 'inOut' }); }
    else if (gShot && !holdingNow() && gLevel <= 0) holdDrop();
  }, FIELD.hold.poll);
  document.addEventListener('moai:session', function(e) { if (e.detail.active) holdDrop(SESSION.wait); });

  M.cameraRules = { session: SESSION, field: FIELD, shotFor: shotFor, specOf: specOf, kinds: ['wait', 'listen', 'respond'] };   // 조정·시험용 (값 조정 도구 ?camtune)
})();
