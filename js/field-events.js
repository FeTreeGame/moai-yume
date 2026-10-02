// 필드 사건 → 동작 연결표 — 인스턴스(field-actors.js)는 알리기만 하고, 무엇을 할지는 여기 한 곳에서 정한다 (구조 로드맵 F-2)
//   키 = '사건:종류' (예: 'tap:sprout'), 값 = function(detail). 없는 조합은 아무 일도 없다 (알림만 남음)
//   지금: 새싹·미니 모아이 누름 → 그 계열 핑퐁으로 진입. 풍선은 보상 없음 (가끔의 재미 — 붙이려면 'pop:balloon' / 'land:balloon')
//   게이지(field-gauge.js): 바가 생김('appear') · 다 채움('full') — 홀드 미션(입력원 'hold')이면 누르던 입력을 뗀 것처럼 놓음 (input.js M.releaseInput — 엉,
//     이후 실제 손 떼기는 무시 → 다시 누르려면 떼고 새로). 패턴 미션(루프 성공)은 입력을 그대로 둔다
//     무엇을 보상하나(BGM 파트·미니 모아이 …)는 진행 표가 정한다 (js/field-progress.js — 단계마다 카드)
//   게이지 미션을 받는 상태 (진행 표 M.fieldProgress.setReceiving)에 붙인 역할 — 끄는 조작은 둘:
//     BGM 리모컨 정지 → 끔 / 재생 → 켬 (bgm.js 'moai:bgm' — 사용자 조작만, 곡이 울리는지와 무관)
//     세션 시작 → 그때 값을 기억하고 끔 / 세션 끝 → 기억한 값으로 되돌림 (켜진 채 들어갔으면 다시 켬 — 채움은 처음부터, 꺼진 채였으면 그대로)
//   하늘에 떠다니는 것(플래카드·새 — field-actors.js 자동 등장): 진행 표의 FLOAT.fromReward번째 보상부터 나오기 시작 (그전엔 하늘이 빔)
(function() {
  const M = window.Moai;

  function releaseIfHold(d) { if (d.source === 'hold' && M.releaseInput) M.releaseInput(); }   // 홀드 미션이 다 참 → 그 홀드는 끝 (엉)
  function enterStage(d) { if (d.stage && M.session && M.session.enter) M.session.enter(d.stage, 'pingpong'); }

  const RULES = {
    'tap:sprout': function(d) { enterStage(d); },
    'tap:mini': function(d) { enterStage(d); },
    'appear:gauge': function(d) { releaseIfHold(d); },
    'full:gauge': function(d) { releaseIfHold(d); },
    // 즉각 보상 더: 악세사리·사운드 해금(bgm.js M.beats.unlock) 등 — 'pop:종류' / 'land:종류'
    // 'bloom:sprout': function(d) { … 계열 1:1 보상 (무지개·캐릭터 등 — 종착지 무지개) … },
  };

  document.addEventListener('moai:field-event', function(e) {
    const f = RULES[e.detail.kind + ':' + e.detail.actor];
    if (f) f(e.detail);
  });
  M.fieldRules = RULES;   // 시험·조정용

  // ── 게이지 미션을 받는 상태에 붙인 역할 ──
  function receive(on) { if (M.fieldProgress) M.fieldProgress.setReceiving(on); }
  const MISSION = {
    bgm: { stop: false, play: true },   // 리모컨 조작 → 켬/끔
    session: 'restore',                 // 세션 동안 끄고 끝나면 들어가기 전 값으로
  };
  document.addEventListener('moai:bgm', function(e) {
    const v = MISSION.bgm[e.detail.kind];
    if (v !== undefined) receive(v);
  });
  let beforeSession = null;             // 세션에 들어갈 때의 값
  document.addEventListener('moai:session', function(e) {
    if (MISSION.session !== 'restore' || !M.fieldProgress) return;
    if (e.detail.active) {
      if (beforeSession === null) beforeSession = M.fieldProgress.receiving();
      receive(false);
    } else if (beforeSession !== null) {
      receive(beforeSession);
      beforeSession = null;
    }
  });
  M.fieldMission = MISSION;             // 시험·조정용

  // ── 떠다니는 것이 나오기 시작하는 때 ──
  const FLOAT = { fromReward: 2 };      // 몇 번째 보상(진행 표 단계 — 1 = 바 생성, 2 = 메인 BGM)부터. 0 = 처음부터
  if (M.fieldActors && FLOAT.fromReward > 0) M.fieldActors.spawning(false);
  document.addEventListener('moai:field-event', function(e) {
    const d = e.detail;
    if (d.kind === 'reward' && d.actor === 'progress' && d.level + 1 >= FLOAT.fromReward && M.fieldActors) M.fieldActors.spawning(true);
  });
  M.fieldFloat = FLOAT;                 // 시험·조정용
})();
