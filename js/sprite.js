// 스프라이트 렌더러: 콜라주 에셋 Canvas drawImage
// 기존 CSS 모아이와 병렬 동작 — 같은 입력 상태를 참조하되 독립 렌더
(function() {
  const M = window.Moai;

  // 프레임 정의
  const FRAME_NAMES = M.MOAI_FRAMES;   // js/moai-anim.js (미니 모아이와 공용)

  const frames = {};       // name → Image
  let loaded = 0;
  let ready = false;
  let mainRenderAnnounced = false;
  let spriteCtx = null;
  let currentFrame = 'idle';
  let animId = null;        // rAF id

  // 필드 이미지 (4:3, 캔버스 전체): 배경 = 하늘·바다·섬·구멍 / 전경 = 앞쪽 잔디 띠 (layout.js 'ground' 레이어)
  const field = { back: new Image(), front: new Image() };
  field.back.onload = field.front.onload = function() { if (ready) drawFrame(currentFrame); };
  field.back.src = 'assets/field/back.png';
  field.front.src = 'assets/field/front.png';
  function loadedImg(img) { return img.complete && img.naturalWidth > 0; }

  // 프레임 프리로드
  function preload(cb) {
    FRAME_NAMES.forEach(name => {
      const img = new Image();
      img.onload = () => {
        frames[name] = img;
        loaded++;
        updateLoadProgress();
        if (loaded === FRAME_NAMES.length) { ready = true; if (cb) cb(); }
      };
      img.onerror = () => {
        console.warn('Frame load failed:', name);
        loaded++;
        if (loaded === FRAME_NAMES.length) { ready = true; if (cb) cb(); }
      };
      img.src = 'assets/' + name + '.png';
    });
  }

  // 로딩 진행률 표시
  function updateLoadProgress() {
    const el = M.el.spriteStatus;
    if (!el) return;
    if (loaded < FRAME_NAMES.length) {
      el.textContent = 'LOADING ' + loaded + '/' + FRAME_NAMES.length;
    } else {
      el.textContent = 'READY';
      setTimeout(() => { el.style.opacity = '0'; }, 800);
    }
  }

  // Canvas에 현재 프레임 그리기 (배경 + 스프라이트)
  function drawFrame(name) {
    if (M.spriteFrameOverride) name = M.spriteFrameOverride;   // 편집기가 프레임 하나를 붙잡아 봄 (?accessory)
    if (!spriteCtx || !frames[name]) return;
    const canvas = M.el.spriteCanvas;
    const img = frames[name];
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // 카메라 (js/camera.js): 월드 층(배경·z순 층·편집기 오버레이)에만 변환 — 화면 층(아래 높이 표시)은 변환 밖
    const cam = M.camera && !M.camera.identity() ? M.camera : null;
    if (cam) spriteCtx.clearRect(0, 0, W, H);       // 변환 밖 가장자리가 지난 그림으로 남지 않게

    // 배경: 필드 이미지 (로드 전에는 scene.js 절차적 씬)
    spriteCtx.save();
    if (cam) cam.apply(spriteCtx, W, H, 'back');
    if (loadedImg(field.back)) {
      spriteCtx.drawImage(field.back, 0, 0, W, H);
    } else if (M.drawSceneTo) {
      M.drawSceneTo(spriteCtx, W, H);
    } else {
      spriteCtx.clearRect(0, 0, W, H);
    }
    spriteCtx.restore();
    spriteCtx.save();
    if (cam) cam.apply(spriteCtx, W, H, 'world');

    // 레이어: 모아이 + 전경 + 친구 + 배경 보상(scenery.js) + 필드 인스턴스 + 효과 파티클(fx.js), 심도(z) 순 — 배치는 layout.js(M.LAYOUT). 같은 z면 모아이가 앞
    const layers = (M.friendLayers ? M.friendLayers() : []).concat(M.sceneryLayers ? M.sceneryLayers() : []).concat(M.fieldActors ? M.fieldActors.layers() : []).concat(M.fxLayers ? M.fxLayers() : []);
    if (loadedImg(field.front)) layers.push({ id: 'ground', z: M.LAYOUT.ground.z, draw: function(ctx) { M.drawPlaced(ctx, field.front, 'ground', W, H); } });
    layers.push({ id: 'moai', z: M.LAYOUT.moai.z, draw: function(ctx) {
      const acc = M.accessories, r = acc ? M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, W, H, M.moaiDy()) : null;
      if (acc) acc.draw(ctx, name, r, M.LAYOUT.moai.flip, 'back');    // 악세사리 (js/accessories.js — 모아이와 같은 상자·반전, 지금 프레임의 델타)
      M.drawPlaced(ctx, img, 'moai', W, H);
      if (acc) acc.draw(ctx, name, r, M.LAYOUT.moai.flip, 'front');
    } });
    layers.sort(function(a, b) { return a.z - b.z; });
    for (let i = 0; i < layers.length; i++) layers[i].draw(spriteCtx, W, H);

    // 레이아웃 편집기 오버레이 (index.html?layout 에서만 로드)
    if (M.drawLayoutOverlay) M.drawLayoutOverlay(spriteCtx, W, H);
    spriteCtx.restore();                               // 여기까지 월드 층

    // 모아이 높이 조정 표시 (↑/↓ 직후 잠시)
    if (performance.now() < heightLabelUntil) {
      const dy = M.moaiDy();
      const txt = M.body && M.body.current() !== null
        ? 'MINI ' + M.body.current() + ' ' + Math.round(getHeight() * 100) + '%'   // 빙의한 미니 모아이 (js/possess.js)
        : 'MOAI ' + Math.round(M.moaiHeight * 100) + '%  (dy ' + (dy >= 0 ? '+' : '') + dy.toFixed(2) + ', y ' + (M.LAYOUT.moai.y + dy).toFixed(2) + ')';
      spriteCtx.save();
      spriteCtx.font = 'bold 16px monospace';
      spriteCtx.fillStyle = 'rgba(0,0,0,0.6)';
      spriteCtx.fillRect(8, 8, spriteCtx.measureText(txt).width + 16, 26);
      spriteCtx.fillStyle = '#39ff14';
      spriteCtx.fillText(txt, 16, 27);
      spriteCtx.restore();
    }

    currentFrame = name;
    if (!mainRenderAnnounced) {
      mainRenderAnnounced = true;
      document.dispatchEvent(new CustomEvent('moai:main-rendered'));
      const cover = document.getElementById('spriteLoadingCover');
      if (cover) cover.classList.add('dismissed');
    }
  }

  // 모아이 높이 조정 (임시 조작) — ↑/↓ 누르는 동안 연속 이동, 떼면 정지. 0~100% (layout.js M.MOAI_HEIGHT)
  //   지금 몸의 높이 (빙의 — js/possess.js M.body: 메인 모아이 = M.moaiHeight, 미니 모아이 = 그 인스턴스). 목소리 게인도 몸의 높이를 따름
  //   레이아웃 편집기(?layout)에서는 편집기가 방향키를 먼저 가져간다
  const HEIGHT_SPEED = 1.25;          // 초당 높이 변화 (0% → 100% 0.8초)
  const heightKeys = { ArrowUp: false, ArrowDown: false };
  // 시간 원천은 rAF 타임스탬프 하나 — 키 이벤트는 눌림 상태만 기록한다 (이벤트 시각과 섞으면 dt가 음수가 될 수 있음)
  let heightLabelUntil = 0, heightLabelTimer = null, heightRaf = null, heightLast = null;
  function heightDir() { return (heightKeys.ArrowUp ? 1 : 0) - (heightKeys.ArrowDown ? 1 : 0); }
  function getHeight() { return M.body ? M.body.height() : M.moaiHeight; }
  function setHeight(h) { if (M.body) M.body.setHeight(h); else M.moaiHeight = h; }
  function heightStep(t) {
    const dt = heightLast === null ? 0 : Math.min(0.05, (t - heightLast) / 1000);   // 첫 프레임 = 기준점 (이동 0)
    heightLast = t;
    setHeight(Math.min(1, Math.max(0, getHeight() + heightDir() * HEIGHT_SPEED * dt)));
    if (M.updateVoiceGain) M.updateVoiceGain();   // 높이 ↔ 목소리 게인 (선형 감쇠)
    heightLabelUntil = performance.now() + 2000;
    if (ready) drawFrame(currentFrame);
    if (heightDir()) { heightRaf = requestAnimationFrame(heightStep); return; }
    heightRaf = null;
    heightLast = null;
    announceHeight(false);
    console.log('[moai] height', getHeight().toFixed(2), M.body && M.body.current() !== null ? 'mini ' + M.body.current() : 'dy ' + M.moaiDy().toFixed(3));
    clearTimeout(heightLabelTimer);
    heightLabelTimer = setTimeout(function() { if (ready) drawFrame(currentFrame); }, 2050);   // 표시 지우기
  }
  function heightKey(e, down) {
    if (!(e.code in heightKeys)) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    e.preventDefault();
    heightKeys[e.code] = down;
    // 방향이 남아 있으면 (재)시작 — 두 키 상쇄로 멈춘 뒤 한쪽을 뗀 경우 포함
    if (heightDir() && !heightRaf) { heightRaf = requestAnimationFrame(heightStep); announceHeight(true); }
  }
  // 알림 'moai:height' { moving, dir, height } — 움직이기 시작·멈춤 (연출 연결표 js/fx-rules.js — 돌 가는 소리·먼지)
  function announceHeight(moving) {
    if (typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('moai:height', { detail: { moving: moving, dir: heightDir(), height: getHeight() } }));
  }
  M.moaiHeightNow = getHeight;
  document.addEventListener('keydown', function(e) { heightKey(e, true); });
  document.addEventListener('keyup', function(e) { heightKey(e, false); });
  window.addEventListener('blur', function() { heightKeys.ArrowUp = heightKeys.ArrowDown = false; });

  // 현재 프레임 다시 그리기 (친구 합류 등 외부 변화용)
  M.spriteRedraw = function() {
    if (ready) drawFrame(currentFrame);
  };

  // 동작 재생: 애니메이터(js/moai-anim.js — 경과 시간으로 프레임)를 프레임 루프(frame.js)가 돌린다 — 루프가 프레임마다 다시 그림
  //   예전 setTimeout 시퀀스와 같은 시퀀스 표(M.MOAI_SEQ). 지금 프레임은 currentFrame (그리기 기준)
  const anim = M.moaiAnimator();
  function nowSec() { return performance.now() / 1000; }
  function animTask(t) {
    currentFrame = anim.frame(t);
    return anim.busy(t);
  }
  function act(action) {
    if (!ready) return;
    const t = nowSec();
    anim.play(action, t);
    currentFrame = anim.frame(t);
    drawFrame(currentFrame);                       // 첫 프레임은 바로
    if (anim.busy(t) && M.frame) M.frame.add(animTask);
  }

  // === 공개 API: 사운드 이벤트에서 호출 (메인 모아이 몸 — 빙의는 js/possess.js) ===
  M.spritePlayTap = function() { act('tap'); };        // 떽: tap-1(피크) → tap-4 → idle
  M.spriteStartHold = function() { act('hold'); };     // 뚜 시작: hold-1 → hold-2 → hold-3 유지
  M.spritePlayRelease = function() { act('release'); };   // 엉: hold-4 → hold-5 → idle
  M.spriteIdle = function() { act('idle'); };          // idle 복귀

  // === 초기화 ===
  M.initSprite = function() {
    const canvas = M.el.spriteCanvas;
    if (!canvas) return;

    spriteCtx = canvas.getContext('2d');
    // DPR 대응
    resizeSprite();
    preload(() => drawFrame('idle'));
  };

  function resizeSprite() {
    const canvas = M.el.spriteCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ready) drawFrame(currentFrame);
  }

  M.resizeSprite = resizeSprite;
})();
