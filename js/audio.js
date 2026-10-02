// 오디오 유틸: AudioContext 관리 + 강제 정리
(function() {
  var M = window.Moai;

  // 모든 홀드 상태 강제 정리 (포커스 이탈 시 input.js에서 호출)
  M.forceCleanup = function() {
    if (M.originalCleanup) M.originalCleanup();
  };
})();
