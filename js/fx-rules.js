// 연출 연결표 — 사건 → 효과음(js/sfx.js 이름) + 비주얼(js/fx.js 이름). 모듈은 알리기만 하고, 무엇을 울리고 보일지는 여기 한 곳 (field-events.js · camera-rules.js와 같은 방식)
//   명세 docs/index/fx.md. 슬롯을 바꾸려면 여기 줄을, 소리·모양 자체를 바꾸려면 sfx.js SFX · fx.js BURSTS를
//   패턴을 부르는 목소리(세션 = 미니 모아이, 필드 = 안내 칩튠)는 소리 예약이 박에 묶여 있어 그쪽 모듈에 (rhythm/session.js · js/field-rhythm.js)
(function() {
  const M = window.Moai;
  const S = function(name, o) { return M.sfx ? M.sfx.play(name, o) : null; };
  const V = function(name, x, y, o) { if (M.fx) M.fx.burst(name, x, y, o); };
  const POS = {
    gauge: { x0: 0.172, w: 0.656, y: 0.026 },   // 게이지 바 (style.css .field-gauge — 캔버스 비)
    moaiHole: 0.83,                            // 모아이가 솟는 땅 구멍 높이 (먼지)
  };
  function gaugeX(v) { return POS.gauge.x0 + POS.gauge.w * Math.max(0, Math.min(1, v)); }
  function moaiBox() { return M.placedRect && M.LAYOUT ? M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, 1, 1, M.moaiDy ? M.moaiDy() : 0) : null; }
  function el(id) { return document.getElementById(id); }
  function cam() { return M.camera; }
  function nowA() { return M.ensureCtx ? M.ensureCtx().currentTime : 0; }

  // ── 필드: 게이지 ──
  document.addEventListener('moai:gauge-step', function(e) {
    const d = e.detail, fill = document.querySelector && document.querySelector('.field-gauge-fill');
    if (d.dir > 0) { S('gaugeUp', { step: d.step }); if (M.fx) M.fx.pulseEl(fill, 'glow'); }
    else { S('gaugeDown', { step: d.step }); if (M.fx) M.fx.pulseEl(fill, 'dim'); }
  });
  const sparkBar = function() { [0.2, 0.5, 0.8].forEach(function(k) { V('sparkle', gaugeX(k), POS.gauge.y, { n: 8 }); }); };
  const RULES = {
    // 게이지
    'appear:gauge': function() { S('barAppear'); sparkBar(); },
    'full:gauge':   function() { S('missionClear'); sparkBar(); if (cam()) cam().pulse({ amp: 0.015 }); },
    'ready:gauge':  function() {
      if (!M.fieldGauge || M.fieldGauge.policy.source !== 'hold') return;   // 홀드 미션만 (패턴 미션은 드러내기가 신호)
      S('ready'); if (M.fx) M.fx.pulseEl(el('fieldGaugeCue'), 'pop');
    },
    // 하늘·땅의 인스턴스
    'pop:balloon':  function(d) { S('pop'); V('debris', d.x, d.y, { z: 6.6 }); falls[d.id] = S('fall', { dur: 1.2 }); },
    'land:balloon': function(d) { stopHandle(falls, d.id); S('land'); V('dust', d.x, d.y + 0.03, { z: 6.6 }); },
    'tap:mini':     function(d) { S('tapHit'); V('ring', d.x, d.y, { z: 9 }); },
    'tap:sprout':   function(d) { S('tapHit'); V('ring', d.x, d.y, { z: 9 }); },
    'raise:mini':   function(d) { rises[d.id] = S('rise', { dur: 1.6 }); V('dust', d.x, d.y + 0.06, { z: 6.4, n: 14 }); if (cam()) cam().shake(0.25); },
    'risen:mini':   function(d) { stopHandle(rises, d.id); S('risen'); V('sparkle', d.x, d.y - 0.04, { z: 9, n: 10 }); },
    // 보상 (필드 미션 'progress' · 세션 'session')
    'reward:progress': function(d) { rewardFx(d.card); },
    'reward:session':  function(d) { rewardFx(d.card); },
  };
  const falls = {}, rises = {};
  function stopHandle(map, id) { const h = map[id]; if (h && h.stop) h.stop(nowA()); delete map[id]; }
  function rewardFx(card) {
    if (!card || card === 'none' || card === 'bar') return;
    if (card.indexOf('scn.') === 0 && M.scenery) {
      const it = M.scenery.items().filter(function(x) { return 'scn.' + x.id === card; })[0];
      if (it) { S('reward'); V('sparkle', it.x, it.y, { z: 9, n: 16 }); }
    } else if (card.indexOf('acc.') === 0) {
      const r = moaiBox();
      S('reward'); if (r) V('sparkle', r.cx, r.cy - r.dh * 0.25, { z: 9, n: 16 });
    } else S('reward');
  }
  document.addEventListener('moai:field-event', function(e) {
    const f = RULES[e.detail.kind + ':' + e.detail.actor];
    if (f) f(e.detail);
  });

  // ── 모아이 높이 (↑/↓) — 돌 가는 소리 (높이에 따라 음높이), 멈추면 툭 + 먼지 ──
  let grind = null;
  function grindTick() { if (!grind) return false; grind.set(M.moaiHeightNow ? M.moaiHeightNow() : 1); return true; }
  document.addEventListener('moai:height', function(e) {
    const r = moaiBox();
    if (e.detail.moving) {
      if (!grind) grind = S('grind', { height: e.detail.height });
      if (M.frame) M.frame.add(grindTick);
      if (r) V('dust', r.cx, POS.moaiHole, { z: 6.5, n: 6 });
    } else {
      if (grind) { grind.stop(nowA()); grind = null; }
      if (r) V('dust', r.cx, POS.moaiHole, { z: 6.5, n: 10 });
    }
  });

  // ── 세션 ──
  document.addEventListener('moai:session', function(e) {
    if (e.detail.active && e.detail.phase === 'wait') S('whooshIn');   // 들어감 (대기 — 레터박스)
    else if (!e.detail.active) S('whooshOut');
  });
  document.addEventListener('moai:stage-step', function(e) {
    if (e.detail.stage >= 3) return;                                    // 최상위 = 완수 (stage-result clear)
    S('stepClear'); if (M.fx) M.fx.flash('rgb(60,255,140)', 0.16, 260); if (cam()) cam().pulse({ amp: 0.012 });
  });
  document.addEventListener('moai:stage-miss', function(e) {
    if (e.detail.chances <= 0) return;                                  // 기회 소진 = 끝 (stage-result fail)
    S('stepMiss'); if (M.fx) M.fx.flash('rgb(255,60,60)', 0.22, 300); if (cam()) cam().shake(0.35);
  });
  document.addEventListener('moai:stage-result', function(e) {
    const d = e.detail;
    if (d.reason === 'clear') { S('complete'); V('confetti', 0.5, 0.25, { z: 9 }); if (cam()) cam().pulse({ amp: 0.02 }); }
    else if (d.reason === 'fail') { S('out'); if (M.fx) M.fx.flash('rgb(0,0,0)', 0.35, 700); }
  });

  M.fxRules = { rules: RULES, pos: POS };   // 시험·조정용
})();
