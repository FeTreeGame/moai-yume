// 공유 상태 네임스페이스
window.Moai = {
  // Audio
  ctx: null,

  // Input
  tapThreshold: 150,


  // DOM (populated by main.js)
  el: {},

  ensureCtx: function() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
};
