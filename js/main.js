// 초기화: DOM 바인딩 + 레이아웃 엔진 + 드로어 + 모듈 연결
(function() {
  var M = window.Moai;
  var ASPECT = 4 / 3;
  var MARGIN = 16;
  var DRAWER_H_RATIO = 0.45;

  // DOM 요소 바인딩
  M.el = {
    playArea:    document.getElementById('playArea'),
    feedback:    document.getElementById('feedback'),
    spriteCanvas: document.getElementById('spriteCanvas'),
    spriteStatus: document.getElementById('spriteStatus'),
    playOriginal: document.getElementById('playOriginal'),
    playOrigTap:  document.getElementById('playOrigTap'),
    playOrigHold: document.getElementById('playOrigHold'),
    playSplit:    document.getElementById('playSplit'),
    spriteBox:    document.querySelector('.sprite-box'),
  };

  var spriteBox = M.el.spriteBox;
  var panel = document.getElementById('panel');
  var toggle = document.getElementById('drawerToggle');
  var backdrop = document.getElementById('drawerBackdrop');
  var drawerOpen = false;
  var isLandscape = true;

  function getDrawerSize() {
    var vw = window.innerWidth;
    return Math.max(240, Math.min(vw * 0.28, 360));
  }

  // 레이아웃 계산 + CSS 변수 주입
  // 드로어와 캔버스 모두 같은 CSS transition 엔진이 구동 (동기화)
  function calcLayout() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var root = document.documentElement;
    isLandscape = vw > vh;

    var availW, availH;
    var offsetX = 0, offsetY = 0;

    if (drawerOpen) {
      if (isLandscape) {
        var dw = getDrawerSize();
        availW = vw - dw - MARGIN * 2;
        availH = vh - MARGIN * 2;
        offsetX = -dw / 2;
      } else {
        var dh = vh * DRAWER_H_RATIO;
        availW = vw - MARGIN * 2;
        availH = vh - dh - MARGIN * 2;
        offsetY = -dh / 2;
      }
    } else {
      availW = vw - MARGIN * 2;
      availH = vh - MARGIN * 2;
    }

    var canvasW, canvasH;
    if (availW / ASPECT <= availH) {
      canvasW = availW;
      canvasH = availW / ASPECT;
    } else {
      canvasH = availH;
      canvasW = availH * ASPECT;
    }

    canvasW = Math.max(120, Math.floor(canvasW));
    canvasH = Math.max(90, Math.floor(canvasH));

    var uiUnit = Math.max(9, Math.min(13, canvasH / 30));

    var spriteTop = Math.round(vh / 2 + offsetY);

    root.style.setProperty('--canvas-w', canvasW + 'px');
    root.style.setProperty('--canvas-h', canvasH + 'px');
    root.style.setProperty('--ui-unit', uiUnit + 'px');
    root.style.setProperty('--sprite-left', Math.round(vw / 2 + offsetX) + 'px');
    root.style.setProperty('--sprite-top', spriteTop + 'px');

    // 세로모드: 드로어가 캔버스 하단부터 시작
    if (!isLandscape) {
      var canvasBottom = spriteTop + Math.round(canvasH / 2) + MARGIN;
      root.style.setProperty('--drawer-top', canvasBottom + 'px');
    }

    updateDrawerDirection();
  }

  // CSS transition 완료 시 Canvas 해상도 갱신
  // 드로어 슬라이드와 캔버스 스케일이 동일한 CSS transition 엔진이므로
  // transitionend 시점에 양쪽 모두 최종 위치에 도달
  spriteBox.addEventListener('transitionend', function(e) {
    if (e.propertyName === 'width' || e.propertyName === 'height') {
      if (M.resizeSprite) M.resizeSprite();
    }
  });

  // 드로어 방향 class 갱신
  function updateDrawerDirection() {
    panel.classList.remove('drawer-right', 'drawer-bottom');
    if (isLandscape) {
      panel.classList.add('drawer-right');
    } else {
      panel.classList.add('drawer-bottom');
    }
  }

  // 드로어 상태 알림 (열림·페이지) — 해석은 듣는 쪽이 한다 (예: bgm.js = 샘플 탭이 보이면 필드 BGM 내려 두기)
  var drawerPage = 'control';
  function announceDrawer() {
    document.dispatchEvent(new CustomEvent('moai:drawer', { detail: { open: drawerOpen, page: drawerPage } }));
  }

  function openDrawer() {
    drawerOpen = true;
    updateDrawerDirection();
    panel.classList.add('open');
    backdrop.classList.add('open');
    toggle.classList.add('active');
    toggle.textContent = '✕';
    calcLayout();
    announceDrawer();
    // 드로어 열림 후 스크롤 트랙 갱신 (레이아웃 확정 후)
    requestAnimationFrame(function() {
      if (window.updateScrollTracks) window.updateScrollTracks();
    });
  }

  function closeDrawer() {
    drawerOpen = false;
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    toggle.classList.remove('active');
    toggle.textContent = '☰';
    calcLayout();
    announceDrawer();
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  }

  // 이벤트 (모바일: touchend로 즉시 반응, click 중복 방지)
  var toggledByTouch = false;
  toggle.addEventListener('touchend', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggledByTouch = true;
    toggleDrawer();
  }, { passive: false });
  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    if (toggledByTouch) { toggledByTouch = false; return; }
    toggleDrawer();
  });
  backdrop.addEventListener('touchend', function(e) {
    e.preventDefault();
    closeDrawer();
  }, { passive: false });
  backdrop.addEventListener('click', closeDrawer);

  // ── 드로어 탭 전환 (조작 / 샘플 / 비트 / 설정) ──
  var drawerTabs = document.querySelectorAll('.drawer-tab');
  var drawerPages = {
    control: document.getElementById('drawerControl'),
    sample:  document.getElementById('drawerSample'),
    beat:    document.getElementById('drawerBeat'),
    config:  document.getElementById('drawerConfig'),
  };

  function switchDrawerPage(tab) {
    var page = tab.getAttribute('data-drawer');
    drawerTabs.forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    Object.keys(drawerPages).forEach(function(key) {
      drawerPages[key].classList.toggle('hidden', key !== page);
    });
    if (page !== drawerPage) { drawerPage = page; announceDrawer(); }
    // 스크롤 트랙 갱신 (레이아웃 반영 후)
    requestAnimationFrame(function() {
      if (window.updateScrollTracks) window.updateScrollTracks();
    });
  }

  drawerTabs.forEach(function(tab) {
    var touchSwitched = false;
    tab.addEventListener('touchend', function(e) {
      e.preventDefault();
      touchSwitched = true;
      switchDrawerPage(tab);
    }, { passive: false });
    tab.addEventListener('click', function() {
      if (touchSwitched) { touchSwitched = false; return; }
      switchDrawerPage(tab);
    });
  });

  // 원본 에셋 초기 로드
  if (M.originalEnsureLoaded) M.originalEnsureLoaded();

  // 초기 레이아웃 (transition 없이 즉시)
  spriteBox.style.transition = 'none';
  calcLayout();

  // 레이아웃 확정 후 스크롤 트랙 초기화
  if (window.initScrollTracks) window.initScrollTracks();

  // 모듈 초기화
  M.initInput();
  M.initScene();
  M.initSprite();

  // 다음 프레임에서 transition 복원
  requestAnimationFrame(function() {
    spriteBox.style.transition = '';
  });

  // 우클릭 차단
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

  // 버튼/슬라이더 포커스 차단
  document.querySelectorAll('button, input[type="range"]').forEach(function(el) {
    el.setAttribute('tabindex', '-1');
  });

  // 윈도우 리사이즈 (transition 없이 즉시)
  var resizeTimer = null;
  window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      spriteBox.style.transition = 'none';
      calcLayout();
      if (M.resizeSprite) M.resizeSprite();
      requestAnimationFrame(function() {
        spriteBox.style.transition = '';
      });
    }, 50);
  });
})();
