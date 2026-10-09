// 초기화: DOM 바인딩 + 레이아웃 엔진 + 드로어 + 모듈 연결
(function() {
  var M = window.Moai;
  var ASPECT = 4 / 3;
  var MARGIN = 16;
  var DRAWER_H_RATIO = 0.45;

  // DOM 요소 바인딩
  M.el = {
    playArea:    document.getElementById('playArea'),
    spriteCanvas: document.getElementById('spriteCanvas'),
    spriteStatus: document.getElementById('spriteStatus'),
    playOrigTap:  document.getElementById('playOrigTap'),
    playOrigHold: document.getElementById('playOrigHold'),
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
    root.style.setProperty('--field-cue-font-size', Math.round(canvasH * 0.06) + 'px');
    root.style.setProperty('--field-cue-shadow-y', Math.max(1, Math.round(canvasH * 0.003)) + 'px');
    root.style.setProperty('--field-cue-letter-spacing', Math.round(canvasH * 0.0023) + 'px');
    root.style.setProperty('--ui-unit', uiUnit + 'px');
    root.style.setProperty('--sprite-left', Math.round(vw / 2 + offsetX) + 'px');
    root.style.setProperty('--sprite-top', spriteTop + 'px');

    // 세로모드: 드로어가 캔버스 하단부터 시작
    if (!isLandscape) {
      var canvasBottom = spriteTop + Math.round(canvasH / 2) + MARGIN;
      root.style.setProperty('--drawer-top', canvasBottom + 'px');
    }

    updateDrawerDirection();
    // 화면 배치 소식 (가로 · 세로, 드로어) — 해석은 듣는 쪽이 한다 (예: pad.js = 조작 버튼을 보일 수 있는 조건)
    document.dispatchEvent(new CustomEvent('moai:layout', { detail: { landscape: isLandscape, drawerOpen: drawerOpen } }));
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
  var drawerPage = 'config';   // 드로어를 열면 처음 보이는 탭 (index.html의 active 탭과 같게)
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

  // 설정 탭의 전체 화면 토글
  var fullscreenToggle = document.getElementById('fullscreenToggle');
  //   브라우저의 답(document.fullscreenElement)만 믿지 않는다: 권한 창(녹음 등)이 뜨면 화면은 전체 화면에서 빠져나오는데 브라우저는 여전히 '전체 화면 중'이라고
  //   답하는 경우가 있다 — 그러면 단추는 끄기만 시도하고 (끌 것이 없어 아무 일도 없다) 그 뒤로 내내 먹통이었다
  //   → 전체 화면에 들어갔을 때의 창 높이를 적어 두고, 그보다 뚜렷이 줄어 있으면 '풀린 것'으로 본다 (fsStale). 풀린 것이면 다시 켠다
  //   끄기를 시도했는데 달라진 것이 없어도 (알림이 오지 않고 여전히 전체 화면이라고 답함) 다시 켠다. 실패 문구는 잠깐만 보이고 돌아온다
  var fsHeight = 0, fsNoteTimer = null;
  function fsStale() { return !!document.fullscreenElement && fsHeight > 0 && window.innerHeight < fsHeight - 24; }
  function fsActive() { return !!document.fullscreenElement && !fsStale(); }
  function updateFullscreenToggle() {
    var active = fsActive();
    fullscreenToggle.textContent = active ? '전체 화면 종료' : '전체 화면';
    fullscreenToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  function fsNote(text) {
    fullscreenToggle.textContent = text;
    clearTimeout(fsNoteTimer); fsNoteTimer = setTimeout(updateFullscreenToggle, 1500);
  }
  function fsEnter(target) {
    var el = target || document.documentElement;
    if (!el.requestFullscreen) { fsNote('전체 화면 미지원'); return; }
    var p; try { p = el.requestFullscreen(); } catch (e) { p = Promise.reject(e); }
    if (p && p.then) p.then(function() { setTimeout(function() { if (document.fullscreenElement) fsHeight = window.innerHeight; updateFullscreenToggle(); }, 300); },
      function() { fsNote('전체 화면을 사용할 수 없음'); });
  }
  fullscreenToggle.addEventListener('click', function() {
    if (!document.fullscreenElement) { fsEnter(); return; }
    if (fsStale()) {                                   // 풀려 있는데 브라우저는 전체 화면이라고 답함 → 그 기억을 지우고 다시 켠다 (다른 요소로 — 같은 요소면 '이미 전체 화면'이라 넘어갈 수 있다)
      var again = function() { fsEnter(document.fullscreenElement === document.documentElement ? document.body : document.documentElement); };
      var q; try { q = document.exitFullscreen(); } catch (e) { q = null; }
      if (q && q.then) q.then(again, again); else again();
      return;
    }
    var changed = false, mark = function() { changed = true; };
    document.addEventListener('fullscreenchange', mark, { once: true });
    var r; try { r = document.exitFullscreen(); } catch (e) { r = null; }
    if (r && r.catch) r.catch(function() {});
    setTimeout(function() {                            // 끄기가 먹지 않았다 (알림이 없고 여전히 전체 화면이라고 답함) → 풀려 있던 것으로 보고 다시 켠다
      document.removeEventListener('fullscreenchange', mark);
      if (!changed && document.fullscreenElement) fsEnter(document.fullscreenElement === document.documentElement ? document.body : document.documentElement);
      else updateFullscreenToggle();
    }, 500);
  });
  document.addEventListener('fullscreenchange', function() {
    if (document.fullscreenElement) setTimeout(function() { if (document.fullscreenElement) fsHeight = window.innerHeight; updateFullscreenToggle(); }, 300);
    else fsHeight = 0;
    updateFullscreenToggle();
  });
  document.addEventListener('fullscreenerror', updateFullscreenToggle);
  window.addEventListener('resize', updateFullscreenToggle);
  document.addEventListener('visibilitychange', updateFullscreenToggle);

  // 세션 HUD 표시 설정 (처음에는 끔, 이후 선택은 기기에 저장) — 개발 탭의 조작: 개발 공간(?dev)이 아니면 늘 끔 (저장된 값도 보지 않음)
  var sessionHudToggle = document.getElementById('sessionHudToggle');
  var sessionHud = document.getElementById('encHud');
  var showSessionHud = false;
  try { showSessionHud = M.dev && localStorage.getItem('moai-session-hud') === 'true'; } catch (e) {}
  function updateSessionHudToggle() {
    sessionHud.classList.toggle('hud-disabled', !showSessionHud);
    sessionHudToggle.textContent = '세션 HUD: ' + (showSessionHud ? 'ON' : 'OFF');
    sessionHudToggle.classList.toggle('active', showSessionHud);
    sessionHudToggle.setAttribute('aria-pressed', showSessionHud ? 'true' : 'false');
  }
  sessionHudToggle.addEventListener('click', function() {
    showSessionHud = !showSessionHud;
    updateSessionHudToggle();
    try { localStorage.setItem('moai-session-hud', String(showSessionHud)); } catch (e) {}
  });
  updateSessionHudToggle();

  // 개발 탭: 비트 · 곡 모두 열기 (js/bgm.js M.beats.unlockAll) · 이탈 방어 켜고 끄기 (js/leave-guard.js — 개발 공간에선 처음에 꺼져 있음)
  var devUnlock = document.getElementById('devUnlockBeats'), devGuard = document.getElementById('devLeaveGuard');
  function updateDevGuard() { if (devGuard && M.leaveGuard) { devGuard.textContent = '이탈 방어: ' + (M.leaveGuard.active() ? 'ON' : 'OFF'); devGuard.classList.toggle('active', M.leaveGuard.active()); } }
  if (devUnlock) devUnlock.addEventListener('click', function() { if (M.beats && M.beats.unlockAll) M.beats.unlockAll(); });
  if (devGuard) devGuard.addEventListener('click', function() { if (!M.leaveGuard) return; M.leaveGuard.set(!M.leaveGuard.active()); updateDevGuard(); });
  updateDevGuard();

  // 수렴 윤곽의 모양 넘기기 (rhythm/approach.js — 원 → 사각 → 끔)
  var devApproach = document.getElementById('devApproach');
  if (devApproach) devApproach.addEventListener('click', function() {
    var A = window.G && window.G.approach, order = ['circle', 'square', 'off'], names = { circle: '원', square: '사각', off: '끔' };
    if (!A) return;
    A.set(order[(order.indexOf(A.shape()) + 1) % order.length]);
    devApproach.textContent = '수렴 윤곽: ' + names[A.shape()];
    devApproach.classList.toggle('active', A.shape() !== 'off');
  });
  if (devApproach) devApproach.classList.add('active');
  // 가이드의 모양 넘기기 (rhythm/guide.js — 중심선 ↔ 예전 막대)
  var devGuide = document.getElementById('devGuideStyle');
  if (devGuide) devGuide.addEventListener('click', function() {
    var G2 = window.G;
    if (!G2 || !G2.guideStyle) return;
    devGuide.textContent = '가이드: ' + (G2.guideStyle(G2.guideStyle() === 'line' ? 'bar' : 'line') === 'line' ? '중심선' : '막대');
  });

  // 악세사리 편집기 (js/accessory-editor.js — 주소에 accessory가 있을 때만 로드된다): 그 주소로 다시 연다 (이미 열려 있으면 닫는다)
  var devAccessory = document.getElementById('devAccessory');
  if (devAccessory) {
    var accOn = /[?&]accessory\b/.test(location.search);
    devAccessory.textContent = accOn ? '악세사리 편집기 닫기' : '악세사리 편집기 열기';
    devAccessory.classList.toggle('active', accOn);
    devAccessory.addEventListener('click', function() {
      if (M.leaveGuard) M.leaveGuard.set(false);
      location.search = accOn ? location.search.replace(/[?&]accessory\b/, '').replace(/^&/, '?') : location.search + (location.search ? '&' : '?') + 'accessory';
    });
  }

  // 진행 마커의 맥박 하트 색 넘기기 (rhythm/guide.js — 녹색 ↔ 흰색)
  var devMarkerHeart = document.getElementById('devMarkerHeart');
  if (devMarkerHeart) devMarkerHeart.addEventListener('click', function() {
    var G2 = window.G;
    if (!G2 || !G2.guideHeartColor) return;
    devMarkerHeart.textContent = '마커 하트: ' + (G2.guideHeartColor(G2.guideHeartColor() === 'green' ? 'white' : 'green') === 'green' ? '녹색' : '흰색');
  });

  // ── 드로어 탭 전환 (녹음 / 비트 / 설정 + 개발 — 개발 공간(?dev)에서만 탭이 보임) ──
  var drawerTabs = document.querySelectorAll('.drawer-tab');
  var drawerPages = {
    sample:  document.getElementById('drawerSample'),
    beat:    document.getElementById('drawerBeat'),
    config:  document.getElementById('drawerConfig'),
    dev:     document.getElementById('drawerDev'),
  };
  if (M.dev) document.getElementById('drawerDevTab').classList.remove('hidden');
  // 세션 중(진입 대기 포함)에는 비트 · 녹음 탭을 건드릴 수 없다 — 보이기는 하되 눌리지 않는다 (style.css .session-locked)
  var SESSION_LOCKED = ['beat', 'sample'];
  document.addEventListener('moai:session', function(e) {
    SESSION_LOCKED.forEach(function(k) { if (drawerPages[k]) drawerPages[k].classList.toggle('session-locked', !!(e.detail && e.detail.active)); });
  });

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
