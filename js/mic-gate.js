// 마이크 권한과 전체 화면: 권한 창이 전체 화면 안에서 뜨지 않게 한다
//   왜: 브라우저는 권한 창을 띄울 때 전체 화면에서 강제로 빠져나오게 하는데, 그 뒤로 '아직 전체 화면'이라고 답하는 어긋난 상태가 남아
//       그 탭에서 전체 화면이 죽는 일이 있었다 (안드로이드 크롬 — 페이지 코드로는 그 상태를 고칠 수 없다). 창이 전체 화면 밖에서 뜨면 생기지 않는다
//   권한의 상태 (state): granted 허용됨 · denied 거절됨 · prompt 묻기 전 (요청하면 창이 뜬다) · unknown 모름 (상태를 묻지 못하는 브라우저) · none 마이크 기능 없음
//     브라우저에 묻는다 (navigator.permissions — 창은 뜨지 않는다). 불러올 때 한 번 묻고, 바뀌면 알림으로 따라간다 → 누른 순간에는 기다리지 않고 답한다
//   쓰는 곳: 녹음 시작 (js/recorder/recorder.js — 전체 화면 중인데 창이 뜰 것이면 전체 화면을 먼저 끈다). 전체 화면에 들어갈 때는 묻지 않는다
(function() {
  const M = window.Moai;
  const MIC = { exitWait: 600, settle: 150 };   // 전체 화면이 꺼지기를 기다리는 한도 · 꺼진 뒤 요청까지의 틈 (ms)
  const has = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let state = has ? 'unknown' : 'none', got = false;   // got = 이번 방문에서 마이크를 받은 적이 있다 (상태를 묻지 못하는 브라우저에서 — 두 번째부터는 창이 뜨지 않는다)
  function refresh() {
    if (!has || !navigator.permissions || !navigator.permissions.query) return Promise.resolve(state);
    let p; try { p = navigator.permissions.query({ name: 'microphone' }); } catch (e) { return Promise.resolve(state); }
    return p.then(function(st) { state = st.state; st.onchange = function() { state = st.state; }; return state; }, function() { return state; });
  }
  // 요청하면 창이 뜰 것인가
  function willPrompt() { return state === 'prompt' || (state === 'unknown' && !got); }
  // 마이크를 요청하기 직전: 전체 화면 중이고 창이 뜰 것이면 전체 화면을 먼저 끈다 (꺼진 뒤에 풀린다). 아니면 바로 풀린다
  function clearFullscreen() {
    if (!document.fullscreenElement || !document.exitFullscreen || !willPrompt()) return Promise.resolve(false);
    return new Promise(function(done) {
      let over = false;
      const end = function() { if (over) return; over = true; document.removeEventListener('fullscreenchange', end); setTimeout(function() { done(true); }, MIC.settle); };
      document.addEventListener('fullscreenchange', end);
      setTimeout(end, MIC.exitWait);                 // 알림이 오지 않아도 기다리다 넘어간다
      try { const r = document.exitFullscreen(); if (r && r.catch) r.catch(function() {}); } catch (e) {}
    });
  }
  refresh();
  M.mic = {
    state: function() { return state; },
    willPrompt: willPrompt,
    clearFullscreen: clearFullscreen,
    mark: function() { got = true; refresh(); },      // 마이크를 받았다 (녹음 쪽이 알린다)
  };
})();
