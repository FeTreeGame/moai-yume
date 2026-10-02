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

  // Moai.ctx를 전역 actx로도 노출 (recorder 모듈이 전역 actx 참조)
  window.actx = M.ctx;
})();
