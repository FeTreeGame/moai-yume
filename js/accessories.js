// 모아이 악세사리 (메인 모아이만) — 안경·머리카락·콧수염 같은 정적 그림을 모아이에 씌운다. 명세 docs/index/content.md §7
//   데이터 파일 accessories = { frames: { 프레임: { dx, dy, rot, scale } }, items: [{ id, img, u, v, w, rot, flip, layer }] } (편집기 ?accessory)
//     frames = 프레임별 델타 (idle = 0 기준) — 머리가 그 프레임에서 idle보다 얼마나 움직였나: dx·dy = 모아이 상자 폭·높이 비, rot = 도, scale = 배
//       한 번 맞추면 (악세사리 하나를 얹고 프레임 10장마다) 모든 악세사리가 따라감
//     items = 악세사리마다 idle에서의 자리: u·v = 그림 중심 (모아이 상자 0~1 — 오른쪽을 보는 원본 기준), w = 폭 (모아이 상자 폭 비), rot = 도, flip = 그림 좌우 반전 (선택),
//       layer = 'front'(모아이 위) | 'back'(모아이 뒤 — 뒷머리 등). 그림 = assets/accessory/ 의 파일
//   그리기 = 모아이 층 안에서 모아이와 같은 상자·회전·반전 (sprite.js) — 높이 이동·바라보는 방향·카메라를 저절로 따라감
//   보상 카드 'acc.<id>' (js/rewards.js 등록부) — 받으면 얻은 것이 되고 씌움 (페이드인), 한 번만. 받은 상태는 새로고침하면 사라짐
//     얻은 것(owned)만 치장 탭(js/dress.js)의 칸에 나온다 — 벗어도 얻은 것은 그대로
//   한 번에 하나만 (WEAR.one): 씌우면 쓰고 있던 것은 벗겨진다 (치장 탭 · 보상 모두 — 보상으로 받으면 새것으로 바뀜). 다 벗은 상태도 된다
//   씌우기 · 벗기기 = 페이드: 악세사리마다 투명도가 지금 값에서 목표(쓴다 1 · 벗는다 0)로 일정한 빠르기로 간다
//     도중에 다시 누르면 그 순간의 값에서 방향만 바뀐다 (연타해도 튀지 않고 마지막에 누른 상태로 — 쌓이는 것 없음)
//     시간: 보상 = FADE.sec, 치장 탭에서 켜고 끄기 = TOGGLE.sec (opts.toggle), opts.fade === false = 그 자리에서
(function() {
  const M = window.Moai;
  const FADE = { sec: 0.8 };
  const DROP = { from: 0.12 };   // 보상으로 받을 때: 이만큼 위(모아이 상자 높이 비)에서 내려앉는다 — 페이드와 같이 (치장 탭에서 켜고 끌 때는 아님)
  const START = [];            // 처음부터 씌워 둘 악세사리 (id) — 시험용 자리. 지금은 전부 얻어야 한다 (새 = 메인 모아이 위에 앉음 · 왕관 = 완수 왕관 탭: js/field-events.js / 광대 · 리본 = 세션)
  const HAVE = [];             // 처음부터 얻은 것으로만 둘 악세사리 (쓰지는 않음 — 치장 탭의 칸에 나온다). 시험용 자리
  const TOGGLE = { sec: 0.3 }; // 치장 탭에서 켜고 끌 때의 페이드 (초)
  const WEAR = { one: true };  // 한 번에 하나만 쓴다 (false = 여럿을 같이)
  const vis = {};              // id → { a0, t0, on, sec } — 투명도가 a0에서 (t0부터, 1/sec의 빠르기로) 목표(on ? 1 : 0)로
  const owned = {};            // id → true (얻음 — 보상 카드 · START)
  const imgs = {};
  const preview = { all: false, sel: null };   // 편집기: 모두 / 고른 것을 씌워 보임

  function data() { return (window.MoaiData && window.MoaiData.accessories) || {}; }
  function items() { return data().items || []; }
  function frameDelta(name) { const f = (data().frames || {})[name]; return { dx: (f && f.dx) || 0, dy: (f && f.dy) || 0, rot: (f && f.rot) || 0, scale: (f && f.scale) || 1 }; }
  function nowSec() { return performance.now() / 1000; }
  function redraw() { if (M.spriteRedraw) M.spriteRedraw(); }
  function imgOf(path) {
    if (!path) return null;
    if (!imgs[path]) { const im = new Image(); im.onload = redraw; im.src = path; imgs[path] = im; }
    return imgs[path];
  }
  function alphaOf(id, t) {
    const v = vis[id];
    if (!v) return 0;
    const d = v.sec > 0 ? (t - v.t0) / v.sec : 1e9;
    return v.on ? Math.min(1, v.a0 + d) : Math.max(0, v.a0 - d);
  }
  function isWorn(id) { return !!vis[id] && vis[id].on; }
  function secOf(opts) { return opts && opts.fade === false ? 0 : opts && opts.toggle ? TOGGLE.sec : FADE.sec; }
  function go(id, on, sec) { const t = nowSec(); vis[id] = { a0: alphaOf(id, t), t0: t, on: on, sec: sec }; }   // 지금 투명도에서 새 목표로
  function fading() { const t = nowSec(); return Object.keys(vis).some(function(id) { return alphaOf(id, t) !== (vis[id].on ? 1 : 0); }); }
  function tick() { redraw(); return fading(); }
  function wake() { if (M.frame) M.frame.add(tick); else redraw(); }
  function wear(id, opts) {
    if (isWorn(id)) return false;
    const sec = secOf(opts);
    if (WEAR.one) Object.keys(vis).forEach(function(o) { if (o !== id && vis[o].on) go(o, false, sec); });   // 쓰던 것은 벗는다 (같이 페이드)
    go(id, true, sec);
    items().forEach(function(it) { if (it.id === id) imgOf(it.img); });
    wake();
    return true;
  }
  function unwear(id, opts) { if (!isWorn(id)) return false; go(id, false, secOf(opts || { toggle: true })); wake(); return true; }   // 벗기기 (치장 탭 — js/dress.js)
  function register() {
    if (!M.rewards) return;
    items().forEach(function(it) {
      M.rewards.register('acc.' + it.id, { name: '악세사리 ' + it.id, can: function() { return !owned[it.id]; }, give: function(o) { owned[it.id] = true; wear(it.id, o); } });
    });
  }
  // 모아이 상자 r(placedRect)·반전·지금 프레임 위에 그 층(front|back)의 악세사리
  function draw(ctx, frame, r, flip, layer) {
    const f = frameDelta(frame), t = nowSec();
    items().forEach(function(it) {
      if ((it.layer || 'front') !== layer) return;
      const pv = preview.all || preview.sel === it.id, a = pv ? 1 : alphaOf(it.id, t);
      if (a <= 0) return;
      const im = imgOf(it.img);
      if (!im || !im.complete || !im.naturalWidth) return;
      const w = (it.w || 0.2) * f.scale * r.dw, h = w * im.naturalHeight / im.naturalWidth;
      ctx.save();
      if (a < 1) ctx.globalAlpha *= a;
      ctx.translate(r.cx, r.cy);
      if (r.rot) ctx.rotate(r.rot);
      if (flip) ctx.scale(-1, 1);
      const vv = vis[it.id], drop = !pv && vv && vv.on && vv.sec === FADE.sec && a < 1 ? DROP.from * (1 - a) * (1 - a) : 0;
      ctx.translate(((it.u != null ? it.u : 0.5) + f.dx - 0.5) * r.dw, ((it.v != null ? it.v : 0.3) + f.dy - 0.5 - drop) * r.dh);
      const rot = (it.rot || 0) + f.rot;
      if (rot) ctx.rotate(rot * Math.PI / 180);
      if (it.flip) ctx.scale(-1, 1);          // 그림만 좌우 반전 (자리 · 회전은 그대로)
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  }

  register();
  items().forEach(function(it) { imgOf(it.img); });
  HAVE.forEach(function(id) { owned[id] = true; });
  START.forEach(function(id) { owned[id] = true; wear(id, { fade: false }); });

  M.accessories = {
    draw: draw, wear: wear, unwear: unwear, register: register, items: items, frameDelta: frameDelta,
    worn: isWorn,                                   // 쓰고 있나 (목표 — 벗는 페이드 중이면 false)
    owned: function(id) { return !!owned[id]; },
    reset: function() { Object.keys(vis).forEach(function(k) { delete vis[k]; }); Object.keys(owned).forEach(function(k) { delete owned[k]; }); redraw(); },
    preview: preview, imgOf: imgOf, fade: FADE, toggle: TOGGLE, policy: WEAR, alpha: function(id) { return alphaOf(id, nowSec()); },   // 편집기·시험용
  };
})();
