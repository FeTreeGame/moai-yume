// 이펙트 켜고 끄기 (설정 탭 '디스플레이' — #fxOptions): 연출의 묶음 스위치(js/fx-rules.js SW)를 플레이어의 버튼 셋으로 묶는다
//   분위기 = 빛줄기 + 색 필터 / 타격감 = 파티클 + 반응 + 막대 이펙트 / 카메라 = 카메라 + 테두리
//   분위기는 손가락만 쓰는 기기(M.device.handheld — js/state.js)에서 끈 채 고정 · 버튼 없음 (style.css)
//     왜: 목표 기기에서 잰 결과 전력의 대부분이 이 두 층이었다 (소스 저장소 docs/RENDER-COST.md)
//   고른 값은 기기에 기억한다 (OPT.key). 처음 값 = 모두 켬
(function() {
  const M = window.Moai, FX = M.fxRules && M.fxRules.fx, box = document.getElementById('fxOptions');
  if (!FX || !box) return;
  const OPT = { key: 'moai.fx', groups: { atmo: ['beams', 'filter'], hit: ['particles', 'react', 'bar'], camera: ['camera', 'frame'] }, handheldOff: { atmo: true } };
  const state = { atmo: true, hit: true, camera: true };
  try { const s = JSON.parse(localStorage.getItem(OPT.key) || '{}'); Object.keys(state).forEach(function(k) { if (typeof s[k] === 'boolean') state[k] = s[k]; }); } catch (e) {}
  function locked(k) { return !!(OPT.handheldOff[k] && M.device && M.device.handheld); }
  function on(k) { return state[k] && !locked(k); }
  function apply() {
    Object.keys(OPT.groups).forEach(function(k) {
      const v = on(k), b = box.querySelector('[data-fx="' + k + '"]');
      OPT.groups[k].forEach(function(g) { if (FX.get()[g] !== v) FX.set(g, v); });
      if (b) { b.classList.toggle('active', v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); }
    });
  }
  box.addEventListener('click', function(e) {
    const b = e.target.closest ? e.target.closest('[data-fx]') : null, k = b && b.getAttribute('data-fx');
    if (!k || !(k in state) || locked(k)) return;
    state[k] = !state[k];
    try { localStorage.setItem(OPT.key, JSON.stringify(state)); } catch (e2) {}
    apply();
  });
  // 조작 수단이 바뀌면 (마우스를 꽂음 — M.device가 다시 판별한 뒤) 분위기의 고정도 다시 본다
  const mq = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', function() { setTimeout(apply, 0); });
  apply();
  M.fxOptions = { get: function() { return { atmo: on('atmo'), hit: on('hit'), camera: on('camera') }; }, apply: apply };
})();
