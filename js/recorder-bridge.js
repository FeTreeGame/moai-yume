// ================================================
// recorder-bridge.js — recorder 모듈을 index.html에 연결하는 브릿지
// recorder.js보다 먼저 로드되어 actx를 사전 세팅한다.
// 로드 순서: main.js → recorder-bridge.js → recorder/*.js
// ================================================
(function() {
  var M = window.Moai;

  // Moai.ctx가 아직 없으면 생성만 (resume은 첫 인터랙션에서)
  if (!M.ctx) M.ctx = new AudioContext();

  // recorder.js가 로드될 때 initAudio()에서 Moai.ctx를 찾아 actx로 사용
  // (recorder.js initAudio에 window.Moai.ctx 분기 이미 추가됨)

  // 녹음 탭이 소리를 내거나 녹음하는 동안 게임의 소리를 잠깐 내린다 — 음량만 (BGM · 필드는 멈추지 않고 그대로 흐른다)
  //   알림 'moai:recorder' { busy } (recorder.js — 듣는 중 · 마이크 대기 · 카운트인 · 녹음 중)
  //   channels = 내릴 채널 (녹음에 섞이면 안 되는 것 · 들을 때 겹치는 것 — 내 목소리와 녹음 듣기는 그대로)
  //   out · back = 내릴 때 · 되돌릴 때 걸리는 초, wait = 끝난 뒤 되돌리기까지 기다리는 초 (이어서 또 들을 때 깜빡이지 않게)
  var DUCK = { channels: ['npc', 'bgm', 'sfx'], out: 0.15, back: 0.4, wait: 0.8 };
  var duckTimer = null;
  document.addEventListener('moai:recorder', function(e) {
    if (!M.mixer || !M.mixer.duck) return;
    clearTimeout(duckTimer); duckTimer = null;
    if (e.detail && e.detail.busy) M.mixer.duck(DUCK.channels, true, DUCK.out);
    else duckTimer = setTimeout(function() { M.mixer.duck(DUCK.channels, false, DUCK.back); }, DUCK.wait * 1000);
  });

  // Moai.ctx를 전역 actx로도 노출 (recorder 모듈이 전역 actx 참조)
  window.actx = M.ctx;
})();
