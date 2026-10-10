// 연출 연결표 — 사건 → 효과음(js/sfx.js 이름) + 비주얼(js/fx.js 이름). 모듈은 알리기만 하고, 무엇을 울리고 보일지는 여기 한 곳 (field-events.js · camera-rules.js와 같은 방식)
//   명세 docs/index/fx.md. 슬롯을 바꾸려면 여기 줄을, 소리·모양 자체를 바꾸려면 sfx.js SFX · fx.js BURSTS를
//   패턴을 부르는 목소리(세션 = 미니 모아이, 필드 = 안내 칩튠)는 소리 예약이 박에 묶여 있어 그쪽 모듈에 (rhythm/session.js · js/field-rhythm.js)
(function() {
  const M = window.Moai;
  const S = function(name, o) { return M.sfx ? M.sfx.play(name, o) : null; };
  // 연출의 묶음 스위치: 묶음마다 켜고 끈다 (전체 스위치 IMPACT.on · 개발 공간의 I 키와는 따로 — 둘 다 켜져 있어야 나온다). 바꾸는 곳 = setFx (아래), 밖에서는 M.fxRules.fx
  //   beams 빛줄기 · filter 색 필터 (색 입힘 · 누르는 색 · 둘레의 어둠) · frame 테두리 · particles 파티클 (고리 · 빛살 · 하트 · 모여드는 점)
  //   bar 막대의 이펙트 · react 모아이와 세계의 반응 (튀기 · 끄덕임 · 들숨 · 들썩임) · camera 카메라 연출 (펄스 · 기울기 · 다가감)
  //   왜: 기기에서 잰 결과 연출 전체가 전력의 절반쯤을 썼고, 그중 빛줄기 · 색 필터가 유력하다 (소스 저장소 docs/RENDER-COST.md) — 묶음별로 꺼 보며 가리고, 무거운 것만 끌 수 있게
  const SW = { beams: true, filter: true, frame: true, particles: true, bar: true, react: true, camera: true };
  const SW_NAME = { beams: '빛줄기', filter: '색 필터', frame: '테두리', particles: '파티클', bar: '막대 이펙트', react: '반응', camera: '카메라' };
  const PART = { shock: 1, rays: 1, hearts: 1, gather: 1 };   // '파티클' 묶음에 드는 것 (연출 작업에서 넣은 것 — 누른 자리의 고리 · 먼지 · 반짝이 · 색종이는 그 전부터의 것이라 남는다)
  const V = function(name, x, y, o) { if (!SW.particles && PART[name]) return; if (M.fx) M.fx.burst(name, x, y, o); };
  const POS = {
  };
  // 게이지 바 위의 한 점 (캔버스 비) — 게이지의 실제 자리를 읽는다 (style.css .field-gauge. 자리를 따로 적어 두지 않는다). k = 왼쪽 끝에서의 비, 세로는 가운데
  function gaugeSpot(k) {
    const g = el('fieldGauge'), box = g && g.parentNode;
    if (!g || !box || !g.getBoundingClientRect || !box.clientWidth) return null;
    const a = g.getBoundingClientRect(), b = box.getBoundingClientRect();
    return { x: (a.left - b.left - (box.clientLeft || 0) + a.width * k) / box.clientWidth, y: (a.top - b.top - (box.clientTop || 0) + a.height / 2) / box.clientHeight };
  }
  function moaiBox() { return M.placedRect && M.LAYOUT ? M.placedRect(M.LAYOUT.moai, M.LAYOUT_ASPECT.moai, 1, 1, M.moaiDy ? M.moaiDy() : 0) : null; }
  function el(id) { return document.getElementById(id); }
  function cam() { return M.camera; }
  function nowA() { return M.ensureCtx ? M.ensureCtx().currentTime : 0; }

  // ── 음표 하나의 판정 ('moai:judge' { kind, tick } — rhythm/core.js) ──
  //   맞힘 (필드 · 세션): 얕은 카메라 펄스 + 그 음표 주변에 터지는 작은 파티클 (가이드 층 — rhythm/feedback.js burst. 색 = 등급)
  //   놓침 (세션만 — 필드는 실패를 반영하지 않는다): 가장자리의 붉은 깜빡임 + 좌우로 터는 수평 셰이크
  //   헛침 (세션만 — 실패의 한 가지): 소리만
  //   소리 (sfx.js 이름): 맞힘 · 놓침 · 헛침마다 하나 — 찰지게 (세 겹), 짧게 끊어 목소리를 덮지 않는다
  // ── 타격 연출 (js/impact.js가 장치 — 여기는 무엇을 언제 얼마나) ──
  //   맞혔다는 것을 화면 한가운데의 모아이에게 싣는다: 등급마다 세기가 다르고(grade), 정해 둔 단계만큼 더 크고(heat), 세계가 같이 반응한다(world)
  //   필드는 성공만 반영한다 — 놓침 · 헛침은 아무것도 보이지 않는다 (세션의 실패 연출은 아래 JUDGE.miss 그대로)
  //   on = false면 전부 꺼진다. 항목마다: grade의 amp를 0으로 / heat.level 0 / world의 항목을 null / hold를 null
  const IMPACT = {
    on: true,
    grade: {                              // 모아이가 튀는 정도 (0.05 = 5%) · 길이(초) · 밝아짐(0~1) · 가이드 줄의 파티클 수
      ace:    { amp: 0.06, dur: 0.14, flash: 0.3,  n: 14 },   // 밝아짐 0.5 → 0.3: 멈춘 그림으로 보니 첫 프레임에 얼굴이 하얗게 날아갔다
      good:   { amp: 0.04, dur: 0.12, flash: 0.12, n: 9 },
      barely: { amp: 0.02, dur: 0.10, flash: 0,    n: 5 },    // 폰(캔버스 폭 354px)에서 3.3px — 보이는 하한 바로 위
    },
    fit: 0.9,                             // 길이는 16분음표 간격의 이 비율을 넘지 않는다 (템포가 빠르면 줄인다 — 180 BPM의 16분음표는 83ms. 다음 음표 전에 끝나야 박이 흐려지지 않는다)
    // 달아오른 정도 (단계): 0 = 바탕 ~ 1 = 가장 진하게. 맞힐 때의 튀기가 이만큼 커지고 (level 1에 max배), 리스폰스의 분위기가 이만큼 진해진다 (ATMO.heat)
    //   세지 않는다 — 처음부터 이 단계로 들어간다 (예전에는 연속으로 맞힌 수에서 계산해 놓치면 0으로 돌아갔다: 세션은 독립된 스테이지이고 필드의 평가는 짧아, 쌓고 허무는 것이 맞지 않았다)
    //   이후 가능한 길: 이 값을 세션의 스테이지 단계에 묶는다 (1 · 2 · 3단계 → 0.3 · 0.6 · 1 — 초기화 없이 진행할수록 진해진다). 읽는 곳은 heatNow 하나
    heat: { level: 0.5, max: 1.5 },
    world: {
      // 맞힐 때 배경 요소가 들썩인다 (요소마다 조금씩 늦게 — 물결). 잰 결과로 고친 값:
      //   커지기만 하면 작은 요소는 폰에서 1px (안 보인다) → 위로 뛰기(hop — 캔버스 높이의 1.2% = 폰에서 3px)를 더하고 커지기는 줄임
      //   물결 간격 15ms는 마지막 요소가 228ms에 정점 — 다음 음표와 겹친다 → 6ms (마지막이 약 90ms)
      bounce: { amp: 0.012, hop: 0.012, dur: 0.16, stagger: 0.006 },
      glow: { amp: 0.6, dur: 0.5, stagger: 0.06 },        // 패턴을 다 맞히면 무지개 띠가 안쪽부터 밝아진다
      minis: true,                                        // 패턴을 다 맞히면 미니 모아이들이 떽 동작을 한 번
    },
    hold: { pulse: { every: 2, amp: 0.04, hearts: 5 },   // 유지 중의 맥박: 누른 음표에서부터 every칸마다 (16분음표) 작게 한 번 — 모아이가 튀는 정도 · 하트 수 (고리 · 빛살 · 카메라 없이). every 0 = 없음
            gather: { every: 0.12, n: 3 } },   // gather = 누르는 동안 둘레에서 점이 모인다 (간격 초 · 한 번에 몇 개)   // 홀드를 끝까지 맞히고 떼는 순간: 평소보다 크게 + 모아이 둘레의 파티클. 누르는 동안의 떨림은 impact.js HOLD
  };
  function gradeAt(tick) {
    const G = window.G, ms = (G && G.noteInputMarks) || [];
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].tick === tick && IMPACT.grade[ms[i].res]) return ms[i].res;
    return 'good';
  }
  function heatNow() { return Math.max(0, Math.min(1, IMPACT.heat.level)); }
  function heatMul() { return 1 + (IMPACT.heat.max - 1) * heatNow(); }
  function impactOn() { return IMPACT.on && M.impact; }
  function fitDur(sec) {                 // 지금 템포의 16분음표 안에 끝나게
    const G = window.G, bpm = G && G.BPM;
    return bpm ? Math.min(sec, 60 / bpm / 4 * IMPACT.fit) : sec;
  }
  function worldClear() {                // 패턴을 다 맞힘: 무지개 · 미니 모아이
    if (!impactOn()) return;
    if (IMPACT.world.glow) M.impact.glow(IMPACT.world.glow);
    if (IMPACT.world.minis && M.fieldActors && M.session && M.session.families && !M.sessionActive) M.session.families().forEach(function(f) { M.fieldActors.act(f, 'tap'); });
  }
  document.addEventListener('moai:voice', function(e) {   // 누르는 동안의 떨림 (판정과 무관 — 누르고 있다는 것)
    if (!impactOn() || !IMPACT.hold) return;
    if (e.detail.sound === 'doo') { M.impact.holdStart(); gatherOn(true); holding = true; lean('hold', CAMX.hold.amp, { dur: CAMX.hold.in, ease: 'out' }); } else { M.impact.holdEnd(); gatherOn(false); if (holding) lean('hold', 0, { dur: CAMX.hold.out }); holding = false; }
  });
  let gathering = false, gatherAt = 0;
  function gatherTick(t) {
    if (!gathering || !impactOn() || !IMPACT.hold || !IMPACT.hold.gather) return false;
    if (t - gatherAt >= IMPACT.hold.gather.every) { gatherAt = t; gatherFx(); }
    return true;
  }
  function gatherFx() { const q = mainSpot('gather'); if (q) V('gather', q.x, q.y, { z: SPOT.z, cx: q.x, cy: q.y, n: IMPACT.hold.gather.n }); }   // 모여드는 점: 그 자리로
  function gatherOn(on) { gathering = on; if (on && M.frame) M.frame.add(gatherTick); }

  // ── 분위기 · 콜 앤 리스폰스 · 킥 (명세서 C) ──
  //   박 = 킥: 곡의 킥이 울릴 때마다 화면이 숨 쉰다 (정박이 아니다 — 곡마다 킥의 무늬가 다르다). 이펙트의 길이도 킥 사이의 간격으로 잰다 → 다음 킥에 닿으며 끝난다
  //     킥이 아직 울리지 않으면 (그 파트가 풀리기 전) 아무것도 뛰지 않는다 — 곡이 쌓일수록 세계가 뛰기 시작한다
  //   콜 = 차갑고 어둡게 · 부르는 쪽의 색 / 리스폰스 = 따뜻하고 밝게 — 단계(IMPACT.heat.level)만큼 더 진하게 (heat)
  //   리스폰스의 맞힘 = 가장 힘을 싣는 곳: 충격 고리 · 빛살 · 하트 · (ACE) 가장자리 빛. 콜의 음표는 같은 모양을 작게 (콜에서 본 것을 리스폰스에서 내가 크게)
  //   큰 면적의 밝기 변화(가장자리 빛 · 모아이의 밝아짐)는 한도를 같이 쓴다 (M.impact.flashOk). 고리 · 빛살 · 하트는 선과 조각이라 한도 밖
  const ATMO = {
    // color · a = 입히는 색 (겹쳐서 — 진해진다) / shade · sa = 누르는 색 (곱해서 — 가라앉는다) / spot = 둘레의 어둠 (가운데만 남는 조명)
    //   잰 결과로 올린 값: 처음 값(부드러운 빛 0.2~0.34)은 바탕과 달라진 넓이가 콜 28% · 리스폰스 8% — 나란히 놓아야 보였다
    listen:  { color: '#4f8dff', a: 0.45, shade: '#8f9be6', sa: 0.6, spot: 0.7 },   // 세션의 바탕 (대기 · 콜 · 리스폰스 내내): 밤처럼 가라앉고 가운데만 남는다. 입히는 색은 그 계열의 색이 있으면 그것으로
    respond: { color: '#ffb347', a: 0.1, spot: 0.22 },      // 필드의 패턴 미션 (내내): 따뜻하게 — 옅게. 단계까지 더한 실제 세기 0.15 (예전: 치는 루프에만 0.42 + 0.15)
    heat:    { a: 0.1, spot: -0.22 },                       // 단계가 1일 때 그것에 더해지는 양 (예전 a 0.3)
    // 판정에 대한 반응: 바탕 위에서 잠깐 밀었다 돌아온다 (M.atmo.nudge — 더하는 양 · 길이는 박). 다른 필터로 갈아타지 않는다
    react: { hit: { ace: { a: 0.06, spot: -0.1 }, good: { a: 0.04, spot: -0.06 }, barely: { a: 0.02, spot: -0.03 }, beats: 1 },   // 맞힘: 살짝 진해지고 둘레가 걷힌다
             miss: { sa: 0.12, spot: 0.06, beats: 1 } },                                                             // 놓침 (세션): 살짝 더 가라앉는다 (예전: 파란 필터로 한 박 갈아탔다)
    dur: 0.4,                                               // 넘어가는 시간 (초 — 천천히: 번쩍임이 아니다)
    beat: { amp: 0.03, accent: 0.055, span: 0.6 },          // 킥마다 조명이 커지는 정도 (보통 · 마디의 첫 킥) · 길이 (킥 간격의 비)
  };
  const RESP = {
    onGrid: true,                                           // 이펙트를 누른 순간이 아니라 그 음표의 칸에서 시작 (일찍 눌렀으면 그만큼 기다린다 — 화면이 '맞는 박은 여기'를 말한다)
    color: { ace: '#ffd700', good: '#39ff14', barely: '#ffffff' },
    layers: {                                               // 등급마다 겹치는 층: 고리의 굵기 배수 · 빛살 조각 수 · 하트 수 · 가장자리 빛
      ace:    { shock: 1,    rays: 7,  hearts: 8, edge: true },    // 빛살 12 → 7 (GOOD과 같게): 앞으로 옮기고 나니 12조각은 얼굴을 덮어 과했다
      good:   { shock: 0.7,  rays: 7,  hearts: 4, edge: false },
      barely: { shock: 0.35, rays: 0,  hearts: 0, edge: false },
    },
    shock: { size: 0.95, width: 0.014, life: 0.26, max: 0.5, from: 0.2 },   // 고리: 닿는 반지름 (캔버스 높이 비) · 굵기 · 킥이 없을 때의 길이 · 킥 간격을 쓸 때의 상한 (초) · 시작 반지름 (캔버스 높이 비)
    //   from: 고리는 전경보다 앞이어야 해서 모아이보다도 앞이다 — 가운데의 한 점에서 시작하면 얼굴 위를 지나간다. 얼굴 둘레에서 나타나게 시작 반지름을 둔다 (0.2 = 이마에서 입술까지를 감싸는 둘레 — 사용자가 ?fxtune으로 정한 값)
    rays:  { size: 0.52, life: 0.14, max: 0.22 },
    heart: '#ff5e8a', hearts: { speed: 1.8, scale: 1.4 },   // 하트: 퍼지는 빠르기 · 크기의 배수 · 얼굴에서 얼마나 위에서 솟나 (멈춘 그림으로 보니 코에 뭉쳐 0.2초 넘게 거의 안 움직였다)
    edge:  { color: 'rgba(255,215,0,0.9)', a: 0.32, ms: 260 },
    // (홀드를 끝까지 맞히고 뗄 때의 이펙트는 따로 두지 않는다 — ACE의 맞힘과 같다. 예전: 고리 두 겹 · 빛살 14 · 하트 12 — 누를 때 이미 한 번 터진 데다 떼기가 ACE의 두 배라 과했다)
    clear: { amp: 0.1, shocks: [0.75], lead: 1, hearts: 10 },    // 패턴을 다 맞힘: 모아이가 크게 뛴다 + 고리 하나 더 — 마지막 음표의 맞힘 고리에 이어 한 박자 늦게 · 조금 더 크게 (합쳐 두 겹). 하트 10개 더 — 맞힘의 8개와 합쳐 18개 (예전 16: 합쳐 24개)
    //   lead = 몇 번째 겹으로 치는가 (1 = 둘째: 0.07초 뒤 · 12% 더 크게). 예전: 세 겹 [1, 0.75, 0.5] — 맞힘의 고리까지 네 겹이 0.14초 안에 몰렸다
  };
  // 콜의 음표: 부르는 미니가 튄다 + (세션) 그 자리에서 리스폰스와 같은 모양(고리 · 빛살)이 작게, 그 계열의 색으로. 필드 = 미니들의 합창 — 몸짓만
  //   잰 결과로 올린 값: 처음 값(튀기 3% · 고리 0.1)은 화면의 0.6%만 달라졌다 — 킥(조명의 숨)보다도 작아 콜이 묻혔다
  const CALL = { chorus: true, beat: 0.06,
    session: { amp: 0.12, ring: 0.14, shock: { size: 0.34, width: 0.009 }, rays: { n: 7, size: 0.2 } },
    field:   { amp: 0.09 } };   // 필드의 합창은 몸짓만 (동작 · 튀기) — 고리 · 빛살은 그 미니가 자기 세션에서 부를 때만. 일곱이 한꺼번에 터지면 가운데의 메인 모아이를 가렸다 (예전: 고리 0.1 · 빛살 4)
  const KICK = { squash: 0.008, nod: 0.006, mini: 0.012, min: 0.18 };   // 킥: 배경 요소의 눌림 · 모아이 · 미니의 끄덕임 · 이보다 촘촘한 킥은 건너뛴다 (초)
  const MISS = { droop: 0.02 };                                         // 놓침 (세션만): 모아이가 움찔
  const INHALE = { amp: 0.015 };                                        // 내 차례 직전: 콜의 마지막 박에 모아이가 숨을 들이쉰다
  // ── 햇살 · 테두리 · 카메라 (명세서 D — 전부 추가: 위의 것들은 그대로) ──
  //   햇살 (js/atmo.js beam): 메인 모아이를 비추는 은은한 빛줄기 — 늘 깔려 있고, 턴에 따라 좁아지고 식거나 (콜 — 세션은 부르는 미니 쪽으로) 넓어지고 따뜻해진다 (리스폰스 · 연속)
  const BEAM = { on: true, kick: 0.07, foot: 0.3, dx: -0.045, flip: 0.35, motion: { lead: 1, ease: 'inOut', enter: 0.6 }, kickInMove: false,   // flip = 대상의 방향이 바뀌어 빛이 반대편으로 넘어가는 데 걸리는 초 · motion = 세션에서 조명이 바뀌는 타이밍: lead = 턴의 마지막 몇 박에 (꺼지는 것 · 켜지는 것 같이) · enter = 세션에 들어갈 때와 끝날 때 (초) · kickInMove = 켜고 끄는 도중에도 킥에 폭이 숨 쉬는가
    // 그 밖: 킥마다 폭이 커지는 정도 · 빛이 닿는 높이 (모아이 상자 가운데에서 아래로 — 상자 높이의 비)
    // 잰 결과로 올린 값: 처음 값(0.3 · 흐림 1.4%)은 바탕과 달라진 넓이 12% — 빛줄기가 아니라 뿌연 안개로 보였다 → 세기를 올리고 가장자리를 덜 흐리게
    // 턴마다: 세기 · 폭의 배수 · 기울기 (도 — 빛이 오는 방향) · 퍼진 정도 (0 = 기둥 ~ 1 = 한 점에서 퍼지는 부채) · 닿는 자리를 대상에서 얼마나 옮기나 (dx · dy — 대상의 폭의 비: 가로 −0.19 = 사용자가 필드의 메인 모아이에서 정한 −0.08(캔버스 비)을 환산). 값 조정 ?fxtune
    //     (처음에는 캔버스 비로 두었다 — 세션 대기처럼 미니가 작게 보일 때는 같은 0.08이 미니 폭의 절반을 넘어 빛이 미니를 빗나갔다)
    //   폭 w = 대상의 폭의 몇 배 (메인 모아이 · 부르는 미니 — 세계의 크기: 카메라가 당기면 세계와 함께 통째로 커진다). 1보다 작으면 대상이 빛 밖으로 넘친다
    //     (예전에는 캔버스 폭의 54% × 배수로 고정 — 세션에서 카메라가 3배까지 당기면 모아이가 빛줄기를 넘어섰다. 바탕 · 리스폰스는 그때의 모습을 환산한 값, 콜은 0.77 → 1로 올림)
    base:    { a: 0.5,  w: 1.29, tilt: -14, spread: 0.87, dx: -0.19, dy: 0, color: '#fff4cf' },
    // (콜만의 빛줄기 값은 두지 않는다 — 콜에서도 바탕의 것을 쓴다: 같은 모양 · 같은 색. 달라지는 것은 비추는 대상뿐 (세션에서는 부르는 미니). 예전: 콜만 좁고 푸른 빛)
    // 길이를 따른 밝기 (조명마다 — 놓인 틀이 달라서): hold = 위에서 여기까지는 가장 밝게 (길이의 비) → mid에서 a → 아래 끝에서 0
    //   메인 = 세계의 물체: 광원 쪽이 밝고 대상으로 내려오며 꾸준히 옅어지게. 카메라가 당긴 리스폰스(1.2 ~ 1.5배)에서는 위쪽 3분의 1이 화면 밖이라, 그 자리까지 가장 밝게 두어야 화면 위쪽 끝이 밝다
    //     (고른 분포 그대로 세계에 두면 리스폰스에서 밋밋한 중간 구간만 보여 부시시했다)
    //   미니 = 화면에 고정: 처음의 분포 그대로 (위 62%는 완만하게 · 아래에서 사라진다)
    glow: { main: { hold: 0.35, mid: 0.7, a: 0.42 }, mini: { hold: 0, mid: 0.62, a: 0.6 } },
    // (모양은 바탕 하나 — 메인 모아이의 것도 부르는 미니의 것도. 예전: 리스폰스에는 넓고 따뜻한 모양 a 0.62 · w 1.54 · '#ffe0a0', 단계만큼 더 a +0.22 · w +0.51)
  };
  //   테두리 (js/frame-fx.js): 띠 = 턴의 색 · 킥마다 두께 / 모서리 = 콜의 음표마다 조임 · 내 차례 직전에 크게 / 흐름 = 턴 한 번에 한 바퀴 / 물결 = 패턴 성공
  const FRAME = { on: true,
    band: { base: { color: '#ffffff', w: 0.004, a: 0.4 }, listen: { color: '#6fa8ff', w: 0.008, a: 0.95 }, respond: { color: '#ffb347', w: 0.008, a: 0.95 } },
    kick: { amp: 0.005, accent: 0.009 }, corners: { a: 0.9 }, call: { pinch: 0.012 }, preturn: { pinch: 0.035 }, run: null,   // run = 띠 위를 한 턴에 한 바퀴 도는 밝은 점 — 뺐다 (정신사납다. 턴의 남은 길이는 비트 막대의 진행 마커가 보인다). 되살리려면 { color: '#ffffff' }
    ripple: { clear: 0.025 } };   // 물결: 패턴 성공 때만 (위아래 변). 맞힐 때마다 아래 변에서 좌우로 퍼지던 것은 뺐다 — 판정 피드백으로는 없는 편이 낫다는 판정 (예전: ace 0.02 · good 0.014 · barely 0.008)
  //   카메라 (js/camera.js): 샷은 건드리지 않고 그 위에 얹는다 — 펄스 · 기울기 · 다가감 (lean: 이름마다 따로, 더한 값의 상한은 카메라 쪽)
  const CAMX = { on: true,
    kick: { amp: 0.004, accent: 0.008 },                               // 킥: 아주 얕은 펄스 (맞힘 0.008의 절반 · 마디의 첫 킥은 같게)
    call: { session: 0.02, field: 0.008, tilt: 0.5, cover: 0.02, hold: 0.9 },   // 콜의 음표: 펄스 (세션 · 필드) · 필드는 좌우로 번갈아 기울기 (도) + 그만큼 다가감 (귀퉁이가 드러나지 않게) · 기울기가 머무는 초
    turn: { respond: 0.03, dur: 0.6 },                                 // 필드의 턴: 치는 루프에 다가감
    preturn: { amp: -0.03 },                                           // 내 차례 직전 한 박: 물러났다가 첫 박에 제자리 (들숨과 같은 박 — 배율이 1보다 클 때만)
    hold: { amp: 0.035, in: 1.2, out: 0.15 },                          // 홀드: 누르는 동안 다가감 → 떼면 돌아옴
    clear: { pulse: 0.035, tilt: 1.2, cover: 0.035, dur: 0.18 } };     // 패턴 성공: 큰 펄스 + 한 번 기울었다 돌아옴
  let bigPulseAt = -1e9, tiltSide = 1, tiltTimer = null;
  function camPulse(amp) { if (!CAMX.on || !impactOn() || !cam()) return; bigPulseAt = performance.now() / 1000; cam().pulse({ amp: amp }); }
  function lean(key, amount, opts) { if (cam() && cam().lean) cam().lean(key, CAMX.on && impactOn() ? amount : 0, opts); }
  // 빛줄기의 반전: 대상이 왼쪽을 보면 빛도 거울처럼 — 오는 방향(기울기)과 닿는 자리의 가로가 뒤집힌다 (그림은 오른쪽을 보는 것이 기본: 값은 그 기준)
  //   대상 = 메인 모아이, 세션의 콜에서는 부르는 미니. 방향이 바뀌면 기울기가 반대편으로 넘어간다 (보간 — 수직을 지나 넘어가는 탐조등처럼. 걸리는 시간 BEAM.flip)
  // 빛줄기 = 객체 (조명 하나하나가 자기 것을 갖는다): 누구를 비추는가 (key) · 어떤 모양인가 (look — BEAM의 이름) · 대상의 방향 (left) · 켜진 정도 (lit) · 지금의 세기 (a)
  //   바깥에서 하는 일은 켜고 끄기뿐 — 턴이 바뀌어도 모양은 건드려지지 않는다. [0] 메인 모아이의 조명 · [1] 부르는 미니의 조명 — 모양은 둘 다 바탕
  //     (처음에는 '지금 턴'이라는 전역 값 하나가 두 빛줄기의 모양을 같이 다시 정했다 — 메인의 것이 꺼진 채 바탕 모양으로 있다가 리스폰스 턴 경계에서 켜지는 도중에 40% 넓어졌다)
  //   모양이 바뀌는 때: 꺼져 있는 동안이면 바로 (보이지 않게), 켜져 있는 동안이면 천천히 — 필드에서 턴에 따라 넓어지는 것 · 세션이 끝나 바탕으로 돌아오는 것
  const LIGHTS = [{ key: 'main', look: null, left: false, lit: 0, a: 0, on: 1, fade: null, next: null }, { key: null, look: null, left: false, lit: 0, a: 0, on: 0, fade: null, next: null }];   // on = 켜 둘 것인가 (목표) · fade · next = 켜고 끄기의 예약
  function lookOf(i) { return 'base'; }                 // 그 조명이 가질 모양 — 지금은 모두 바탕 (조명마다 다른 모양을 주려면 여기서 이름을 돌려준다: BEAM의 그 이름)
  function lookVal(name) { return BEAM[name] || BEAM.base; }
  function shape(i, dur) {              // 그 조명의 모양을 장치에 (꺼져 있으면 바로)
    const L = LIGHTS[i], bs = M.atmo && M.atmo.beams; if (!bs || !L.look) return;
    const V = lookVal(L.look); bs[i].set(Object.assign({}, V, { tilt: V.tilt * (L.left ? -1 : 1), glow: BEAM.glow[i === 0 ? 'main' : 'mini'], dur: L.lit < 0.02 ? 0 : dur }));
  }
  // 켜고 끄기: 조명마다 따로 예약한다 (fade = 지금 진행 중인 것 · next = 그 시각이 되면 시작할 것). 켜진 정도 0 ~ 1
  //   세션에서는 박에 맞춘다 — 턴 알림('moai:turn': 다음 턴의 역할 · 시작 시각 · 한 박의 길이)을 듣고 스스로 예약: **턴의 마지막 lead박에** 다음 턴의 조명으로 바뀐다
  //     (꺼지는 것과 켜지는 것이 같은 박에 같이 — 다음 턴의 첫 박에는 이미 그 턴의 조명이다)
  //     대기 = 둘 다 켜져 있다 (메인 모아이와 부르는 미니) → 대기의 마지막 박에 메인의 것이 꺼지며 콜로 / 콜 = 미니의 것만 / 리스폰스 = 메인의 것만
  //   카메라와는 무관하다 (BEAM.motion.lead = 박 수 — 'camera'로 두면 카메라의 샷이 출발하는 박 수를 읽는다)
  let btFamily = null;
  function clockA() { const G = window.G; return G && G.actx ? G.actx.currentTime : 0; }
  function beamMotion(kind) {
    const S = M.cameraRules && M.cameraRules.session, c = (S && S[kind]) || {}, m = c.motion || {};
    const cam0 = { lead: m.lead != null ? m.lead : (S && S.lead != null ? S.lead : 1), ease: 'inOut', enter: c.dur != null ? c.dur : 0.8 };
    return BEAM.motion && BEAM.motion !== 'camera' ? Object.assign(cam0, BEAM.motion) : cam0;
  }
  function fadeNow(L, t) {
    const f = L.fade; if (!f) return L.on;
    const u = f.dur <= 0 ? (t >= f.t0 ? 1 : 0) : Math.max(0, Math.min(1, (t - f.t0) / f.dur)), e = (cam() && cam().ease && cam().ease[f.ease]) || function(x) { return x; };
    return f.a0 + (f.a1 - f.a0) * e(u);
  }
  function lightTo(i, level, t0, dur, later) {   // 그 조명을 level(0 | 1)로 — t0부터 dur초에 걸쳐. later = 예약 (그 시각이 되면)
    const L = LIGHTS[i], n = { a1: level, t0: t0, dur: Math.max(0, dur || 0), ease: beamMotion('respond').ease };
    if (later && t0 > clockA()) { L.next = n; return; }
    L.next = null; n.a0 = fadeNow(L, clockA()); L.fade = n; L.on = level;
  }
  function wants(role) {                 // 그 턴에 켜져 있을 조명 [메인, 미니]
    const mini = !!(btFamily && miniOf(btFamily)[0]);
    return role === 'wait' || role === 'listen' ? [mini ? 0 : 1, mini ? 1 : 0] : [1, 0];   // 대기 · 콜 = 부르는 미니의 것만 (대기에 둘 다 켜 두는 것은 해 보고 걷어냄 — 볼만하지 않았다)
  }
  function lightsTo(role, t0, dur, later) { const w = wants(role); lightTo(0, w[0], t0, dur, later); lightTo(1, w[1], t0, dur, later); }
  function beamMoving() { const t = clockA(); return LIGHTS.some(function(L) { const f = L.fade; return !!f && f.a0 !== f.a1 && t > f.t0 && t < f.t0 + f.dur; }); }   // 켜고 끄는 중인가
  // 그 대상을 비추는 빛줄기의 자리 · 폭 · 방향 (캔버스 비)
  //   메인 모아이의 것 = 세계의 절대 자리 (v 없이): 카메라는 여기서 모른다 — 틀 전체에 한 번 걸린다 (M.atmo.world). 애초부터 그 자리에 그 모양으로 있는 물체
  //   부르는 미니의 것 = 화면의 자리 (v = 카메라의 지금 보기로 환산): 윗변이 늘 화면 위쪽 끝이라 카메라가 3배로 당겨도 밝은 윗부분이 화면 안에 있다 (모양은 카메라에 따라 변한다)
  function poseOf(key, off, v) {
    if (!key) return null;
    const a = key !== 'main' ? miniOf(key)[0] : null, b = a ? null : moaiBox();
    if ((key !== 'main' && !a) || (!a && !b)) return null;
    const left = a ? !!a.p.flip : !!(M.LAYOUT && M.LAYOUT.moai && M.LAYOUT.moai.flip), sg = left ? -1 : 1;
    const wx = a ? a.p.x : b.cx + BEAM.dx * sg, wy = a ? a.p.y + 0.04 : b.cy + b.dh * BEAM.foot, ww = a ? (a.p.w || 0.12) : b.dw;
    const z = v ? v.zoom : 1, sw = ww * z, sx = v ? (wx - v.x) * z + 0.5 + v.ox : wx, sy = v ? (wy - v.y) * z + 0.5 + v.oy : wy;   // v가 있으면 화면으로
    return { x: sx + (off.dx || 0) * sw * sg, y: sy + (off.dy || 0) * sw * (M.CANVAS_ASPECT || 4 / 3), w: sw, left: left };   // 옮기는 양 = 대상의 폭에 대한 비
  }
  document.addEventListener('moai:session', function(e) {
    const d = e.detail || {}, mo = beamMotion('wait');
    if (d.active) { if (d.family) { btFamily = d.family; LIGHTS[1].key = d.family; } if (d.phase === 'wait') lightsTo('wait', clockA(), mo.enter); }   // 대기에 들어감 → 미니의 조명도 켜진다 (메인의 것은 그대로)
    else { lightsTo('respond', clockA(), mo.enter); btFamily = null; }                                                                    // 세션이 끝남 → 메인의 것만
  });
  document.addEventListener('moai:turn', function(e) {
    const d = e.detail || {}; if (!M.sessionActive) return;
    if (d.family) { btFamily = d.family; LIGHTS[1].key = d.family; }
    const b = d.beat || 0.5, mo = beamMotion(d.role === 'wait' ? 'listen' : d.role), w = wants(d.role);
    if (LIGHTS[0].on !== w[0] || LIGHTS[1].on !== w[1]) lightsTo(d.role, clockA(), Math.min(0.3, b));       // 미리 예약하지 못한 턴 — 바로
    if (d.next && d.next.role !== 'wait') lightsTo(d.next.role, d.next.time - mo.lead * b, mo.lead * b, true);   // 이 턴의 마지막 박에 다음 턴의 조명으로
  });
  function applyBeam(dur) { shape(0, dur); shape(1, dur); }   // 값이 바뀌었을 수 있을 때 (값 조정 도구 · 단계) 지금 모양을 다시 넣는다 — 어떤 모양을 가질지는 조명이 스스로 (beamFollow)
  function applyExtras(fast) {           // 턴이 바뀔 때: 햇살 · 테두리
    const dur = fast ? 0.12 : ATMO.dur, h = heatNow();
    applyBeam(dur);
    if (M.frameFx) {
      const F = M.frameFx, on = IMPACT.on && FRAME.on, m = on && moodFamily && mood === 'listen' ? miniOf(moodFamily)[0] : null;
      // 띠의 색 — 세션: 턴의 역할 (콜 = 계열 색 · 리스폰스 = 주황) / 필드의 패턴 미션: 주황이 기본, **발신 소리가 나오는 루프에만 파랑** (턴의 역할이 아니라 소리를 따른다 — 안내 목소리는 치는 루프에도 되풀이된다) / 그 밖: 킥이 울리면 흰 띠
      const b = !on ? null : M.sessionActive ? (mood === 'listen' ? Object.assign({}, FRAME.band.listen, m && m.color ? { color: m.color } : null) : mood === 'respond' ? FRAME.band.respond : null)
        : patternMission() ? (fieldCalling ? FRAME.band.listen : FRAME.band.respond) : (M.impact && M.impact.kicking() ? FRAME.band.base : null);
      F.tone(Object.assign({ dur: dur }, b || { w: 0, a: 0 }));
      F.corners({ color: b ? b.color : '#ffffff', a: on && mood !== 'none' ? FRAME.corners.a : 0 });
      if (!on || mood === 'none') F.run(null);
    }
  }
  // 빛줄기의 자리 · 폭: 프레임마다 대상의 화면 자리를 읽어 그대로 놓는다 (전환 중이면 앞 대상과 새 대상을 섞어서)
  let beamT = 0;
  function beamFollow(ms) {
    requestAnimationFrame(beamFollow);
    const bs = M.atmo && M.atmo.beams; if (!bs) return;
    const dt = Math.min(0.05, beamT ? (ms - beamT) / 1000 : 0), on = IMPACT.on && BEAM.on && SW.beams; beamT = ms;
    if (!on) { bs[0].alpha(0); bs[1].alpha(0); return; }                                    // 꺼 두었으면 따라가지도 않는다 (프레임마다 자리 · 폭을 넣지 않는다)
    const tA = clockA();
    const v = cam() && cam().view ? cam().view('world') : null;                            // 카메라의 지금 보기
    if (M.atmo.world) M.atmo.world(v);                                                     // → 세계의 틀에 (메인의 빛줄기: 점들은 세계의 자리 그대로)
    for (let i = 0; i < 2; i++) {
      const L = LIGHTS[i], want = lookOf(i);
      if (L.next && tA >= L.next.t0) { const n = L.next; L.next = null; n.a0 = fadeNow(L, tA); L.fade = n; L.on = n.a1; }   // 예약해 둔 것의 시각이 됨
      const wt = L.key ? fadeNow(L, tA) : 0;                                               // 켜진 정도
      if (want !== L.look && (L.lit < 0.02 || (wt >= 1 && L.on === 1))) { L.look = want; shape(i, ATMO.dur); }   // 모양: 꺼져 있을 때 (바로) · 다 켜져 머무는 동안 (천천히)만 바꾼다 — 켜지고 꺼지는 도중에는 그대로
      const V = L.look ? lookVal(L.look) : null, P = L.key && V ? poseOf(L.key, V, i === 1 ? v : null) : null;   // 미니의 것만 화면으로 환산
      if (P && P.left !== L.left) { L.left = P.left; shape(i, BEAM.flip); }                // 대상이 돌아봄 → 반대편으로 (꺼져 있으면 바로)
      if (V) L.a = L.lit < 0.02 ? V.a : L.a + (V.a - L.a) * Math.min(1, dt / 0.25);        // 켜졌을 때의 세기 (모양이 바뀌면 천천히 따라간다)
      L.lit = P ? wt : 0;
      bs[i].alpha(on ? L.a * L.lit : 0);
      if (P) { bs[i].size(P.w); bs[i].at(P.x, i === 1 ? Math.max(0.3, Math.min(1.05, P.y)) : P.y); }
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(beamFollow);
  setTimeout(function() { applyExtras(); }, 0);                        // 처음의 햇살 (킥이 없어도 깔린다)

  let mood = 'none', moodFamily = null, rayTurn = 0, lastKickAt = -1e9, holding = false, kickIdle = null, fieldCalling = false, fieldCallTimer = null, fieldLoopEnd = 0, holdFrom = 0;
  function atmoOn() { return IMPACT.on && SW.filter && M.atmo; }
  function miniOf(family) { return M.fieldActors ? M.fieldActors.list().filter(function(a) { return a.kind === 'mini' && (!family || a.stage === family); }) : []; }
  // 필드에서 패턴 미션 중인가 (패턴을 듣고 치는 미션 — 소강 · 발신 · 리스폰스 내내). 홀드로 게이지를 채우는 미션 · 미션이 없을 때는 아님
  function patternMission() { return !!(M.fieldRhythm && M.fieldRhythm.mode && M.fieldRhythm.mode() === 'eval'); }
  function applyMood() {
    if (!atmoOn()) return;
    // 세션: 턴과 무관하게 그 세션의 바탕 하나 (예전: 리스폰스에서 주황의 밝은 필터로 갈아탔다 — 턴마다 색조와 밝기가 같이 뒤집혀 대비가 심했다)
    // 필드: 필터는 턴이 아니라 미션의 종류를 따른다
    //   패턴 미션 = 내내 같은 옅은 따뜻한 색 (소강 · 발신 · 리스폰스의 구별 없이 — 발신과 리스폰스 사이에서 한 번 바뀌는 것이 어색했다. 구별은 카메라의 기울기 · 테두리가)
    //   홀드 미션 · 미션이 없을 때 = 필터 없음: 필드의 처음과 끝인 야외가 칙칙한 채로 지속되지 않게 (예전: 곡이 시작된 뒤로는 킥이 울리는 동안 둘레가 내내 어두웠다)
    //   만든 세션 (구구): 세션의 바탕을 깔지 않는다 — 필터는 필드의 규칙 그대로
    const sess = M.sessionActive && !customFamily(moodFamily);
    if (sess && mood !== 'none') { const m = moodFamily ? miniOf(moodFamily)[0] : null; M.atmo.tone(Object.assign({}, ATMO.listen, m && m.color ? { color: m.color } : null, { dur: ATMO.dur })); }
    else if (!sess && patternMission()) { const h = heatNow(); M.atmo.tone(Object.assign({}, ATMO.respond, { a: ATMO.respond.a + ATMO.heat.a * h, spot: Math.max(0, ATMO.respond.spot + ATMO.heat.spot * h), dur: ATMO.dur })); }
    else M.atmo.tone({ dur: ATMO.dur });
  }
  function setMood(m, family) { mood = m; moodFamily = family || null; applyMood(); applyExtras(); }
  function noteDelayMs(tick) {           // 일찍 눌렀으면 그 음표의 칸까지 남은 시간 (ms)
    const G = window.G, ms = (G && G.noteInputMarks) || [], bpm = (G && G.BPM) || 0;
    if (!RESP.onGrid || !bpm) return 0;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].tick === tick && ms[i].abs != null) return Math.max(0, Math.min(90, (tick - ms[i].abs) * 60000 / bpm / 4));
    return 0;
  }
  function spanOr(k, sec, max) { const g = M.impact && M.impact.span ? M.impact.span(k) : null; return g ? Math.min(g, max) : sec; }
  function face() { return mainSpot('shock'); }
  // ── 이펙트의 자리 · 심도 ──
  //   심도: 소리에서 나오는 이펙트는 앞에서 — 전경(땅 6 · 미니 모아이 6.3)보다 앞이어야 가려지지 않고, 메인 모아이(5)는 전경보다 뒤이므로 모아이보다도 앞 (고를 것이 아니라 정해지는 것)
  //     (처음에는 고리 · 빛살을 모아이 뒤 4.6 ~ 4.7에 깔았다 — 후광으로 보였고 아래쪽이 풀밭에 잘렸다)
  //   자리 (캔버스 비): 메인 = 모아이 그림 상자의 가운데에서 얼마나 (모아이가 왼쪽을 보면 가로를 뒤집는다) / 미니 = 그 미니의 자리(a.p)에서 얼마나 (왼쪽을 보면 가로를 뒤집는다)
  //   값 조정: 주소에 ?fxtune (js/fx-tuner.js — 항목을 골라 옮기고, 이 형식으로 출력)
  //   값: 사용자가 ?fxtune으로 맞춘 것 (2026-10-09)
  //   메인의 빛살만은 모아이의 바로 뒤 (raysZ.main) — 면이라 앞에 있으면 얼굴을 덮는다 (미니의 빛살은 뒤로 보내 봤으나 앞이 낫다는 판정 — 앞 그대로). 메인은 모아이(5) 뒤라 아래쪽이 풀밭(6)에 잘리지만, 지금 빈도(7조각 · 짧게)라면 괜찮다는 판정. 고리 · 하트는 앞
  const SPOT = { z: 9, raysZ: { main: 4.7, mini: 9 },
    main: { shock: { dx: -0.04, dy: -0.1 }, rays: { dx: -0.04, dy: -0.1 }, hearts: { dx: -0.02, dy: -0.2 },
            gather: { dx: 0.06, dy: 0.06 } },   // 홀드: 누르는 동안 모여드는 점 — 입 쪽 (사용자가 맞춘 값)
    mini: { ring: { dx: -0.01, dy: -0.01 }, shock: { dx: -0.01, dy: -0.01 }, rays: { dx: -0.01, dy: -0.01 } } };
  function mainSpot(kind) {
    const b = moaiBox(), o = SPOT.main[kind]; if (!b || !o) return null;
    return { x: b.cx + (M.LAYOUT.moai.flip ? -o.dx : o.dx), y: b.cy + o.dy };   // 상자는 반전 축에 대해 이미 옮겨져 있다 (js/layout.js placedRect) — 가로만 뒤집는다
  }
  function miniSpot(a, kind) { const o = SPOT.mini[kind]; return { x: a.p.x + o.dx * (a.p.flip ? -1 : 1), y: a.p.y + o.dy }; }
  function VM(name, kind, o) { const q = mainSpot(kind); if (q) V(name, q.x, q.y, Object.assign({ z: SPOT.z }, o)); }
  function VN(name, a, kind, o) { const q = miniSpot(a, kind); V(name, q.x, q.y, Object.assign({ z: SPOT.z }, o)); }
  function respondFx(gname, tick, edgeOk) {   // 리스폰스의 맞힘
    const L = RESP.layers[gname]; if (!L) return;
    const go = function() {
      const f = face(); if (!f) return;
      const col = RESP.color[gname];
      if (L.shock) VM('shock', 'shock', { from: RESP.shock.from, size: RESP.shock.size, life: spanOr(1, RESP.shock.life, RESP.shock.max), color: col, width: RESP.shock.width * L.shock });
      if (L.rays) VM('rays', 'rays', { z: SPOT.raysZ.main, n: L.rays, life: spanOr(0.5, RESP.rays.life, RESP.rays.max), size: RESP.rays.size, color: col, turn: rayTurn });
      if (L.hearts) VM('hearts', 'hearts', { n: L.hearts, color: RESP.heart, speed: RESP.hearts.speed, scale: RESP.hearts.scale });
      if (L.edge && edgeOk && M.fx.edge) M.fx.edge(RESP.edge.color, RESP.edge.a, RESP.edge.ms);
    };
    const d = noteDelayMs(tick);
    if (d > 4) setTimeout(go, d); else go();
  }
  function burstFx(shocks, rays, hearts, col, lead) {   // 고리 여러 겹 + 빛살 + 하트 (패턴 성공) — lead = 첫 겹을 몇 번째로 치는가 (늦게 · 크게)
    const f = face(); if (!f) return;
    shocks.forEach(function(k, j) { const i = j + (lead || 0); setTimeout(function() { VM('shock', 'shock', { from: RESP.shock.from, size: RESP.shock.size * (1 + i * 0.12), life: spanOr(1, 0.3, 0.55), color: col, width: RESP.shock.width * k }); }, i * 70); });
    if (rays) VM('rays', 'rays', { z: SPOT.raysZ.main, n: rays, life: spanOr(0.5, 0.16, 0.25), size: RESP.rays.size * 1.15, color: col, turn: rayTurn });
    if (hearts) VM('hearts', 'hearts', { n: hearts, color: RESP.heart, speed: RESP.hearts.speed * 1.25, scale: RESP.hearts.scale });
  }
  // 킥
  document.addEventListener('moai:drum', function(e) {
    const d = e.detail || {}, now = performance.now() / 1000;
    if (d.drum !== 'kick' || !impactOn()) return;
    if (M.fieldBgm && M.fieldBgm.timeline && d.tl && M.fieldBgm.timeline() !== d.tl) return;   // 필드의 곡만 (비트 탭의 시험 재생 등은 아님)
    const first = !M.impact.kicking();
    M.impact.kick(d);
    clearTimeout(kickIdle); kickIdle = setTimeout(function() { if (!M.impact.kicking()) { applyMood(); applyExtras(); } }, (d.gap * M.impact.kickPolicy.stale + 0.15) * 1000);   // 킥이 끊기면 (곡이 멈춤) 바탕의 조명도 걷힌다
    if (now - lastKickAt < KICK.min) return;
    lastKickAt = now; rayTurn++;
    if (first || mood === 'none') { applyMood(); applyExtras(); }    // 킥이 들어왔다 → 바탕의 조명 · 테두리의 띠
    if (BEAM.on && M.atmo && M.atmo.beamBeat && (BEAM.kickInMove || !beamMoving())) M.atmo.beamBeat({ amp: BEAM.kick * (d.accent ? 1.6 : 1), dur: Math.max(0.1, Math.min(0.4, d.gap * ATMO.beat.span)) });
    if (FRAME.on && M.frameFx) M.frameFx.kick({ amp: d.accent ? FRAME.kick.accent : FRAME.kick.amp, dur: Math.max(0.1, Math.min(0.4, d.gap * ATMO.beat.span)) });
    if (CAMX.on && cam() && now - bigPulseAt > 0.25) cam().pulse({ amp: d.accent ? CAMX.kick.accent : CAMX.kick.amp });   // 더 큰 펄스(맞힘 · 콜)가 도는 중이면 양보
    const span = Math.max(0.1, Math.min(0.4, d.gap * ATMO.beat.span));
    if (atmoOn()) M.atmo.beat({ amp: d.accent ? ATMO.beat.accent : ATMO.beat.amp, dur: span });
    M.impact.squash({ amp: KICK.squash * (d.accent ? 1.5 : 1), dur: span });
    M.impact.nod({ amp: KICK.nod, mini: KICK.mini, dur: span });
  });
  // 콜의 음표
  // 구구 (만든 세션의 NPC — 배경 요소 gugu): 한 번 튄다 + 그 자리에서 고리. 값은 GUGU 한 곳
  const GUGU = { id: 'gugu', amp: 0.14, hop: 0.03, dur: 0.22, ring: '#ffffff' };
  function guguAt() { const it = M.scenery && M.scenery.items ? M.scenery.items().filter(function(x) { return x.id === GUGU.id; })[0] : null; return it ? { x: it.x, y: it.y } : null; }
  function guguAct(k) { if (M.impact && M.impact.itemPunch) M.impact.itemPunch(GUGU.id, { amp: GUGU.amp * k, hop: GUGU.hop * k, dur: GUGU.dur }); }
  function customFamily(f) { return !!(M.session && M.session.custom && f && f === M.session.custom.family); }
  document.addEventListener('moai:call', function(e) {
    const d = e.detail || {};
    if (!impactOn()) return;
    if (d.where === 'session' && customFamily(d.family)) {             // 만든 세션: 부르는 쪽 = 구구 — 음표마다 튀고, 떽 · 어택에는 고리
      guguAct(d.type === 'release' ? 0.6 : 1);
      const q = d.type !== 'release' ? guguAt() : null; if (q) V('ring', q.x, q.y, { z: 9, color: GUGU.ring });
      if (atmoOn()) M.atmo.beat({ amp: CALL.beat, dur: 0.3 });
      return;
    }
    if (d.where === 'field' && !fieldCalling) {                         // 필드: 발신 소리가 나오기 시작 → 이 루프가 끝날 때까지 띠가 파랑
      fieldCalling = true; applyExtras(true);
      clearTimeout(fieldCallTimer); fieldCallTimer = setTimeout(function() { fieldCalling = false; applyExtras(); }, Math.max(0.2, fieldLoopEnd - nowA()) * 1000);
    }
    const list = d.where === 'session' ? miniOf(d.family) : (CALL.chorus ? miniOf(null) : []);
    const dur = spanOr(0.5, fitDur(0.12), 0.2);
    list.forEach(function(a) {
      if (d.where === 'field' && M.fieldActors.act) M.fieldActors.act(a.stage, d.type === 'hold' ? 'hold' : d.type === 'release' ? 'release' : 'tap');   // 필드: 미니들이 합창으로 부른다
      const K = CALL[d.where === 'session' ? 'session' : 'field'], col = a.color || '#ffffff';
      M.impact.miniPunch(a.stage, { amp: K.amp * (d.type === 'release' ? 0.6 : 1), dur: dur });
      if (d.type === 'release') return;
      if (K.ring) VN('ring', a, 'ring', { size: K.ring, color: col });
      if (K.shock) VN('shock', a, 'shock', { size: K.shock.size, life: spanOr(1, 0.26, 0.5), color: col, width: K.shock.width });
      if (K.rays) VN('rays', a, 'rays', { z: SPOT.raysZ.mini, n: K.rays.n, life: spanOr(0.5, 0.14, 0.22), size: K.rays.size, color: col, turn: rayTurn });
    });
    if (atmoOn()) M.atmo.beat({ amp: CALL.beat, dur: dur * 2 });
    if (d.type === 'release') return;
    if (FRAME.on && M.frameFx) M.frameFx.pinch({ amp: FRAME.call.pinch, dur: dur * 2 });
    if (d.where === 'session') camPulse(CAMX.call.session);
    else if (CAMX.on && cam() && cam().tilt) {                         // 필드: 얕은 펄스 + 음표마다 좌우로 번갈아 기운다 (콜이 끝나면 돌아온다)
      camPulse(CAMX.call.field); tiltSide = -tiltSide;
      lean('call', CAMX.call.cover, { dur: 0.15 }); cam().tilt(CAMX.call.tilt * tiltSide, { dur: 0.14 });
      clearTimeout(tiltTimer); tiltTimer = setTimeout(function() { if (cam()) cam().tilt(0, { dur: 0.4 }); lean('call', 0, { dur: 0.4 }); }, CAMX.call.hold * 1000);
    }
  });
  // 턴 (세션 · 필드)
  document.addEventListener('moai:turn', function(e) {
    const d = e.detail || {}, G = window.G;
    setMood(d.role === 'respond' ? 'respond' : d.role === 'listen' || d.role === 'wait' ? 'listen' : 'none', d.family);
    // 내 차례 직전의 들숨: 다음이 내 차례면 이 턴의 마지막 박에
    if (impactOn() && INHALE && d.next && d.next.role === 'respond' && d.role !== 'respond' && G && G.conductor && G.conductor.at && d.beat)
      G.conductor.at(d.next.time - d.beat, function() { M.impact.inhale({ amp: INHALE.amp, dur: d.beat }); preTurn(d.beat); });
    if (impactOn() && FRAME.on && FRAME.run && M.frameFx && d.length && (d.role === 'listen' || d.role === 'respond')) M.frameFx.run({ dur: d.length, color: FRAME.run.color });
  });
  function preTurn(beat) {               // 내 차례 직전의 한 박: 모서리가 끝까지 조였다가 첫 박에 풀리고, 카메라가 물러났다 제자리로
    if (!impactOn()) return;
    if (FRAME.on && M.frameFx) M.frameFx.pinch({ amp: FRAME.preturn.pinch, dur: beat, wind: true });
    lean('pre', CAMX.preturn.amp, { dur: beat * 0.9, ease: 'out' });
    setTimeout(function() { lean('pre', 0, { dur: 0.12 }); }, beat * 1000);
  }
  document.addEventListener('moai:field-turn', function(e) {
    if (M.sessionActive) return;
    const d = e.detail || {}, left = d.nextAt ? d.nextAt - nowA() : 0;
    fieldLoopEnd = d.nextAt || 0;
    setMood(d.role === 'none' ? 'none' : d.role, null);
    lean('turn', d.role === 'respond' ? CAMX.turn.respond : 0, { dur: CAMX.turn.dur });
    if (impactOn() && FRAME.on && FRAME.run && M.frameFx && d.role !== 'none' && left > 0.3) M.frameFx.run({ dur: left, color: FRAME.run.color });
    if (d.role === 'listen' && left > d.beat && d.beat) setTimeout(function() { if (mood === 'listen' && !M.sessionActive) preTurn(d.beat); }, (left - d.beat) * 1000);
  });
  document.addEventListener('moai:session', function(e) { if (!e.detail.active) setMood('none'); lean('turn', 0, { dur: 0.3 }); lean('hold', 0, { dur: 0.2 }); });

  const JUDGE = { hit: { pulse: 0.008, n: 9, sfx: 'noteHit' }, miss: { edge: ['rgba(255,40,60,0.9)', 0.85, 380], jolt: 0.012, sfx: 'noteMiss' }, whiff: { sfx: 'noteWhiff' } };
  document.addEventListener('moai:judge', function(e) {
    const d = e.detail || {}, G = window.G;
    if (d.kind === 'miss' || d.kind === 'whiff') {
      if (M.sessionActive && d.kind === 'miss' && impactOn()) {      // 세션: 모아이가 움찔하고 필터가 한 박 살짝 더 가라앉는다
        const G = window.G, beat = G && G.BPM ? 60 / G.BPM : 0.5;
        if (MISS) M.impact.droop({ amp: MISS.droop, dur: Math.min(0.35, beat * 0.6) });
        if (atmoOn() && M.atmo.nudge) M.atmo.nudge(Object.assign({ dur: beat * ATMO.react.miss.beats }, ATMO.react.miss));
      }
    }
    if (d.kind === 'hit') {
      holdFrom = d.tick;                                              // 홀드의 누름일 수 있다 — 유지 중의 맥박은 여기서부터 센다
      S(JUDGE.hit.sfx, { grade: G && G.feedback && G.feedback.gradeOf ? G.feedback.gradeOf(d.tick) : 'ace' });   // ACE는 더 밝게
      if (cam()) cam().pulse({ amp: JUDGE.hit.pulse });
      const gname = gradeAt(d.tick), gr = impactOn() ? IMPACT.grade[gname] : null;
      if (G && G.feedback && G.feedback.burst) G.feedback.burst(d.tick, gr ? gr.n : JUDGE.hit.n);
      if (gr) {
        const mul = heatMul();
        const bright = (gr.flash || (RESP.layers[gname] && RESP.layers[gname].edge)) && M.impact.flashOk();   // 큰 면적의 밝기는 한 번의 한도를 같이 쓴다 (모아이의 밝아짐 + 가장자리 빛)
        if (gr.amp) M.impact.punch({ amp: gr.amp * mul, dur: fitDur(gr.dur), flash: bright ? gr.flash : 0, checked: true });   // 밝아짐에는 단계의 배수를 걸지 않는다 (절제)
        respondFx(gname, d.tick, bright);
        if (atmoOn() && M.atmo.nudge && ATMO.react.hit[gname]) M.atmo.nudge(Object.assign({ dur: (G && G.BPM ? 60 / G.BPM : 0.5) * ATMO.react.hit.beats }, ATMO.react.hit[gname]));   // 필터의 반응 (바탕의 근방에서)
        if (IMPACT.world.bounce) M.impact.bounce(Object.assign({}, IMPACT.world.bounce, { dur: fitDur(IMPACT.world.bounce.dur) }));
      }
    } else if (d.kind === 'hold') {      // 홀드를 유지하는 동안 16분음표 한 칸마다 오는 확인 — 몇 칸에 한 번만, 가볍게 (누를 때 · 뗄 때의 이펙트가 가장 크고 그 사이는 작게)
      const Pu = impactOn() && IMPACT.hold ? IMPACT.hold.pulse : null, off = d.tick - holdFrom;
      if (Pu && Pu.every > 0 && off > 0 && off % Pu.every === 0) {
        if (Pu.amp) M.impact.punch({ amp: Pu.amp, dur: fitDur(0.1), flash: 0, checked: true });
        if (Pu.hearts) VM('hearts', 'hearts', { n: Pu.hearts, color: RESP.heart, speed: RESP.hearts.speed, scale: RESP.hearts.scale });
      }
    // (맞힘의 이펙트 한 벌은 붙이지 않는다. 누르고 있다는 것은 떨림 · 모여드는 점 · 카메라의 다가감 · 꼬리의 빛이 말한다
    //   예전: 이것을 '끝까지 맞히고 떼는 순간에 한 번'으로 잘못 알고 가장 큰 튀기(9%)와 이펙트 한 벌을 붙였다 — 홀드 한가운데에서 칸마다 되풀이됐다)
    } else if (d.kind === 'whiff' && M.sessionActive) {
      S(JUDGE.whiff.sfx);
    } else if (d.kind === 'miss' && M.sessionActive) {
      S(JUDGE.miss.sfx);
      if (M.fx && M.fx.edge) M.fx.edge.apply(null, JUDGE.miss.edge);
      if (cam() && cam().jolt) cam().jolt({ amp: JUDGE.miss.jolt });
    }
  });

  // ── 마지막 성공: 패턴을 다 맞힌 순간 (필드 = 루프 성공 'moai:field-event' loopClear / 세션 = 단계 성공 'moai:stage-step') ──
  //   마지막으로 맞힌 음표 자리에서 평소보다 크게 퍼지는 이펙트 (rhythm/feedback.js finale) + 조금 더 큰 펄스
  //   (패턴은 그 순간 걷히거나 곧 바뀐다 — 이펙트는 자리를 기억해 끝까지 그려진다)
  const FINALE = { pulse: 0.02 };
  function finale() {
    const G = window.G;
    if (G && G.feedback && G.feedback.finale) G.feedback.finale();
    if (cam()) cam().pulse({ amp: FINALE.pulse });
    worldClear();
    if (G && G.guideFx && impactOn()) G.guideFx.finale();           // 비트 막대: 줄이 쓸려 나가고 · 맞힌 음표가 차례로 튀고 · 큰 빛기둥
    if (impactOn() && FRAME.on && M.frameFx) { const x = G && G.guideFx ? G.guideFx.lastX() : 0.5; ['bottom', 'top'].forEach(function(sd, i) { setTimeout(function() { M.frameFx.ripple({ side: sd, at: x, color: RESP.color.ace, amp: FRAME.ripple.clear, dur: 0.5 }); }, i * 120); }); }
    if (impactOn() && CAMX.on && cam()) {
      const C2 = CAMX.clear; camPulse(C2.pulse); tiltSide = -tiltSide;
      if (cam().tilt) { lean('clear', C2.cover, { dur: C2.dur }); cam().tilt(C2.tilt * tiltSide, { dur: C2.dur }); setTimeout(function() { if (cam()) cam().tilt(0, { dur: 0.4 }); lean('clear', 0, { dur: 0.4 }); }, C2.dur * 1000 + 60); }
    }
    if (impactOn()) { M.impact.punch({ amp: RESP.clear.amp, dur: spanOr(1, 0.3, 0.45), flash: 0 }); burstFx(RESP.clear.shocks, 0, RESP.clear.hearts, RESP.color.ace, RESP.clear.lead); }
  }
  document.addEventListener('moai:field-event', function(e) { if (e.detail && e.detail.kind === 'loopClear') finale(); });
  document.addEventListener('moai:stage-step', finale);

  // ── 필드: 게이지 ──
  document.addEventListener('moai:gauge-step', function(e) {
    const d = e.detail, fill = document.querySelector && document.querySelector('.field-gauge-fill');
    if (d.dir > 0) { S('gaugeUp', { step: d.step }); if (M.fx) M.fx.pulseEl(fill, 'glow'); }
    else { S('gaugeDown', { step: d.step }); if (M.fx) M.fx.pulseEl(fill, 'dim'); }
  });
  const sparkBar = function() { [0.2, 0.5, 0.8].forEach(function(k) { const p = gaugeSpot(k); if (p) V('sparkle', p.x, p.y, { n: 8, screen: true }); }); };   // 화면 층 — 게이지(화면 요소)보다 앞에
  const RULES = {
    // 게이지
    'appear:gauge': function() { S('barAppear'); sparkBar(); },
    'full:gauge':   function() { S('missionClear'); sparkBar(); if (cam()) cam().pulse({ amp: 0.015 }); },
    'ready:gauge':  function() {
      if (!M.fieldGauge || M.fieldGauge.policy.source !== 'hold') return;   // 홀드 미션만 (패턴 미션은 드러내기가 신호)
      S('ready'); if (M.fx) M.fx.pulseEl(el('fieldGaugeCue'), 'pop');
    },
    // 하늘·땅의 인스턴스
    'pop:balloon':  function(d) { S('pop'); V('debris', d.x, d.y, { z: 6.6 }); falls[d.id] = S('fall', { dur: 1.2 }); },
    'land:balloon': function(d) { stopHandle(falls, d.id); S('land'); V('dust', d.x, d.y + 0.03, { z: 6.6 }); },
    'tap:mini':     function(d) { S('tapHit'); V('ring', d.x, d.y, { z: 9 }); },
    'idle:gugu':    function(d) { S('tapHit'); guguAct(1); V('ring', d.x, d.y, { z: 9 }); },   // 구구를 눌렀는데 만든 세션이 없음 — 몸짓만
    'tap:sprout':   function(d) { S('tapHit'); V('ring', d.x, d.y, { z: 9 }); },
    'raise:mini':   function(d) { rises[d.id] = S('rise', { dur: 1.6 }); V('dust', d.x, d.y + 0.06, { z: 6.4, n: 14 }); if (cam()) cam().shake(0.25); },
    'risen:mini':   function(d) { stopHandle(rises, d.id); S('risen'); V('sparkle', d.x, d.y - 0.04, { z: 9, n: 10 }); },
    // 보상 (필드 미션 'progress' · 세션 'session')
    'reward:progress': function(d) { rewardFx(d.card); },
    'reward:session':  function(d) { rewardFx(d.card); },
    'reward:field':    function(d) { rewardFx(d.card); },   // 필드에서 직접 얻은 것 (새 안착 · 왕관 탭 · 배경 요소 탭 — js/field-events.js)
    // 비트 탭 해금 (js/bgm.js) — 파트가 다 모여 비트가 열릴 때만 (첫 파트 · 곡 카드는 위 보상 알림이 이미 울림)
    'unlock:bgm':      function(d) { if (d.why === 'allParts') S('reward'); },
  };
  const falls = {}, rises = {};
  function stopHandle(map, id) { const h = map[id]; if (h && h.stop) h.stop(nowA()); delete map[id]; }
  function rewardFx(card) {
    if (!card || card === 'none' || card === 'bar') return;
    if (card.indexOf('scn.') === 0 && M.scenery) {
      const it = M.scenery.items().filter(function(x) { return 'scn.' + x.id === card; })[0];
      if (it) { S('reward'); V('sparkle', it.x, it.y, { z: 9, n: 16 }); }
    } else if (card.indexOf('acc.') === 0) {
      const r = moaiBox();
      S('reward'); if (r) V('sparkle', r.cx, r.cy - r.dh * 0.25, { z: 9, n: 16 });
    } else S('reward');
  }
  document.addEventListener('moai:field-event', function(e) {
    const f = RULES[e.detail.kind + ':' + e.detail.actor];
    if (f) f(e.detail);
  });

  // ── 모아이 높이 (↑/↓) — 돌 가는 소리 (높이에 따라 음높이), 멈추면 툭 ──
  let grind = null;
  function grindTick() { if (!grind) return false; grind.set(M.moaiHeightNow ? M.moaiHeightNow() : 1); return true; }
  document.addEventListener('moai:height', function(e) {
    if (e.detail.moving) {
      if (!grind) grind = S('grind', { height: e.detail.height });
      if (M.frame) M.frame.add(grindTick);
    } else {
      if (grind) { grind.stop(nowA()); grind = null; }
    }
  });

  // ── 세션 ──
  document.addEventListener('moai:session', function(e) {
    if (e.detail.active && e.detail.phase === 'wait') S('whooshIn');   // 들어감 (대기 — 레터박스)
    else if (!e.detail.active) S('whooshOut');
  });
  document.addEventListener('moai:stage-step', function(e) {
    if (e.detail.stage >= 3) return;                                    // 최상위 = 완수 (stage-result clear)
    S('stepClear'); if (M.fx) M.fx.flash('rgb(60,255,140)', 0.16, 260); if (cam()) cam().pulse({ amp: 0.012 });
  });
  document.addEventListener('moai:stage-miss', function(e) {
    if (e.detail.chances <= 0) return;                                  // 기회 소진 = 끝 (stage-result fail)
    S('stepMiss'); if (M.fx) M.fx.flash('rgb(255,60,60)', 0.22, 300); if (cam()) cam().shake(0.35);
  });
  document.addEventListener('moai:stage-result', function(e) {
    const d = e.detail;
    if (d.reason === 'clear') { S('complete'); V('confetti', 0.5, 0.25, { z: 9 }); if (cam()) cam().pulse({ amp: 0.02 }); }
    else if (d.reason === 'fail') { S('out'); if (M.fx) M.fx.flash('rgb(0,0,0)', 0.35, 700); }
  });

  // 타격 연출 끄고 켜기 (I 키 — 원래와 바로 견준다. 개발 공간 ?dev 에서만 — 처음에는 J였다: J는 뚜우엉의 키가 됐다) · 세기 (개발 탭). 화면 왼쪽 위에 지금 상태를 잠깐 띄운다
  const BASE = JSON.parse(JSON.stringify(IMPACT));
  let tag = null, tagTimer = null;
  function note(text) {
    if (!tag) { tag = document.createElement('div'); tag.style.cssText = 'position:fixed;left:70px;top:14px;z-index:9999;padding:6px 10px;background:rgba(0,0,0,0.75);color:#fff;font:14px/1.4 sans-serif;border-radius:6px;pointer-events:none'; document.body.appendChild(tag); }
    tag.textContent = text; tag.style.display = '';
    clearTimeout(tagTimer); tagTimer = setTimeout(function() { tag.style.display = 'none'; }, 1600);
  }
  function setImpact(on) { IMPACT.on = !!on; if (M.frameFx) M.frameFx.set(!!on && SW.frame); if (window.G && window.G.guideFx) window.G.guideFx.set(!!on && SW.bar); if (!on && cam()) { ['hold', 'turn', 'pre', 'call', 'clear'].forEach(function(k) { if (cam().lean) cam().lean(k, 0, { dur: 0.1 }); }); if (cam().tilt) cam().tilt(0, { dur: 0.1 }); } if (M.atmo) { M.atmo.set(!!on); if (on) applyMood(); } applyExtras(true); if (M.impact) { M.impact.on = !!on && SW.react; if (!on) M.impact.holdEnd(); } note('타격 연출 ' + (on ? '켬' : '끔') + '  (J)'); sync(); }
  // 묶음 하나를 켜고 끈다 (SW — 위). 전체 스위치(IMPACT.on)가 꺼져 있으면 켜도 나오지 않는다
  function setFx(group, on) {
    if (!(group in SW)) return; on = !!on; SW[group] = on;
    const all = IMPACT.on;
    if (group === 'beams') { if (M.atmo && M.atmo.show) M.atmo.show('beams', on); if (on) applyBeam(0); }
    else if (group === 'filter') { if (M.atmo) { if (!on) { M.atmo.tone({ dur: 0 }); } if (M.atmo.show) M.atmo.show('filter', on); if (on && all) applyMood(); } }
    else if (group === 'frame') { FRAME.on = on; if (M.frameFx) M.frameFx.set(on && all); applyExtras(true); }
    else if (group === 'bar') { if (window.G && window.G.guideFx) window.G.guideFx.set(on && all); }
    else if (group === 'react') { if (M.impact) { M.impact.on = on && all; if (!on) M.impact.holdEnd(); } }
    else if (group === 'camera') { CAMX.on = on; if (!on && cam()) { ['hold', 'turn', 'pre', 'call', 'clear'].forEach(function(k) { if (cam().lean) cam().lean(k, 0, { dur: 0.1 }); }); if (cam().tilt) cam().tilt(0, { dur: 0.1 }); } }
  }
  function setScale(k) {                 // 세기 전체에 배수 (모아이가 튀는 정도 · 배경 요소의 들썩임)
    ['ace', 'good', 'barely'].forEach(function(g) { IMPACT.grade[g].amp = BASE.grade[g].amp * k; });
    IMPACT.world.bounce.amp = BASE.world.bounce.amp * k; IMPACT.world.bounce.hop = BASE.world.bounce.hop * k;
    IMPACT.scale = k; sync();
  }
  function sync() {
    const b = document.getElementById('devImpact'), r = document.getElementById('devImpactScale'), v = document.getElementById('devImpactScaleVal');
    if (b) { b.classList.toggle('active', IMPACT.on); b.textContent = '타격 연출 ' + (IMPACT.on ? '켬' : '끔') + ' (I)'; }
    if (r) r.value = IMPACT.scale || 1;
    if (v) v.textContent = Math.round((IMPACT.scale || 1) * 100) + '%';
  }
  document.addEventListener('keydown', function(e) {
    if (!M.dev || e.repeat || e.code !== 'KeyI' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, n = t && t.tagName;
    if (n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT') return;
    e.preventDefault(); setImpact(!IMPACT.on);
  });
  (function() {
    const b = document.getElementById('devImpact'), r = document.getElementById('devImpactScale');
    if (b) b.addEventListener('click', function() { setImpact(!IMPACT.on); });
    if (r) r.addEventListener('input', function() { setScale(+r.value); });
    sync();
  })();
  M.fxRules = { fx: { get: function() { return Object.assign({}, SW); }, set: setFx, names: SW_NAME }, rules: RULES, pos: POS, impact: IMPACT, beamState: function() { return { now: clockA(), a: [M.atmo.beams[0].now().a, M.atmo.beams[1].now().a], lights: LIGHTS.map(function(L) { return { key: L.key, look: L.look, left: L.left, on: L.on, lit: +L.lit.toFixed(3), next: L.next ? { a1: L.next.a1, t0: L.next.t0, dur: L.next.dur } : null }; }) }; }, spot: SPOT, spotOf: { main: mainSpot, mini: miniSpot }, test: { pulse: function() { const Pu = IMPACT.hold.pulse; if (Pu.amp) M.impact.punch({ amp: Pu.amp, dur: 0.1, flash: 0, checked: true }); if (Pu.hearts) VM('hearts', 'hearts', { n: Pu.hearts, color: RESP.heart, speed: RESP.hearts.speed, scale: RESP.hearts.scale }); }, mood: function(m) { setMood(m || 'none', null); }, gather: function() { for (let i = 0; i < 6; i++) setTimeout(gatherFx, i * 120); }, hit: function(g) { respondFx(g || 'ace', -1, false); }, release: function() { respondFx('ace', -1, false); }, call: function(where, family) { document.dispatchEvent(new CustomEvent('moai:call', { detail: { type: 'tap', where: where || 'field', family: family } })); } }, beam: BEAM, frame: FRAME, camx: CAMX, atmo: ATMO, resp: RESP, call: CALL, kick: KICK, mood: function() { return mood; }, fieldCalling: function() { return fieldCalling; }, patternMission: patternMission, heat: heatNow, setImpact: setImpact, setImpactScale: setScale };   // 시험·조정용
})();
