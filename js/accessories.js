// 모아이 악세사리 (메인 모아이만) — 안경·머리카락·콧수염 같은 정적 그림을 모아이에 씌운다. 명세 docs/index/content.md §7
//   데이터 파일 accessories = { frames: { 프레임: { dx, dy, rot, scale } }, items: [{ id, img, u, v, w, rot, layer }] } (편집기 ?accessory)
//     frames = 프레임별 델타 (idle = 0 기준) — 머리가 그 프레임에서 idle보다 얼마나 움직였나: dx·dy = 모아이 상자 폭·높이 비, rot = 도, scale = 배
//       한 번 맞추면 (악세사리 하나를 얹고 프레임 10장마다) 모든 악세사리가 따라감
//     items = 악세사리마다 idle에서의 자리: u·v = 그림 중심 (모아이 상자 0~1 — 오른쪽을 보는 원본 기준), w = 폭 (모아이 상자 폭 비), rot = 도,
//       layer = 'front'(모아이 위) | 'back'(모아이 뒤 — 뒷머리 등). 그림 = assets/accessory/ 의 파일
//   그리기 = 모아이 층 안에서 모아이와 같은 상자·회전·반전 (sprite.js) — 높이 이동·바라보는 방향·카메라를 저절로 따라감
//   보상 카드 'acc.<id>' (js/rewards.js 등록부) — 받으면 씌움 (페이드인), 한 번만. 받은 상태는 새로고침하면 사라짐
(function() {
  const M = window.Moai;
  const FADE = { sec: 0.8 };
  const worn = {};             // id → 씌운 시각 (초)
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
  function fading() { const t = nowSec(); return Object.keys(worn).some(function(id) { return t - worn[id] < FADE.sec; }); }
  function tick() { redraw(); return fading(); }
  function wear(id, opts) {
    if (worn[id] != null) return false;
    worn[id] = opts && opts.fade === false ? -1e9 : nowSec();
    items().forEach(function(it) { if (it.id === id) imgOf(it.img); });
    if (M.frame) M.frame.add(tick); else redraw();
    return true;
  }
  function register() {
    if (!M.rewards) return;
    items().forEach(function(it) {
      M.rewards.register('acc.' + it.id, { name: '악세사리 ' + it.id, can: function() { return worn[it.id] == null; }, give: function(o) { wear(it.id, o); } });
    });
  }
  // 모아이 상자 r(placedRect)·반전·지금 프레임 위에 그 층(front|back)의 악세사리
  function draw(ctx, frame, r, flip, layer) {
    const f = frameDelta(frame), t = nowSec();
    items().forEach(function(it) {
      if ((it.layer || 'front') !== layer) return;
      const on = preview.all || preview.sel === it.id || worn[it.id] != null;
      if (!on) return;
      const im = imgOf(it.img);
      if (!im || !im.complete || !im.naturalWidth) return;
      const a = preview.all || preview.sel === it.id ? 1 : Math.min(1, (t - worn[it.id]) / FADE.sec);
      const w = (it.w || 0.2) * f.scale * r.dw, h = w * im.naturalHeight / im.naturalWidth;
      ctx.save();
      if (a < 1) ctx.globalAlpha *= a;
      ctx.translate(r.cx, r.cy);
      if (r.rot) ctx.rotate(r.rot);
      if (flip) ctx.scale(-1, 1);
      ctx.translate(((it.u != null ? it.u : 0.5) + f.dx - 0.5) * r.dw, ((it.v != null ? it.v : 0.3) + f.dy - 0.5) * r.dh);
      const rot = (it.rot || 0) + f.rot;
      if (rot) ctx.rotate(rot * Math.PI / 180);
      ctx.drawImage(im, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
  }

  register();
  items().forEach(function(it) { imgOf(it.img); });

  M.accessories = {
    draw: draw, wear: wear, register: register, items: items, frameDelta: frameDelta,
    worn: function(id) { return worn[id] != null; },
    reset: function() { Object.keys(worn).forEach(function(k) { delete worn[k]; }); redraw(); },
    preview: preview, imgOf: imgOf, fade: FADE,   // 편집기·시험용
  };
})();
