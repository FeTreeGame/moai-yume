// 배경 보상 — 정해진 자리에 정해진 에셋이 생긴다 (친구 레이어와 같은 방식). 명세 docs/index/content.md §6
//   데이터 파일 scenery = { items: [{ id, imgs: [그림 경로…], x, y, w, rot, flip, band }] } (편집기 ?scenery)
//     x·y = 중심 (캔버스 폭·높이 비), w = 폭 (캔버스 폭 비 — 높이는 그림 비율), rot = 회전(도), flip = 좌우 반전
//     band = 심도 띠: 'back' = 모아이 뒤 (배경) · 'mid' = 모아이 앞, 전경(모아이가 숨을 때 가리는 땅) 뒤 · 'front' = 전경 앞
//       같은 띠 안에서는 목록 순서대로 (뒤에 있는 항목이 앞에 그려짐)
//     imgs = 그 자리의 그림 차례 — 보상을 받을 때마다 다음 그림으로 (처음 받으면 첫 그림이 생김, 바뀔 땐 겹쳐 바뀜)
//   보상 카드: 자리마다 'scn.<id>' (js/rewards.js 등록부) — 줄 수 있음 = 다음 그림이 남음. 필드 미션·세션 단계 보상에서 고른다 (?missions)
//   생길 때 FADE.sec초 페이드인. 받은 상태는 새로고침하면 사라짐 (저장은 아직 없음)
(function() {
  const M = window.Moai;
  const BAND = { back: 2, mid: 5.5, front: 6.8 };   // 심도 띠 → z (모아이 5 · 전경 6 — js/layout.js, 떠다니는 것 1.5, 미니 모아이 6.3)
  const FADE = { sec: 1.2 };
  const state = {};   // id → { step: 받은 그림 번호(-1 = 없음), prev, t0 }
  const imgs = {};
  const preview = { all: false, sel: null, img: null };   // 편집기: 모든 자리를 보임 / 고른 자리의 보일 그림 번호

  function items() { const d = window.MoaiData && window.MoaiData.scenery; return (d && d.items) || []; }
  function itemOf(id) { return items().filter(function(it) { return it.id === id; })[0] || null; }
  function stOf(id) { return state[id] || (state[id] = { step: -1, prev: -1, t0: 0 }); }
  function nowSec() { return performance.now() / 1000; }
  function redraw() { if (M.spriteRedraw) M.spriteRedraw(); }
  function imgOf(path) {
    if (!path) return null;
    if (!imgs[path]) { const im = new Image(); im.onload = redraw; im.src = path; imgs[path] = im; }
    return imgs[path];
  }
  function loaded(im) { return !!im && im.complete && im.naturalWidth > 0; }
  function fading() { const t = nowSec(); return Object.keys(state).some(function(id) { return state[id].step >= 0 && t - state[id].t0 < FADE.sec; }); }
  function tick() { redraw(); return fading(); }
  function wake() { if (M.frame) M.frame.add(tick); else redraw(); }

  function grant(id, opts) {
    const it = itemOf(id), s = stOf(id);
    if (!it || s.step >= (it.imgs || []).length - 1) return false;
    s.prev = s.step; s.step++;
    s.t0 = opts && opts.fade === false ? -1e9 : nowSec();
    (it.imgs || []).forEach(imgOf);
    wake();
    return true;
  }
  function register() {
    if (!M.rewards) return;
    items().forEach(function(it) {
      M.rewards.register('scn.' + it.id, {
        name: '배경 ' + it.id + ((it.imgs || []).length > 1 ? ' (그림 ' + (it.imgs || []).length + '장 차례)' : ''),
        can: function() { const cur = itemOf(it.id); return !!cur && stOf(it.id).step < (cur.imgs || []).length - 1; },
        give: function(o) { grant(it.id, o); },
      });
    });
  }
  function drawOne(ctx, it, im, alpha, W, H) {
    if (!loaded(im) || alpha <= 0) return;
    if (alpha < 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    M.drawAt(ctx, im, { x: it.x, y: it.y, w: it.w, rot: it.rot || 0, flip: !!it.flip }, im.naturalHeight / im.naturalWidth, W, H);
    if (alpha < 1) ctx.restore();
  }
  // 그릴 층 (sprite.js가 모아이·전경·친구·필드 인스턴스와 심도 순으로)
  function layers() {
    const out = [], t = nowSec();
    items().forEach(function(it, i) {
      const s = stOf(it.id), list = it.imgs || [];
      let step = s.step, prev = s.prev, a = Math.min(1, Math.max(0, (t - s.t0) / FADE.sec));
      if (preview.all || preview.sel === it.id) {   // 편집기 미리보기
        step = preview.sel === it.id && preview.img != null ? preview.img : (step >= 0 ? step : 0); prev = -1; a = 1;
      }
      if (step < 0 || !list.length) return;
      const z = (BAND[it.band] != null ? BAND[it.band] : BAND.back) + i * 0.001;
      out.push({ id: 'scenery', z: z, draw: function(ctx, W, H) {
        if (prev >= 0 && a < 1) drawOne(ctx, it, imgOf(list[prev]), 1, W, H);   // 바뀌는 중: 이전 그림 위로 겹쳐 바뀜
        drawOne(ctx, it, imgOf(list[Math.min(step, list.length - 1)]), a, W, H);
      } });
    });
    return out;
  }

  register();
  items().forEach(function(it) { (it.imgs || []).forEach(imgOf); });   // 미리 불러 둠 (생길 때 바로)

  M.sceneryLayers = layers;
  M.scenery = {
    grant: grant, items: items, state: function(id) { return Object.assign({}, stOf(id)); },
    reset: function(id) { if (id) delete state[id]; else Object.keys(state).forEach(function(k) { delete state[k]; }); redraw(); },
    register: register, preview: preview, band: BAND, fade: FADE, imgOf: imgOf,   // 편집기·시험용
  };
})();
