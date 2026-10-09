// 타격 연출의 장치 — 맞혔다는 것을 모아이와 세계에 싣는다. 무엇을 언제 얼마나 할지(정책)는 연출 연결표 js/fx-rules.js IMPACT
//   여기는 '지금 얼마나'를 답하는 곳: 시작만 받아 두고, 그리는 쪽이 그릴 때마다 묻는다 (값을 들고 있지 않으면 화면은 평소 그대로)
//     punch(o)        모아이가 튄다 — o = { amp (커지는 정도 — 0.05 = 5%), dur (초), flash (밝아지는 정도 0~1) }
//     nod(o)          모아이 · 미니 모아이가 끄덕인다 (눌렸다 돌아옴 — 킥) — o = { amp, dur, mini (미니의 정도) }. 모아이는 튀는 중이면 양보한다
//     inhale(o)       모아이가 숨을 들이쉰다 (내 차례 직전 — 눌렸다 풀림) — o = { amp, dur }
//     droop(o)        모아이가 움찔한다 (놓침 — 세션) — o = { amp, dur }
//     miniPunch(stage | '*', o)   미니 모아이가 튄다 (콜의 음표)
//     holdStart() / holdEnd()     누르는 동안의 미세한 떨림
//     bounce(o)       배경 요소가 들썩인다 — o = { amp, hop, dur, stagger }      squash(o)  배경 요소가 눌린다 (킥) — o = { amp, dur }
//     glow(o)         무지개 띠가 안쪽부터 차례로 밝아진다 — o = { amp, dur, stagger }
//   그리는 쪽이 읽는 것: moai(t) → { sx, sy, flash, dx, dy, acc } | null  (js/sprite.js — acc = 악세사리에 더 거는 배수: 한 박자 늦게 따라온다)
//                       mini(stage, t) → { sx, sy } | null                  (js/field-actors.js)
//                       scenery(it, i, t) → { s, sq, dy, glow } | null      (js/scenery.js — 배경 요소 하나)
//   박 = 킥: 이펙트의 길이는 초가 아니라 '킥 사이의 간격'으로 잰다 (곡마다 킥의 무늬가 다르다 — 정박이 아니다)
//     kick(o) = 방금 울린 킥 { gap (다음 킥까지 — 초), accent (마디의 첫 킥) } / span(k) → 지금 킥 간격의 k배 (초). 킥이 없으면 null (부르는 쪽이 다른 값으로)
//   밝아짐의 한도: flashOk() — 큰 면적의 밝기 변화는 FLASH.gap초에 한 번만 (튀기 · 가장자리 빛이 같이 쓴다)
//   시계 = 벽시계 (performance.now — 프레임 루프 js/frame.js와 같은 축). 움직이는 동안만 프레임 루프에 붙는다
//   on = false면 전부 꺼진다 (아무것도 답하지 않는다)
(function() {
  const M = window.Moai;
  const now = function() { return performance.now() / 1000; };
  const S = { punch: null, hold: null, bounce: null, squash: null, glow: null, nod: null, inhale: null, droop: null, mini: {} };
  const HOLD = { amp: 0.0025, ramp: 1.2, freq: 31 };   // 떨림: 최대 이동 (모아이 상자 폭 비) · 다 커지기까지 (초) · 빠르기
  // 밝아짐의 간격: 화면의 큰 면적이 1초에 세 번 넘게 번쩍이면 안 된다 (빛에 민감한 사람 — 16분음표를 연달아 맞히면 초당 8번까지 간다)
  const FLASH = { gap: 0.36 };
  const ACC = { lag: 0.035, gain: 1.7 };               // 악세사리: 모아이보다 이만큼(초) 늦게, 이 배수로 더 크게 따라온다
  const KICK = { min: 0.1, max: 1.2, stale: 2.5 };     // 킥 간격으로 쓰는 범위 (초) · 마지막 킥에서 간격의 몇 배가 지나면 '킥 없음'
  let lastFlash = -1e9, kick = null;

  // 튀는 곡선: 처음 PEAK 안에 정점(1)까지 오르고, 그 뒤 살짝 넘쳤다(음수) 0으로 가라앉는다
  const PEAK = 0.22;   // 잰 결과: 0.3이면 ACE의 정점이 40ms — 판정 순간에서 2프레임(33ms)을 넘는다 → 0.22 (140ms짜리가 31ms)
  function curve(u) {
    if (u <= 0 || u >= 1) return 0;
    if (u < PEAK) { const v = u / PEAK; return 1 - (1 - v) * (1 - v); }
    const v = (u - PEAK) / (1 - PEAK);
    return (1 - v) * (1 - v) * Math.cos(v * Math.PI * 1.2);
  }
  function bump(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); }   // 눌렸다 풀리는 곡선 (끄덕임 · 들숨)
  function val(p, t, f) { return p ? p.amp * (f || curve)((t - p.t0) / p.dur) : 0; }
  function tick() { return active(); }
  function wake() { if (M.frame) M.frame.add(tick); else if (M.spriteRedraw) M.spriteRedraw(); }
  function done(p, t, extra) { return p && t - p.t0 >= p.dur + (extra || 0); }
  function active() {
    const t = now();
    ['punch', 'squash', 'nod', 'inhale', 'droop'].forEach(function(k) { if (done(S[k], t, k === 'punch' ? ACC.lag : 0)) S[k] = null; });
    if (S.bounce && done(S.bounce, t, S.bounce.span)) S.bounce = null;
    if (S.glow && done(S.glow, t, S.glow.span)) S.glow = null;
    Object.keys(S.mini).forEach(function(k) { if (done(S.mini[k], t)) delete S.mini[k]; });
    return !!(S.punch || S.hold || S.bounce || S.squash || S.glow || S.nod || S.inhale || S.droop || Object.keys(S.mini).length || (S.item && Object.keys(S.item).length));
  }
  function start(key, o, def) { if (!api.on) return; S[key] = Object.assign({ t0: now() }, def, o); wake(); }

  const api = {
    on: true,
    flashOk: function() { const t = now(); if (!api.on || t - lastFlash < FLASH.gap) return false; lastFlash = t; return true; },
    kick: function(o) { kick = { t0: now(), gap: Math.max(KICK.min, Math.min(KICK.max, o.gap || 0.5)), accent: !!o.accent }; },
    span: function(k) { return kick && now() - kick.t0 < kick.gap * KICK.stale ? kick.gap * (k == null ? 1 : k) : null; },
    kicking: function() { return !!(kick && now() - kick.t0 < kick.gap * KICK.stale); },
    punch: function(o) {
      if (!api.on) return;
      const fl = o.flash && (o.checked || api.flashOk()) ? o.flash : 0;   // checked = 부르는 쪽이 이미 한도를 확인함 (가장자리 빛과 같이 쓸 때)
      S.punch = { t0: now(), amp: o.amp || 0, dur: o.dur || 0.12, flash: fl }; wake();
    },
    nod: function(o) { start('nod', o, { amp: 0.006, dur: 0.16, mini: 0.01 }); },
    inhale: function(o) { start('inhale', o, { amp: 0.015, dur: 0.4 }); },
    droop: function(o) { start('droop', o, { amp: 0.02, dur: 0.3 }); },
    // 배경 요소 하나만 튄다 (그 개체의 몸짓 — 구구: 누름 · 만든 세션의 콜) — o = { amp (커지는 정도), hop (뛰는 높이 — 캔버스 높이 비), dur }
    itemPunch: function(id, o) { if (!api.on) return; S.item = S.item || {}; S.item[id] = { t0: now(), amp: o.amp || 0.1, hop: o.hop || 0, dur: o.dur || 0.2 }; wake(); },
    miniPunch: function(stage, o) { if (!api.on) return; S.mini[stage] = { t0: now(), amp: o.amp || 0.03, dur: o.dur || 0.12 }; wake(); },
    holdStart: function() { if (!api.on) return; S.hold = { t0: now() }; wake(); },
    holdEnd: function() { S.hold = null; },
    bounce: function(o) { if (!api.on) return; S.bounce = { t0: now(), amp: o.amp || 0, hop: o.hop || 0, dur: o.dur || 0.2, stagger: o.stagger || 0, span: (o.stagger || 0) * 12 }; wake(); },
    squash: function(o) { start('squash', o, { amp: 0.008, dur: 0.16 }); },
    glow: function(o) { if (!api.on) return; S.glow = { t0: now(), amp: o.amp || 0, dur: o.dur || 0.4, stagger: o.stagger || 0, span: (o.stagger || 0) * 8 }; wake(); },
    moai: function(t) {
      if (!api.on) return null;
      t = t == null ? now() : t;
      let a = 0, flash = 0, dx = 0, dy = 0, acc = 1;
      const p = S.punch;
      if (p) {
        const u = (t - p.t0) / p.dur; a = p.amp * curve(u); flash = p.flash * Math.max(0, 1 - u / 0.5);
        acc = (1 + p.amp * ACC.gain * curve((t - p.t0 - ACC.lag) / p.dur)) / (1 + a);   // 악세사리: 늦게 · 더 크게
      } else a = -val(S.nod, t, bump);                                              // 끄덕임은 튀는 중이 아닐 때만
      a -= val(S.inhale, t, bump) + val(S.droop, t, bump);
      if (S.hold) {
        const k = Math.min(1, (t - S.hold.t0) / HOLD.ramp) * HOLD.amp;
        dx = k * Math.sin(t * HOLD.freq * 6.283); dy = k * Math.cos(t * HOLD.freq * 4.7 + 1.3) * 0.6;
      }
      if (!a && !flash && !dx && !dy && acc === 1) return null;
      return { sx: 1 + a * 0.5, sy: 1 + a, flash: flash, dx: dx, dy: dy, acc: acc };   // 위로 솟는 모양 (세로가 더 크게). 음수면 눌림
    },
    mini: function(stage, t) {
      if (!api.on) return null;
      t = t == null ? now() : t;
      const a = val(S.mini[stage] || S.mini['*'], t) - (S.nod ? S.nod.mini * bump((t - S.nod.t0) / S.nod.dur) : 0);
      return a ? { sx: 1 + a * 0.5, sy: 1 + a } : null;
    },
    scenery: function(it, i, t) {
      if (!api.on) return null;
      t = t == null ? now() : t;
      let s = 1, glow = 0, dy = 0, sq = 0;
      if (it.band !== 'far' && it.band !== 'ground') {
        const f = Math.min(1, 0.25 / Math.max(0.25, it.w));   // 큰 것은 덜 움직인다 (나무처럼 화면을 덮는 것이 박마다 뛰면 피곤하다)
        if (S.bounce) { const c = curve((t - S.bounce.t0 - (i % 12) * S.bounce.stagger) / S.bounce.dur); s += S.bounce.amp * c * f; dy = -S.bounce.hop * c * f; }
        sq = val(S.squash, t, bump) * f;
      }
      if (S.glow && it.band === 'far') { const u = (t - S.glow.t0 - (i % 8) * S.glow.stagger) / S.glow.dur; if (u > 0 && u < 1) glow = S.glow.amp * Math.sin(u * Math.PI); }
      const p = S.item && S.item[it.id];                               // 그 개체만의 몸짓 (itemPunch)
      if (p) { const u = (t - p.t0) / p.dur; if (u >= 1) delete S.item[it.id]; else { const c = curve(u); s += p.amp * c; dy -= p.hop * c; } }
      return s !== 1 || glow || dy || sq ? { s: s, sq: sq, glow: glow, dy: dy } : null;
    },
    active: active, curve: curve, hold: HOLD, flashPolicy: FLASH, accPolicy: ACC, kickPolicy: KICK,
  };
  M.impact = api;
})();
