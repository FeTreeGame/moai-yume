// 배경 보상 — 정해진 자리에 정해진 에셋이 생긴다 (친구 레이어와 같은 방식). 명세 docs/index/content.md §6
//   데이터 파일 scenery = { items: [{ id, imgs: [그림 경로…], x, y, w, rot, flip, band }] } (편집기 ?scenery)
//     x·y = 중심 (캔버스 폭·높이 비), w = 폭 (캔버스 폭 비 — 높이는 그림 비율), rot = 회전(도), flip = 좌우 반전
//     band = 심도 띠: 'far' = 맨 뒤 (하늘 바로 앞 — 떠다니는 것보다도 뒤) · 'ground' = 그 앞의 땅 (하늘을 뺀 배경 그림 back_f — 'far'의 것이 수평선 뒤로 들어가게) · 'back' = 모아이 뒤 (배경) · 'mid' = 모아이 앞, 전경(모아이가 숨을 때 가리는 땅) 뒤 · 'front' = 전경 앞
//     panel = false면 배경 탭(js/dress.js)의 칸에 나오지 않는다 (켜고 끄는 대상이 아닌 것)
//     tap = 보상 카드 id (선택): 이 요소를 누르면 (보이는 부분 위에서 뗀 자리 + 떽 — 필드 개체와 같은 규칙) 그 카드를 준다 (연결표 js/field-events.js)
//       누름 판정 = 그림의 알파 (hitAt) — 그림을 잘라 다시 배치해도 그대로 맞는다
//     mirror = 대칭축의 자리 (선택 — 그림 폭에서 왼쪽부터의 비 0~1): 그림이 좌우 대칭인 것의 반쪽일 때. 그 축에서 뒤집은 것을 한 번 더 그린다 (그림 한 장으로 양쪽 — 용량 · 메모리 절반)
//     group = 묶음 이름 (선택): 같은 묶음은 배경 탭에서 한 칸 — 얻은 것들을 같이 켜고 끈다 (받침 + 물체 세트, 무지개 띠 일곱). 주는 것은 따로 (자리마다 카드 — 같이 주려면 보상 표에서 같이)
//       같은 띠 안에서는 목록 순서대로 (뒤에 있는 항목이 앞에 그려짐)
//     imgs = 그 자리의 그림 차례 — 보상을 받을 때마다 다음 그림으로 (처음 받으면 첫 그림이 생김, 바뀔 땐 겹쳐 바뀜)
//   보상 카드: 자리마다 'scn.<id>' (js/rewards.js 등록부) — 줄 수 있음 = 다음 그림이 남음. 필드 미션·세션 단계 보상에서 고른다 (?missions)
//   생길 때 FADE.sec초 페이드인. 받은 상태는 새로고침하면 사라짐 (저장은 아직 없음)
//   켜고 끄기: 얻은 요소(owned)는 보이기 · 숨기기를 고를 수 있다 (show — 배경 탭 js/dress.js). 얻은 직후에는 켜져 있다. 숨겨도 얻은 것 · 그림 차례는 그대로
//     켜고 끌 때 TOGGLE.sec초 페이드 — 투명도가 지금 값에서 목표로 일정한 빠르기로 간다 (도중에 다시 누르면 그 값에서 방향만 바뀜 — 연타해도 튀지 않는다)
(function() {
  const M = window.Moai;
  const BAND = { far: 0.5, ground: 1, back: 2, mid: 5.5, front: 6.8 };   // 심도 띠 → z (모아이 5 · 전경 6 — js/layout.js, 떠다니는 것 1.5, 미니 모아이 6.3)
  // 처음부터 얻은 것으로 둘 자리 (id): ground = 하늘을 뺀 땅 (늘 있다 — 무지개의 양 끝을 수평선 뒤로). 무지개 띠는 계열의 보상 (데이터 파일 missions.session)
  const START = ['ground'];
  const FADE = { sec: 1.2 };
  const POP = { from: 0.6, sec: 0.4, fade: 0.12 };   // 처음 생길 때: 이 크기에서 시작해 살짝 넘치게 커졌다 자리 잡는다 (초) — 서서히 드러나기만 하면 받았다는 맛이 약하다. fade = 그때 드러나는 시간 (멈춘 그림으로 보니 1.2초에 걸쳐 드러나면 튀는 동안에는 거의 투명해서 튀는 것이 안 보였다)
  function backOut(u) { const c = 1.70158; u = Math.max(0, Math.min(1, u)) - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  const state = {};   // id → { step: 받은 그림 번호(-1 = 없음), prev, t0 }
  const hidden = {};  // id → true (얻었지만 숨김)
  const TOGGLE = { sec: 0.3 };
  const vis = {};     // id → { a0, t0, on } — 켜고 끄는 페이드 (없으면 지금 상태 그대로: 숨김 0 · 보임 1)
  function visA(id, t) {
    const v = vis[id];
    if (!v) return hidden[id] ? 0 : 1;
    const d = TOGGLE.sec > 0 ? (t - v.t0) / TOGGLE.sec : 1e9;
    return v.on ? Math.min(1, v.a0 + d) : Math.max(0, v.a0 - d);
  }
  function setShown(id, on) {       // 지금 투명도에서 새 목표로
    const t = performance.now() / 1000, a = visA(id, t);
    if (on) delete hidden[id]; else hidden[id] = true;
    vis[id] = { a0: a, t0: t, on: !!on };
  }
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
  function fading() {
    const t = nowSec();
    return Object.keys(state).some(function(id) { return state[id].step >= 0 && t - state[id].t0 < FADE.sec; }) ||
      Object.keys(vis).some(function(id) { return visA(id, t) !== (vis[id].on ? 1 : 0); });
  }
  function tick() { redraw(); return fading(); }
  function wake() { if (M.frame) M.frame.add(tick); else redraw(); }

  function grant(id, opts) {
    const it = itemOf(id), s = stOf(id);
    if (!it || s.step >= (it.imgs || []).length - 1) return false;
    s.prev = s.step; s.step++;
    delete hidden[id]; delete vis[id];   // 얻은 직후에는 보인다 (생길 때의 페이드인은 아래 t0)
    if (it.group) items().forEach(function(o) { if (o.group === it.group && o.id !== id && hidden[o.id]) setShown(o.id, true); });   // 묶음은 같이 (꺼 둔 묶음에 새 것이 오면 다 켠다)
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
    if (it.mirror != null) {            // 대칭축에서 뒤집어 한 번 더 (회전이 없는 그림만)
      const axis = (it.x - it.w / 2 + it.w * it.mirror) * W;
      ctx.save(); ctx.translate(2 * axis, 0); ctx.scale(-1, 1);
      M.drawAt(ctx, im, { x: it.x, y: it.y, w: it.w, rot: 0, flip: !!it.flip }, im.naturalHeight / im.naturalWidth, W, H);
      ctx.restore();
    }
    if (alpha < 1) ctx.restore();
  }
  // 그릴 층 (sprite.js가 모아이·전경·친구·필드 인스턴스와 심도 순으로)
  function layers() {
    const out = [], t = nowSec();
    items().forEach(function(it, i) {
      const s = stOf(it.id), list = it.imgs || [];
      let step = s.step, prev = s.prev, a = Math.min(1, Math.max(0, (t - s.t0) / (s.prev < 0 ? POP.fade : FADE.sec)));   // 처음 생길 때는 빨리 드러난다 (통 튀는 것이 보이게 — 아래 POP), 그림이 바뀔 때는 천천히 겹쳐 바뀐다
      if (preview.all || preview.sel === it.id) {   // 편집기 미리보기
        step = preview.sel === it.id && preview.img != null ? preview.img : (step >= 0 ? step : 0); prev = -1; a = 1;
      }
      if (step < 0 || !list.length) return;
      const va = preview.all || preview.sel === it.id ? 1 : visA(it.id, t);   // 켜고 끄는 페이드 (0 = 숨김)
      if (va <= 0) return;
      const z = (BAND[it.band] != null ? BAND[it.band] : BAND.back) + i * 0.001;
      out.push({ id: 'scenery', z: z, draw: function(ctx, W, H) {
        const im = imgOf(list[Math.min(step, list.length - 1)]), pv = preview.all || preview.sel === it.id;
        // 타격 연출 (js/impact.js — 맞힐 때 들썩임 · 무지개의 밝아짐) + 처음 생길 때 통 튀기 (POP): 아래 가운데를 기준으로 커졌다 돌아온다
        const k = M.impact && !pv ? M.impact.scenery(it, i) : null;
        const pop = !pv && prev < 0 && t - s.t0 < POP.sec ? POP.from + (1 - POP.from) * backOut((t - s.t0) / POP.sec) : 1;
        const sc = (k ? k.s : 1) * pop, hop = k && k.dy ? k.dy * H : 0, sq = k && k.sq ? k.sq : 0, tf = (sc !== 1 || hop || sq) && loaded(im);
        if (tf) {
          const h = it.w * W * im.naturalHeight / im.naturalWidth, ax = (it.mirror != null ? it.x - it.w / 2 + it.w * it.mirror : it.x) * W, ay = it.y * H + h / 2;
          ctx.save(); ctx.translate(ax, ay + hop); ctx.scale(sc * (1 + sq * 0.5), sc * (1 - sq)); ctx.translate(-ax, -ay);   // sq = 눌림 (킥 — 납작해졌다 돌아온다)
        }
        if (va < 1) { ctx.save(); ctx.globalAlpha *= va; }
        if (prev >= 0 && a < 1) drawOne(ctx, it, imgOf(list[prev]), 1, W, H);   // 바뀌는 중: 이전 그림 위로 겹쳐 바뀜
        drawOne(ctx, it, im, a, W, H);
        if (k && k.glow > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawOne(ctx, it, im, k.glow, W, H); ctx.restore(); }
        if (va < 1) ctx.restore();
        if (tf) ctx.restore();
      } });
    });
    return out;
  }

  // 배경 탭의 칸: 얻은 것을 묶음(없으면 자리 하나)마다 한 칸 → [{ id: 묶음 · 자리 이름, ids: [그 칸의 얻은 자리…], imgs: [지금 그림…] }] (목록 순서)
  function cells() {
    const out = [], by = {};
    items().forEach(function(it) {
      const s = stOf(it.id), list = it.imgs || [];
      if (it.panel === false || s.step < 0 || !list.length) return;
      const k = it.group || it.id;
      if (!by[k]) out.push(by[k] = { id: k, ids: [], imgs: [] });
      by[k].ids.push(it.id); by[k].imgs.push(list[Math.min(s.step, list.length - 1)]);
    });
    return out;
  }
  // 배경 탭의 자리: 얻었든 아니든 묶음(없으면 자리 하나)마다 한 칸 — 자리는 목록 순서로 미리 정해져 있다
  //   → [{ id, own: 하나라도 얻었나, imgs: [{ src, own, box }], aspect }] (얻지 않은 그림 = 탭에서 실루엣)
  //     box = 그 칸 안에서 그림의 자리 [왼쪽, 위, 폭, 높이] (0~1 — 묶음 전체를 감싸는 상자 기준: 화면에서의 서로의 자리 · 크기 그대로), aspect = 그 상자의 폭/높이
  //       (그림이 아직 안 불려 크기를 모르면 box · aspect 없음 — 탭이 칸에 꽉 채워 보인다)
  function slots() {
    const out = [], by = {};
    items().forEach(function(it) {
      const s = stOf(it.id), list = it.imgs || [];
      if (it.panel === false || !list.length) return;
      const k = it.group || it.id;
      if (!by[k]) out.push(by[k] = { id: k, own: false, imgs: [] });
      const src = list[Math.max(0, Math.min(s.step, list.length - 1))], im = imgOf(src), A = M.CANVAS_ASPECT;
      const w = it.w * A, h = loaded(im) ? w * im.naturalHeight / im.naturalWidth : null;   // 캔버스 높이 = 1인 단위
      by[k].imgs.push({ src: src, own: s.step >= 0, rect: h == null ? null : [it.x * A - w / 2, it.y - h / 2, w, h] });
      if (it.mirror != null) by[k].imgs.push({ src: src, own: s.step >= 0, flip: true,      // 뒤집은 쪽 (대칭축 건너편)
        rect: h == null ? null : [2 * (it.x - it.w / 2 + it.w * it.mirror) * A - (it.x * A + w / 2), it.y - h / 2, w, h] });
      if (s.step >= 0) by[k].own = true;
    });
    out.forEach(function(c) {
      if (c.imgs.some(function(g) { return !g.rect; })) return;
      const l = Math.min.apply(null, c.imgs.map(function(g) { return g.rect[0]; })), t = Math.min.apply(null, c.imgs.map(function(g) { return g.rect[1]; }));
      const r = Math.max.apply(null, c.imgs.map(function(g) { return g.rect[0] + g.rect[2]; })), b = Math.max.apply(null, c.imgs.map(function(g) { return g.rect[1] + g.rect[3]; }));
      c.aspect = (r - l) / (b - t);
      c.imgs.forEach(function(g) { g.box = [(g.rect[0] - l) / (r - l), (g.rect[1] - t) / (b - t), g.rect[2] / (r - l), g.rect[3] / (b - t)]; });
    });
    return out;
  }
  function cellOf(id) { return cells().filter(function(c) { return c.id === id; })[0] || null; }

  // 누를 수 있는 요소(tap이 적힌 것 — 얻었고 보이는 것만)의 보이는 부분 위인가: (x, y) = 캔버스 폭 · 높이 비 → 그 요소 id (없으면 null, 겹치면 앞의 것)
  const TAP = { alpha: 32, mask: 256 };   // 이 알파보다 진하면 보이는 부분, 판정용 알파 지도의 폭 (px — 그림을 줄여서 한 번만 읽어 둔다)
  const masks = {};
  function maskOf(path, im) {
    if (masks[path] !== undefined) return masks[path];
    const w = Math.min(TAP.mask, im.naturalWidth), h = Math.max(1, Math.round(w * im.naturalHeight / im.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
    try { masks[path] = { w: w, h: h, d: x.getImageData(0, 0, w, h).data }; } catch (e) { masks[path] = null; }
    return masks[path];
  }
  function hitAt(x, y) {
    const W = M.CANVAS_ASPECT, t = nowSec();
    let hit = null;
    items().forEach(function(it) {
      const s = stOf(it.id), list = it.imgs || [];
      if (!it.tap || s.step < 0 || !list.length || visA(it.id, t) <= 0) return;
      const path = list[Math.min(s.step, list.length - 1)], im = imgOf(path);
      if (!loaded(im)) return;
      const r = M.placedRect({ x: it.x, y: it.y, w: it.w, rot: it.rot || 0, flip: !!it.flip }, im.naturalHeight / im.naturalWidth, W, 1);
      const dx = x * W - r.cx, dy = y - r.cy, c = Math.cos(-(r.rot || 0)), sn = Math.sin(-(r.rot || 0));
      let lx = dx * c - dy * sn; const ly = dx * sn + dy * c;
      if (it.flip) lx = -lx;
      const u = lx / r.dw + 0.5, v = ly / r.dh + 0.5, m = u >= 0 && u < 1 && v >= 0 && v < 1 ? maskOf(path, im) : null;
      if (m && m.d[(Math.floor(v * m.h) * m.w + Math.floor(u * m.w)) * 4 + 3] > TAP.alpha) hit = it.id;
    });
    return hit;
  }

  register();
  START.forEach(function(id) { grant(id, { fade: false }); });
  items().forEach(function(it) { (it.imgs || []).forEach(imgOf); });   // 미리 불러 둠 (생길 때 바로)

  M.sceneryLayers = layers;
  M.scenery = {
    grant: grant, items: items, cells: cells, slots: slots, hitAt: hitAt,
    cellShown: function(id) { const c = cellOf(id); return !!c && c.ids.some(function(x) { return !hidden[x]; }); },      // 그 칸이 켜져 있나
    showCell: function(id, on) { const c = cellOf(id); if (!c) return; c.ids.forEach(function(x) { setShown(x, on); }); wake(); },
    owned: function(id) { return stOf(id).step >= 0; },                    // 얻었나
    shown: function(id) { return stOf(id).step >= 0 && !hidden[id]; },     // 얻었고 켜져 있나
    show: function(id, on) { if (stOf(id).step < 0) return; setShown(id, on); wake(); },
    alpha: function(id) { return stOf(id).step < 0 ? 0 : visA(id, nowSec()); }, toggle: TOGGLE, state: function(id) { return Object.assign({}, stOf(id)); },
    reset: function(id) { if (id) { delete state[id]; delete vis[id]; delete hidden[id]; } else [state, vis, hidden].forEach(function(o) { Object.keys(o).forEach(function(k) { delete o[k]; }); }); redraw(); },
    register: register, preview: preview, band: BAND, fade: FADE, imgOf: imgOf,   // 편집기·시험용
  };
})();
