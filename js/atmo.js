// 분위기 층 — 화면 전체의 공기: 색 입힘 · 조명. 월드(캔버스) 위, HUD 아래에 깔리는 화면 층 (카메라 변환과 무관)
//   무엇을 언제 어떤 색으로 할지(정책)는 연출 연결표 js/fx-rules.js ATMO. 여기는 장치
//     tone(o)   분위기를 바꾼다 — o = { color (입히는 색), a (색의 세기 0~1), shade (누르는 색 — 곱해서 어둡게), sa (누르는 세기 0~1), spot (둘레의 어둠 0~1 — 가운데가 밝은 조명), dur (넘어가는 시간 — 초) }
//               천천히 넘어간다 (번쩍임이 아니다). 같은 값이면 아무 일도 없다
//     nudge(o)  바탕 위에서 잠깐 밀었다 돌아온다 — o = { a, sa, spot (더하는 양), dur }. 판정 · 음표에 대한 반응 (바탕의 근방에서만)
//     beat(o)   조명이 한 번 숨 쉰다 — o = { amp (커지는 정도), dur (초) }. 밝기가 아니라 크기가 바뀐다 (번쩍임이 아니다) — 킥마다: 화면이 박을 말한다
//   입히는 색은 겹쳐서 (mix-blend-mode: overlay — 밝은 곳은 그 색으로 더 밝게, 어두운 곳은 더 어둡게: 색이 진해진다), 누르는 색은 곱해서 (multiply — 전체가 그 색으로 가라앉는다: 밤)
//     beams[i]  햇살 — 위에서 대상으로 내려오는 사다리꼴 빛줄기 (둘: 0 = 메인 모아이 · 1 = 부르는 미니). 모양 set(o): o = { a (세기 0~1), w (폭 — beamSize로 받은 대상 폭의 몇 배), tilt (기울기 — 도: 평행사변형 쪽으로), spread (퍼진 정도 0~1 — 0 = 기둥 · 1 = 한 점에서 퍼지는 부채), color, dur }
//               at(x, y) = 빛이 닿는 자리 (아랫변의 가운데) · size(w) = 폭 — [0]은 **세계의 자리**, [1]은 **화면의 자리** (캔버스 비). glow = 길이를 따른 밝기 { hold, mid, a }. 윗변 = 그 틀의 위쪽 끝에서 12% 위. 카메라는 world(v)가 틀 전체에 건다 / beamBeat(o) = 폭이 한 번 숨 쉰다 (킥)
//               밝게 더해 섞는다 (screen). 가장자리는 흐리게 — 흐림을 바깥 상자에, 오려 내기를 안쪽에 둔다 (한 요소에 같이 두면 오려 낸 자리가 날카롭게 남는다)
//   on = false면 걷힌다
(function() {
  const M = window.Moai;
  const box = document.querySelector && document.querySelector('.sprite-box');
  if (!box) return;
  const root = document.createElement('div'); root.className = 'atmo';
  const tint = document.createElement('div'); tint.className = 'atmo-tint';
  const shade = document.createElement('div'); shade.className = 'atmo-shade';
  const spot = document.createElement('div'); spot.className = 'atmo-spot';
  // 세계를 따르는 틀: 이 안의 것은 세계의 절대 자리에 놓는다 — 카메라가 세계의 판에 거는 변환(초점 · 배율 · 기울기 · 흔들림)을 이 틀에 그대로 건다 (world(v))
  //   빛줄기가 여기 산다: 배경 요소처럼 카메라를 모르는 물체가 된다 (당기면 통째로 같이 커진다 — 도형의 비율 · 각도 · 흐림이 그대로)
  const worldEl = document.createElement('div'); worldEl.className = 'atmo-world';
  //   화면에 고정된 틀 (.atmo-screen): 이 안의 빛줄기는 화면의 자리에 놓는다 — 윗변이 늘 화면 위쪽 끝. 카메라가 대상을 크게 당겨도 밝은 윗부분이 화면 안에 있다 (부르는 쪽이 대상의 화면 자리 · 폭을 넣는다)
  const screenEl = document.createElement('div'); screenEl.className = 'atmo-screen';
  root.appendChild(shade); root.appendChild(tint); root.appendChild(spot); root.appendChild(worldEl); root.appendChild(screenEl);
  const canvas = box.querySelector('.sprite-canvas');
  if (canvas && canvas.nextSibling) box.insertBefore(root, canvas.nextSibling); else box.appendChild(root);   // 캔버스 바로 위 — 가이드 · 게이지 · HUD보다 아래

  // 레터박스(js/camera.js — 처음 켤 때 캔버스 바로 뒤에 끼어든다)보다는 아래에 있어야 한다: 띠 위로 색 · 빛이 올라가지 않게
  function settle() { const lb = box.querySelector('.cam-overlay'); if (lb && (root.compareDocumentPosition(lb) & 2)) box.insertBefore(root, lb); }
  let cur = { color: 'transparent', a: 0, shade: 'transparent', sa: 0, spot: 0 };
  function tone(o) {
    if (!api.on) return;
    settle();
    const n = { color: o.color || 'transparent', a: o.a || 0, shade: o.shade || 'transparent', sa: o.sa || 0, spot: o.spot || 0 }, dur = (o.dur == null ? 0.4 : o.dur) + 's';
    if (n.color === cur.color && n.a === cur.a && n.shade === cur.shade && n.sa === cur.sa && n.spot === cur.spot) return;
    cur = n;
    tint.style.transitionDuration = dur; shade.style.transitionDuration = dur; spot.style.transitionDuration = dur;
    // 진하기 = 바탕(--atmo-a) + 반응(--atmo-n) — 둘을 따로 움직인다 (style.css .atmo-tint 등). 바탕은 CSS 전환으로, 반응은 웹 애니메이션으로 — 서로 다른 값이라 덮지 않는다
    //   (예전: 둘 다 opacity 하나를 움직였다 — 웹 애니메이션이 도는 동안에는 그 속성의 CSS 전환이 보이지 않아, 바탕이 바뀌는 것과 반응이 겹치면 순서가 어느 쪽이든 값이 튀었다)
    if (n.a) tint.style.backgroundColor = n.color; tint.style.setProperty('--atmo-a', n.a);           // 걷힐 때는 색을 그대로 둔 채 옅어진다 (투명으로 가는 길에 색이 탁해지지 않게)
    if (n.sa) shade.style.backgroundColor = n.shade; shade.style.setProperty('--atmo-a', n.sa); spot.style.setProperty('--atmo-a', n.spot);
  }
  function beat(o) {
    if (!api.on || !spot.animate || cur.spot <= 0) return;
    const amp = o.amp || 0.02;
    spot.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (1 + amp) + ')', offset: 0.25 }, { transform: 'scale(1)' }], { duration: (o.dur || 0.2) * 1000, easing: 'ease-out' });
  }
  // 빛줄기 하나 — 대상마다 하나씩 둔다 (beams[0] = 메인 모아이 · beams[1] = 부르는 미니): 옮겨 가지 않고 제자리에서 켜지고 꺼진다
  //   set(o) = 모양 { w, tilt, spread, color, dur } (주지 않은 값은 지금 것 그대로) / alpha(v) = 세기를 바로 (부르는 쪽이 프레임마다 — 켜고 끄기) / at · size · beat · now
  function mkBeam(parent) {
    const boxEl = document.createElement('div'); boxEl.className = 'atmo-beam';
    const inEl = document.createElement('div'); inEl.className = 'atmo-beam-in'; boxEl.appendChild(inEl); parent.appendChild(boxEl);
    boxEl.style.transitionDuration = '0s';
    let b = { a: 0, w: 1, tilt: 0, spread: 0.87, color: '#fff4cf', x: 0.5, y: 0.66, size: 0.54 };
    return {
      set: function(o) {
        if (!api.on) return;
        settle();
        b = Object.assign({}, b, { w: o.w == null ? b.w : o.w, tilt: o.tilt == null ? b.tilt : o.tilt, color: o.color || b.color, spread: o.spread == null ? b.spread : o.spread });
        inEl.style.transitionDuration = (o.dur == null ? 0.4 : o.dur) + 's';
        inEl.style.transform = 'skewX(' + b.tilt + 'deg) scaleX(' + b.w + ')'; inEl.style.setProperty('--beam', b.color);
        if (o.glow) { b.glow = o.glow; inEl.style.setProperty('--hold', (o.glow.hold * 100).toFixed(1) + '%'); inEl.style.setProperty('--mid', (Math.max(o.glow.hold, o.glow.mid) * 100).toFixed(1) + '%'); inEl.style.setProperty('--mida', o.glow.a); }   // 길이를 따른 밝기: hold까지 가장 밝게 → mid에서 a → 아래 끝에서 0
        inEl.style.setProperty('--top', (46 * (1 - Math.max(0, Math.min(1, b.spread)))).toFixed(2) + '%');   // 윗변의 반 폭 (아랫변의 반 폭 46% 기준 — spread 0 = 위아래가 같은 기둥, 1 = 한 점에서 퍼지는 부채)
      },
      alpha: function(v) { v = Math.max(0, Math.min(1, v || 0)); if (Math.abs(v - b.a) < 0.004 && (v > 0) === (b.a > 0)) return; b.a = v; boxEl.style.opacity = v.toFixed(3); },
      at: function(x, y) { if (Math.abs(x - b.x) < 0.001 && Math.abs(y - b.y) < 0.001) return; b.x = x; b.y = y; boxEl.style.left = (x * 100).toFixed(2) + '%'; boxEl.style.height = ((y + 0.12) * 100).toFixed(2) + '%'; },
      size: function(w) { if (Math.abs(w - b.size) < 0.002) return; b.size = w; boxEl.style.width = (w * 100).toFixed(2) + '%'; boxEl.style.marginLeft = (-w * 50).toFixed(2) + '%'; },   // 상자의 폭 (세계 — 캔버스 폭의 비: 대상의 폭). 실제 폭 = 이것 × w
      beat: function(o) { if (!api.on || !boxEl.animate || b.a <= 0.01) return; boxEl.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(' + (1 + (o.amp || 0.06)) + ')', offset: 0.25 }, { transform: 'scaleX(1)' }], { duration: (o.dur || 0.2) * 1000, easing: 'ease-out' }); },
      now: function() { return Object.assign({}, b); },
    };
  }
  // 흔들림: 바탕(tone으로 정한 값)은 그대로 두고 그 위에서 잠깐 밀었다 스스로 돌아온다 — o = { a, sa, spot (더하는 양 — ±NUDGE 안), dur (초) }
  //   판정 · 음표에 대한 반응이 바탕의 근방에서만 놀게 하는 장치 (다른 필터로 갈아타지 않는다 — 색조는 그대로, 진하기와 어둠만)
  const NUDGE = 0.15;
  function nudge(o) {
    if (!api.on) return;
    [[tint, o.a], [shade, o.sa], [spot, o.spot]].forEach(function(q) {
      const el = q[0], dv = Math.max(-NUDGE, Math.min(NUDGE, q[1] || 0));
      if (!dv || !el.animate) return;
      el.animate([{ '--atmo-n': 0 }, { '--atmo-n': dv, offset: 0.2 }, { '--atmo-n': 0 }], { duration: (o.dur || 0.4) * 1000, easing: 'ease-out' });   // 바탕이 어디에 있든 (가는 중이어도) 그 위에 더해진다
    });
  }
  let worldT = '';
  function world(v) {
    if (worldEl.style.display === 'none') return;   // 빛줄기를 꺼 두었으면 프레임마다 변환을 넣지 않는다                // v = 카메라의 지금 보기 (M.camera.view('world') — { x, y, zoom, rot, ox, oy }). 없으면 변환 없음
    const W = root.clientWidth, H = root.clientHeight;
    const t = !v || (v.zoom === 1 && !v.rot && !v.ox && !v.oy && v.x === 0.5 && v.y === 0.5) ? 'none'
      : 'translate(' + (W / 2 + v.ox * W).toFixed(2) + 'px,' + (H / 2 + v.oy * H).toFixed(2) + 'px) rotate(' + (v.rot || 0).toFixed(5) + 'rad) scale(' + v.zoom.toFixed(5) + ') translate(' + (-v.x * W).toFixed(2) + 'px,' + (-v.y * H).toFixed(2) + 'px)';
    if (t !== worldT) { worldT = t; worldEl.style.transform = t; }
  }
  const api = {
    on: true, tone: tone, beat: beat, nudge: nudge, nudgeCap: NUDGE, world: world, beams: null, beamBeat: function(o) { api.beams.forEach(function(b) { b.beat(o); }); }, beamNow: function(i) { return api.beams[i || 0].now(); },
    set: function(on) { api.on = !!on; root.style.display = on ? '' : 'none'; },
    now: function() { return Object.assign({}, cur); },
    // 묶음을 화면에서 뺀다 · 다시 넣는다 (연출의 묶음 스위치 — js/fx-rules.js setFx): 'beams' = 빛줄기의 틀 둘 · 'filter' = 색 입힘 · 누르는 색 · 둘레의 어둠
    //   투명하게만 두면 층이 남는다 (혼합 모드를 쓰는 화면 크기의 층 — 소스 저장소 docs/RENDER-COST.md) → 끌 때는 요소를 뺀다
    show: function(part, on) { const d = on ? '' : 'none'; (part === 'beams' ? [worldEl, screenEl] : part === 'filter' ? [tint, shade, spot] : []).forEach(function(e) { e.style.display = d; }); },
    el: root,
  };
  api.beams = [mkBeam(worldEl), mkBeam(screenEl)];   // [0] 메인 모아이 = 세계의 물체 (world(v)가 틀에 카메라의 변환을 건다) · [1] 부르는 미니 = 화면에 고정
  M.atmo = api;
})();
