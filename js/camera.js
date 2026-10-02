// 카메라 — 필드 캔버스(#spriteCanvas)의 월드 층에 거는 변환 하나 + 연출자(샷 요청) + 떼어 낼 수 있는 연출 기여자
//   명세 docs/index/camera.md · 조사 docs/CAMERA-RESEARCH.md "index 캔버스 카메라"
//   방향 (2026-10-02): 바탕은 제대로, 연출은 모듈로 얹은 뒤 실제로 쓸 것만 남기고 덜어 낸다 (탑다운 — 시험 패널 ?camera)
//
//   바탕 (덜어 내지 않음)
//     자세 pose = { x, y (초점 — 캔버스 비, 기본 가운데 0.5·0.5), zoom (1 = 그대로), rot (라디안) } — 기본 샷 = 변환 없음 (켜 둬도 화면 그대로)
//     apply(ctx, W, H, layer) = 월드 층을 그리기 전 변환 (sprite.js drawFrame — 배경·z순 층). 화면 층(가이드 막대·게이지·HUD·터치 이펙트·높이 표시)은 걸지 않음
//     toWorld(clientX, clientY) = 화면 → 월드 (캔버스 비) 역변환 — 줌해도 보이는 곳 = 눌리는 곳 (field-actors.js 뗀 자리 · facing.js 포인터)
//     경계: 초점을 필드 안으로 제한 (줌 ≥ 1에서 4:3 필드 밖이 보이지 않게 — CAM.clamp)
//     연출자: 샷 요청 스택 — request(shot) → id / release(id). 우선순위가 높은(같으면 나중) 샷이 이김, 다 풀리면 기본 샷
//       shot = { target, zoom, rot, dur(초 — 0 = 컷), ease, priority, at(시작 — 오디오 시계, 선택: Conductor 시각으로 박에 맞춤),
//                offset { x, y } (대상 가운데에서 초점을 비킴 — 캔버스 비, 선택), fit (투샷 — false면 자동 맞춤 없이 zoom 그대로),
//                maxZoom (이 샷의 배율 상한 — 없으면 CAM.maxZoom. 예: 미니 모아이는 작게 그려져 원본 해상도 여유가 커서 더 높게) }
//       target = 점 {x, y} · 'moai' · 필드 인스턴스(액터) · 함수 → {x, y} · [대상, 대상] (투샷 — 둘 다 들어오는 배율로, zoom은 상한)
//       대상이 움직이면 따라감 (전환 뒤에도 매 프레임 그 대상)
//     시계: 오디오 시계(G.actx — 박과 같은 축), 없으면 벽시계. 움직이는 동안만 프레임 루프(frame.js)에 붙어 다시 그림
//
//   연출 기여자 (MODS — 각각 떼어 낼 수 있음: 항목과 그 정책 값만 지우면 됨)
//     shake  흔들림 — 충격량(trauma) 누적, 흔들림 = 충격량², 시간에 따라 줄어듦 (GDC 2016 Eiserloh). 가장자리가 보이지 않게 그만큼 살짝 확대
//     pulse  박 펄스 — 배율을 잠깐 올렸다 이징으로 복귀 (at = 박 시각)
//     tilt   기울임 — 몇 도 기울였다 되돌림 (이징)
//     parallax 패럴랙스 — 층마다 따라가는 비율 (배경 = CAM.mods.parallax.back, 그 밖 1)
//     letterbox · vignette — 화면 층 오버레이 (캔버스 상자 위 DOM — 카메라 변환과 무관)
//   M.camera = { apply, toWorld, request, release, clear, pose, view, identity, at, mods..., policy }
(function() {
  const M = window.Moai;

  const CAM = {
    minZoom: 1, maxZoom: 2,              // 배율 범위 — 1 = 처음 상태(확대만 됨). 기본 상한 2: 배경(field/back.png 1920px)이 캔버스 폭 대비 약 1.9배부터 원본을 넘음
                                         //   샷마다 maxZoom으로 따로 (미니 모아이 — idle.png 폭 1080px를 캔버스 폭의 12%로 그려 약 8배까지 원본 안)
    clamp: true,                         // 초점을 필드 안으로 (보이는 영역 기준 — 아래 insets)
    insets: { top: 0, bottom: 0 },       // 안전 영역: 위아래 가려지는 띠 (화면 비) — 샷의 틀·경계 제한은 그 안쪽 기준, 띠 뒤는 필드 밖이 보여도 됨 (레터박스가 켬)
    box: 'hit',                          // 모아이류(메인·미니) 대상 상자: 'hit' = 판정 사각형(머리~어깨, layout.js MOAI_HIT) / 'drawn' = 그린 상자 전체
    release: { dur: 0.6, ease: 'inOut' },   // 샷이 다 풀릴 때 기본 샷으로 돌아오는 전환
    zoomInterp: 'log',                   // 전환 중 배율 섞기: 'log' = 로그 척도 (확대는 비율로 느껴져 속도가 눈에 고르게) / 'linear'
    twoShot: { margin: 0.06 },           // 투샷: 두 대상 둘레 여백 (캔버스 비)
    mods: {
      shake: { on: true, offset: 0.025, rot: 0.03, decay: 1.2, freq: 22, pad: 0.06 },   // 최대 이동(캔버스 비)·회전(라디안), 초당 감소, 흔들림 빈도, 가장자리 숨김 확대
      pulse: { on: true, amp: 0.03, dur: 0.25 },
      tilt: { on: true, dur: 0.4 },
      parallax: { on: false, back: 0.6 },
      letterbox: { on: true, size: 0.07, dur: 0.4, inset: true },   // 위아래 띠 높이 (상자 높이 비) — inset이면 켜는 동안 안전 영역(insets)이 됨 (아래 띠에 루프 막대)
      vignette: { on: true, strength: 0.55, dur: 0.4 },
    },
  };
  const EASE = {
    linear: function(t) { return t; },
    in: function(t) { return t * t; },
    out: function(t) { return 1 - (1 - t) * (1 - t); },
    inOut: function(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  };
  function ease(name, t) { return (EASE[name] || EASE.inOut)(Math.max(0, Math.min(1, t))); }
  function clock() { const G = window.G; return G && G.actx ? G.actx.currentTime : performance.now() / 1000; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  const HOME = { x: 0.5, y: 0.5, zoom: 1, rot: 0 };
  function copy(p) { return { x: p.x, y: p.y, zoom: p.zoom, rot: p.rot }; }

  // ── 대상 → 초점 (캔버스 비) ──
  const CA = function() { return M.CANVAS_ASPECT || 4 / 3; };
  function centerOfPlaced(p, aspect, dy, hitQuad) {   // 배치 상자 (layout.js placedRect — 폭 = 캔버스 비율 단위). hitQuad면 판정 사각형의 범위
    const r = M.placedRect(p, aspect || 1, CA(), 1, dy);
    if (hitQuad && CAM.box === 'hit' && M.quadOn) {
      const q = M.quadOn(r, hitQuad, p.flip), xs = q.map(function(v) { return v[0] / CA(); }), ys = q.map(function(v) { return v[1]; });
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    }
    return { x: r.cx / CA(), y: r.cy, w: r.dw / CA(), h: r.dh };
  }
  function boxOf(t) {
    if (!t) return null;
    if (typeof t === 'function') return boxOf(t());
    if (t === 'moai') return M.LAYOUT && M.placedRect ? centerOfPlaced(M.LAYOUT.moai, M.LAYOUT_ASPECT && M.LAYOUT_ASPECT.moai, M.moaiDy ? M.moaiDy() : 0, M.MOAI_HIT) : null;
    if (t.p && t.k) {                    // 필드 인스턴스 (모아이 판정을 쓰는 종류 = 미니 모아이는 판정 사각형)
      const asp = M.fieldActors && M.fieldActors.aspect ? M.fieldActors.aspect(t) : t.k.aspect;
      return M.placedRect ? centerOfPlaced(t.p, asp, 0, t.k.hit === 'moai' ? M.MOAI_HIT : null) : null;
    }
    if (typeof t.x === 'number') return { x: t.x, y: t.y, w: 0, h: 0 };
    return null;
  }
  // 대상 도우미: 'moai' · 미니 모아이(계열)
  const at = {
    moai: function() { return 'moai'; },
    mini: function(stage) {
      return function() {
        const list = M.fieldActors ? M.fieldActors.list() : [];
        return list.filter(function(a) { return a.kind === 'mini' && (stage == null || a.stage === stage); })[0] || null;
      };
    },
  };
  // 보이는 영역 (화면 비): 위아래 안전 영역 띠를 뺀 가운데 — 그 가운데가 틀의 중심
  function visible() { const I = CAM.insets; return { top: I.top || 0, bottom: I.bottom || 0, h: 1 - (I.top || 0) - (I.bottom || 0), cy: ((I.top || 0) + 1 - (I.bottom || 0)) / 2 }; }
  function clampPose(p) {
    if (!CAM.clamp) return p;
    const z = Math.max(1, p.zoom), V = visible();
    const half = 0.5 / z;
    p.x = Math.max(half, Math.min(1 - half, p.x));
    const lo = (0.5 - V.top) / z, hi = 1 - (0.5 - V.bottom) / z;   // 보이는 영역이 필드 안 (띠 뒤는 밖이어도 됨)
    p.y = lo <= hi ? Math.max(lo, Math.min(hi, p.y)) : 0.5;
    return p;
  }
  function goalOf(s) {
    if (!s) return copy(HOME);
    let zoom = s.zoom != null ? s.zoom : 1.3, x = HOME.x, y = HOME.y;
    if (Array.isArray(s.target)) {        // 투샷: 두 대상 상자를 다 담는 배율 (zoom은 상한 — fit false면 zoom 그대로)
      const bs = s.target.map(boxOf).filter(Boolean);
      if (bs.length) {
        const x0 = Math.min.apply(null, bs.map(function(b) { return b.x - b.w / 2; })), x1 = Math.max.apply(null, bs.map(function(b) { return b.x + b.w / 2; }));
        const y0 = Math.min.apply(null, bs.map(function(b) { return b.y - b.h / 2; })), y1 = Math.max.apply(null, bs.map(function(b) { return b.y + b.h / 2; }));
        x = (x0 + x1) / 2; y = (y0 + y1) / 2;
        const m = CAM.twoShot.margin, V = visible();
        if (s.fit !== false) zoom = Math.min(zoom, 1 / Math.max(x1 - x0 + 2 * m, 1e-6), V.h / Math.max(y1 - y0 + 2 * m, 1e-6));
      }
    } else {
      const b = boxOf(s.target);
      if (b) { x = b.x; y = b.y; }
    }
    zoom = Math.max(CAM.minZoom, Math.min(s.maxZoom || CAM.maxZoom, zoom));
    if (s.offset) { x += s.offset.x || 0; y += s.offset.y || 0; }   // 초점 비킴 (조정 값)
    y -= (visible().cy - 0.5) / zoom;    // 대상이 보이는 영역의 가운데에 오게 (위아래 띠가 다르면)
    return clampPose({ x: x, y: y, zoom: zoom, rot: s.rot || 0 });
  }

  // ── 연출자: 샷 요청 스택 ──
  let shots = [], seq = 0;
  let pose = copy(HOME);                 // 지금 자세 (기여자 더하기 전)
  let tween = null;                      // { from, shot, t0, dur, ease }
  function top() {
    let best = null;
    shots.forEach(function(s) { if (!best || s.priority > best.priority || (s.priority === best.priority && s.id > best.id)) best = s; });
    return best;
  }
  function retarget(atTime, dur, easeName) {
    const s = top();
    tween = { from: copy(pose), shot: s, t0: atTime != null ? atTime : clock(),
      dur: dur != null ? dur : (s ? s.dur : CAM.release.dur), ease: easeName || (s ? s.ease : CAM.release.ease) };
    wake();
  }
  function request(shot) {
    const s = Object.assign({ zoom: 1.3, rot: 0, dur: 0.6, ease: 'inOut', priority: 0 }, shot, { id: ++seq });
    shots.push(s);
    if (top() === s) retarget(s.at);
    return s.id;
  }
  function release(id, opts) {
    const wasTop = top();
    shots = shots.filter(function(s) { return s.id !== id; });
    if (wasTop && wasTop.id === id) retarget(opts && opts.at, opts && opts.dur, opts && opts.ease);
  }
  function clear(opts) { shots = []; retarget(opts && opts.at, opts && opts.dur, opts && opts.ease); }
  function stepPose(t) {
    if (!tween) return false;
    const goal = goalOf(tween.shot);
    const k = tween.dur > 0 ? ease(tween.ease, (t - tween.t0) / tween.dur) : (t >= tween.t0 ? 1 : 0);
    const zoom = CAM.zoomInterp === 'log' && tween.from.zoom > 0 && goal.zoom > 0
      ? Math.exp(lerp(Math.log(tween.from.zoom), Math.log(goal.zoom), k)) : lerp(tween.from.zoom, goal.zoom, k);
    pose = clampPose({ x: lerp(tween.from.x, goal.x, k), y: lerp(tween.from.y, goal.y, k), zoom: zoom, rot: lerp(tween.from.rot, goal.rot, k) });   // 중간 프레임도 경계 안 (확대·이동이 섞이는 도중 필드 밖이 보이지 않게)
    if (k >= 1 && !tween.shot) { tween = null; pose = copy(HOME); return false; }   // 기본 샷에 도착
    return true;                         // 샷이 있으면 대상을 계속 따라감
  }

  // ── 연출 기여자 (각각 떼어 낼 수 있음) ──
  //   view = { x, y, zoom, rot, ox, oy (화면 이동 — 캔버스 비) } 에 더한다. layer = 'back'(배경) | 그 밖
  const MODS = {};
  MODS.shake = (function() {
    let trauma = 0, last = null;
    return {
      add: function(amount) { trauma = Math.min(1, trauma + (amount == null ? 0.5 : amount)); last = null; wake(); },
      active: function() { return trauma > 0; },
      step: function(t) { if (last != null) trauma = Math.max(0, trauma - CAM.mods.shake.decay * (t - last)); last = t; if (!trauma) last = null; },
      apply: function(v, t) {
        if (!trauma) return;
        const P = CAM.mods.shake, s = trauma * trauma, f = P.freq;
        v.ox += P.offset * s * Math.sin(t * f * 6.283 + 1.3) * Math.cos(t * f * 2.9);
        v.oy += P.offset * s * Math.sin(t * f * 5.1 + 0.4) * Math.cos(t * f * 3.7 + 2.1);
        v.rot += P.rot * s * Math.sin(t * f * 4.3 + 0.9);
        v.zoom *= 1 + P.pad * s;           // 가장자리가 보이지 않게 그만큼 확대
      },
      trauma: function() { return trauma; },
    };
  })();
  MODS.pulse = (function() {
    let p = null;                          // { t0, amp, dur }
    return {
      fire: function(opts) { const P = CAM.mods.pulse; p = { t0: opts && opts.at != null ? opts.at : clock(), amp: opts && opts.amp != null ? opts.amp : P.amp, dur: opts && opts.dur || P.dur }; wake(); },
      active: function(t) { return !!p && t < p.t0 + p.dur; },
      step: function(t) { if (p && t >= p.t0 + p.dur) p = null; },
      apply: function(v, t) { if (!p || t < p.t0) return; v.zoom *= 1 + p.amp * (1 - ease('out', (t - p.t0) / p.dur)); },
    };
  })();
  MODS.tilt = (function() {
    let from = 0, to = 0, t0 = 0, dur = 0;
    function now(t) { return dur > 0 ? lerp(from, to, ease('inOut', (t - t0) / dur)) : to; }
    return {
      set: function(deg, opts) { const t = clock(); from = now(t); to = (deg || 0) * Math.PI / 180; t0 = opts && opts.at != null ? opts.at : t; dur = opts && opts.dur != null ? opts.dur : CAM.mods.tilt.dur; wake(); },
      active: function(t) { return t < t0 + dur; },        // 기울어진 채 멈춰 있으면 다시 그릴 일 없음 (그릴 때마다 view가 값을 읽음)
      step: function() {},
      apply: function(v, t) { v.rot += now(t); },
    };
  })();
  MODS.parallax = {
    active: function() { return false; },
    step: function() {},
    factor: function(layer) { const P = CAM.mods.parallax; return P.on && layer === 'back' ? P.back : 1; },
  };
  // 화면 층 오버레이 (캔버스 상자 위 DOM — 변환과 무관)
  function overlay(cls, styleFn) {
    let el = null;
    function ensure() {
      if (el || typeof document === 'undefined' || !document.createElement) return el;
      const box = document.querySelector ? document.querySelector('.sprite-box') : null;
      if (!box) return null;
      el = document.createElement('div');
      el.className = 'cam-overlay ' + cls;
      const canvas = M.el && M.el.spriteCanvas;   // 필드 캔버스 바로 위 — 가이드 막대·게이지·HUD(화면 층 정보)보다는 아래
      if (canvas && canvas.parentNode === box) box.insertBefore(el, canvas.nextSibling); else box.appendChild(el);
      return el;
    }
    return {
      set: function(on) { const e = ensure(); if (!e) return; styleFn(e); e.classList.toggle('on', !!on); },
      on: function() { return !!(el && el.classList.contains('on')); },
    };
  }
  MODS.letterbox = overlay('cam-letterbox', function(e) { const P = CAM.mods.letterbox; e.style.setProperty('--lb', (P.size * 100) + '%'); e.style.transitionDuration = P.dur + 's'; });
  MODS.vignette = overlay('cam-vignette', function(e) { const P = CAM.mods.vignette; e.style.setProperty('--vg', P.strength); e.style.transitionDuration = P.dur + 's'; });
  const VIEW_MODS = ['shake', 'pulse', 'tilt'];   // 자세에 더하는 기여자 (순서대로)

  // ── 지금 보기 (층별) ──
  function view(layer, t) {
    t = t == null ? clock() : t;
    const v = { x: pose.x, y: pose.y, zoom: pose.zoom, rot: pose.rot, ox: 0, oy: 0 };
    VIEW_MODS.forEach(function(k) { if (CAM.mods[k].on && MODS[k]) MODS[k].apply(v, t); });
    const f = MODS.parallax ? MODS.parallax.factor(layer) : 1;   // 층의 따라가는 비율
    if (f !== 1) {
      v.x = 0.5 + (v.x - 0.5) * f; v.y = 0.5 + (v.y - 0.5) * f;
      v.zoom = 1 + (v.zoom - 1) * f; v.rot *= f; v.ox *= f; v.oy *= f;
    }
    return v;
  }
  function identityView(v) { return v.zoom === 1 && v.rot === 0 && v.ox === 0 && v.oy === 0 && v.x === 0.5 && v.y === 0.5; }
  // 월드 층 변환: 화면 = (월드 − 초점)·배율 → 회전 → + 가운데 + 이동
  function apply(ctx, W, H, layer) {
    const v = view(layer);
    if (identityView(v)) return;
    ctx.translate(W / 2 + v.ox * W, H / 2 + v.oy * H);
    if (v.rot) ctx.rotate(v.rot);
    ctx.scale(v.zoom, v.zoom);
    ctx.translate(-v.x * W, -v.y * H);
  }
  // 화면 → 월드 (캔버스 비): { x, y (월드), sx, sy (화면 — 캔버스 상자 기준), inside (화면 상자 안) }
  function toWorld(clientX, clientY) {
    const c = M.el && M.el.spriteCanvas;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const W = r.width, H = r.height, sx = (clientX - r.left) / W, sy = (clientY - r.top) / H;
    const v = view('world');
    let px = sx * W - W / 2 - v.ox * W, py = sy * H - H / 2 - v.oy * H;
    if (v.rot) { const c0 = Math.cos(-v.rot), s0 = Math.sin(-v.rot); const qx = px * c0 - py * s0; py = px * s0 + py * c0; px = qx; }
    px = px / v.zoom + v.x * W; py = py / v.zoom + v.y * H;
    return { x: px / W, y: py / H, sx: sx, sy: sy, inside: sx >= 0 && sx <= 1 && sy >= 0 && sy <= 1 };
  }

  // ── 프레임: 움직이는 동안만 (자세 전환·대상 추적·기여자) ──
  function busy(t) {
    if (tween) return true;
    return VIEW_MODS.some(function(k) { return CAM.mods[k].on && MODS[k] && MODS[k].active(t); });
  }
  let wasMoving = false;
  function frameTask() {
    const t = clock();
    stepPose(t);
    VIEW_MODS.forEach(function(k) { if (MODS[k]) MODS[k].step(t); });
    const moving = busy(t);
    if (!moving && wasMoving && M.spriteRedraw) M.spriteRedraw();   // 마지막 한 장 (기본 샷으로)
    wasMoving = moving;
    return moving;                       // frame.js가 다시 그림
  }
  function wake() { wasMoving = true; if (M.frame) M.frame.add(frameTask); }

  M.camera = {
    apply: apply, toWorld: toWorld, view: view,
    request: request, release: release, clear: clear,
    pose: function() { return copy(pose); },
    shots: function() { return shots.map(function(s) { return Object.assign({}, s); }); },
    identity: function() { return identityView(view('world')) && identityView(view('back')); },
    at: at,
    shake: function(amount) { MODS.shake.add(amount); },
    pulse: function(opts) { MODS.pulse.fire(opts); },
    tilt: function(deg, opts) { MODS.tilt.set(deg, opts); },
    letterbox: function(on) {             // 켜는 동안 안전 영역 (정책 inset) — 지금 샷의 틀이 그 안쪽으로 다시 잡힘
      MODS.letterbox.set(on);
      const P = CAM.mods.letterbox;
      if (P.inset) { CAM.insets.top = CAM.insets.bottom = on ? P.size : 0; if (shots.length) retarget(null, P.dur); }   // 샷이 있을 때만 다시 잡음 (기본 샷으로 돌아오는 중이면 그 전환을 덮지 않음)
    },
    vignette: function(on) { MODS.vignette.set(on); },
    trauma: function() { return MODS.shake.trauma(); },
    policy: CAM, ease: EASE,             // 조정·시험용
  };
})();
