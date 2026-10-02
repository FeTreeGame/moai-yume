// 입력 처리: 마우스/터치/키보드 → 원본 에셋 재생
//   두 방식이 늘 함께 열려 있다 (모드 구분 없음): 단일 = 캔버스·단일 영역·C (짧게 떽 / 길게 뚜우엉), 분리 = 떽·뚜우엉 버튼·Z·X
//   모아이 입력은 한 번에 하나 — 방식과 주체를 통틀어 먼저 누른 쪽만 받고, 누른 주체의 뗌으로만 풀린다
//   (뚜~ 루프 핸들이 두 방식 공용 — original.js — 겹치면 앞 루프가 고아가 된다)
(function() {
  var M = window.Moai;

  // === 누른 주체 식별: 홀드는 누른 주체의 뗌으로만 릴리즈 ===
  // 'key' | 'mouse' | 't<identifier>' (터치는 손가락별 번호)
  function pressOwner(e) {
    if (e.changedTouches) return 't' + e.changedTouches[0].identifier;
    return e.type.indexOf('key') === 0 ? 'key' : 'mouse';
  }
  function isOwnerUp(e, owner) {
    if (e.changedTouches) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if ('t' + e.changedTouches[i].identifier === owner) return true;
      }
      return false;
    }
    return (e.type.indexOf('key') === 0 ? 'key' : 'mouse') === owner;
  }

  // === 원본 단일 영역 (press/release → 떽/뚜우엉 분기) ===
  var origDown = false;
  var origOwner = null;
  // 대리조작(AUTO) 중에는 수동 누름 무시 (원본 N모드 동일) — 원샷/루프 핸들 충돌 방지
  function autoplayLocked() { return !!(M.isAutoplay && M.isAutoplay()); }

  function onOrigDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (origDown || origHoldDown || autoplayLocked()) return;   // 한 번에 하나 (분리 뚜우엉 중이면 무시)
    origDown = true;
    origOwner = pressOwner(e);
    M.el.playOriginal.classList.add('active');
    M.originalOnPress();
  }
  function onOrigUp(e) {
    if (!origDown || !isOwnerUp(e, origOwner)) return;
    e.preventDefault();
    origDown = false;
    M.el.playOriginal.classList.remove('active');
    emitRelease(e, origOwner);   // 뗀 위치 먼저 — 이어지는 소리 알림(떽/엉)과 한 쌍 (field-actors.js)
    M.originalOnRelease();
  }
  // 모아이 입력(단일)을 뗀 위치 알림 'moai:press-release' { clientX, clientY } — 포인터(터치·마우스)로 뗐을 때만 (키는 위치 없음)
  //   해석은 듣는 쪽: field-actors.js — 캔버스 위에서 뗐고 소리가 떽이면 그 지점의 인스턴스와 상호작용
  function emitRelease(e, owner) {
    var pt = null;
    if (e.changedTouches) {
      for (var i = 0; i < e.changedTouches.length; i++) if ('t' + e.changedTouches[i].identifier === owner) pt = e.changedTouches[i];
    } else if (e.type.indexOf('mouse') === 0) {
      pt = e;
    }
    if (!pt || typeof CustomEvent !== 'function' || !document.dispatchEvent) return;   // 키 / 알림을 받을 곳이 없는 환경
    document.dispatchEvent(new CustomEvent('moai:press-release', { detail: { clientX: pt.clientX, clientY: pt.clientY } }));
  }

  // === 분리 버튼: 떽 (즉발) ===
  function onOrigTapDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (origHoldDown || origDown || autoplayLocked()) return;  // 뚜우엉·단일 누름 중엔 떽 무시 (릴리즈 필수)
    M.el.playOrigTap.classList.add('active');
    M.originalTapPress();
  }
  function onOrigTapUp(e) {
    e.preventDefault();
    M.el.playOrigTap.classList.remove('active');
  }

  // === 분리 버튼: 뚜우~엉 (홀드) ===
  var origHoldDown = false;
  var holdOwner = null;
  function onOrigHoldDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (origHoldDown || origDown || autoplayLocked()) return;   // 한 번에 하나 (단일 누름 중이면 무시)
    origHoldDown = true;
    holdOwner = pressOwner(e);
    M.el.playOrigHold.classList.add('active');
    M.originalHoldPress();
  }
  function onOrigHoldUp(e) {
    if (!origHoldDown || !isOwnerUp(e, holdOwner)) return;
    e.preventDefault();
    origHoldDown = false;
    M.el.playOrigHold.classList.remove('active');
    M.originalHoldRelease();
  }

  // === 포커스 이탈: release가 유실되므로 홀드를 무음 강제 해제 ===
  function releaseAllSilently() {
    M.el.playOrigTap.classList.remove('active');  // Z 누른 채 이탈 시 잔류 방지
    if (!origDown && !origHoldDown) return;
    origDown = false;
    origHoldDown = false;
    M.el.playOriginal.classList.remove('active');
    M.el.playOrigHold.classList.remove('active');
    M.forceCleanup();
    if (M.body) M.body.act('idle');               // 지금 몸 (빙의 — js/possess.js)
    else if (M.spriteIdle) M.spriteIdle();
  }

  M.releaseAllInput = releaseAllSilently;   // 입력 관문(gate.js)이 잠글 때 — 눌려 있던 입력을 무음으로 놓기

  // === 뗀 것처럼 놓기: 눌려 있던 모아이 입력을 원래 뗌 경로로 끝낸다 (소리 = 떽/엉 분기 그대로, 뗀 위치 알림은 없음) ===
  //   어택은 반드시 릴리즈로 끝난다 — 홀드 미션 게이지가 찼을 때 (연결표 field-events.js). 누른 주체가 풀리므로 이후 실제 손 떼기는 무시
  function releaseAsLifted() {
    if (origDown) {
      origDown = false;
      M.el.playOriginal.classList.remove('active');
      M.originalOnRelease();
    }
    if (origHoldDown) {
      origHoldDown = false;
      M.el.playOrigHold.classList.remove('active');
      M.originalHoldRelease();
    }
  }
  M.releaseInput = releaseAsLifted;

  M.initInput = function() {
    window.addEventListener('blur', releaseAllSilently);
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) releaseAllSilently();
    });

    // === 단일 영역 ===
    var origBtn = M.el.playOriginal;
    if (origBtn) {
      origBtn.addEventListener('mousedown', onOrigDown);
      window.addEventListener('mouseup', function(e) {
        if (origDown) onOrigUp(e);
      });
      origBtn.addEventListener('touchstart', onOrigDown, { passive: false });
      window.addEventListener('touchend', function(e) {
        if (origDown) onOrigUp(e);
      });
      window.addEventListener('touchcancel', function(e) {
        if (origDown) onOrigUp(e);
      });
    }

    // === 캔버스: 단일 영역과 동일 (release는 위 window 리스너가 처리 — 뗀 위치 알림 포함) ===
    var canvasBox = M.el.spriteBox;
    if (canvasBox) {
      var onCanvasDown = function(e) { onOrigDown(e); };
      canvasBox.addEventListener('mousedown', onCanvasDown);
      canvasBox.addEventListener('touchstart', onCanvasDown, { passive: false });
    }

    // === 분리: 떽 ===
    var origTapBtn = M.el.playOrigTap;
    if (origTapBtn) {
      origTapBtn.addEventListener('mousedown', onOrigTapDown);
      origTapBtn.addEventListener('mouseup', onOrigTapUp);
      origTapBtn.addEventListener('mouseleave', onOrigTapUp);
      origTapBtn.addEventListener('touchstart', onOrigTapDown, { passive: false });
      origTapBtn.addEventListener('touchend', onOrigTapUp, { passive: false });
      origTapBtn.addEventListener('touchcancel', onOrigTapUp, { passive: false });
    }

    // === 분리: 뚜우~엉 ===
    var origHoldBtn = M.el.playOrigHold;
    if (origHoldBtn) {
      origHoldBtn.addEventListener('mousedown', onOrigHoldDown);
      window.addEventListener('mouseup', function(e) {
        if (origHoldDown) onOrigHoldUp(e);
      });
      origHoldBtn.addEventListener('touchstart', onOrigHoldDown, { passive: false });
      window.addEventListener('touchend', function(e) {
        if (origHoldDown) onOrigHoldUp(e);
      });
      window.addEventListener('touchcancel', function(e) {
        if (origHoldDown) onOrigHoldUp(e);
      });
    }

    // === 키보드 ===
    document.addEventListener('keydown', function(e) {
      var map = KEY_MAP[e.code];
      if (!map || e.repeat) return;
      e.preventDefault();
      map.down(e);
    });
    document.addEventListener('keyup', function(e) {
      var map = KEY_MAP[e.code];
      if (!map) return;
      e.preventDefault();
      if (map.up) map.up(e);  // 각 핸들러가 자체 상태(누른 주체)로 가드
    });
  };

  // 키 맵핑: e.code → 드로어 입력 영역 1:1 대응
  var KEY_MAP = {
    KeyC:  { down: onOrigDown,     up: onOrigUp },     // 단일 (짧게 떽 / 길게 뚜우엉)
    KeyZ:  { down: onOrigTapDown,  up: onOrigTapUp },  // 떽
    KeyX:  { down: onOrigHoldDown, up: onOrigHoldUp }, // 뚜우엉
  };
})();
