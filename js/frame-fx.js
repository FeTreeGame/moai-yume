// 테두리 이펙트 — 캔버스 안쪽 가장자리를 따라 도는 층 (화면 층: 카메라와 무관). 무엇을 언제 어떤 색으로 할지(정책)는 연출 연결표 js/fx-rules.js FRAME
//   가장자리 번쩍임(js/fx.js M.fx.edge — 방사형으로 밝아졌다 사라진다)과는 따로다: 여기는 '선'이고, 바뀌는 것이 밝기가 아니라 두께와 자리다
//     → 큰 면적의 밝기 변화가 아니다 (번쩍임 한도 밖). 대신 두께의 상한을 여기서 묶는다 (CAP — 캔버스 짧은 변의 비)
//   모양:
//     띠 (band)       네 변을 따라 도는 색 띠 — tone(o) = { color, w (두께 — 짧은 변의 비), a (불투명도), dur (넘어가는 초) } / kick(o) = { amp, dur } 두께가 한 번 숨 쉰다
//     모서리 (corners) 네 귀퉁이의 꺾쇠 — corners(o) = { color, a } / pinch(o) = { amp, dur, wind } 안쪽으로 조였다 풀린다 (wind = 끝까지 조였다가 한 번에 풀림 — 내 차례 직전)
//     흐름 (run)      띠 위를 한 바퀴 도는 밝은 점 — run(o) = { dur (한 바퀴 — 초), color } / run(null) 멈춤. 턴이 얼마나 남았는지가 테두리로 보인다
//     물결 (ripple)   한 변의 한 점에서 양쪽으로 퍼지는 굵어짐 — ripple(o) = { side ('bottom' | 'top'), at (그 변의 어디 — 0~1), color, amp, dur }
//   시계 = 벽시계 (performance.now). 움직이는 동안만 자기 프레임을 돈다. on = false면 걷힌다
(function() {
  const M = window.Moai;
  const box = document.querySelector && document.querySelector('.sprite-box');
  if (!box) return;
  const cv = document.createElement('canvas'); cv.className = 'frame-fx';
  const after = box.querySelector('.enc-bars') || (M.atmo && M.atmo.el) || box.querySelector('.sprite-canvas');
  if (after && after.parentNode === box && after.nextSibling) box.insertBefore(cv, after.nextSibling); else box.appendChild(cv);   // 루프 막대 바로 위 — 게이지 · HUD보다 아래 (예전: 분위기 층 바로 위 = 막대보다 아래. 띠가 진행 마커에 덮였다)
  const ctx = cv.getContext('2d');
  const now = function() { return performance.now() / 1000; };
  const CAP = 0.025;                     // 두께의 상한 (짧은 변의 비) — 선이 면이 되지 않게
  const SHAPE = { corner: { len: 0.085, inset: 0.022, width: 0.006 }, run: { tail: 0.1, dots: 14, size: 0.008 }, ripple: { half: 0.09 } };

  function rgb(c) { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [255, 255, 255]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function css(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function bump(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); }
  function out(u) { u = Math.max(0, Math.min(1, u)); return 1 - (1 - u) * (1 - u); }

  const band = { from: { c: [255, 255, 255], w: 0, a: 0 }, to: { c: [255, 255, 255], w: 0, a: 0 }, t0: 0, dur: 0 };
  let kick = null, pinch = null, run = null, corner = { c: [255, 255, 255], a: 0 }, ripples = [];
  function bandNow(t) {
    const k = band.dur > 0 ? Math.max(0, Math.min(1, (t - band.t0) / band.dur)) : 1;
    return { c: mix(band.from.c, band.to.c, k), w: band.from.w + (band.to.w - band.from.w) * k, a: band.from.a + (band.to.a - band.from.a) * k, moving: k < 1 };
  }
  let raf = null;
  function loop() { raf = null; if (draw()) raf = requestAnimationFrame(loop); }
  function wake() { if (!raf && api.on) raf = requestAnimationFrame(loop); }

  function draw() {
    const t = now(), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!api.on || !W) return false;
    const m = Math.min(W, H), b = bandNow(t);
    let busy = b.moving;
    // 띠
    if (kick && t - kick.t0 >= kick.dur) kick = null;
    const tw = Math.min(CAP, b.w + (kick ? kick.amp * bump((t - kick.t0) / kick.dur) : 0)) * m;
    if (kick) busy = true;
    if (tw > 0.2 && b.a > 0.01) { ctx.strokeStyle = css(b.c, b.a); ctx.lineWidth = tw; ctx.strokeRect(tw / 2, tw / 2, W - tw, H - tw); }
    // 물결
    ripples = ripples.filter(function(r) { return t - r.t0 < r.dur; });
    ripples.forEach(function(r) {
      const u = (t - r.t0) / r.dur, th = Math.min(CAP, r.amp * (1 - u)) * m, half = SHAPE.ripple.half * W * (0.6 + u), head = out(u) * W * Math.max(r.at, 1 - r.at);
      const y = r.side === 'top' ? th / 2 : H - th / 2;
      ctx.strokeStyle = css(r.c, 0.95 * (1 - u * u)); ctx.lineWidth = th; ctx.lineCap = 'round';
      [-1, 1].forEach(function(s) { const x = r.at * W + s * head; ctx.beginPath(); ctx.moveTo(Math.max(0, Math.min(W, x - half)), y); ctx.lineTo(Math.max(0, Math.min(W, x + half)), y); ctx.stroke(); });
      busy = true;
    });
    // 모서리
    if (pinch && t - pinch.t0 >= pinch.dur) pinch = null;
    if (corner.a > 0.01) {
      const u = pinch ? (t - pinch.t0) / pinch.dur : 0, pv = pinch ? pinch.amp * (pinch.wind ? u * u : bump(u)) : 0;
      const C = SHAPE.corner, d = (C.inset + pv) * m, len = C.len * m * (1 + pv * 8);
      ctx.strokeStyle = css(corner.c, corner.a); ctx.lineWidth = C.width * m * (1 + pv * 20); ctx.lineCap = 'square';
      [[d, d, 1, 1], [W - d, d, -1, 1], [W - d, H - d, -1, -1], [d, H - d, 1, -1]].forEach(function(q) {
        ctx.beginPath(); ctx.moveTo(q[0] + q[2] * len, q[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + q[3] * len); ctx.stroke();
      });
      if (pinch) busy = true;
    }
    // 흐름
    if (run && t - run.t0 >= run.dur) run = null;
    if (run) {
      const R = SHAPE.run, per = 2 * (W + H), inset = Math.max(tw / 2, 0.006 * m);
      const at = function(p) {           // 둘레 위의 거리 p → 자리 (위 변의 가운데에서 시계 방향)
        p = ((p + W / 2) % per + per) % per;
        if (p < W) return [p, inset]; if (p < W + H) return [W - inset, p - W]; if (p < 2 * W + H) return [W - (p - W - H), H - inset]; return [inset, H - (p - 2 * W - H)];
      };
      const head = (t - run.t0) / run.dur * per;
      for (let i = R.dots; i >= 0; i--) { const q = at(head - i / R.dots * R.tail * per), k = 1 - i / (R.dots + 1); ctx.fillStyle = css(run.c, 0.9 * k * k); ctx.beginPath(); ctx.arc(q[0], q[1], R.size * m * (0.5 + 0.5 * k), 0, Math.PI * 2); ctx.fill(); }
      busy = true;
    }
    return busy;
  }

  const api = {
    on: true, cap: CAP, shape: SHAPE,
    tone: function(o) {
      if (!api.on) return;
      const t = now(), cur = bandNow(t);
      band.from = { c: cur.c, w: cur.w, a: cur.a }; band.to = { c: o.color ? rgb(o.color) : cur.c, w: o.w || 0, a: o.a || 0 }; band.t0 = t; band.dur = o.dur == null ? 0.4 : o.dur; wake();
    },
    kick: function(o) { if (!api.on) return; kick = { t0: now(), amp: o.amp || 0.004, dur: o.dur || 0.2 }; wake(); },
    corners: function(o) { corner = { c: rgb(o.color), a: o.a || 0 }; wake(); },
    pinch: function(o) { if (!api.on) return; pinch = { t0: now(), amp: o.amp || 0.01, dur: o.dur || 0.2, wind: !!o.wind }; wake(); },
    run: function(o) { run = o && api.on ? { t0: now(), dur: Math.max(0.2, o.dur || 2), c: rgb(o.color) } : null; wake(); },
    ripple: function(o) { if (!api.on) return; ripples.push({ t0: now(), side: o.side || 'bottom', at: o.at == null ? 0.5 : o.at, c: rgb(o.color), amp: o.amp || 0.012, dur: o.dur || 0.35 }); if (ripples.length > 8) ripples.shift(); wake(); },
    set: function(on) { api.on = !!on; cv.style.display = on ? '' : 'none'; if (on) wake(); else draw(); },
    draw: draw,
    state: function() { const b = bandNow(now()); return { band: { w: b.w, a: b.a }, run: !!run, pinch: !!pinch, ripples: ripples.length, corner: corner.a }; },
    el: cv,
  };
  M.frameFx = api;
})();
