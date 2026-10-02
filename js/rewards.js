// 보상 카드 — 필드 미션(진행 표 js/field-progress.js)과 세션(미니 모아이 스테이지 단계 성공)이 같은 카드를 준다. 명세 docs/index/content.md §6
//   카드 = { name, can() (지금 줄 수 있나), give(opts) } — 등록: M.rewards.register(id, card)
//     기본 카드(bar·bgm·part·mini·none)는 진행 표가, 배경 보상 카드(scn.<자리>)는 js/scenery.js가, 악세사리 카드는 그 모듈이 등록
//   세션 보상: 데이터 파일 missions.session[계열].rewards = [1단계 카드, 2단계, 3단계] (null = 없음)
//     단계 성공(session.js 'moai:stage-step' — 핑퐁) 때 기록만 하고, 세션이 끝나면(필드로 돌아오면) 기록한 것을 SESSION.delay초 뒤 차례로 준다
//       (세션 중엔 카메라가 미니·투샷을 봐서 배경 변화가 묻힘 — 끝나고 그 자리에서 페이드인). 계열·단계마다 한 번만 (다시 성공해도 다시 주지 않음)
//   알림: document 'moai:field-event' { kind: 'reward', actor: 'session', card, family, stage } — 세션 보상을 준 때 (필드 미션은 진행 표가 actor 'progress'로)
(function() {
  const M = window.Moai;
  const cards = {};
  const SESSION = { delay: 1.0, gap: 0.6 };   // 세션이 끝나고 첫 보상까지(초 — 카메라가 돌아오는 동안), 보상 사이 간격
  const pending = [], given = {};

  function can(id) { const c = cards[id]; return !!c && c.can(); }
  function give(id, opts) { const c = cards[id]; if (!c || !c.can()) return false; c.give(opts || {}); return true; }
  function sessionRewardOf(family, stage) {
    const D = window.MoaiData || {}, list = (D.missions && D.missions.session) || [];
    for (let i = 0; i < list.length; i++) if (list[i].family === family) return (list[i].rewards || [])[stage - 1] || null;
    return null;
  }
  function emit(card, family, stage) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: 'reward', actor: 'session', card: card, family: family, stage: stage } }));
  }

  document.addEventListener('moai:stage-step', function(e) {
    const d = e.detail;
    if (d.mode !== 'pingpong') return;
    const key = d.family + d.stage, id = sessionRewardOf(d.family, d.stage);
    if (!id || given[key]) return;
    given[key] = true;
    pending.push({ id: id, family: d.family, stage: d.stage });
  });
  document.addEventListener('moai:session', function(e) {
    if (e.detail.active || !pending.length) return;
    const list = pending.splice(0);
    list.forEach(function(r, i) {
      setTimeout(function() { if (give(r.id, { fade: true })) emit(r.id, r.family, r.stage); }, (SESSION.delay + i * SESSION.gap) * 1000);
    });
  });

  M.rewards = {
    cards: cards,
    register: function(id, card) { cards[id] = card; },
    can: can, give: give,
    pending: function() { return pending.slice(); },
    sessionRewardOf: sessionRewardOf,
    policy: SESSION,
    reset: function() { pending.length = 0; Object.keys(given).forEach(function(k) { delete given[k]; }); },   // 시험용
  };
})();
