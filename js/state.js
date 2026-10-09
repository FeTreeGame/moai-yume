// 공유 상태 네임스페이스
window.Moai = {
  // Audio
  ctx: null,

  // Input
  tapThreshold: 150,


  // DOM (populated by main.js)
  el: {},

  // 개발 공간: 주소에 ?dev 가 있을 때만 켜짐 — 주소를 읽는 곳은 여기 하나. 개발용 조작(드로어 '개발' 탭 · 시험용 키)은 이 값만 본다
  //   쓰는 곳: main.js (개발 탭 · 세션 HUD) · field-progress.js (M 키) · field-actors.js (F8). 게임 규칙은 이 값으로 바꾸지 않는다
  dev: typeof location !== 'undefined' && /[?&]dev\b/.test(location.search || ''),

  // 기기의 조작 수단 — 판별하는 곳은 여기 하나. 브라우저 이름으로 추측하지 않는다
  //   touch = 손가락으로 누를 수 있는가 / mouse = 마우스 · 키보드가 있는가 (터치스크린 노트북은 둘 다 참)
  //   handheld = 손가락만 쓰는 기기 (touch이고 mouse가 아님 — 폰 · 태블릿). 마우스가 있으면 PC로 본다
  //     쓰는 곳: style.css — 드로어의 커스텀 스크롤 막대는 handheld에서만 보인다 (PC는 막대 없이 휠) / 조작 버튼의 키 표시는 mouse에서만
  //   같은 값을 <html>의 클래스(has-touch · has-mouse · handheld)로 붙인다 — CSS와 JS가 같은 답을 본다
  //   조작 수단이 바뀌면(마우스를 꽂음 · 브라우저의 기기 모사를 켬) 다시 판별한다 — 불러온 순간에 묶이지 않는다
  device: (function() {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var mq = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
    var d = {};
    function update() {
      d.touch = ('ontouchstart' in window) || nav.maxTouchPoints > 0;
      d.mouse = !!(mq && mq.matches);
      d.handheld = d.touch && !d.mouse;
      var root = typeof document !== 'undefined' && document.documentElement;
      if (root && root.classList) ['touch', 'mouse'].forEach(function(k) { root.classList.toggle('has-' + k, d[k]); }), root.classList.toggle('handheld', d.handheld);
    }
    update();
    if (mq && mq.addEventListener) mq.addEventListener('change', update);
    return d;
  })(),

  ensureCtx: function() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended' && !this.audioHold) this.ctx.resume();   // 일시 정지 중(js/pause.js)에는 깨우지 않는다
    return this.ctx;
  }
};
