// 필드 배치 (모아이 + 친구) — 단일 원천. sprite.js·friends.js가 그리고, 레이아웃 편집기(index.html?layout)가 조정한다
//   x, y = 중심 (캔버스 폭·높이 비), w = 폭 (캔버스 폭 비, 높이는 이미지 비율을 따름)
//   rot = 회전(도, 시계 방향), flip = 좌우 반전, z = 심도 (클수록 앞. 같으면 모아이가 앞)
//   배경(assets/field/back.png)은 레이어 밖 고정. ground = 전경(앞쪽 잔디 띠, assets/field/front.png) — 전경 앞은 굴러조개·비둘매기뿐
// 값: 컨셉 아트(moai_yume2.png, 4:3) 매칭 초기값 → 레이아웃 편집기로 원본 오버레이에 맞춘 값 (x·y·w 소수 둘째 자리, z 연번)
(function() {
  const M = window.Moai;

  M.LAYOUT = {
    sun:     { x: 0.20, y: 0.16, w: 0.34, rot: 15.5, flip: false, z: 0 },
    cloud:   { x: 0.56, y: 0.18, w: 0.45, rot: 7.5,  flip: false, z: 1 },
    dolphin: { x: 0.16, y: 0.52, w: 0.46, rot: 0,    flip: true,  z: 2 },
    palm:    { x: 0.81, y: 0.28, w: 0.35, rot: -13,  flip: true,  z: 3 },
    star:    { x: 0.81, y: 0.62, w: 0.48, rot: 0,    flip: false, z: 4 },
    moai:    { x: 0.57, y: 0.65, w: 0.42, rot: 0,    flip: false, z: 5, pivot: 0.37 },  // pivot = 반전 축 (상자 기준 — placedRect). 0.37 = 캔버스 x ≈ 0.515, 오른쪽을 보는 모습과 대칭으로 실화면에서 확정
    ground:  { x: 0.50, y: 0.50, w: 1.00, rot: 0,    flip: false, z: 6 },
    clam:    { x: 0.20, y: 0.81, w: 0.43, rot: 0,    flip: true,  z: 7 },
    pigeon:  { x: 0.79, y: 0.84, w: 0.43, rot: 0,    flip: false, z: 8 },
  };
  // 이미지 높이/폭 비 (기본 1 = 정사각). 모아이 프레임은 1080×1920, 전경은 1920×1440 (캔버스 전체)
  M.LAYOUT_ASPECT = { moai: 1920 / 1080, ground: 1440 / 1920 };

  // 모아이 높이 (두더지 연출 토대): M.moaiHeight 0~1 (1 = 100% = 정상). 위치 = LAYOUT.moai.y + 오프셋(캔버스 높이 비, +가 아래)
  //   up = 100% 오프셋, down = 0% 오프셋 — 컨셉 아트 위치(y 0.65) 대비, 인게임 ↑/↓로 찾은 값 (100% y 0.60 / 0% y 1.00). 사이는 선형
  //   gainMin = 0%일 때 모아이 목소리 게인 (100% = 1). 사이는 선형 감쇠 — 바닥에서도 들린다
  M.MOAI_HEIGHT = { up: -0.05, down: 0.35, gainMin: 0.5 };
  M.moaiHeight = 1;
  M.moaiDy = function(h) {
    if (h === undefined) h = M.moaiHeight;
    return M.MOAI_HEIGHT.down + (M.MOAI_HEIGHT.up - M.MOAI_HEIGHT.down) * h;
  };

  M.moaiGain = function(h) {
    if (h === undefined) h = M.moaiHeight;
    return M.MOAI_HEIGHT.gainMin + (1 - M.MOAI_HEIGHT.gainMin) * h;
  };

  // 캔버스 폭/높이 비 (필드 이미지 4:3 — main.js ASPECT와 같음)
  M.CANVAS_ASPECT = 4 / 3;

  // ── 필드 바닥: 착지 영역의 윗선 (캔버스 비) — 떨어지는 것은 하단이 이 선 아래(영역 안)에 닿아야 착지 ──
  //   grass = 배경(back.png) 잔디 윗선 실측 (x 0.05 간격). hole = 모아이 구멍 열(모아이 비주얼 폭) — 여기선 잔디 대신
  //   전경(front.png) 앞턱 윗선부터 (모아이·구멍 위에는 착지하지 않고 앞턱까지 떨어진다). 필드 이미지가 바뀌면 다시 잰다
  M.FIELD_GROUND = {
    grass: [[0, 0.864], [0.05, 0.817], [0.1, 0.787], [0.15, 0.762], [0.2, 0.742], [0.25, 0.73], [0.3, 0.724], [0.35, 0.714],
            [0.4, 0.708], [0.45, 0.706], [0.5, 0.71], [0.55, 0.706], [0.6, 0.708], [0.65, 0.714], [0.7, 0.72], [0.75, 0.73],
            [0.8, 0.742], [0.85, 0.76], [0.9, 0.785], [0.95, 0.818], [1, 0.865]],
    hole: { from: 0.34, to: 0.69,
            lip: [[0.34, 0.86], [0.35, 0.867], [0.4, 0.898], [0.45, 0.912], [0.5, 0.915], [0.55, 0.921], [0.6, 0.908], [0.65, 0.894], [0.69, 0.87]] },
  };
  function interp(tbl, x) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) { const a = tbl[i - 1], b = tbl[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    }
    return tbl[tbl.length - 1][1];
  }
  // x(캔버스 폭 비)에서 착지 영역이 시작되는 y
  M.landTop = function(x) {
    const g = M.FIELD_GROUND, h = g.hole;
    return (x >= h.from && x <= h.to) ? interp(h.lip, x) : interp(g.grass, x);
  };

  // ── 계열 영역 (새싹을 세우는 자리 — 이름 seed…는 옛 씨앗에서, 미니 모아이 때 정리. 자리 표시 — 스케치에서 읽은 값, 에셋이 들어오면 다시 잰다) ──
  //   모아이 구멍을 둘러싼 고리 위 일곱 곳, 좌우 대칭: 쌍마다 같은 높이 y, 중심에서의 거리 d로 좌우에 하나씩
  //     (보라·빨강 / 남·주황 / 파랑·노랑), 초록 = 중심. 중심 = 캔버스 가운데(0.5) + offset (전체 좌우 보정 — 실화면에서 맞춰 확정한 값)
  //   M.seedZones() = 계열 순서(무지개 보라 → 빨강 — field-actors.js RAINBOW)의 일곱 곳 {x, y}: 오른쪽 뒤에서 앞쪽을 돌아 왼쪽 뒤까지
  //   크기 = SEED_ZONE_SIZE (rx = 폭 비, ry = 높이 비)
  M.SEED_ZONE_RING = {
    pairs: [{ d: 0.23, y: 0.78 }, { d: 0.305, y: 0.86 }, { d: 0.19, y: 0.945 }],   // 보라·빨강 / 남·주황 / 파랑·노랑
    center: { y: 0.97 },                                                             // 초록 (0.955 → 0.97: 파랑·노랑과 높이가 거의 같아 0.015 내림)
    offset: 0.012,                                                                   // 전체 좌우 보정 (캔버스 폭 비)
  };
  M.seedZones = function() {
    const r = M.SEED_ZONE_RING, c = 0.5 + r.offset, p = r.pairs;
    return [
      { x: c + p[0].d, y: p[0].y }, { x: c + p[1].d, y: p[1].y }, { x: c + p[2].d, y: p[2].y },   // 보라 · 남 · 파랑 (오른쪽)
      { x: c, y: r.center.y },                                                                        // 초록 (중심)
      { x: c - p[2].d, y: p[2].y }, { x: c - p[1].d, y: p[1].y }, { x: c - p[0].d, y: p[0].y },   // 노랑 · 주황 · 빨강 (왼쪽)
    ];
  };
  M.SEED_ZONE_SIZE = { rx: 0.035, ry: 0.045 };

  // ── 배치 기하 (공용 — 고정 배치 M.LAYOUT·움직이는 필드 인스턴스·레이아웃 편집기) ──
  //   p = { x, y, w, rot, flip } (위 단위), aspect = 이미지 높이/폭 비, dy = y 오프셋(캔버스 높이 비)
  // 그린 사각형 (px): 중심·크기·회전(라디안)
  //   반전 축(pivot — 선택): 그린 상자 기준 0~1(왼쪽에서). 반전(flip)이면 그 축을 중심으로 거울처럼 놓인다 — 상자 가운데가 축 반대편으로 옮겨짐
  //     (없거나 0.5면 상자 가운데 = 예전 동작). 그리기·판정·편집기가 모두 이 상자를 쓰므로 함께 따라감
  M.placedRect = function(p, aspect, W, H, dy) {
    const dw = p.w * W;
    let cx = p.x * W;
    if (p.flip && p.pivot !== undefined) cx += (2 * p.pivot - 1) * dw;   // 축 x = 왼쪽 + pivot·폭 → 거울 가운데 = 2·축 − 가운데
    return { cx: cx, cy: (p.y + (dy || 0)) * H, dw: dw, dh: dw * (aspect || 1), rot: (p.rot || 0) * Math.PI / 180 };
  };
  // 점(px)이 사각형 안인가 (회전 고려). scale = 판정 크기 비 (기본 1)
  M.hitRect = function(r, x, y, scale) {
    const s = scale || 1, dx = x - r.cx, dy = y - r.cy;
    const lx = dx * Math.cos(-r.rot) - dy * Math.sin(-r.rot);
    const ly = dx * Math.sin(-r.rot) + dy * Math.cos(-r.rot);
    return Math.abs(lx) <= r.dw * s / 2 && Math.abs(ly) <= r.dh * s / 2;
  };
  // ── 모아이 에셋 판정 사각형 (idle — 메인·미니 모아이 공용): 정점 4개, 그린 상자 기준 0~1 (u = 폭, v = 높이), 에셋은 오른쪽을 봄 ──
  //   순서 = 위 왼쪽 · 위 오른쪽 · 아래 오른쪽 · 아래 왼쪽 (머리 꼭대기는 좁게, 어깨는 넓게). 크기·위치·반전은 그린 상자를 따라감
  //   값: 실화면에서 정점을 직접 옮겨 맞춰 확정 (2026-10-01)
  M.MOAI_HIT = [[0.1, 0.17], [0.58, 0.17], [0.7, 0.81], [0, 0.81]];
  // 상자(placedRect 결과) 위의 정점들 (px) — 반전·회전 반영
  M.quadOn = function(r, quad, flip) {
    const c = Math.cos(r.rot || 0), s = Math.sin(r.rot || 0);
    return quad.map(function(q) {
      let x = (q[0] - 0.5) * r.dw;
      const y = (q[1] - 0.5) * r.dh;
      if (flip) x = -x;
      return [r.cx + x * c - y * s, r.cy + x * s + y * c];
    });
  };
  // 점이 다각형 안인가 (짝홀 규칙 — 오목해도 됨)
  M.inPolygon = function(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  // 배치 값대로 그리기 (중심 기준 회전·반전)
  M.drawAt = function(ctx, img, p, aspect, W, H, dy) {
    const r = M.placedRect(p, aspect, W, H, dy);
    ctx.save();
    ctx.translate(r.cx, r.cy);
    if (r.rot) ctx.rotate(r.rot);
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -r.dw / 2, -r.dh / 2, r.dw, r.dh);
    ctx.restore();
  };
  // 고정 배치(M.LAYOUT[id])대로 그리기. 모아이는 높이 오프셋(M.moaiDy()) 적용
  M.drawPlaced = function(ctx, img, id, W, H) {
    M.drawAt(ctx, img, M.LAYOUT[id], M.LAYOUT_ASPECT[id], W, H, id === 'moai' ? M.moaiDy() : 0);
  };
})();
