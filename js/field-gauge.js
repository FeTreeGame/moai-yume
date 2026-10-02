// 필드 게이지 — 채우면 알리기만 한다 (무엇을 할지는 연결표 js/field-events.js)
//   단계: 'appear' = 바 드러내기 (첫 게이지 — 채운 만큼 바의 불투명도 0 → 1, 다 차면 바가 생김 → 'appear' 알림 + 연출 —
//                    생긴 바는 다 찬 막대로 보이고 쉼 동안 비워짐: 다 찼을 때와 같은 모습)
//         'fill'   = 바 채우기 (채운 만큼 바 안의 막대가 참, 다 차면 'full' 알림 + 같은 연출 → 소강)
//   쉼 (lock): 다 찬 순간부터 **끝 시각**까지 — 채움은 받지 않는다. 끝 시각은 진행 표가 다 찬 순간 정해 건다 (restUntil — 루프 단위 소강:
//     비트가 있으면 다음 루프 첫 박 규칙, 없으면 필드 템포 1루프). 걸지 않으면 기본 = 필드 템포 GAUGE.rest.loops루프
//     'fx'    = 연출 중 (연출 길이만큼 — FX[사건].ms, 끝 시각을 넘지 않음). 다 찬 막대는 그대로
//     'drain' = 소강 (연출 뒤 끝 시각까지): 막대가 남은 시간 비율로 0까지 비워진다 (바 생성 뒤도 같음)
//     시간은 오디오 시계로 잰다 (끝 시각과 지금을 비교 — 프레임 간격을 더하지 않아 밀리지 않음, 채움 잠금도 그 순간의 비교로)
//   홀드 미션이 다 차면 연결표가 누르던 입력을 놓는다 (엉 — 그 홀드는 끝, 알림의 source 'hold'). 쉼 동안은 안 참.
//     받기 시작하는 순간(쉼 끝·미션 다시 받음 — 문구 HOLD NOW!가 뜨는 때)부터 어택을 시작한 뚜~만 찬다 — 그 전에 눌러 둔 것은 떼고 다시
//   채우는 쪽: add(초) 한 곳으로 들어온다 — 지금은 홀드(뚜~ 누르는 동안의 실제 시간)만. 홀드 단계는 누르지 않으면 줄어든다 (GAUGE.decay)
//     (이후 시간에 따라 조금씩(필드 시계)·필드 패턴 히트 등이 같은 add를 부를 자리 — 어느 단계부터 무엇을 쓸지는 미정)
//     소리 알림 'moai:voice' (original.js) { sound: 'doo'(누름 시작) | 'pah' | 'wop' | 'stop'(강제 정리) }으로 누르는 동안을 안다
//   표시: 화면 층 DOM (#fieldGauge — 캔버스 상단, 가이드 막대(rhythm/hud.js — 하단)와 위아래 대칭, style.css). 필드 그림과 무관
//     홀드 미션 문구 (#fieldGaugeCue — 게이지 바로 아래, 자리 표시): 홀드 단계에서 홀드를 기다리는 동안 'HOLD NOW!', 누르는 중 'KEEP HOLDING!'.
//       쉼·미션 꺼짐·홀드가 아닌 단계(패턴 미션)엔 숨김. 진행 표의 어느 단계든 홀드 카드면 같음 (CUE)
//     연출 = Web Animations (el.animate — 없는 환경에선 생략, 쉼 길이는 그대로). 효과음은 알림을 듣는 쪽에 붙일 자리
//   게이지 미션을 받지 않는 동안 (진행 표 js/field-progress.js의 상태): 숨김, 채우지 않음 (쉼은 계속 흐름). 다시 받으면 채움·쉼을 비우고 처음부터 (단계·바 생김은 그대로)
//     세션(스테이지 — 진입 대기 포함)도 이 상태로 — 세션 시작이 끄고 끝이 되돌린다 (연결표 js/field-events.js)
//   사건: document 'moai:field-event' { kind: 'appear'|'full'|'ready', actor: 'gauge', count (다 채운 횟수 — 'full'부터 1), source (그 단계의 입력원 — 'hold'|'rhythm') }
//     'ready' = 쉼이 끝남 (다시 채울 수 있음 — 알림만. 다음 조건은 진행 표가 다 찬 순간 끝 시각으로 예약)
//   그리기 = 프레임 루프 (frame.js — 누르는 동안·쉼 동안·줄어드는 동안만). 새로고침하면 처음부터 (저장은 아직 없음)
(function() {
  const M = window.Moai;

  // 한 번 채우는 데 드는 양: appear = 바 드러내기, fill = 바 채우기 — 초(숫자) · { loops: n } (지금 필드 템포의 루프 수) · { points: n } (개수 — 예: 루프 성공 n번)
  //   진행 표가 단계마다 정함 (setNeed). 입력원(source)도 단계마다: 'hold' = 뚜~ 누르는 동안의 시간 / 그 밖(예: 'rhythm' — 필드 평가) = 쓰는 쪽이 add(개수)
  //   루프 = 한 줄 = 1마디 = 박 loopBeats개 (진입 대기의 루프와 같은 말 — rhythm/session.js ROW 16 tick). 기본 100 BPM에서 1루프 = 2.4초
  //   rest = 쉼의 기본 길이 (끝 시각을 걸지 않았을 때 — 필드 템포 루프 수)
//   appearLook = 바 드러내기 동안 막대: 'fill' = 채운 만큼 막대도 참 (불투명도와 함께 — 이후 미션과 같은 "누르면 찬다") /
//                'full' = 꽉 찬 막대로 불투명도만 오름. 어느 쪽이든 다 차는 순간 = 가득 찬 막대 → 소강으로 이어짐
//   decay = 누르지 않는 동안 줄어드는 속도 (차는 속도에 대한 비 — 0.5면 다 비는 데 필요량의 두 배. 0 = 줄지 않음). 홀드 단계만, 쉼·미션 꺼짐 중엔 없음
  const GAUGE = { appear: { loops: 1 }, fill: { loops: 1 }, rest: { loops: 1 }, loopBeats: 4, source: 'hold', appearLook: 'fill', decay: 0.5 };
  function tempo() { const t = M.fieldBgm && M.fieldBgm.tempo ? M.fieldBgm.tempo() : 0; return t > 0 ? t : 100; }
  function loopSec() { return GAUGE.loopBeats * 60 / tempo(); }
  function clock() { const G = window.G; return G && G.actx ? G.actx.currentTime : performance.now() / 1000; }   // 오디오 시계 (없으면 벽시계)
  function needSec(spec) {           // 필요량 → add 단위 (초 — 루프 수면 지금 템포로, 템포가 바뀌면 속도도 따라 바뀜 / 개수면 그 수)
    if (spec && typeof spec === 'object') {
      if (spec.points) return spec.points;
      return (spec.loops || 0) * GAUGE.loopBeats * 60 / tempo() + (spec.beats || 0) * 60 / tempo();
    }
    return spec;
  }
  // 연출 (디테일 — 바 전체): 사건별. 지금은 둘 다 같은 연출 (부풀며 흰 빛 → 제자리 — 바탕은 흰색, 차 있는 막대는 밝게)
  const BURST = { ms: 500, frames: [
    { transform: 'scale(1, 1)', backgroundColor: 'rgba(255,255,255,0.95)', filter: 'brightness(1.8)' },
    { transform: 'scale(1.03, 1.8)', offset: 0.3 },
    { transform: 'scale(1, 1)', backgroundColor: 'rgba(16,14,36,0.85)', filter: 'brightness(1)' },
  ] };
  const FX = { appear: BURST, full: BURST };

  let phase = 'appear';
  let value = 0;                     // 0~1 (지금 단계의 채움)
  let count = 0;                     // 'fill'을 다 채운 횟수
  let holding = false;               // 지금 누르는 뚜~가 채우는 중인가 (쉼이 끝난 뒤 누른 것만)
  let lock = null;                   // 쉼: null | { from(시작), fxEnd(연출 끝), until(끝 시각), drainFrom(소강 시작 때의 채움) }

  const el = document.getElementById('fieldGauge');
  const bar = el && el.querySelector ? el.querySelector('.field-gauge-fill') : null;
  const cue = document.getElementById('fieldGaugeCue');   // 홀드 미션 문구 (자리 표시)
  const CUE = { wait: 'HOLD NOW!', hold: 'KEEP HOLDING!' };

  function receiving() { return !M.fieldProgress || M.fieldProgress.receiving(); }   // 게이지 미션을 받는 상태 (진행 표가 가짐)
  function paused() { return !receiving(); }
  function emit(kind) {   // source = 그 단계의 입력원 (다 찬 순간의 것 — 진행 표가 다음 단계로 넘기기 전)
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: kind, actor: 'gauge', count: count, source: GAUGE.source } }));
  }
  // 보이기 상태 (하단 루프 막대가 같이 보이고 숨는다 — js/field-rhythm.js): shown = 미션을 받는 중, alpha = 바의 불투명도 (바 생성 단계 = 채운 만큼)
  //   바뀔 때마다 document 'moai:gauge-view' { shown, alpha, phase }
  function view() { return { shown: !paused(), alpha: phase === 'appear' ? value : 1, phase: phase }; }
  let lastView = null;
  function announceView() {
    const v = view();
    if (lastView && v.shown === lastView.shown && v.alpha === lastView.alpha && v.phase === lastView.phase) return;
    lastView = v;
    if (typeof CustomEvent === 'function' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('moai:gauge-view', { detail: v }));
  }
  function play(target, fx) { if (target && target.animate) target.animate(fx.frames, { duration: fx.ms, easing: 'ease-out' }); }
  // 홀드 미션 문구: 홀드를 기다리는 동안(홀드 단계 · 미션 받는 중 · 쉼 아님) — 누르는 중이면 KEEP HOLDING!, 아니면 HOLD NOW!
  function renderCue() {
    if (!cue) return;
    const on = GAUGE.source === 'hold' && !paused() && !lock;
    cue.classList.toggle('hidden', !on);
    if (on) cue.textContent = holding ? CUE.hold : CUE.wait;
  }
  function render() {
    announceView();
    renderCue();
    if (!el) return;
    el.classList.toggle('hidden', paused());
    el.style.opacity = phase === 'appear' ? String(value) : '1';
    const w = phase === 'fill' ? value : (GAUGE.appearLook === 'full' ? 1 : value);   // 바 드러내기 동안도 막대를 보임 (appearLook)
    if (bar) bar.style.width = w * 100 + '%';
  }
  function wake() { if (M.frame) M.frame.add(step); }
  // 눈금 알림 'moai:gauge-step' { dir: 1 | -1, step (0~STEPS — 지금 값이 든 눈금), phase } — 채움이 눈금을 넘을 때 (연출: js/fx-rules.js)
  const STEPS = 8;
  let lastStep = 0;
  function stepNotify() {
    const s = Math.floor(value * STEPS + 1e-9);
    if (s === lastStep) return;
    const dir = s > lastStep ? 1 : -1;
    lastStep = s;
    if (typeof CustomEvent === 'function' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('moai:gauge-step', { detail: { dir: dir, step: s, phase: phase } }));
  }

  // 쉼: 지금 시각으로 판단 (끝 시각이 지났으면 그 자리에서 끝냄)
  function restKind() { if (!lock) return null; const t = clock(); if (t >= lock.until) return null; return t < lock.fxEnd ? 'fx' : 'drain'; }
  function locked() { if (lock && clock() >= lock.until) endRest(); return !!lock; }
  // 쉼 끝: 받기 시작 (HOLD NOW!) — 쉼 동안 눌러 둔 뚜~는 안 참 (이때부터 새로 어택한 것만)
  function endRest() { lock = null; value = 0; lastStep = 0; holding = false; render(); emit('ready'); }
  function restUntil(t) {               // 끝 시각 걸기 (진행 표 — 다 찬 순간)
    if (!lock) return;
    lock.until = Math.max(t, lock.from);
    lock.fxEnd = Math.min(lock.fxEnd, lock.until);
    wake();
  }

  // 채우기: 다 차면 알리고 쉼으로 (그 홀드는 끝)
  function add(sec) {
    if (locked() || paused() || !(sec > 0)) return;
    value = Math.min(1, value + sec / needSec(GAUGE[phase]));
    if (value < 1) { stepNotify(); render(); return; }
    lastStep = 0;                                             // 다 참 — 눈금은 다음 채움부터 (다 찬 연출은 'appear'·'full')
    holding = false;
    const kind = phase === 'appear' ? 'appear' : 'full';
    if (kind === 'appear') { phase = 'fill'; value = 1; }   // 바가 생김 — 다 찬 막대로 보이고 쉼 동안 비워짐 (다 찼을 때와 같은 모습)
    else count++;                                           // 다 참 — 막대는 가득 찬 채 연출, 뒤이어 소강
    const t0 = clock(), until = t0 + GAUGE.rest.loops * loopSec();   // 기본 끝 시각 — 진행 표가 곧바로 restUntil로 건다
    lock = { from: t0, fxEnd: Math.min(t0 + FX[kind].ms / 1000, until), until: until, drainFrom: value };
    render();
    play(el, FX[kind]);
    emit(kind);
    wake();
  }
  // 쉼 흐름 (프레임마다 — 지금 시각으로): 연출 동안은 그대로 → 소강 = 끝 시각까지 남은 비율로 비움 → 끝 시각에 끝 (그때 누르고 있으면 이어서 참)
  function rest() {
    const t = clock();
    if (t >= lock.until) { endRest(); return; }
    if (t >= lock.fxEnd) { value = lock.drainFrom * (lock.until - t) / Math.max(1e-6, lock.until - lock.fxEnd); render(); }
  }

  // 입력이 없으면 줄어듦 (홀드 단계만 — 0이 되면 프레임 루프에서 빠짐)
  function decay(dt) {
    if (!(GAUGE.decay > 0) || GAUGE.source !== 'hold' || !(value > 0)) return false;
    value = Math.max(0, value - GAUGE.decay * dt / needSec(GAUGE[phase]));
    stepNotify();
    render();
    return value > 0;
  }
  // 프레임마다: 쉼이면 흘리고, 아니면 누르는 동안 실제 시간만큼 채움 · 누르지 않으면 줄어듦
  function step(t, dt) {
    if (lock) { rest(); return true; }
    if (paused()) return false;
    if (!holding) return decay(dt);
    add(dt);
    return true;
  }
  document.addEventListener('moai:voice', function(e) {
    holding = e.detail.sound === 'doo' && !locked() && !paused() && GAUGE.source === 'hold';   // 홀드로 차는 단계에서만
    if (holding || value > 0) wake();   // 떼면 줄어들기 시작
    renderCue();
  });
  document.addEventListener('moai:field-event', function(e) {   // 게이지 미션을 받는 상태가 바뀜 (진행 표)
    const d = e.detail;
    if (d.kind !== 'receive' || d.actor !== 'progress') return;
    holding = false;                        // 다시 받음도 받기 시작 — 이때부터 새로 어택한 뚜~만
    if (d.on) { value = 0; lastStep = 0; lock = null; }   // 다시 받음: 채움·쉼은 처음부터 (단계는 그대로)
    render();
  });

  M.fieldGauge = {
    add: add,
    state: function() { const k = restKind(); return { phase: phase, value: value, count: count, rest: k, restEnd: k ? lock.until : null }; },
    restUntil: restUntil,            // 쉼의 끝 시각 걸기 (진행 표 — 다 찬 순간, 오디오 시계)
    clock: clock, loopSec: loopSec,  // 쉼 시계 · 필드 템포 1루프 초 (진행 표가 끝 시각을 셀 때)
    view: view,                      // 보이기 상태 (하단 루프 막대가 따름)
    setNeed: function(which, n) { if ((which === 'appear' || which === 'fill') && (n > 0 || (n && typeof n === 'object'))) GAUGE[which] = n; },   // 단계의 필요량 (진행 표 — js/field-progress.js): 초 | { loops } | { beats }
    setSource: function(src) { GAUGE.source = src || 'hold'; if (GAUGE.source !== 'hold') holding = false; renderCue(); },   // 입력원 (진행 표 조건 카드)
    needSec: function(which) { return needSec(GAUGE[which || (phase === 'appear' ? 'appear' : 'fill')]); },   // 지금(또는 그 단계) 필요량을 초로
    policy: GAUGE, fx: FX, cue: CUE, // 조정·시험용 (값을 바꾸면 다음 채움부터)
  };
  render();
})();
