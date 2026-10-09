// 비주얼 효과 — 이름 붙인 효과 표 (그릇: 이름은 연출 연결표 js/fx-rules.js가 부르고, 모양은 여기 BURSTS에서만 바꾼다). 명세 docs/index/fx.md
//   월드 층 파티클: M.fx.burst(이름, x, y, { z, n, color }) — x·y = 캔버스 비, z = 심도 (기본 9 = 맨 앞). sprite.js가 다른 층과 심도 순으로 그림
//     dust(먼지) · sparkle(반짝이) · debris(파편) · ring(퍼지는 고리) · confetti(색종이)
//   화면 층 파티클: 같은 burst에 { screen: true } — 화면 요소(게이지)보다 앞, 카메라와 무관
//   화면 플래시: M.fx.flash(색, 세기, ms) — 캔버스 위 반투명 덮개 (화면 층)
//   DOM 강조: M.fx.pulseEl(요소, 'glow' | 'dim' | 'pop') — Web Animations (없는 환경에선 생략)
//   이후 에셋으로 바꿀 자리: 같은 이름에 그림 그리기 함수를 넣으면 됨
(function() {
  const M = window.Moai;
  const parts = [];
  function now() { return performance.now() / 1000; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function redraw() { if (M.spriteRedraw) M.spriteRedraw(); }
  function tick() { const t = now(); for (let i = parts.length - 1; i >= 0; i--) if (t - parts[i].t0 >= parts[i].life) parts.splice(i, 1); redraw(); return parts.length > 0; }
  function wake() { if (M.frame) M.frame.add(tick); }

  // ── 효과 표 (이름 → 파티클 만들기) — 바꿀 곳은 여기 ──
  //   파티클 = { x, y, vx, vy (캔버스 비/초), g (중력), life (초), size (캔버스 높이 비), color, shape: 'dot'|'star'|'rect'|'ring', spin }
  const BURSTS = {
    dust:     function(o) { return many(o.n || 10, function() { return { vx: rnd(-0.12, 0.12), vy: rnd(-0.12, -0.02), g: 0.15, life: rnd(0.4, 0.7), size: rnd(0.008, 0.016), color: o.color || 'rgba(200,180,140,0.8)', shape: 'dot' }; }); },
    sparkle:  function(o) { return many(o.n || 12, function() { const a = rnd(0, Math.PI * 2), s = rnd(0.05, 0.22) * (o.speed || 1); return { vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.05, life: rnd(0.4, 0.8), size: rnd(0.008, 0.016), color: o.color || '#fff6b0', shape: 'star', spin: rnd(-6, 6) }; }); },
    debris:   function(o) { return many(o.n || 8, function() { const a = rnd(0, Math.PI * 2), s = rnd(0.1, 0.35); return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.1, g: 0.9, life: rnd(0.5, 0.8), size: rnd(0.006, 0.012), color: o.color || '#e8e2d0', shape: 'rect', spin: rnd(-10, 10) }; }); },
    // 모이는 점: 가운데(o.cx · o.cy)에서 떨어진 자리에 생겨 안쪽으로 들어오며 사라진다 (홀드를 누르는 동안 — 모으고 있다는 것)
    gather:   function(o) { return many(o.n || 3, function() { const a = rnd(0, Math.PI * 2), r = rnd(0.16, 0.24), life = rnd(0.28, 0.4); return { x: o.cx + Math.cos(a) * r / (M.CANVAS_ASPECT || 4 / 3), y: o.cy + Math.sin(a) * r, vx: -Math.cos(a) * r / (M.CANVAS_ASPECT || 4 / 3) / life * 0.85, vy: -Math.sin(a) * r / life * 0.85, g: 0, life: life, size: rnd(0.005, 0.009), color: o.color || 'rgba(255,255,255,0.9)', shape: 'dot' }; }); },
    // 충격 고리: 가운데에서 o.size(캔버스 높이 비)까지 퍼지며 가늘어진다 — o.life초 동안 (부르는 쪽이 킥 간격으로 정한다: 다음 킥에 끝에 닿는다). flat < 1 = 눕힌 고리. o.from = 시작 반지름 (캔버스 높이 비 — 0이면 가운데의 한 점에서)
    shock:    function(o) { return [{ vx: 0, vy: 0, g: 0, life: o.life || 0.3, size: o.size || 0.9, color: o.color || '#ffffff', shape: 'shock', width: o.width || 0.012, flat: o.flat || 1, alpha: o.alpha || 1, from: o.from || 0 }]; },
    // 빛살: 가운데에서 방사형으로 터지는 세모 조각들 (오려 붙인 종이처럼 — 색 면, 흰 조각이 섞인다). o.turn = 몇 칸 돌려 놓나 (킥마다 한 칸)
    rays:     function(o) { const n = o.n || 10, out = []; for (let i = 0; i < n; i++) out.push({ vx: 0, vy: 0, g: 0, life: (o.life || 0.16) * rnd(0.8, 1), size: (o.size || 0.5) * rnd(0.7, 1), color: i % 3 === 0 ? '#ffffff' : (o.color || '#ffd700'), shape: 'ray', ang: (i + (o.turn || 0) * 0.5 + rnd(-0.12, 0.12)) / n * Math.PI * 2, wid: rnd(0.035, 0.07), alpha: o.alpha || 0.85 }); return out; },
    // 하트 조각: 위로 솟았다 떨어진다 (이 게임의 말 — 가이드 · 기회 · 맥박이 모두 하트)
    hearts:   function(o) { return many(o.n || 6, function() { const a = rnd(-Math.PI * 0.92, -Math.PI * 0.08), s = rnd(0.28, 0.6) * (o.speed || 1); return { vx: Math.cos(a) * s * 0.75, vy: Math.sin(a) * s, g: 1.1, life: rnd(0.45, 0.75), size: rnd(0.022, 0.042) * (o.scale || 1), color: Math.random() < 0.25 ? '#ffffff' : (o.color || '#ff5e8a'), shape: 'heart', spin: rnd(-2.5, 2.5) }; }); },
    ring:     function(o) { return [{ vx: 0, vy: 0, g: 0, life: 0.35, size: o.size || 0.06, color: o.color || '#ffffff', shape: 'ring' }]; },
    confetti: function(o) { const C = ['#ff5e7a', '#ffd23f', '#3ee0a8', '#5ab0ff', '#c58bff']; return many(o.n || 36, function() { return { vx: rnd(-0.35, 0.35), vy: rnd(-0.6, -0.2), g: 0.7, life: rnd(1.0, 1.6), size: rnd(0.008, 0.014), color: C[Math.floor(rnd(0, C.length))], shape: 'rect', spin: rnd(-12, 12) }; }); },
  };
  function many(n, f) { const out = []; for (let i = 0; i < n; i++) out.push(f()); return out; }

  function burst(name, x, y, o) {
    o = o || {};
    const f = BURSTS[name];
    if (!f) return;
    const t = now();
    if (o.screen) { f(o).forEach(function(p) { sparts.push(Object.assign({ x: x, y: y, t0: t }, p)); }); wakeScreen(); return; }   // 화면 층 (아래)
    f(o).forEach(function(p) { parts.push(Object.assign({ x: x, y: y, t0: t, z: o.z != null ? o.z : 9 }, p)); });
    wake();
  }
  function drawPart(ctx, p, W, H, t) {
    const a = (t - p.t0), k = 1 - a / p.life;
    if (k <= 0) return;
    const x = (p.x + p.vx * a) * W, y = (p.y + p.vy * a + 0.5 * p.g * a * a) * H, s = p.size * H;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, k * 1.5);
    ctx.translate(x, y);
    if (p.spin) ctx.rotate(p.spin * a);
    if (p.shape === 'ring') {
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, s * 0.15 * k);
      ctx.beginPath(); ctx.arc(0, 0, s * (0.4 + 1.6 * (1 - k)), 0, Math.PI * 2); ctx.stroke();
    } else if (p.shape === 'shock') {
      ctx.globalAlpha *= p.alpha;
      if (p.flat !== 1) ctx.scale(1, p.flat);
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, p.width * H * (0.25 + 0.75 * k));
      const r0 = Math.min(s, (p.from || 0) * H);   // 시작 반지름 (from — 캔버스 높이 비): 가운데의 한 점이 아니라 그만큼 떨어진 둘레에서 나타나 퍼진다
      ctx.beginPath(); ctx.arc(0, 0, r0 + (s - r0) * (1 - k * k), 0, Math.PI * 2); ctx.stroke();      // 처음에 빠르고 끝에서 느려지며 닿는다
    } else if (p.shape === 'ray') {
      ctx.globalAlpha *= p.alpha; ctx.rotate(p.ang);
      const r0 = s * 0.2, L = s * (0.45 + 0.55 * (1 - k * k));
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(r0, -r0 * p.wid * 0.5); ctx.lineTo(L, -L * p.wid); ctx.lineTo(L, L * p.wid); ctx.lineTo(r0, r0 * p.wid * 0.5); ctx.closePath(); ctx.fill();
    } else if (p.shape === 'heart') {
      const h = s * 0.5;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, h * 0.9);
      ctx.bezierCurveTo(-h * 1.5, -h * 0.1, -h * 0.75, -h * 1.15, 0, -h * 0.4); ctx.bezierCurveTo(h * 0.75, -h * 1.15, h * 1.5, -h * 0.1, 0, h * 0.9); ctx.fill();
    } else if (p.shape === 'star') {
      ctx.fillStyle = p.color; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.35 : s, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); ctx.fill();
    } else if (p.shape === 'rect') {
      ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
    } else {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // 그릴 층 — 심도별로 묶어서
  function layers() {
    if (!parts.length) return [];
    const byZ = {}, t = now();
    parts.forEach(function(p) { (byZ[p.z] = byZ[p.z] || []).push(p); });
    return Object.keys(byZ).map(function(z) {
      return { id: 'fx', z: +z, draw: function(ctx, W, H) { byZ[z].forEach(function(p) { drawPart(ctx, p, W, H, t); }); } };
    });
  }

  // ── 화면 층 파티클: burst(이름, x, y, { screen: true }) — 캔버스 위의 화면 요소(게이지 등)보다 앞에, 카메라와 무관하게 (x · y = 화면의 캔버스 비) ──
  //   월드 층(위)은 게임 그림과 같은 캔버스라 화면 요소 밑에 깔리고 카메라를 탄다 — 화면 요소의 자리에서 터지는 것은 여기로
  //   덮개 캔버스는 처음 쓸 때 만든다 (그때의 맨 뒤 자식 = 게이지 · HUD보다 앞). 파티클이 있는 동안만 자기 프레임을 돈다
  const sparts = []; let scv = null, sraf = null;
  function drawScreen() {
    sraf = null;
    const t = now(); for (let i = sparts.length - 1; i >= 0; i--) if (t - sparts[i].t0 >= sparts[i].life) sparts.splice(i, 1);
    const dpr = window.devicePixelRatio || 1, W = scv.clientWidth, H = scv.clientHeight, pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (scv.width !== pw || scv.height !== ph) { scv.width = pw; scv.height = ph; }
    const ctx = scv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    sparts.forEach(function(p) { drawPart(ctx, p, W, H, t); });
    if (sparts.length) sraf = requestAnimationFrame(drawScreen);
  }
  function wakeScreen() {
    const box = document.querySelector && document.querySelector('.sprite-box');
    if (!box || typeof requestAnimationFrame !== 'function') return;
    if (!scv) { scv = document.createElement('canvas'); scv.className = 'fx-screen'; scv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; box.appendChild(scv); }
    if (!sraf) sraf = requestAnimationFrame(drawScreen);
  }

  // ── 화면 플래시 ──
  let flashEl = null;
  function flash(color, strength, ms) {
    const box = document.querySelector && document.querySelector('.sprite-box');
    if (!box) return;
    if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;opacity:0'; box.appendChild(flashEl); }
    flashEl.style.background = color;
    if (flashEl.animate) flashEl.animate([{ opacity: strength || 0.3 }, { opacity: 0 }], { duration: ms || 300, easing: 'ease-out' });
  }
  // ── 가장자리 깜빡임: 가운데는 그대로, 가장자리로 갈수록 color — 피격처럼 (M.fx.edge(색, 세기, ms)) ──
  let edgeEl = null;
  function edge(color, strength, ms) {
    const box = document.querySelector && document.querySelector('.sprite-box');
    if (!box) return;
    if (!edgeEl) { edgeEl = document.createElement('div'); edgeEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;opacity:0'; box.appendChild(edgeEl); }
    edgeEl.style.background = 'radial-gradient(ellipse at center, transparent 45%, ' + color + ' 115%)';
    if (edgeEl.animate) edgeEl.animate([{ opacity: strength || 0.8 }, { opacity: 0 }], { duration: ms || 380, easing: 'ease-out' });
  }
  // ── DOM 강조 ──
  const EL_FX = {
    glow: [[{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], 160],
    dim:  [[{ filter: 'brightness(0.6)' }, { filter: 'brightness(1)' }], 160],
    pop:  [[{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 260],
  };
  function pulseEl(el, kind) { const f = EL_FX[kind]; if (el && el.animate && f) el.animate(f[0], { duration: f[1], easing: 'ease-out' }); }

  M.fxLayers = layers;
  M.fx = { burst: burst, flash: flash, edge: edge, pulseEl: pulseEl, table: BURSTS, count: function() { return parts.length; }, screenCount: function() { return sparts.length; } };
})();
