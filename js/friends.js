// 계열의 완수 기록 (예전의 '친구 합류'): 스테이지(세션)를 끝까지 완수하면 그 계열을 기록한다
//   쓰는 곳: 세션이 완수 때 기록 (js/rhythm/session.js friendJoin) · 필드가 다음에 세울 계열을 고를 때 끝난 계열로 건너뜀 (js/field-actors.js friendJoined)
//   친구 캐릭터의 그림 · 배치 · 그리기는 게시본에서 뺐다 — 그리지 않기로 한 뒤로 쓰이지 않았다 (에셋 일곱 장 약 3.5MB — 소스 저장소 assets/friends 에 있다)
//   이름(friend ~)은 그때의 것 그대로
(function() {
  const M = window.Moai;

  const FRIENDS = [{ stage: 'TAP' }, { stage: 'DOO' }, { stage: 'MIX' }, { stage: 'CPA' }, { stage: 'CPB' }, { stage: 'CPC' }, { stage: 'CPD' }];   // 계열의 순서 (세션 모듈이 없을 때의 예비 — js/field-actors.js order)
  M.FRIENDS = FRIENDS;

  const joined = {};           // 스테이지 id → true

  M.friendJoined = function(stage) { return !!joined[stage]; };

  // 기록: 그 계열이 목록에 있으면 (이미 기록했으면 무시)
  M.friendJoin = function(stage) {
    let found = false;
    for (let i = 0; i < FRIENDS.length; i++) if (FRIENDS[i].stage === stage) found = true;
    if (!found || joined[stage]) return;
    joined[stage] = true;
  };
})();
