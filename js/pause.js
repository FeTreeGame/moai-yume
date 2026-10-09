// 일시 정지 — 화면을 떠나면 멈추고, 돌아와서 한 번 눌러야 이어진다
//   왜: 화면이 가려져도 소리 장치는 계속 돌아 곡이 울렸고 (모바일에서 홈 화면으로 나가도), 그리기 루프는 멈추는데 소리의 시계는 계속 가서
//       세션 중에 떠났다 돌아오면 그 사이의 차례가 전부 놓친 것으로 처리됐다
//   어떻게: 이 게임의 리듬 · 세션 · 곡은 모두 소리 장치의 시계 하나를 따른다 (Conductor) → 그 장치를 멈추면(suspend) 전부가 같은 자리에서 멈추고,
//       다시 돌리면(resume) 그 자리에서 이어진다. 이미 예약해 둔 소리는 소리의 시각에 걸려 있어 밀리거나 겹치지 않는다
//   떠남 = 화면이 가려짐 ('visibilitychange' — 탭 전환 · 최소화 · 모바일의 홈 화면 · 다른 앱). 창만 바꾼 것(화면은 보임)은 떠남으로 치지 않는다
//   돌아옴 = 덮개(PAUSE)가 떠 있다 — 누르거나 아무 키나 누르면 이어진다 (그 입력은 연주로 들어가지 않는다. 모바일은 소리를 다시 켤 때 손의 입력을 요구하기도 한다)
//   멈춘 동안: M.audioHold = true — 소리 장치를 깨우는 곳(M.ensureCtx · G.ensureCtx)과 효과음(M.sfx.play)이 이것을 보고 가만히 있는다
//       (멈춘 사이에 벽시계 타이머로 울리려던 소리가 쌓였다가 돌아올 때 한꺼번에 나오지 않게)
//   소리 장치가 아직 없거나 돌고 있지 않으면 (첫 입력 전) 아무것도 하지 않는다
(function() {
  const M = window.Moai;
  if (!M || typeof document === 'undefined' || !document.body) return;
  const el = document.createElement('div');
  el.className = 'pause-cover hidden';
  el.innerHTML = '<div class="pause-title">PAUSE</div><div class="pause-hint">TAP TO RESUME</div>';
  document.body.appendChild(el);

  const ctx = function() { return M.ctx || (window.G && window.G.actx) || null; };
  let paused = false, resuming = false;

  function pause() {
    const c = ctx();
    if (paused || !c || c.state !== 'running') return;
    paused = true; M.audioHold = true;
    if (M.releaseAllInput) M.releaseAllInput();             // 누르고 있던 입력은 소리 없이 놓는다
    try { c.suspend(); } catch (e) {}
    el.classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('moai:pause', { detail: { paused: true } }));
  }
  function resume() {
    const c = ctx();
    if (!paused || resuming) return;
    resuming = true;
    const done = function() {
      resuming = false; paused = false; M.audioHold = false;
      el.classList.add('hidden');
      document.dispatchEvent(new CustomEvent('moai:pause', { detail: { paused: false } }));
    };
    if (!c || !c.resume) { done(); return; }
    M.audioHold = false;                                    // 깨우는 것을 허락한 뒤에 깨운다
    c.resume().then(done, function() { resuming = false; M.audioHold = true; });   // 깨우지 못했으면 덮개를 둔다 (다시 누른다)
  }

  document.addEventListener('visibilitychange', function() { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);

  // 덮개: 누르면 이어진다 — 그 입력이 아래(캔버스 · 조작 버튼)로 가지 않게 여기서 끝낸다
  ['pointerdown', 'mousedown', 'touchstart'].forEach(function(t) { el.addEventListener(t, function(e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }, { passive: false }); });
  ['pointerup', 'click', 'touchend'].forEach(function(t) { el.addEventListener(t, function(e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); resume(); }, { passive: false }); });
  // 키: 멈춘 동안의 첫 키는 이어 가기 (연주 · 단축키로 가지 않는다)
  window.addEventListener('keydown', function(e) { if (!paused) return; e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) resume(); }, true);
  window.addEventListener('keyup', function(e) { if (paused) e.stopImmediatePropagation(); }, true);

  // ── 시작 덮개 (TAP TO START): 캔버스가 처음 드러났을 때 그 위에 — 투명, 글자만 ──
  //   왜: 브라우저는 손의 입력이 있기 전에는 소리를 내지 않는다. 입력 없이 곧바로 시작했다가 소리가 뚝 끊긴 듯한 경험을 피한다 —
  //       첫 입력을 '시작'으로 받아 소리 장치를 켜 두고, 그 다음 입력부터 연주로 받는다 (첫 입력은 연주로 들어가지 않는다)
  //   글자는 캔버스의 한가운데 (.start-cover — 누름을 받지 않는다), 누름은 화면 전체가 받는다 (.start-catch — 구석의 조작 버튼 · 드로어 단추까지 덮는다)
  //     화면 어디든 첫 탭(눌렀다 뗌)은 시작으로만 쓰인다 — 브라우저가 소리를 허락하는 것도 닿는 순간이 아니라 떼는 순간이다
  //     (전에는 캔버스만 덮었다 — 손가락으로 조작 버튼부터 누르면 소리 장치가 켜지지 않은 채 덮개가 남았다)
  //   걷힐 때: 누름은 바로 풀고 (이어서 치는 입력이 먹히게), 글자는 START.fade 동안 옅어지며 사라진다
  //   뜨는 때 = 그림을 처음 그린 순간 ('moai:main-rendered' — js/sprite.js가 로딩 덮개를 걷는 때)
  const box = document.querySelector('.sprite-box');
  const START = { fade: 300 };          // 글자가 사라지는 길이 (ms — style.css .start-cover의 전환과 같은 값)
  let startEl = null, catchEl = null, starting = false;
  function startHide() {
    if (!startEl || !starting) return;
    starting = false;
    if (catchEl) catchEl.classList.add('hidden');
    startEl.classList.add('leaving');
    setTimeout(function() { startEl.classList.add('hidden'); }, START.fade + 50);
  }
  function startShow() {
    if (!box || startEl) return;      // 소리 장치가 이미 돌고 있어도 띄운다 — 자주 찾은 사이트는 PC의 브라우저가 입력 없이도 소리를 허락해, 그 경우 덮개가 아예 뜨지 않았다. 시작은 언제나 한 번 누르는 것으로
    startEl = document.createElement('div');
    startEl.className = 'start-cover';
    startEl.innerHTML = '<div class="start-hint">TAP TO START</div>';
    box.appendChild(startEl); starting = true;
    catchEl = document.createElement('div');
    catchEl.className = 'start-catch';
    document.body.appendChild(catchEl);
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function(t) { catchEl.addEventListener(t, function(e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }, { passive: false }); });
    ['pointerup', 'click', 'touchend'].forEach(function(t) { catchEl.addEventListener(t, function(e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); start(); }, { passive: false }); });
  }
  function start() {
    if (!starting) return;
    try { if (M.ensureCtx) M.ensureCtx(); if (window.G && window.G.ensureCtx) window.G.ensureCtx(); } catch (e) {}
    startHide();
    document.dispatchEvent(new CustomEvent('moai:start'));
  }
  document.addEventListener('moai:main-rendered', startShow);
  const lc = document.getElementById('spriteLoadingCover');
  if (lc && lc.classList.contains('dismissed')) startShow();           // 이미 드러나 있었으면 바로
  window.addEventListener('keydown', function(e) { if (!starting || paused) return; e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) start(); }, true);   // 첫 키도 시작으로

  M.pause = { on: function() { return paused; }, pause: pause, resume: resume, start: start, starting: function() { return starting; } };
})();
