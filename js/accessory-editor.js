// 악세사리 편집기 (개발용) — index.html?accessory 일 때만 로드. 명세 docs/index/content.md §7
//   ① 프레임 맞추기 (한 번): 악세사리 하나(예: 안경)를 얹고, idle = 0 기준으로 프레임 10장마다 머리가 움직인 만큼(델타)을 맞춤 → 모든 악세사리가 따라감
//   ② 악세사리: 그림(assets/accessory/)마다 idle에서의 자리(u·v)·폭·회전·층(모아이 위/뒤)을 맞춤 → 보상 카드 'acc.<이름>'
//   캔버스: 끌기 = 위치, 휠 = 크기, Q·E = 회전, H = 그림 좌우 반전 (② 악세사리에서), 방향키 = 위치 (Shift ×10), F = 바라보는 방향 바꿔 보기
//   프레임 버튼 = 그 프레임으로 고정해 봄 (고정 해제 = 평소처럼 — 키로 연주해 동작 확인)
(function() {
  const M = window.Moai, K = M.editorKit, A = M.accessories;
  const DIR = 'assets/accessory', FRAMES = M.MOAI_FRAMES || ['idle'];
  const data = M.data.get('accessories', {});
  data.frames = data.frames || {}; data.items = data.items || [];
  FRAMES.forEach(function(f) { data.frames[f] = data.frames[f] || { dx: 0, dy: 0, rot: 0, scale: 1 }; });
  window.MoaiData.accessories = data;
  const missions = M.data.get('missions', {});
  let mode = 'frames', sel = data.items.length ? data.items[0].id : null, frame = 'idle', files = [], renamed = false, face = null;
  M.spriteFrameOverride = frame;

  const sb = document.querySelector('.sprite-box'), box = document.createElement('div'), ghost = document.createElement('div');
  box.style.cssText = 'position:absolute;pointer-events:none;z-index:61;border:1px dashed #f44;box-sizing:border-box';
  ghost.style.cssText = 'position:absolute;pointer-events:none;z-index:61;border:1px dotted rgba(80,200,255,0.9);box-sizing:border-box';
  sb.appendChild(ghost); sb.appendChild(box);

  function itemOf(id) { return data.items.filter(function(it) { return it.id === id; })[0] || null; }
  function cur() { return itemOf(sel); }
  function round(v, n) { const f = Math.pow(10, n); return Math.round(v * f) / f; }
  function moaiRect() { return M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, M.CANVAS_ASPECT, 1, M.moaiDy()); }
  function place(el, it, fr) {              // 악세사리 상자를 캔버스 위 % 로
    const im = A.imgOf(it.img), r = moaiRect(), f = fr ? data.frames[fr] : { dx: 0, dy: 0, rot: 0, scale: 1 }, sx = M.LAYOUT.moai.flip ? -1 : 1;
    const w = it.w * (f.scale || 1) * r.dw, h = w * (im && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1);
    const cx = r.cx + sx * (it.u + f.dx - 0.5) * r.dw, cy = r.cy + (it.v + f.dy - 0.5) * r.dh;
    el.style.display = '';
    el.style.left = ((cx - w / 2) / M.CANVAS_ASPECT * 100) + '%'; el.style.top = ((cy - h / 2) * 100) + '%';
    el.style.width = (w / M.CANVAS_ASPECT * 100) + '%'; el.style.height = (h * 100) + '%';
    el.style.transform = 'rotate(' + sx * ((it.rot || 0) + (f.rot || 0)) + 'deg)';
  }
  function guides() {
    const it = cur();
    if (!it) { box.style.display = ghost.style.display = 'none'; return; }
    place(box, it, frame);
    if (frame !== 'idle') place(ghost, it, null); else ghost.style.display = 'none';
  }
  function refresh() {
    A.preview.all = false; A.preview.sel = sel;
    M.spriteFrameOverride = frame;
    A.register(); guides(); render();
    if (M.spriteRedraw) M.spriteRedraw();
  }
  function change(fn) {
    const it = cur();
    if (!it) return;
    if (mode === 'frames') {
      if (frame === 'idle') { pad.status('idle = 기준 (0) — 다른 프레임을 고르세요'); return; }
      const f = data.frames[frame];
      fn(null, f);
      f.dx = round(f.dx, 3); f.dy = round(f.dy, 3); f.rot = round(f.rot, 1); f.scale = round(Math.max(0.2, f.scale), 3);
    } else {
      fn(it, null);
      it.u = round(it.u, 3); it.v = round(it.v, 3); it.w = round(Math.max(0.01, it.w), 4); it.rot = round(it.rot || 0, 1);
    }
    refresh();
  }

  const pad = K.panel('ACCESSORY (모아이)', { width: 340 });
  function render() {
    const it = cur(), f = data.frames[frame];
    let h = '<div class="ek-row"><button data-mode="frames"' + (mode === 'frames' ? ' class="on"' : '') + '>① 프레임 맞추기</button>' +
      '<button data-mode="items"' + (mode === 'items' ? ' class="on"' : '') + '>② 악세사리</button></div>';
    h += '<div class="ek-row">' + FRAMES.map(function(fr) { return '<button data-frame="' + fr + '"' + (fr === frame ? ' class="on"' : '') + '>' + fr + '</button>'; }).join('') +
      '<button data-frame="">고정 해제</button></div>';
    h += '<div class="ek-row">' + data.items.map(function(x) { return '<button data-sel="' + x.id + '"' + (x.id === sel ? ' class="on"' : '') + '>' + x.id + '</button>'; }).join('') +
      '<select data-f="newimg"><option value="">+ 악세사리 (그림)</option>' + files.map(function(n) { return '<option>' + n + '</option>'; }).join('') + '</select></div>';
    if (!files.length) h += '<div style="color:#c96">' + DIR + '/ 에 그림이 없거나 목록을 못 읽음</div>';
    if (mode === 'frames') {
      h += '<div class="ek-sec">프레임 <b>' + frame + '</b> 델타 (idle 대비) — dx <b>' + f.dx + '</b> dy <b>' + f.dy + '</b> rot <b>' + f.rot + '</b> scale <b>' + f.scale + '</b>' +
        (it ? '' : '<br><span style="color:#c96">맞출 기준 악세사리를 먼저 하나 추가</span>') +
        '<br><span style="color:#8a8">빨간 점선 = 이 프레임 · 파란 점선 = idle 자리</span> <button data-a="zero">이 프레임 0으로</button></div>';
    } else if (it) {
      h += '<div class="ek-sec ek-row">이름 <input data-f="id" value="' + it.id + '" style="width:90px"><button data-a="rename">바꾸기</button> 카드 <b>acc.' + it.id + '</b></div>' +
        '<div class="ek-row">' + it.img.replace(DIR + '/', '') + ' · u <b>' + it.u + '</b> v <b>' + it.v + '</b> w <b>' + it.w + '</b> rot <b>' + (it.rot || 0) + '</b>' + (it.flip ? ' · <b>반전</b>' : '') + '</div>' +
        '<div class="ek-row">층 <button data-layer="front"' + (it.layer !== 'back' ? ' class="on"' : '') + '>모아이 위</button><button data-layer="back"' + (it.layer === 'back' ? ' class="on"' : '') + '>모아이 뒤</button>' +
        '<button data-a="flip"' + (it.flip ? ' class="on"' : '') + '>반전 (H)</button><button data-a="wear">시험 착용 ▶</button><button data-a="unwear">벗기기</button><button data-a="del" style="margin-left:auto">삭제</button></div>';
    }
    h += '<div class="ek-sec ek-row"><button data-a="face">방향 (F)</button><button data-a="save" style="margin-left:auto">저장</button></div>';
    h += '<div class="ek-help">끌기 = 위치 · 휠 = 크기 · Q·E = 회전 · H = 반전 · 방향키 (Shift ×10) · F = 방향\n① 기준 악세사리 하나로 프레임마다 델타를 한 번 (idle = 0)\n② 악세사리마다 idle에서의 자리만 — 나머지 프레임은 델타로 따라감\n보상으로 쓰기: ?missions에서 보상 카드 acc.<이름></div>';
    pad.body.innerHTML = h;
  }

  pad.body.addEventListener('change', function(e) {
    const t = e.target;
    if (t.dataset.f === 'newimg' && t.value) {
      let k = 1; while (itemOf('acc' + k)) k++;
      data.items.push({ id: 'acc' + k, img: DIR + '/' + t.value, u: 0.45, v: 0.3, w: 0.3, rot: 0, layer: 'front' });
      sel = 'acc' + k; A.imgOf(DIR + '/' + t.value);
      refresh();
    }
  });
  pad.body.addEventListener('click', function(e) {
    const t = e.target, d = t.dataset, it = cur();
    if (d.mode) mode = d.mode;
    else if (d.frame != null) { frame = d.frame || null; if (!frame) { M.spriteFrameOverride = null; render(); guides(); if (M.spriteRedraw) M.spriteRedraw(); frame = 'idle'; return; } }
    else if (d.sel) sel = d.sel;
    else if (d.layer && it) it.layer = d.layer;
    else if (d.a === 'zero' && frame !== 'idle') data.frames[frame] = { dx: 0, dy: 0, rot: 0, scale: 1 };
    else if (d.a === 'face') { face = face === 'left' ? 'right' : 'left'; if (M.facing) M.facing.lock(face); }
    else if (d.a === 'flip' && it) { if (it.flip) delete it.flip; else it.flip = true; }
    else if (d.a === 'wear' && it) { A.preview.sel = null; A.wear(it.id); render(); return; }
    else if (d.a === 'unwear') A.reset();
    else if (d.a === 'del' && it) { data.items.splice(data.items.indexOf(it), 1); sel = data.items.length ? data.items[0].id : null; }
    else if (d.a === 'rename' && it) {
      const to = (pad.body.querySelector('[data-f="id"]').value || '').trim();
      if (!/^[A-Za-z0-9_-]+$/.test(to)) { pad.status('이름 = 영문·숫자·_·-'); return; }
      if (to === it.id) return;
      if (itemOf(to)) { pad.status('이미 있는 이름'); return; }
      const from = 'acc.' + it.id, nu = 'acc.' + to;
      (missions.field || []).forEach(function(L) { if (L.reward === from) L.reward = nu; });
      (missions.session || []).forEach(function(f) { f.rewards = (f.rewards || []).map(function(r) { if (r && r.give) r.give = r.give.map(function(g) { return g === from ? nu : g; }); return r === from ? nu : r; }); });
      it.id = to; sel = to; renamed = true; pad.status('이름 바꿈 — 저장하면 미션 데이터의 보상 참조도 함께');
    }
    else if (d.a === 'save') { K.save('accessories', data, pad).then(function(r) { if (r.ok && renamed) { renamed = false; K.save('missions', missions, pad); } }); return; }
    else return;
    refresh();
  });

  // 캔버스 이동량(캔버스 비) → 모아이 상자 비 (반전이면 가로 반대)
  function toBox(d) {
    const L = M.LAYOUT.moai;
    return { du: (L.flip ? -1 : 1) * d.dx / L.w, dv: d.dy / (L.w * M.LAYOUT_ASPECT.moai * M.CANVAS_ASPECT) };
  }
  K.capture({
    move: function(p, d) { const b = toBox(d); change(function(it, f) { if (f) { f.dx += b.du; f.dy += b.dv; } else { it.u += b.du; it.v += b.dv; } }); },
    wheel: function(s) { change(function(it, f) { if (f) f.scale *= 1 + s * 0.01; else it.w *= 1 + s * 0.02; }); },
  });
  const step = function(e) { return e.shiftKey ? 0.01 : 0.001; };
  function nudge(dx, dy) { return function(e) { const b = toBox({ dx: dx * step(e), dy: dy * step(e) }); change(function(it, f) { if (f) { f.dx += b.du; f.dy += b.dv; } else { it.u += b.du; it.v += b.dv; } }); }; }
  K.keys({
    ArrowLeft: nudge(-1, 0), ArrowRight: nudge(1, 0), ArrowUp: nudge(0, -1), ArrowDown: nudge(0, 1),
    KeyQ: function(e) { change(function(it, f) { const v = e.shiftKey ? 5 : 0.5; if (f) f.rot -= v; else it.rot = (it.rot || 0) - v; }); },
    KeyE: function(e) { change(function(it, f) { const v = e.shiftKey ? 5 : 0.5; if (f) f.rot += v; else it.rot = (it.rot || 0) + v; }); },
    KeyH: function() { const it = cur(); if (mode !== 'items' || !it) return; if (it.flip) delete it.flip; else it.flip = true; refresh(); },
    KeyF: function() { face = face === 'left' ? 'right' : 'left'; if (M.facing) M.facing.lock(face); refresh(); },
  });

  K.list(DIR).then(function(f) { files = f; refresh(); });
  refresh();
  const wait = setInterval(function() { guides(); if (M.spriteRedraw) M.spriteRedraw(); }, 500); setTimeout(function() { clearInterval(wait); }, 4000);
})();
