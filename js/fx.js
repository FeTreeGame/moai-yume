// 비주얼 효과 — 이름 붙인 효과 표 (그릇: 이름은 연출 연결표 js/fx-rules.js가 부르고, 모양은 여기 BURSTS에서만 바꾼다). 명세 docs/index/fx.md
//   월드 층 파티클: M.fx.burst(이름, x, y, { z, n, color }) — x·y = 캔버스 비, z = 심도 (기본 9 = 맨 앞). sprite.js가 다른 층과 심도 순으로 그림
//     dust(먼지) · sparkle(반짝이) · debris(파편) · ring(퍼지는 고리) · confetti(색종이)
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
    sparkle:  function(o) { return many(o.n || 12, function() { const a = rnd(0, Math.PI * 2), s = rnd(0.05, 0.22); return { vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.05, life: rnd(0.4, 0.8), size: rnd(0.008, 0.016), color: o.color || '#fff6b0', shape: 'star', spin: rnd(-6, 6) }; }); },
    debris:   function(o) { return many(o.n || 8, function() { const a = rnd(0, Math.PI * 2), s = rnd(0.1, 0.35); return { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.1, g: 0.9, life: rnd(0.5, 0.8), size: rnd(0.006, 0.012), color: o.color || '#e8e2d0', shape: 'rect', spin: rnd(-10, 10) }; }); },
    ring:     function(o) { return [{ vx: 0, vy: 0, g: 0, life: 0.35, size: o.size || 0.06, color: o.color || '#ffffff', shape: 'ring' }]; },
    confetti: function(o) { const C = ['#ff5e7a', '#ffd23f', '#3ee0a8', '#5ab0ff', '#c58bff']; return many(o.n || 36, function() { return { vx: rnd(-0.35, 0.35), vy: rnd(-0.6, -0.2), g: 0.7, life: rnd(1.0, 1.6), size: rnd(0.008, 0.014), color: C[Math.floor(rnd(0, C.length))], shape: 'rect', spin: rnd(-12, 12) }; }); },
  };
  function many(n, f) { const out = []; for (let i = 0; i < n; i++) out.push(f()); return out; }

  function burst(name, x, y, o) {
    o = o || {};
    const f = BURSTS[name];
    if (!f) return;
    const t = now();
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

  // ── 화면 플래시 ──
  let flashEl = null;
  function flash(color, strength, ms) {
    const box = document.querySelector && document.querySelector('.sprite-box');
    if (!box) return;
    if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;opacity:0'; box.appendChild(flashEl); }
    flashEl.style.background = color;
    if (flashEl.animate) flashEl.animate([{ opacity: strength || 0.3 }, { opacity: 0 }], { duration: ms || 300, easing: 'ease-out' });
  }
  // ── DOM 강조 ──
  const EL_FX = {
    glow: [[{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], 160],
    dim:  [[{ filter: 'brightness(0.6)' }, { filter: 'brightness(1)' }], 160],
    pop:  [[{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 260],
  };
  function pulseEl(el, kind) { const f = EL_FX[kind]; if (el && el.animate && f) el.animate(f[0], { duration: f[1], easing: 'ease-out' }); }

  M.fxLayers = layers;
  M.fx = { burst: burst, flash: flash, pulseEl: pulseEl, table: BURSTS, count: function() { return parts.length; } };
})();
