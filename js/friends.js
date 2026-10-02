// 친구 레이어: 스테이지(인카운터) 클리어 → 필드의 고정 자리에 친구 합류
// 배치(위치·크기·회전·반전·심도)는 layout.js(M.LAYOUT)가 원천. sprite.js가 모아이와 함께 심도 순으로 그린다
// 에셋: 임시로 소용돌이 눈 PNG — 정상 상태(똘망한 눈) 에셋으로 교체 예정
// 그리기 정책 FRIENDS_SHOW.render: 지금 false — 합류(기록·진행 판정)는 그대로, 그리기만 숨김 (단계별 성공 보상의 마지막 = 캐릭터 렌더가 계륵인 시점, 2026-10-01).
//   레이아웃 편집기(?layout)의 모두 표시(M.friendsShowAll)는 그대로 보임
(function() {
  const M = window.Moai;

  const FRIENDS = [
    { stage: 'TAP', name: '굴러조개',   id: 'clam' },
    { stage: 'DOO', name: '비둘매기',   id: 'pigeon' },
    { stage: 'MIX', name: '짱뚱돌고래', id: 'dolphin' },
    { stage: 'CPA', name: '나는야자수', id: 'palm' },
    { stage: 'CPB', name: '미소냉소타', id: 'star' },
    { stage: 'CPC', name: '비행우니',   id: 'cloud' },
    { stage: 'CPD', name: '마실태양',   id: 'sun' },
  ];
  M.FRIENDS = FRIENDS;

  const FRIENDS_SHOW = { render: false };   // 합류한 친구를 그리는가
  M.friendsShow = FRIENDS_SHOW;
  const joined = {};           // 스테이지 id → true
  M.friendsShowAll = false;    // 레이아웃 편집기용: 합류 여부와 무관하게 모두 표시

  FRIENDS.forEach(function(f) {
    f.img = new Image();
    f.img.onload = function() { if (((FRIENDS_SHOW.render && joined[f.stage]) || M.friendsShowAll) && M.spriteRedraw) M.spriteRedraw(); };
    f.img.src = 'assets/friends/' + f.id + '.png';
  });

  // 그릴 친구 레이어 목록 — sprite.js가 모아이 레이어와 합쳐 심도(z) 순으로 그린다
  M.friendLayers = function() {
    const out = [];
    FRIENDS.forEach(function(f) {
      if (!((FRIENDS_SHOW.render && joined[f.stage]) || M.friendsShowAll) || !f.img.complete || !f.img.naturalWidth) return;
      out.push({ id: f.id, z: M.LAYOUT[f.id].z, draw: function(ctx, W, H) { M.drawPlaced(ctx, f.img, f.id, W, H); } });
    });
    return out;
  };

  M.friendJoined = function(stage) { return !!joined[stage]; };

  // 합류: 해당 스테이지의 친구가 있으면 표시 (이미 합류했으면 무시)
  M.friendJoin = function(stage) {
    let found = false;
    for (let i = 0; i < FRIENDS.length; i++) if (FRIENDS[i].stage === stage) found = true;
    if (!found || joined[stage]) return;
    joined[stage] = true;
    if (M.spriteRedraw) M.spriteRedraw();
  };
})();
