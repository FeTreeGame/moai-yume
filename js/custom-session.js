// 세션 만들기 — 제작 탭의 아래쪽 구역: 플레이어가 세션의 패턴을 직접 찍는다 (엔드 콘텐츠 · 연습)
//   구성: 도구 (TAP · HOLD · ERASE) / 슬롯 (1 · 2 · 3 — 켜진 것만 세션의 단계가 된다, 작은 번호부터) / 격자 8칸 × 4줄 (고른 슬롯의 패턴)
//   슬롯 단추: 꺼진 것 → 켜지면서 편집 대상 / 켜져 있는 다른 슬롯 → 편집 대상만 바뀜 / 편집 중인 것을 다시 → 꺼짐 (찍어 둔 패턴은 남는다)
//   찍기
//     TAP    칸 = 떽. 누른 채 끌면 이어서
//     HOLD   첫 누름 = 어택(누르기 시작), 두 번째 누름 = 릴리즈(떼는 자리 — 늘 어택보다 뒤). 그 사이는 저절로 뚜~로 채워진다.
//            두 번째 누름이 어택과 같거나 앞이면 어택을 그 자리로 옮긴다. 도구 · 슬롯을 바꾸면 걸어 둔 어택은 거둔다
//     ERASE  칸 = 빈칸. 뚜~를 누르면 그 뚜~ 전체를 지운다. 누른 채 끌면 이어서
//   패턴의 꼴 = 세션 패턴과 같다 (js/rhythm/session.js): 32칸, 칸마다 0 쉼 · 1 떽 · 2 뚜~ 유지 (이어진 2 = 뚜~ 하나 — 첫 칸 = 어택, 끝난 다음 칸 = 릴리즈)
//   규칙 (세션의 것 그대로): 마지막 한 박(28 ~ 31번 칸)은 잠긴 칸 — 떽 · 어택 · 릴리즈를 둘 수 없다 → 떽은 27번까지, 릴리즈는 27번까지 (뚜~는 26번까지 채워진다)
//   단계 = 켜져 있고 음표가 하나 이상 있는 슬롯 (번호순). 음표 없이 켜진 슬롯은 치지 않는다 — M.customSession.stages()
//   보관 = 기기 (localStorage 'moai.custom'). 값은 MAKER 한 곳
(function() {
  const M = window.Moai;
  const host = document.getElementById('sessionMaker');
  if (!M || !host) return;
  const MAKER = { key: 'moai.custom', slots: 3, len: 32, cols: 8, lock: 28 };   // lock = 여기부터 잠긴 칸 (세션 패턴의 마지막 한 박)
  const empty = function() { const c = []; for (let i = 0; i < MAKER.len; i++) c.push(0); return c; };

  // ── 상태 ──
  let slots = [], sel = -1, tool = 'tap', attack = -1;   // attack = HOLD의 걸어 둔 어택 칸 (없으면 -1)
  function load() {
    slots = [];
    let d = null; try { d = JSON.parse(localStorage.getItem(MAKER.key) || 'null'); } catch (e) {}
    for (let i = 0; i < MAKER.slots; i++) {
      const s = d && d.slots && d.slots[i], c = s && typeof s.cells === 'string' && s.cells.length === MAKER.len ? s.cells.split('').map(Number) : empty();
      slots.push({ on: !!(s && s.on), cells: clean(c) });
    }
  }
  function save() { try { localStorage.setItem(MAKER.key, JSON.stringify({ slots: slots.map(function(s) { return { on: s.on, cells: s.cells.join('') }; }) })); } catch (e) {} }
  // 규칙에 맞게 다듬는다: 0·1·2만, 잠긴 칸은 비움, 뚜~가 잠긴 칸 직전(27번)에서 끝나지 않게 (릴리즈가 28번이 된다)
  function clean(c) {
    for (let i = 0; i < MAKER.len; i++) { if (c[i] !== 1 && c[i] !== 2) c[i] = 0; if (i >= MAKER.lock) c[i] = 0; }
    if (c[MAKER.lock - 1] === 2) c[MAKER.lock - 1] = 0;
    return c;
  }
  function notes(c) { let n = 0; for (let i = 0; i < c.length; i++) if (c[i] === 1 || (c[i] === 2 && (i === 0 || c[i - 1] !== 2))) n++; return n; }
  function stages() { return slots.filter(function(s) { return s.on && notes(s.cells) > 0; }).map(function(s) { return s.cells.slice(); }); }
  function push() { const S = M.session && M.session.custom; return S ? S.set(stages()) : 0; }     // 세션 모듈에 지금의 단계들을 넣는다 (세션 중에는 바뀌지 않는다)
  function changed() { save(); push(); document.dispatchEvent(new CustomEvent('moai:custom-session', { detail: { stages: stages().length } })); }

  // ── 찍기 ──
  function holdSpan(c, i) { if (c[i] !== 2) return null; let a = i, b = i; while (a > 0 && c[a - 1] === 2) a--; while (b < c.length - 1 && c[b + 1] === 2) b++; return [a, b]; }
  function put(i, first) {             // first = 누른 순간 (끌어서 지나가는 칸이 아님)
    if (sel < 0 || i < 0 || i >= MAKER.lock) return;
    const c = slots[sel].cells;
    if (tool === 'tap') { if (c[i] === 1) return; c[i] = 1; }
    else if (tool === 'erase') {
      const h = holdSpan(c, i);
      if (h) for (let k = h[0]; k <= h[1]; k++) c[k] = 0; else { if (c[i] === 0) return; c[i] = 0; }
    } else {                           // hold: 누른 순간에만 (끌기로는 찍지 않는다)
      if (!first) return;
      if (attack < 0 || i <= attack) { attack = i; render(); return; }   // 어택을 건다 (또는 그 자리로 옮긴다)
      for (let k = attack; k < i; k++) c[k] = 2;                          // 어택 ~ 릴리즈 직전까지 뚜~ (릴리즈 = i번 칸에서 뗌)
      if (c[i] === 2) c[i] = 0;                                           // 릴리즈 자리에 이어지던 뚜~가 있었으면 끊는다 (떼는 자리가 되게)
      attack = -1;
    }
    clean(c); changed(); render();
  }

  // ── 화면 ──
  host.innerHTML =
    '<div class="maker-row maker-tools">' + [['tap', 'TAP'], ['hold', 'HOLD'], ['erase', 'ERASE']].map(function(t) { return '<button class="ctrl-btn" type="button" data-tool="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<div class="maker-row maker-slots">' + [0, 1, 2].map(function(i) { return '<button class="ctrl-btn" type="button" data-slot="' + i + '">' + (i + 1) + '</button>'; }).join('') + '</div>' +
    '<div class="maker-grid" style="--cols:' + MAKER.cols + '">' + empty().map(function(_, i) { return '<div class="maker-cell" data-cell="' + i + '"></div>'; }).join('') + '</div>' +
    '<div class="maker-note"></div>';
  const grid = host.querySelector('.maker-grid'), note = host.querySelector('.maker-note');
  const cellEls = [].slice.call(host.querySelectorAll('.maker-cell'));
  function render() {
    [].forEach.call(host.querySelectorAll('[data-tool]'), function(b) { b.classList.toggle('active', b.getAttribute('data-tool') === tool); });
    [].forEach.call(host.querySelectorAll('[data-slot]'), function(b) { const i = +b.getAttribute('data-slot'); b.classList.toggle('active', slots[i].on); b.classList.toggle('editing', i === sel); });
    grid.classList.toggle('off', sel < 0);
    const c = sel >= 0 ? slots[sel].cells : null;
    cellEls.forEach(function(el, i) {
      const v = c ? c[i] : 0, prev = c && i > 0 ? c[i - 1] : 0;
      // 칸을 그 음표의 색으로 채운다 — 게임의 막대에서 보던 색 그대로 (G.guideNoteColor: 떽 · 어택 · 유지 · 릴리즈. 색을 따로 적지 않는다)
      const kind = v === 1 ? 'tap' : v === 2 ? (prev !== 2 ? 'attack' : 'sustain') : (c && prev === 2 ? 'release' : '');
      const pend = !!c && i === attack && !kind;                         // 걸어 둔 어택 (아직 뚜~가 아님) — 어택의 색으로 미리 보인다
      let cls = 'maker-cell' + (i >= MAKER.lock ? ' locked' : '') + (kind ? ' filled ' + kind : '') + (pend ? ' pending' : '');
      if (el.className !== cls) el.className = cls;
      const col = kind && window.G && window.G.guideNoteColor ? window.G.guideNoteColor(v, prev) : pend && window.G && window.G.guideNoteColor ? window.G.guideNoteColor(2, 0) : '';
      if (el.style.backgroundColor !== col) el.style.backgroundColor = col;
    });
    const n = stages().length, on = slots.filter(function(s) { return s.on; }).length;
    note.textContent = sel < 0 ? (on ? 'STAGES ' + n : 'SELECT A SLOT') : tool === 'hold' ? (attack < 0 ? 'HOLD: TAP START' : 'HOLD: TAP END') : 'STAGES ' + n;
  }
  host.addEventListener('click', function(e) {
    const t = e.target.closest ? e.target.closest('[data-tool],[data-slot]') : null;
    if (!t) return;
    if (t.hasAttribute('data-tool')) { tool = t.getAttribute('data-tool'); attack = -1; }
    else {
      const i = +t.getAttribute('data-slot');
      attack = -1;
      if (!slots[i].on) { slots[i].on = true; sel = i; }                  // 꺼진 것 → 켜지면서 편집 대상
      else if (sel !== i) sel = i;                                        // 켜져 있는 다른 것 → 편집 대상만
      else { slots[i].on = false; sel = -1; }                             // 편집 중인 것 → 꺼짐
      changed();
    }
    render();
  });
  // 칸: 누르기 · 누른 채 끌기 (손가락이 지나가는 칸을 자리로 찾는다)
  let down = false;
  function cellAt(e) { const el = document.elementFromPoint(e.clientX, e.clientY), c = el && el.closest ? el.closest('.maker-cell') : null; return c && grid.contains(c) ? +c.getAttribute('data-cell') : -1; }
  grid.addEventListener('pointerdown', function(e) { if (sel < 0) return; down = true; e.preventDefault(); const i = cellAt(e); if (i >= 0) put(i, true); });
  grid.addEventListener('pointermove', function(e) { if (!down || sel < 0) return; e.preventDefault(); const i = cellAt(e); if (i >= 0) put(i, false); });
  ['pointerup', 'pointercancel'].forEach(function(t) { window.addEventListener(t, function() { down = false; }); });

  // 구구를 눌렀을 때 (js/field-events.js 'tap:scenery' — 배경 요소 gugu): 단계가 있으면 만든 세션으로 들어간다, 없으면 false (부른 쪽이 몸짓만)
  function play() {
    const S = M.session && M.session.custom;
    if (!S || M.sessionActive) return false;
    if (!push()) return false;
    return !!M.session.enter(S.family, 'pingpong');
  }
  load(); render(); push();
  M.customSession = {
    play: play,                        // 만든 세션으로 들어간다 (단계가 없으면 false)
    stages: stages,                    // 세션에 들어갈 단계들 [32칸 배열…] — 켜져 있고 음표가 있는 슬롯, 번호순
    state: function() { return { slots: slots.map(function(s) { return { on: s.on, cells: s.cells.join('') }; }), sel: sel, tool: tool, attack: attack }; },
    policy: MAKER,
  };
})();
