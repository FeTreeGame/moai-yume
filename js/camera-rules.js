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
      on = true; family = e.detail.family || null; lastRole = null;
      if (SESSION.letterbox) CAMR().letterbox(true);
      setShot('wait', null);               // 대기 동안 투샷
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
    if (d.role !== 'wait' && SESSION[d.role] && d.role !== lastRole) {   // 미리 예약하지 못한 턴 (대기 없는 시작 등) — 그 턴 첫 박에 바로
      lastRole = d.role;
      const mo = motionOf(d.role);
      setShot(d.role, d.time, mo.arrive ? mo.arrive * (d.beat || 0.5) : null);   // 도착 박이 있으면 그만큼에 걸쳐
    }
    if (d.next) scheduleNext(d.next, d.beat);
  });

  M.cameraRules = { session: SESSION, shotFor: shotFor, specOf: specOf, kinds: ['wait', 'listen', 'respond'] };   // 조정·시험용 (값 조정 도구 ?camtune)
})();
