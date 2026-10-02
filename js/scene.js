// 배경 씬 렌더링: 하늘 + 구름 + 바다 + 잔디
(function() {
  const M = window.Moai;
  let sCtx;

  // 배경 풀잎 좌표 (한 번만 생성)
  const BG_BLADE_COUNT = 120;
  let bgBlades = null;
  function generateBgBlades() {
    bgBlades = [];
    for (let i = 0; i < BG_BLADE_COUNT; i++) {
      bgBlades.push({
        rx: Math.random(),
        ry: Math.random(),
        h: 4 + Math.random() * 8,
        dx: (Math.random() - 0.5) * 4,
        dark: Math.random() > 0.5
      });
    }
  }

  M.initScene = function() {
    if (!M.el.sceneBg) return; // 독립 캔버스 없을 시 스킵
    sCtx = M.el.sceneBg.getContext('2d');
    resizeScene();
  };

  M.resizeScene = function() {
    if (M.el.sceneBg) resizeScene();
  };

  // 외부 컨텍스트에 배경 그리기 (스프라이트 캔버스용)
  M.drawSceneTo = function(ctx, W, H) {
    const prevCtx = sCtx;
    sCtx = ctx;
    drawScene(W, H);
    sCtx = prevCtx;
  };

  function resizeScene() {
    const canvas = M.el.sceneBg;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(rect.width, rect.height);
  }

  function drawScene(W, H) {
    // Sky
    const skyH = H * 0.55;
    const skyGrad = sCtx.createLinearGradient(0, 0, 0, skyH);
    skyGrad.addColorStop(0, '#4da6e8');
    skyGrad.addColorStop(0.4, '#6ec3f5');
    skyGrad.addColorStop(0.7, '#8dd4f8');
    skyGrad.addColorStop(1, '#b0e2fc');
    sCtx.fillStyle = skyGrad;
    sCtx.fillRect(0, 0, W, skyH + 10);

    // Clouds (캔버스 폭 비례)
    var cs = W / 480; // 기준 480px 대비 스케일
    drawCloud(sCtx, W * 0.2, skyH * 0.22, 50 * cs, 0.8);
    drawCloud(sCtx, W * 0.55, skyH * 0.12, 65 * cs, 1.0);
    drawCloud(sCtx, W * 0.82, skyH * 0.30, 40 * cs, 0.6);
    drawCloud(sCtx, W * 0.35, skyH * 0.42, 35 * cs, 0.5);

    // Sea
    const seaTop = skyH;
    const seaH = H * 0.18;
    const seaGrad = sCtx.createLinearGradient(0, seaTop, 0, seaTop + seaH);
    seaGrad.addColorStop(0, '#1ac8db');
    seaGrad.addColorStop(0.3, '#15b5c9');
    seaGrad.addColorStop(0.6, '#0ea2b8');
    seaGrad.addColorStop(1, '#0990a6');
    sCtx.fillStyle = seaGrad;
    sCtx.fillRect(0, seaTop, W, seaH + 2);

    // Sea shimmer
    sCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    sCtx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = seaTop + 6 + i * (seaH / 6);
      sCtx.beginPath();
      sCtx.moveTo(0, y);
      for (let x = 0; x < W; x += 8) {
        sCtx.lineTo(x, y + Math.sin(x * 0.05 + i * 1.2) * 1.5);
      }
      sCtx.stroke();
    }

    // Grass
    const grassTop = seaTop + seaH;
    const grassH = H - grassTop;
    const grassGrad = sCtx.createLinearGradient(0, grassTop, 0, H);
    grassGrad.addColorStop(0, '#5cb338');
    grassGrad.addColorStop(0.3, '#4a9e2f');
    grassGrad.addColorStop(0.7, '#3d8a26');
    grassGrad.addColorStop(1, '#2d6e1c');
    sCtx.fillStyle = grassGrad;
    sCtx.fillRect(0, grassTop, W, grassH);

    // Grass blades (사전 생성 좌표)
    if (!bgBlades) generateBgBlades();
    sCtx.lineWidth = 1;
    for (let i = 0; i < bgBlades.length; i++) {
      const b = bgBlades[i];
      const gx = b.rx * W;
      const gy = grassTop + b.ry * grassH;
      sCtx.strokeStyle = b.dark ? 'rgba(80,180,50,0.4)' : 'rgba(30,100,15,0.3)';
      sCtx.beginPath();
      sCtx.moveTo(gx, gy);
      sCtx.lineTo(gx + b.dx * cs, gy - b.h * cs);
      sCtx.stroke();
    }

    // Moai shadow (캔버스 폭 비례)
    const cx = W / 2;
    const cy = grassTop + grassH * 0.45;
    sCtx.fillStyle = 'rgba(0,0,0,0.25)';
    sCtx.beginPath();
    sCtx.ellipse(cx, cy, 48 * cs, 14 * cs, 0, 0, Math.PI * 2);
    sCtx.fill();
  }

  function drawCloud(ctx, cx, cy, size, opacity) {
    ctx.fillStyle = `rgba(255,255,255,${opacity * 0.9})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.55, cy + size * 0.08, size * 0.55, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + size * 0.5, cy + size * 0.1, size * 0.5, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + size * 0.1, cy - size * 0.2, size * 0.45, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
})();
