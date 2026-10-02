// UI 헬퍼: 피드백 텍스트
(function() {
  var M = window.Moai;

  M.ui = {
    showFeedback: function(text, cls) {
      var fb = M.el.feedback;
      fb.textContent = text;
      fb.className = 'feedback ' + (cls || '');
      clearTimeout(fb._timer);
      fb._timer = setTimeout(function() {
        fb.innerHTML = '&nbsp;';
        fb.className = 'feedback';
      }, 1200);
    }
  };
})();
