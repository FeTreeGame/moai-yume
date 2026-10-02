// 커스텀 스크롤 트랙: .scroll-track 터치/드래그로 .drawer-scroll-content의 scrollTop 제어
// 콘텐츠 영역은 touch-action: none (터치 스크롤 차단), 스크롤 트랙만 조작 가능
(function() {
  function initScrollTrack(parent) {
    var track = parent.querySelector('.scroll-track');
    var thumb = track ? track.querySelector('.scroll-thumb') : null;
    if (!track || !thumb) return;
    var content = parent.querySelector('.drawer-scroll-content');
    if (!content) return;

    var dragging = false;
    var dragStartY = 0;
    var dragStartScroll = 0;

    function updateThumb() {
      var sh = content.scrollHeight;
      var ch = content.clientHeight;
      var th = track.clientHeight;
      if (sh <= ch) {
        // 스크롤 불필요 → 숨김
        thumb.style.display = 'none';
        return;
      }
      thumb.style.display = '';
      var ratio = ch / sh;
      var thumbH = Math.max(32, Math.round(th * ratio));
      var scrollRatio = content.scrollTop / (sh - ch);
      var thumbTop = Math.round(scrollRatio * (th - thumbH));
      thumb.style.height = thumbH + 'px';
      thumb.style.top = thumbTop + 'px';
    }

    // 콘텐츠 변화 감지
    var observer = new MutationObserver(updateThumb);
    observer.observe(content, { childList: true, subtree: true, attributes: true });

    // 리사이즈 시
    window.addEventListener('resize', updateThumb);

    // 초기화
    requestAnimationFrame(updateThumb);

    // 외부에서 갱신 호출 가능하도록 저장
    parent._scrollTrackUpdate = updateThumb;

    // 트랙 클릭: 해당 위치로 점프
    track.addEventListener('mousedown', onTrackDown);
    track.addEventListener('touchstart', onTrackDown, { passive: false });

    function onTrackDown(e) {
      e.preventDefault();
      e.stopPropagation();
      var y = getEventY(e) - track.getBoundingClientRect().top;
      var th = track.clientHeight;
      var thumbH = thumb.offsetHeight;
      var sh = content.scrollHeight;
      var ch = content.clientHeight;
      if (sh <= ch) return;

      // 썸 위에서 시작하면 드래그 모드
      var thumbTop = thumb.offsetTop;
      if (y >= thumbTop && y <= thumbTop + thumbH) {
        dragging = true;
        dragStartY = y;
        dragStartScroll = content.scrollTop;
        thumb.classList.add('dragging');
        bindDragEvents();
        return;
      }

      // 트랙 빈 영역 클릭 → 해당 비율로 점프
      var ratio = (y - thumbH / 2) / (th - thumbH);
      ratio = Math.max(0, Math.min(1, ratio));
      content.scrollTop = ratio * (sh - ch);
      updateThumb();

      // 점프 후 드래그 시작
      dragging = true;
      dragStartY = y;
      dragStartScroll = content.scrollTop;
      thumb.classList.add('dragging');
      bindDragEvents();
    }

    function onDragMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var y = getEventY(e) - track.getBoundingClientRect().top;
      var dy = y - dragStartY;
      var th = track.clientHeight;
      var thumbH = thumb.offsetHeight;
      var sh = content.scrollHeight;
      var ch = content.clientHeight;
      var scrollRange = sh - ch;
      var trackRange = th - thumbH;
      if (trackRange <= 0) return;
      content.scrollTop = dragStartScroll + (dy / trackRange) * scrollRange;
      updateThumb();
    }

    function onDragEnd(e) {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('dragging');
      unbindDragEvents();
    }

    function bindDragEvents() {
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('touchend', onDragEnd);
      window.addEventListener('touchcancel', onDragEnd);
    }

    function unbindDragEvents() {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
      window.removeEventListener('touchcancel', onDragEnd);
    }

    function getEventY(e) {
      if (e.touches && e.touches.length > 0) return e.touches[0].clientY;
      if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
      return e.clientY;
    }

    // content 스크롤 이벤트 (마우스 휠 등)
    content.addEventListener('scroll', updateThumb);

    // 마우스 휠은 콘텐츠에서도 허용 (touch-action: none은 터치만 차단)
    content.addEventListener('wheel', function(e) {
      content.scrollTop += e.deltaY;
      e.preventDefault();
      updateThumb();
    }, { passive: false });
  }

  // PC 판별: 터치 불가 디바이스
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // .scroll-track을 가진 모든 컨테이너에 적용
  function initAll() {
    var tracks = document.querySelectorAll('.scroll-track');
    for (var i = 0; i < tracks.length; i++) {
      var parent = tracks[i].parentElement;
      if (!parent) continue;
      if (!isTouch) {
        // PC: 커스텀 트랙 숨기고 네이티브 스크롤 복원
        tracks[i].style.display = 'none';
        var content = parent.querySelector('.drawer-scroll-content');
        if (content) {
          content.style.overflowY = 'auto';
          content.style.touchAction = '';
        }
        continue;
      }
      if (!parent._scrollTrackInit) {
        initScrollTrack(parent);
        parent._scrollTrackInit = true;
      }
    }
  }

  // DOMContentLoaded에서 자동 초기화하지 않음 — main.js의 calcLayout() 이후 호출 필요
  window.initScrollTracks = initAll;

  // 기존 트랙의 thumb 크기/위치 갱신 (탭 전환 등 레이아웃 변경 후 호출)
  window.updateScrollTracks = function() {
    var tracks = document.querySelectorAll('.scroll-track');
    for (var i = 0; i < tracks.length; i++) {
      var parent = tracks[i].parentElement;
      if (parent && parent._scrollTrackUpdate) {
        parent._scrollTrackUpdate();
      }
    }
  };
})();
