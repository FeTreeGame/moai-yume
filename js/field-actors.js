// 필드 인스턴스 — 필드(세션 밖)의 대상들. 종류(KINDS)가 성질을 정하고, 인스턴스는 사건을 알리기만 한다
//   (무엇을 할지는 듣는 쪽 — 연결표 js/field-events.js)
//   갈래 (interact): 'none' = 환경형 (지나가기만, 누를 수 없음 — 그 자리 누름은 모아이로)
//                    'instant' = 즉각 보상형 (누르면 바로 — 보상이 있다면 연결표에서. 지금 풍선은 보상 없음 = 가끔의 재미)
//                    'deferred' = 사후 보상형 (새싹 — 스테이지 결과로 성장)
//   움직임: 'float' = 하늘을 떠다님 (가로 등속 + 얕고 긴 사인파 — 세로 변위만), 화면 밖으로 나가면 사라짐
//           'ground' = 바닥에 머묾 (새싹)
//   누르면 (onTap): 'drop' = 터져 낙하 → 하단이 필드 바닥(layout.js M.landTop)에 닿으면 착지 / 'emit' = 알리기만
//   착지하면 (onLand): 'fade' = 머묾·사라짐
//   세션(스테이지) 중 (session): 'remove' = 사라지고 세션 중엔 등장 안 함 / 'hide' = 숨김, 세션 뒤 다시 보임 /
//     'keep' = 그대로 (떠다니는 것은 계속 지나다니고 세션 중에도 등장 — 지금 환경형만)
//   모습 (look): { img } 이미지 / { draw(ctx, r, a) } 코드 / 그 밖 = 자리 표시(사각형 + 글자). 이미지가 로드 전이면 자리 표시
//     { img, tint: true } = 이미지에 인스턴스의 계열 색을 입혀 그림 (js/tint.js — 'color' 합성, 구워 캐시)
//   미니 모아이 (mini): 메인 모아이 에셋(프레임 10장 — js/moai-anim.js)을 계열 색으로. 인스턴스마다 애니메이터 — act(계열, 동작)으로 움직임
//     (지금은 빙의 js/possess.js가 플레이어 입력을 그 몸으로 보냄. 이후 스테이지 NPC 오토도 같은 act) — 계열 영역마다 하나, 메인 모아이 쪽을 바라봄
//     (에셋은 오른쪽을 봄. 고리 중심 기준 오른쪽(중심 포함)은 왼쪽을, 왼쪽은 오른쪽을 — 메인 모아이가 오른쪽 고정인 동안 가운데 초록은 왼쪽)
//     MINI.show = 'raised'(지금 — 세운 것만: 진행 표의 'mini' 보상이 raiseMini로 하나씩) | 'all'(일곱 모두 — 시험용) | 'none'
//     세우기(raiseMini): 순서 MINI.appear.order(보라부터 — 'reverse'면 빨강부터, 목록 지정 가능)의 다음 계열을 그 순간 땅속에 만들고
//       (히트박스 윗변이 마스크 아래 경계 바로 밑 — 안 보임) 최대 높이(1)까지 올린다. 다 올라온 뒤부터 누를 수 있음 ('raise' 알림)
//     누르면 (뗀 자리 + 떽 — 마스크로 보이는 부분만) 'tap' → 연결표 'tap:mini' → 그 계열 진입 (새싹이 하던 역할). 순서 제약 없음
//     스테이지 결과는 계열 진행(garden)에만 기록 (모습 변화는 아직 없음). 세션 중 발신 턴엔 NPC 몸 (rhythm/session.js 연주자)
//     미러 (MINI.mirror): 필드(세션 밖)에서 미니 모아이는 플레이어 입력의 동작을 따라 한다 — 소리 알림(doo·pah·wop·stop) → 각자 애니메이터
//       (동작만 — 소리는 플레이어 목소리 하나, 높이 ↑/↓는 안 따름). 떽이 상호작용(미니 모아이를 누름)이면 누른 미니만 떽, 나머지는 대기로
//       (이어서 세션 시작에 따라 하한으로). 세션 중엔 끔 (NPC 몸·하한). 시험 장치로 미니 모아이에 빙의 중이면 끔 (그 몸만 움직임)
//     세션이 시작되면(진입 대기부터) 그 계열이 아닌 미니 모아이는 높이를 하한(0)까지 내리고, 끝나면 들어가기 전 높이로 (MINI.session)
//       — 플레이어가 ↓로 하는 것과 같은 높이 조작. 오르내리는 속도는 하나 (MINI.move — 세션 대기·세우기 공용)
//   새싹: 핑퐁 계열 하나에 대응. 순서·색 = 조작 탭 스테이지 행 순서(M.session.families — 쉬운 것부터) × 무지개 보라~빨강
//         (굴러조개 TAP 보라 … 마실태양 CPD 빨강 — 종착지 무지개와의 매칭, 난이도 표시)
//         세우기: raise(계열) — 그 계열 영역(layout.js M.seedZones() — 계열마다 한 곳, 좌우 대칭 고리) 가운데에 새싹을 세운다 ('sprout' 알림).
//           부르는 쪽 = 이후 사건 (예정: 게이지). 지금은 부르는 곳 없음 — 필드 입구는 비어 있고 스테이지는 서랍 조작 탭으로
//         세울 순서 (nextStage): 앞 계열의 새싹이 세워지고 그 새싹과 상호작용(누름 = 스테이지 경험)해야 다음 계열이 열린다. 클리어 순서는 자유
//         영역 표시는 ZONE.show (지금 = 안 보임 — 미니 모아이가 자리를 보여 줌. 'always'면 계열 색 원)
//         누르면 'tap' → 그 스테이지로 진입(연결표).
//         스테이지 결과(session.js 'moai:stage-result')로 성장 — 도달 단계가 오르면 형태가 바뀌고, 성공 없이 끝나면 그대로.
//         끝까지 완수(도달 = 최상위)하면 'bloom' → 사라짐. 보상(무지개·캐릭터 등, 계열 1:1)은 연결표 'bloom:sprout' 자리
//         (지금 친구 합류는 세션이 클리어 때 그대로 — friends.js)
//   계열별 진행(garden): { sprouted, entered, level, done } — 세울 순서·성장의 원천. 새로고침하면 사라진다 (저장은 아직 없음)
//   자막: caption(id, 글자) — 인스턴스 위에 글자 (보상 안내 등). 착지해 머무는 중이면 읽을 시간만큼 머묾을 늘린다
//   사건: document 'moai:field-event' { kind: 'pop'|'land'|'sprout'|'tap'|'grow'|'bloom', actor: 종류 id, id, interact, stage, level, x, y }
//   상호작용 = 뗀 자리 + 떽: 캔버스 누름은 늘 모아이 입력. 모아이 입력을 뗀 위치(input.js 'moai:press-release')가 캔버스 위이고
//     이어지는 소리(original.js 'moai:voice')가 떽이면 그 지점의 인스턴스 하나(맨 앞)와 상호작용 — 떽이어야만 (집어 두는 단계 없음).
//     엉(어택-릴리즈 — 바람)·키 입력(위치 없음)이면 없음. 세션 중엔 없음. 누름 이펙트는 따로 (js/touch-fx.js — CSS, 화면 어디서든)
//     디버그 마커: 조건이 일어난 마지막 뗀 자리에 작은 원 (다음 조건에서 갱신 — MARKER)
//   시계 = rAF (frame.js — 움직이는 것이 있을 때만). 떠다니는 이동·등장 주기는 필드 시계 배속(field-clock.js — 바람: 뚜~ 누르는 동안 빨라짐)을 따른다.
//     낙하·착지는 바람과 무관 (실제 시간). 모두 흐르는 시간이라 Conductor 대상 아님
//   배치 단위는 layout.js와 같음 (x·y = 중심, 캔버스 폭·높이 비 / w = 폭 비, aspect = 높이/폭 비) — 그리기·판정도 layout.js 공용 함수
//   아이디어·단계 계획: docs/STRUCTURE-ROADMAP.md 트랙 F
(function() {
  const M = window.Moai;

  // ── 종류 (디테일 — 여기서 바꾼다. 떠다니는 값: band = 높이 띠, speed = 폭 비/초, amp·period = 사인파) ──
  const FLOAT = { band: [0.12, 0.26], speed: 0.025, amp: 0.012, period: 14 };
  const KINDS = {
    // 환경형: "환영합니다" 플래카드 (자리 표시 — 에셋 예정)
    banner:  Object.assign({}, FLOAT, { interact: 'none', motion: 'float', session: 'keep',
      look: { label: '환영합니다', fill: 'rgba(255,244,194,0.9)' }, w: 0.18, aspect: 0.28, z: [1.5], band: [0.07, 0.14], speed: 0.018, period: 18 }),
    // 즉각 보상형: 풍선에 매달린 것 — 터뜨려 필드로 떨군다 (임시 에셋 bird-1). 보상은 지금 없음 (붙이려면 연결표에서)
    balloon: Object.assign({}, FLOAT, { interact: 'instant', motion: 'float', onTap: 'drop', onLand: 'fade', session: 'remove',
      look: { img: 'assets/bird-1.png', faceRight: true }, w: 0.12, aspect: 1, z: [1.5, 5.5] }),
    // 새싹: 성장 단계별 모습 (looks[도달 단계] — 0 = 발아, 1·2 = 성장, 완수 단계는 bloom). 자리 표시 — 에셋 예정
    sprout:  { interact: 'deferred', motion: 'ground', onTap: 'emit', session: 'keep', w: 0.06, z: 6.5,
      looks: [
        { label: '발아', aspect: 1.0 },        // 색 = 계열 색 (RAINBOW)
        { label: '성장 1', aspect: 1.5 },
        { label: '성장 2', aspect: 2.0 },
      ] },
    // 미니 모아이: 메인 모아이 에셋(프레임) + 계열 색. 심도 = 영역 원(6.2) 위, 앞쪽(아래) 영역일수록 앞
    mini:    { interact: 'deferred', motion: 'ground', onTap: 'emit', session: 'keep', z: 6.3, aspect: 1920 / 1080, mask: miniMask, hit: 'moai',   // hit = 모아이 판정 사각형 (layout.js M.MOAI_HIT)   // 자리·크기·마스크 = MINI. 누르면 'tap' → 그 계열 진입 (연결표)
      look: { img: 'assets/idle.png', frames: true, faceRight: true, tint: true } },   // frames = 모아이 프레임 10장 (애니메이터가 고름)
  };
  // 등장: 첫 등장(초 — 등장을 켠 때부터), 다음 등장까지 간격(초, 무작위 — 등장마다), 떠다니는 것의 동시 수, 뽑기 가중치
  //   등장을 켜고 끄는 것은 밖에서 (spawning(on) — 언제부터 나올지는 연결표 js/field-events.js). 끄면 새로 나오지 않을 뿐, 떠 있는 것은 그대로 지나감
  const SPAWN = { first: 2, gap: [3, 7], max: 3, pool: { balloon: 1, banner: 1 } };
  // 새싹 계열 색: 무지개 보라 → 빨강 (계열 순서대로. 종착지 무지개와 매칭 — 난이도 표시)
  const RAINBOW = ['#8e44ad', '#3f51b5', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#e53935'];
  // 낙하: 가속(높이 비/초²), 머묾·사라짐(초), 심도 — 터지면 모아이(5)·전경(6) 앞 (누름 우선권이 인스턴스에 있으니 보이는 순서도 앞,
  //   구멍 열의 앞턱에 착지해도 보이게. 아래쪽 친구 굴러조개 7·비둘매기 8 뒤)
  //   착지 = 인스턴스 하단이 필드 바닥(layout.js M.landTop — 잔디, 모아이 구멍 열은 앞턱) 아래로 depth(0~, 무작위)만큼 들어간 곳
  const DROP = { gravity: 0.9, linger: 1.5, fade: 0.5, z: 6.5, depth: 0.05, captionLinger: 2.5 };   // captionLinger = 자막이 있으면 머묾(초)
  // 성장: 이 모드의 결과로만 자람, 완수 단계(핑퐁 계열 단계 수), 완수 뒤 사라짐(초)
  const GROW = { modes: ['pingpong'], full: 3, bloomFade: 0.8 };
  // 영역 표시: show = 'always'(늘 보임) | 'never' — 이후 조건(예: 홀드 중)으로 바꿀 자리. alpha = 자리 표시 채움
  const ZONE = { show: 'never', alpha: 0.7 };   // 기준 원은 숨김 (자리 잡기 끝 — 미니 모아이가 그 자리에 섬)
  const HIT_SCALE = 0.8;             // 뗀 자리 판정 = 그린 사각형의 이 비율 (이미지 여백 보정) — 종류에 hit: 'moai'가 있으면 모아이 판정 사각형
  // 판정 영역 표시 (디버그): 상호작용 인스턴스·메인 모아이의 판정 모양을 겹쳐 그림. selected = 강조할 정점 번호 (조정 도구용)
  const HITBOX = { show: false, selected: -1 };
  // 미니 모아이 배치: show 'all' = 일곱 계열 모두 영역에 세움 (배치 확인) | 'none'
  //   영역 기준 상대 위치·크기 (실화면에서 맞춰 확정): w = 폭(캔버스 폭 비),
  //   dx = 바라보는 쪽 기준 가로 — 뒤(+)·앞(−, 메인 모아이 쪽) (좌우 대칭 — 가운데 초록도 바라보는 쪽 기준), dy = 하단의 영역 중심 아래(+) 거리 (높이 비)
  //   mask = 그 인스턴스에만 거는 가림판. 미니 모아이가 서는 자리(영역 기준)에 고정 — 이후 솟아올라도 그대로 (밑단은 이후 수풀 등 에셋으로 마감)
  //     mode: 'show' = 도형 안쪽만 그림 (창문 — 밖으로 삐져나온 부분은 사라짐) | 'hide' = 도형 안쪽만 안 그림 (덮개 — 밖은 그대로)
  //     shape: 'rect' | 'circle'. 기준 상자 = 서 있는 모아이 크기에서 — 폭 w배·높이 h배, 가운데를 dx(바라보는 쪽 기준 뒤 +)·dy(아래 +)만큼 옮김
  //       (dx·dy = 캔버스 폭·높이 비). 원 = 상자 가운데, 지름 = 상자 폭. outline = 테두리 보임 (조정용)
  const MINI = { show: 'raised', w: 0.12, dx: -0.02, dy: 0.06,
    mask: { on: true, mode: 'show', shape: 'rect', w: 1, h: 1, dx: 0.01, dy: -0.04, outline: false },   // 마스크 값: 실화면에서 idle·탭 겹쳐 맞춰 확정
    // 오르내리는 속도 (높이 초당 — 플레이어 ↑/↓ sprite.js HEIGHT_SPEED와 같은 값에서 출발, 따로 둠): 세션 대기 때 내려가기·세우기 때 올라오기 공용
    move: { speed: 1.25 },
    // 세션 중 그 계열이 아닌 미니 모아이의 높이 (0 = 플레이어 ↓ 하한)
    session: { height: 0 },
    // 세우는 순서: 'forward' = 계열 순서(보라 → 빨강) | 'reverse' = 빨강부터 | [계열 목록]
    appear: { order: 'forward' },
    // 미러: 필드에서 플레이어 입력의 동작을 따라 함 (동작만)
    mirror: true };
  // 디버그 마커: 상호작용 조건(캔버스 위에서 떽)이 일어난 마지막 뗀 자리 — 보임 여부, 반지름(px)
  //   지금 숨김 (2026-10-02) — 자리 기록(marker())은 시험용으로 남김. 디버그 도구로 옮길 수 있음
  const MARKER = { show: false, r: 6 };

  const imgs = {};
  Object.keys(KINDS).forEach(function(k) {
    const look = KINDS[k].look;
    if (look && look.img) { imgs[k] = new Image(); imgs[k].onload = function() { redraw(); }; imgs[k].src = look.img; }
    if (look && look.frames) (M.MOAI_FRAMES || []).forEach(function(f) {   // 프레임별 이미지 (이름: '종류:프레임')
      const im = imgs[k + ':' + f] = new Image(); im.onload = function() { redraw(); }; im.src = 'assets/' + f + '.png';
    });
  });
  function loaded(img) { return !!img && img.complete && img.naturalWidth > 0; }

  // ── 하늘 비주얼 풀: 떠다니는 종류마다 이미지 풀 — assets/sky/<풀>/01.png ~ (SKY.slots 장) 중 있는 파일만, 등장마다 하나 뽑음 (없으면 종류의 기본 모습)
  //   풀: 'deco' = 상호작용 없음(플래카드 자리), 'tap' = 상호작용 있음(풍선 자리 — 터져 떨어짐). 동작·빈도는 종류 그대로, 모습만 풀에서
  //   이미지마다 맞춤 = 데이터 파일 sky (js/data/sky.js — 편집기 ?sky): { <풀>: { '01': { scale, dx, dy } } }
  //     scale = 종류 폭(KINDS w) 대비 배율, dx·dy = 움직임 중심에서 그림 중심까지 (캔버스 폭·높이 비 — dx는 바라보는 방향 따라 반전). 판정·착지도 그림을 따름
  //   faceRight = 그 풀의 그림이 오른쪽을 본다 (나아가는 쪽으로 뒤집음) / null = 뒤집지 않음 (글자 등)
  const SKY = { slots: 8, pools: { banner: 'deco', balloon: 'tap' }, faceRight: { deco: null, tap: true } };
  const skyPool = { deco: [], tap: [] };   // 풀 → [{ name: '01', file, img }] (있는 파일만, 이름 순)
  function skyFile(pool, name) { return 'assets/sky/' + pool + '/' + name + '.png'; }
  function skyAdd(pool, name, img) {
    const list = skyPool[pool];
    if (!list || list.some(function(e) { return e.name === name; })) return;
    list.push({ name: name, file: skyFile(pool, name), img: img });
    list.sort(function(a, b) { return a.name < b.name ? -1 : 1; });
  }
  Object.keys(skyPool).forEach(function(pool) {
    for (let i = 1; i <= SKY.slots; i++) {
      const name = (i < 10 ? '0' : '') + i, img = new Image();
      img.onload = function() { skyAdd(pool, name, img); };
      img.src = skyFile(pool, name);
    }
  });
  function skyFit(pool, name) {
    const d = window.MoaiData && window.MoaiData.sky, f = d && d[pool] && d[pool][name];
    return { scale: f && f.scale > 0 ? f.scale : 1, dx: (f && f.dx) || 0, dy: (f && f.dy) || 0 };
  }
  // 등장한 인스턴스에 풀 그림 입히기 (a.v) — 폭 = 종류 폭 × 배율
  function skyDress(a, entry) {
    const pool = SKY.pools[a.kind];
    if (!pool || !entry) return;
    const f = skyFit(pool, entry.name);
    a.v = { pool: pool, name: entry.name, img: entry.img, aspect: entry.img.naturalHeight / entry.img.naturalWidth || 1, dx: f.dx, dy: f.dy, scale: f.scale };
    a.p.w = a.k.w * f.scale;
    const fr = SKY.faceRight[pool];
    a.p.flip = fr == null ? false : (a.dir > 0) !== fr;
  }
  // 그린 자리 (풀 그림이면 맞춤 오프셋만큼 — 그리기·판정)
  function boxOf(a) {
    if (!a.v) return a.p;
    return Object.assign({}, a.p, { x: a.p.x + (a.p.flip ? -a.v.dx : a.v.dx), y: a.p.y + a.v.dy });
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  let actors = [];
  let spawnTimer = null;
  let spawnOn = true;
  function windRate() { return M.fieldClock ? M.fieldClock.rate() : 1; }
  function later(sec, fn) { return M.fieldClock ? M.fieldClock.after(sec, fn) : setTimeout(fn, sec * 1000); }
  function unlater(id) { if (M.fieldClock) M.fieldClock.cancel(id); else clearTimeout(id); }
  let nextId = 1;
  const garden = {};                 // 계열 → { sprouted, entered, level, done }
  function gardenOf(stage) { return garden[stage] || (garden[stage] = { sprouted: false, entered: false, level: 0, done: false }); }
  function order() {
    if (M.session && M.session.families) return M.session.families();
    return (M.FRIENDS || []).map(function(f) { return f.stage; });
  }
  function stageColor(stage) { const i = order().indexOf(stage); return i >= 0 ? RAINBOW[i % RAINBOW.length] : null; }

  function inSession() { return !!M.sessionActive; }
  function lookOf(a) { return a.k.looks ? a.k.looks[Math.min(a.level, a.k.looks.length - 1)] : a.k.look; }
  function aspectOf(a) { if (a.v) return a.v.aspect; const l = lookOf(a); return (l && l.aspect) || a.k.aspect || 1; }
  function halfH(a) { return a.p.w * aspectOf(a) * M.CANVAS_ASPECT / 2; }   // 그린 높이의 절반 (캔버스 높이 비)
  function emit(kind, a) {
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: {
      kind: kind, actor: a.kind, id: a.id, interact: a.k.interact, stage: a.stage || null, level: a.level || 0, x: a.p.x, y: a.p.y } }));
  }
  function redraw() { if (M.spriteRedraw) M.spriteRedraw(); }
  function nowSec() { return performance.now() / 1000; }
  function animating() { const t = nowSec(); return actors.some(function(a) { return a.state !== 'ground' || (a.anim && a.anim.busy(t)) || (a.heightTo !== undefined && a.height !== a.heightTo); }); }
  function wake() { if (animating()) M.frame.add(step); }

  // ── 등장 ──
  // 등장마다 다음을 예약 — 떠다니는 것이 동시 수보다 적고 세션 밖이면 뽑아서 등장 (여럿 공존)
  function scheduleSpawn(sec) {
    if (spawnTimer !== null) unlater(spawnTimer);
    spawnTimer = later(sec, function() {
      spawnTimer = null;
      const floating = actors.filter(function(a) { return a.k.motion === 'float'; }).length;
      if (floating < SPAWN.max) { const kind = drawKind(); if (kind) spawn(kind); }
      scheduleSpawn(rand(SPAWN.gap[0], SPAWN.gap[1]));
    });
  }
  function spawning(on) {
    if (on === undefined) return spawnOn;
    if (!!on === spawnOn) return spawnOn;
    spawnOn = !!on;
    if (spawnOn) scheduleSpawn(SPAWN.first);
    else if (spawnTimer !== null) { unlater(spawnTimer); spawnTimer = null; }
    return spawnOn;
  }
  // 다음에 세울 계열 — 순서대로 보면서: 끝난 계열(완수·친구 합류)은 지나가고, 세우지 않은 첫 계열이 답.
  //   세웠지만 아직 상호작용(누름)하지 않은 계열을 만나면 거기서 막힌다 (그 스테이지를 경험해야 다음이 열림)
  function nextStage() {
    const list = order();
    for (let i = 0; i < list.length; i++) {
      const s = list[i], g = gardenOf(s);
      if (g.done || (M.friendJoined && M.friendJoined(s))) continue;
      if (!g.sprouted) return s;
      if (!g.entered) return null;
    }
    return null;
  }
  function drawKind() {
    const pool = Object.keys(SPAWN.pool).filter(function(k) {
      return !(inSession() && KINDS[k].session === 'remove');   // 세션 중엔 남는 종류(환경형)만
    });
    const total = pool.reduce(function(s, k) { return s + SPAWN.pool[k]; }, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= SPAWN.pool[pool[i]]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1] || null;
  }
  function make(kind, p, extra) {
    const k = KINDS[kind];
    const a = Object.assign({ id: nextId++, kind: kind, k: k, z: pickOne(k.z instanceof Array ? k.z : [k.z]), state: k.motion,
      age: 0, level: 0, alpha: 1, left: 0, vy: 0, depth: 0, dir: 1, phase: 0, baseY: 0, stage: null }, extra || {});
    a.p = Object.assign({ x: 0, y: 0, w: k.w, rot: 0, flip: false }, p);
    if (a.stage) a.color = stageColor(a.stage);
    actors.push(a);
    return a;
  }
  function spawn(kind) {
    const k = KINDS[kind];
    if (k.motion !== 'float') return null;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const baseY = rand(k.band[0], k.band[1]);
    const faceRight = !!(k.look && k.look.faceRight);
    const a = make(kind, { x: dir > 0 ? -k.w / 2 : 1 + k.w / 2, y: baseY, flip: k.look && k.look.img ? (dir > 0) !== faceRight : false },
      { dir: dir, baseY: baseY, phase: rand(0, Math.PI * 2) });
    const pool = skyPool[SKY.pools[kind]];
    if (pool && pool.length) { skyDress(a, pickOne(pool)); a.p.x = dir > 0 ? -a.p.w / 2 : 1 + a.p.w / 2; }
    wake();
    return a;
  }
  // 새싹 세우기: 계열(없으면 순서상 다음 — nextStage) 영역 가운데, 하단 = 영역 안 아래쪽. 이미 세웠거나 영역이 없으면 null
  function raise(stage) {
    stage = stage || nextStage();
    const z = stage && zoneOf(stage);
    if (!z || gardenOf(stage).sprouted) return null;
    const bottom = z.y + M.SEED_ZONE_SIZE.ry * 0.5;
    const s = make('sprout', { x: z.x }, { stage: stage, bottom: bottom });
    s.p.y = bottom - halfH(s);
    gardenOf(stage).sprouted = true;
    emit('sprout', s);
    redraw();
    return s;
  }
  function despawn(a) {
    actors = actors.filter(function(x) { return x !== a; });
  }

  // ── 움직임 (프레임마다 — 움직이는 것이 있을 때만) ──
  function step(t, dt) {
    const fdt = dt * windRate();   // 떠다니는 것은 필드 시계 (바람)
    actors.slice().forEach(function(a) {
      const k = a.k;
      if (a.kind === 'mini') heightStep(a, dt);   // 높이 목표로 (실제 시간)
      if (a.state === 'float') {
        a.age += fdt;
        a.p.x += a.dir * k.speed * fdt;
        a.p.y = a.baseY + k.amp * Math.sin(2 * Math.PI / k.period * a.age + a.phase);
        if ((a.dir > 0 && a.p.x > 1 + a.p.w / 2 + Math.abs(a.v ? a.v.dx : 0)) || (a.dir < 0 && a.p.x < -a.p.w / 2 - Math.abs(a.v ? a.v.dx : 0))) despawn(a);
      } else if (a.state === 'fall') {
        a.vy += DROP.gravity * dt;
        a.p.y += a.vy * dt;
        a.p.x += a.dir * k.speed * 0.3 * dt;   // 떠다니던 방향으로 조금 흘러감
        const half = halfH(a), dy = a.v ? a.v.dy : 0, target = Math.min(0.99, M.landTop(Math.min(1, Math.max(0, a.p.x))) + a.depth);
        if (a.p.y + dy + half >= target) { a.p.y = target - half - dy; land(a); }   // 그림 아래끝이 땅에
      } else if (a.state === 'land' || a.state === 'bloom') {
        a.left -= dt;
        a.alpha = Math.max(0, Math.min(1, a.left / (a.state === 'bloom' ? GROW.bloomFade : DROP.fade)));
        if (a.left <= 0) despawn(a);
      }
    });
    return animating();
  }
  // 착지: 상태를 먼저 바꾸고 알린다 (듣는 쪽이 착지 상태를 보고 반응 — 예: 자막이 머묾을 늘림)
  function land(a) {
    a.state = 'land';
    a.left = DROP.linger + DROP.fade;
    emit('land', a);
  }

  // ── 누름 ──
  function tap(a) {
    if (a.k.onTap === 'drop' && a.state === 'float') {
      a.state = 'fall';
      a.z = DROP.z;
      a.vy = 0;
      a.depth = rand(0, DROP.depth);
      emit('pop', a);
      wake();
    } else if (a.k.onTap === 'emit') {
      if (a.stage) gardenOf(a.stage).entered = true;   // 상호작용 = 그 스테이지 경험 → 다음 계열이 열림
      emit('tap', a);
    }
  }
  function tappable(a) {
    if (a.k.interact === 'none' || a.emerging) return false;   // 세우는 중(올라오는 중)엔 안 눌림
    return (a.k.onTap === 'drop' && a.state === 'float') || (a.k.onTap === 'emit' && a.state === 'ground');
  }
  // ── 미니 모아이: 계열 영역마다 하나 (MINI.show) — 메인 모아이 쪽을 바라봄, 자리·크기 = MINI (영역 기준 상대) ──
  let minisPlaced = false;
  function ringCenter() { const ring = M.SEED_ZONE_RING; return 0.5 + (ring ? ring.offset : 0); }
  function posMini(a) {                // 지금 MINI 값으로 자리·크기 (조정하면 다시 부름)
    const z = zoneOf(a.stage);
    a.p.w = MINI.w;
    a.p.x = z.x + MINI.dx * (a.p.flip ? 1 : -1);   // 왼쪽을 보면(반전) 뒤 = 오른쪽
    a.bottom = z.y + MINI.dy;
    a.p.y = a.bottom - halfH(a) + miniDy(a);
  }
  // 높이를 목표(heightTo)로 — 플레이어가 ↑/↓를 누르고 있는 것과 같은 일정한 속도 (MINI.move.speed). 세우는 중이었으면 도착하면 누를 수 있게
  function heightStep(a, dt) {
    if (a.heightTo === undefined || a.height === a.heightTo) return;
    const d = MINI.move.speed * dt;
    a.height = a.heightTo > a.height ? Math.min(a.heightTo, a.height + d) : Math.max(a.heightTo, a.height - d);
    if (a.emerging && a.height >= 1) { a.emerging = false; emit('risen', a); }
    posMini(a);
  }
  // 세우기: 순서상 다음 계열 (세우지 않았고, 끝나지 않았고, 영역이 있는 것)
  function miniOrder() {
    const o = MINI.appear.order;
    if (Array.isArray(o)) return o.slice();
    const list = order().slice();
    return o === 'reverse' ? list.reverse() : list;
  }
  function nextMini() {
    const list = miniOrder();
    for (let i = 0; i < list.length; i++) {
      const s = list[i], g = gardenOf(s);
      if (!g.sprouted && !g.done && zoneOf(s) && !actors.some(function(a) { return a.kind === 'mini' && a.stage === s; })) return s;
    }
    return null;
  }
  // 생겨나는 높이: 히트박스 윗변(판정 사각형 위쪽)이 마스크 아래 경계 바로 밑 — 높이 축을 하한(0) 아래로 늘려 씀
  //   (높이 h의 이동 = (1 − h) × K, K = 메인 모아이 높이 이동 × 크기 비율 — miniDy)
  function spawnHeight(a) {
    const hN = halfH(a) * 2, m = MINI.mask;
    const vTop = M.MOAI_HIT ? Math.min.apply(null, M.MOAI_HIT.map(function(q) { return q[1]; })) : 0;
    const maskBottom = m && m.on && m.mode === 'show' ? a.bottom - hN / 2 + m.dy + hN * m.h / 2 : a.bottom;
    const hitTopStanding = a.bottom - hN + vTop * hN;
    const K = (M.moaiDy && M.LAYOUT) ? (M.moaiDy(0) - M.moaiDy(1)) * (MINI.w / M.LAYOUT.moai.w) : 0;
    return K > 0 ? 1 - (maskBottom - hitTopStanding + 0.002) / K : 0;
  }
  function raiseMini(stage) {
    stage = stage || nextMini();
    const z = stage && zoneOf(stage);
    if (!z || actors.some(function(a) { return a.kind === 'mini' && a.stage === stage; })) return null;
    const c = ringCenter();
    const a = make('mini', { flip: z.x >= c - 1e-9 }, { stage: stage, height: 1, anim: M.moaiAnimator ? M.moaiAnimator() : null });
    a.z = KINDS.mini.z + z.y * 0.01;
    posMini(a);                        // 서 있는 자리(마스크 기준)를 먼저 정하고
    a.height = spawnHeight(a);         // 땅속에서 시작
    a.heightTo = 1;
    a.emerging = true;
    posMini(a);
    gardenOf(stage).sprouted = true;
    emit('raise', a);
    redraw();
    wake();
    return a;
  }
  // 높이 (메인 모아이와 같은 조작 — 0~1, 1 = 서 있음): 메인 모아이 높이 이동(layout.js M.moaiDy)을 크기 비율만큼 줄여 아래로.
  //   마스크는 서 있는 자리에 고정 → 내려가면 땅속으로 들어감
  function miniDy(a) {
    if (!M.moaiDy || !M.LAYOUT) return 0;
    return (M.moaiDy(a.height) - M.moaiDy(1)) * (MINI.w / M.LAYOUT.moai.w);
  }
  function setHeight(stage, h) {
    const a = actors.filter(function(x) { return x.kind === 'mini' && x.stage === stage; })[0];
    if (!a) return false;
    a.height = Math.min(1, Math.max(0, h));
    a.heightTo = undefined;                // 직접 조작이 목표 이동보다 먼저
    posMini(a);
    redraw();
    return true;
  }
  function heightOf(stage) {
    const a = actors.filter(function(x) { return x.kind === 'mini' && x.stage === stage; })[0];
    return a ? a.height : null;
  }
  function placeMinis() {
    minisPlaced = true;
    const c = ringCenter();
    order().forEach(function(stage) {
      const z = zoneOf(stage);
      if (!z || actors.some(function(a) { return a.kind === 'mini' && a.stage === stage; })) return;
      const a = make('mini', { flip: z.x >= c - 1e-9 }, { stage: stage, height: 1, anim: M.moaiAnimator ? M.moaiAnimator() : null });   // 에셋은 오른쪽을 봄 → 왼쪽 보기 = 반전
      a.z = KINDS.mini.z + z.y * 0.01;
      posMini(a);
    });
    redraw();
  }
  // 마스크 (px): 서 있는 모아이 상자(가운데 = 자리 가로·자리 하단에서 반 높이 위)에서 폭 w배·높이 h배, 가운데를 dx·dy만큼
  //   → { mode, shape, x, y, w, h } (원 = 상자 가운데, 반지름 = 상자 폭 / 2)
  function miniMask(a, W, H) {
    const m = MINI.mask;
    if (!m.on) return null;
    const dw = a.p.w * W, dh = dw * aspectOf(a);
    const cx = (a.p.x + m.dx * (a.p.flip ? 1 : -1)) * W, cy = a.bottom * H - dh / 2 + m.dy * H;   // 왼쪽을 보면(반전) 뒤 = 오른쪽
    const w = dw * m.w, h = dh * m.h;
    return { mode: m.mode, shape: m.shape, x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  function maskPath(ctx, k) {
    if (k.shape === 'circle') ctx.arc(k.x + k.w / 2, k.y + k.h / 2, k.w / 2, 0, Math.PI * 2);
    else ctx.rect(k.x, k.y, k.w, k.h);
  }
  // 동작: 그 계열 미니 모아이의 애니메이터 ('tap'|'hold'|'release'|'idle' — js/moai-anim.js). 없으면 false
  function act(stage, action) {
    const a = actors.filter(function(x) { return x.kind === 'mini' && x.stage === stage; })[0];
    if (!a || !a.anim) return false;
    a.anim.play(action, nowSec());
    redraw();
    wake();
    return true;
  }
  function layoutMinis() { actors.forEach(function(a) { if (a.kind === 'mini') posMini(a); }); redraw(); }

  // ── 영역 (계열마다 한 곳 — 새싹을 세우는 자리) ──
  function zoneOf(stage) { const i = order().indexOf(stage); return i >= 0 && M.seedZones ? M.seedZones()[i] || null : null; }
  // 자리 표시: 계열 색 타원 (그 계열이 끝났으면 안 그림)
  function drawZones(ctx, W, H) {
    const sz = M.SEED_ZONE_SIZE;
    order().forEach(function(stage) {
      const z = zoneOf(stage);
      if (!z || gardenOf(stage).done) return;
      ctx.save();
      ctx.globalAlpha = ZONE.alpha;
      ctx.fillStyle = stageColor(stage);
      ctx.beginPath();
      ctx.ellipse(z.x * W, z.y * H, sz.rx * W, sz.ry * H, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── 뗀 자리 + 떽 → 상호작용 ──
  //   모아이 입력을 뗀 위치(moai:press-release, 캔버스 비)를 받아 두고, 이어지는 소리가 떽이면 그 지점의 인스턴스 하나(맨 앞)와 상호작용
  //   (input.js가 뗀 위치를 먼저 알리고 곧바로 original.js가 떽/엉을 알린다 — 늘 한 쌍)
  let upAt = null;       // 방금 뗀 자리 (캔버스 위일 때만)
  let marker = null;     // 디버그: 조건이 일어난 마지막 뗀 자리
  function interactAt(pt) {           // → 상호작용한 인스턴스 (없으면 null)
    marker = pt;
    const W = M.CANVAS_ASPECT, H = 1;   // 판정은 캔버스 비 좌표 (높이 1, 폭 = 캔버스 비)
    const list = actors.filter(tappable).sort(function(a, b) { return b.z - a.z; });
    let hit = null;
    for (let i = 0; i < list.length; i++) {
      if (hitShape(list[i], pt.x * W, pt.y * H, W, H) && inMask(list[i], pt.x * W, pt.y * H, W, H)) { hit = list[i]; tap(hit); break; }
    }
    redraw();
    return hit;
  }
  // 미러: 소리 알림 → 미니 모아이 동작 (필드에서만, 몸이 메인 모아이일 때만). except = 떽이 상호작용이었을 때 누른 미니 (그것만 떽)
  const MIRROR_ACT = { doo: 'hold', pah: 'tap', wop: 'release', stop: 'idle' };
  function mirror(sound, tapped) {
    if (!MINI.mirror || !MIRROR_ACT[sound]) return;
    if (M.body && M.body.current && M.body.current() !== null) return;   // 시험 장치로 빙의 중 — 그 몸만
    const t = nowSec();
    actors.forEach(function(a) {
      if (a.kind !== 'mini' || !a.anim) return;
      const act = sound === 'pah' && tapped ? (a === tapped ? 'tap' : 'idle') : MIRROR_ACT[sound];
      a.anim.play(act, t);
    });
    redraw();
    wake();
  }
  // 판정 모양: 종류의 hit — 'moai' = 모아이 판정 사각형(정점 4개), 없으면 그린 사각형 × HIT_SCALE
  function hitQuad(a, W, H) { return M.quadOn(M.placedRect(a.p, aspectOf(a), W, H), M.MOAI_HIT, a.p.flip); }
  function hitShape(a, x, y, W, H) {
    if (a.k.hit === 'moai' && M.MOAI_HIT) return M.inPolygon(hitQuad(a, W, H), x, y);
    return M.hitRect(M.placedRect(boxOf(a), aspectOf(a), W, H), x, y, HIT_SCALE);
  }
  // 판정 영역 표시: 미니 모아이(모아이 판정 사각형)·메인 모아이(같은 에셋)·그 밖 상호작용 인스턴스(사각형 × HIT_SCALE)
  function drawHitboxes(ctx, W, H) {
    function poly(pts, color) {
      ctx.beginPath(); pts.forEach(function(p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      pts.forEach(function(p, i) {
        ctx.beginPath(); ctx.arc(p[0], p[1], i === HITBOX.selected ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === HITBOX.selected ? '#ffeb3b' : '#2196f3'; ctx.fill();
      });
    }
    ctx.save();
    if (M.LAYOUT && M.MOAI_HIT) poly(M.quadOn(M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, W, H, M.moaiDy ? M.moaiDy() : 0), M.MOAI_HIT, M.LAYOUT.moai.flip), 'rgba(229,57,53,0.9)');
    actors.filter(tappable).forEach(function(a) {
      if (a.k.hit === 'moai') poly(hitQuad(a, W, H), 'rgba(229,57,53,0.9)');
      else { const r = M.placedRect(boxOf(a), aspectOf(a), W, H); poly(M.quadOn(r, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], false), 'rgba(255,255,255,0.7)'); }
    });
    ctx.restore();
  }
  // 마스크가 있는 종류는 보이는 부분만 눌림 (show = 도형 안 / hide = 도형 밖) — 땅속으로 가려진 부분은 안 눌림
  function inMask(a, x, y, W, H) {
    const k = a.k.mask ? a.k.mask(a, W, H) : null;
    if (!k) return true;
    const inside = k.shape === 'circle'
      ? Math.pow(x - (k.x + k.w / 2), 2) + Math.pow(y - (k.y + k.h / 2), 2) <= Math.pow(k.w / 2, 2)
      : x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h;
    return k.mode === 'hide' ? !inside : inside;
  }
  function drawMarker(ctx, W, H) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(marker.x * W, marker.y * H, MARKER.r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,40,40,0.95)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(marker.x * W, marker.y * H, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,40,40,0.95)';
    ctx.fill();
    ctx.restore();
  }

  // ── 성장 (스테이지 결과) ──
  function grow(d) {
    if (GROW.modes.indexOf(d.mode) < 0) return;
    actors.forEach(function(a) {
      if (a.kind === 'mini' && a.stage === d.family) {   // 미니 모아이: 계열 진행만 (모습 변화는 아직 없음)
        const g = gardenOf(a.stage), mlv = Math.max(g.level, d.highest || 0);
        if (mlv <= g.level) return;
        g.level = a.level = mlv;
        if (mlv >= GROW.full) g.done = true;
        emit('grow', a);
        return;
      }
      if (a.kind !== 'sprout' || a.stage !== d.family || a.state !== 'ground') return;
      const lv = Math.max(a.level, d.highest || 0);
      if (lv <= a.level) return;                         // 성공 없이 끝남 → 그대로
      a.level = lv;
      gardenOf(a.stage).level = lv;
      a.p.y = a.bottom - halfH(a);                       // 하단 고정으로 형태만 바뀜
      emit('grow', a);
      if (lv >= GROW.full) { gardenOf(a.stage).done = true; a.state = 'bloom'; a.left = GROW.bloomFade; emit('bloom', a); wake(); }
    });
    redraw();
  }

  // ── 세션 (session.js 'moai:session') ──
  function onSession(active, family) {
    if (active) actors.slice().forEach(function(a) { if (a.k.session === 'remove') despawn(a); });
    // 미니 모아이: 세션 중엔 그 계열만 남고 나머지는 높이 하한으로, 끝나면 들어가기 전 높이로
    actors.forEach(function(a) {
      if (a.kind !== 'mini') return;
      if (active && a.stage !== family) {
        if (a.heightBefore === undefined) a.heightBefore = a.emerging ? 1 : a.height;   // 올라오던 중이면 돌아올 자리 = 최대 높이
        a.heightTo = MINI.session.height;
      } else if (a.heightBefore !== undefined) {
        a.heightTo = a.heightBefore;
        a.heightBefore = undefined;
      }
    });
    redraw();   // 숨김/다시 보임 (남는 떠다니는 것은 프레임 루프가 계속 움직인다)
    wake();
  }

  // ── 그리기 ──
  function drawActor(ctx, a, W, H) {
    const look = lookOf(a) || {};
    const asp = aspectOf(a);
    const clip = a.k.mask ? a.k.mask(a, W, H) : null;   // 종류의 마스크: 이 사각형 안쪽만 그림 (그 인스턴스에만)
    if (a.alpha < 1) { ctx.save(); ctx.globalAlpha = a.alpha; }
    if (clip) {                                       // show = 도형 안만 / hide = 전체 − 도형 (evenodd)
      ctx.save();
      ctx.beginPath();
      if (clip.mode === 'hide') ctx.rect(0, 0, W, H);
      maskPath(ctx, clip);
      ctx.clip(clip.mode === 'hide' ? 'evenodd' : 'nonzero');
    }
    const img = look.frames && a.anim ? imgs[a.kind + ':' + a.anim.frame(nowSec())] : imgs[a.kind];   // 프레임이 있으면 애니메이터가 고른 것
    if (a.v && loaded(a.v.img)) M.drawAt(ctx, a.v.img, boxOf(a), asp, W, H);   // 하늘 풀 그림
    else if (look.img && loaded(img)) M.drawAt(ctx, tintOf(look, a, img), a.p, asp, W, H);
    else if (look.img && loaded(imgs[a.kind])) M.drawAt(ctx, tintOf(look, a, imgs[a.kind]), a.p, asp, W, H);   // 그 프레임이 로드 전이면 대기 모습
    else if (look.draw) look.draw(ctx, M.placedRect(a.p, asp, W, H), a);
    else drawPlaceholder(ctx, M.placedRect(a.p, asp, W, H), look, a);
    if (clip) { ctx.restore(); if (MINI.mask.outline) drawMaskOutline(ctx, clip, a.color); }
    if (a.caption) drawCaption(ctx, M.placedRect(boxOf(a), asp, W, H), a.caption);
    if (a.alpha < 1) ctx.restore();
  }
  function tintOf(look, a, img) { return (look.tint && a.color && M.tinted && M.tinted(img, a.color)) || img; }
  // 마스크 테두리 (조정용): 계열 색 실선 + 흰 점선
  function drawMaskOutline(ctx, k, color) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); maskPath(ctx, k);
    ctx.strokeStyle = color || '#fff';
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.restore();
  }
  // 자막: 인스턴스 위쪽 가운데, 흰 글자 + 어두운 테두리
  function drawCaption(ctx, r, text) {
    const fs = Math.max(12, Math.round(r.dw * 0.16));
    ctx.save();
    ctx.font = 'bold ' + fs + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(3, fs * 0.25);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#fff';
    const y = r.cy - Math.max(r.dh, r.dw) / 2 - 4;
    ctx.strokeText(text, r.cx, y);
    ctx.fillText(text, r.cx, y);
    ctx.restore();
  }
  // 자리 표시: 사각형 + 글자 (에셋이 들어오면 look.img 또는 look.draw로 바뀐다)
  function drawPlaceholder(ctx, r, look, a) {
    ctx.save();
    ctx.translate(r.cx, r.cy);
    if (r.rot) ctx.rotate(r.rot);
    ctx.fillStyle = a.color || look.fill || 'rgba(255,255,255,0.8)';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.fillRect(-r.dw / 2, -r.dh / 2, r.dw, r.dh);
    ctx.strokeRect(-r.dw / 2, -r.dh / 2, r.dw, r.dh);
    const text = (look.label || a.kind) + (a.stage ? '\n' + a.stage : '');
    const lines = text.split('\n');
    const fs = Math.max(9, Math.min(r.dh / (lines.length + 0.6), r.dw / 5));
    ctx.fillStyle = '#222';
    ctx.font = 'bold ' + Math.round(fs) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach(function(l, i) { ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.1); });
    ctx.restore();
  }

  M.fieldActors = {
    // 그릴 층 — sprite.js가 모아이·친구와 합쳐 심도 순으로 그린다 (세션 중엔 'keep' 종류만)
    layers: function() {
      if (MINI.show === 'all' && !minisPlaced) placeMinis();   // 계열 순서(세션 모듈)가 준비된 뒤 첫 그리기에서
      const shown = inSession() ? actors.filter(function(a) { return a.k.session === 'keep'; }) : actors;
      const out = shown.map(function(a) {
        return { id: 'actor', z: a.z, draw: function(ctx, W, H) { drawActor(ctx, a, W, H); } };
      });
      if (ZONE.show === 'always' && !inSession()) out.push({ id: 'zones', z: 6.2, draw: drawZones });   // 전경(6) 위, 떨어지는 것(6.5) 아래
      if (HITBOX.show) out.push({ id: 'hitbox', z: 98, draw: drawHitboxes });
      if (MARKER.show && marker) out.push({ id: 'marker', z: 99, draw: drawMarker });
      return out;
    },
    marker: function() { return marker ? Object.assign({}, marker) : null; },   // 디버그·시험용
    list: function() { return actors.slice(); },
    spawn: spawn,          // 떠다니는 것 즉시 등장 (시험·이후 사건용)
    sky: { policy: SKY, pools: skyPool, add: skyAdd, fit: skyFit, dress: skyDress, file: skyFile, box: boxOf, aspect: aspectOf },   // 하늘 비주얼 풀 (편집기 ?sky · 시험용)
    spawning: spawning,    // 자동 등장 켜기·끄기 (인자 없으면 지금 상태) — 켜면 SPAWN.first초 뒤 첫 등장
    raise: raise,          // 새싹 세우기 (계열 — 없으면 순서상 다음. 세울 수 없으면 null)
    placeMinis: placeMinis,   // 미니 모아이 일곱 계열 세우기 (MINI.show 'all'이면 첫 그리기에서 저절로 — 시험용)
    raiseMini: raiseMini,     // 미니 모아이 하나 세우기 (계열 — 없으면 순서상 다음): 땅속에서 생겨나 올라옴. 세울 수 없으면 null
    nextMini: nextMini,       // 순서상 다음에 세울 계열 (없으면 null)
    layoutMinis: layoutMinis, // MINI(자리·크기)를 바꾼 뒤 세운 미니 모아이에 다시 적용 (조정 도구용)
    act: act,                 // 미니 모아이 동작 (계열, 'tap'|'hold'|'release'|'idle') — 빙의·이후 NPC 오토
    setHeight: setHeight,     // 미니 모아이 높이 (계열, 0~1 — 메인 모아이와 같은 조작)
    height: heightOf,
    aspect: aspectOf,         // 인스턴스 그림의 높이/폭 비 (모습·프레임 기준 — 카메라 대상 상자)
    remove: function(a) { despawn(a); redraw(); },   // 즉시 없앰 (시험·장면 정리용)
    // 자막 (보상 안내 등): 인스턴스 id로. 착지해 머무는 중이면 머묾을 늘린다
    caption: function(id, text) {
      const a = actors.filter(function(x) { return x.id === id; })[0];
      if (!a) return false;
      a.caption = text;
      if (a.state === 'land') a.left = Math.max(a.left, DROP.captionLinger + DROP.fade);
      redraw();
      return true;
    },
    nextStage: nextStage,
    hasMini: function(stage) { return actors.some(function(a) { return a.kind === 'mini' && a.stage === stage; }); },
    garden: function(stage) { return Object.assign({}, gardenOf(stage)); },
    kinds: KINDS,
    policy: { SPAWN: SPAWN, DROP: DROP, GROW: GROW, MARKER: MARKER, ZONE: ZONE, MINI: MINI, HITBOX: HITBOX },   // 조정·시험용 (값을 바꾸면 다음 동작부터)
  };

  document.addEventListener('moai:press-release', function(e) {
    upAt = null;
    const w = M.camera ? M.camera.toWorld(e.detail.clientX, e.detail.clientY) : null;   // 화면 → 월드 (카메라 역변환 — 줌해도 보이는 곳 = 눌리는 곳)
    if (w) { if (w.inside) upAt = { x: w.x, y: w.y }; return; }   // 캔버스 위에서 뗐을 때만
    const c = M.el && M.el.spriteCanvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.detail.clientX - r.left) / r.width, y = (e.detail.clientY - r.top) / r.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) upAt = { x: x, y: y };
  });
  document.addEventListener('moai:voice', function(e) {
    const s = e.detail.sound, field = !inSession();   // 상호작용으로 세션이 시작될 수 있으니 먼저 봐 둔다
    if (s === 'doo') { if (field) mirror(s, null); return; }   // 누름 시작 — 뗀 자리와 무관
    const pt = upAt;
    upAt = null;
    const tapped = pt && s === 'pah' && field ? interactAt(pt) : null;
    if (field) mirror(s, tapped && tapped.kind === 'mini' ? tapped : null);
  });
  document.addEventListener('moai:stage-result', function(e) { grow(e.detail); });
  document.addEventListener('moai:session', function(e) { onSession(!!e.detail.active, e.detail.family); });

  scheduleSpawn(SPAWN.first);
})();
