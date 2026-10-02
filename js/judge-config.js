// 판정 창 설정 (설정 탭) — 절대치(ms) / 상대치(칸 %) 선택, 프리셋(EASY·NORMAL·HARD), ACE·GOOD·BARELY 슬라이더
// 값·환산·순서 유지는 judge.js (G.getJudgeConfig·setJudgeValue·setJudgeMode·setUnitType), 여기는 UI와 저장만 (localStorage, 기기별)
//   상대치 % = 창 전체 폭 ÷ 칸 (100% = 가이드 막대 구멍이 칸에 꽉 참, 초과 허용 — 판정은 이웃 칸까지)
//   안내: 현재 BPM·칸 길이, 막대 표시 한계(100% 초과) — 막지 않고 알리기만
(function() {
  var G = window.G;
  var KEY = 'moai.judge';
  try { G.loadJudgeConfig(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G.getJudgeConfig())); } catch (e) {} }

  var rows = document.getElementById('judgeRows');
  if (!rows) return;
  var modeBox = document.getElementById('judgeModes');
  var presetBox = document.getElementById('judgePresets');
  var note = document.getElementById('judgeNote');
  var GRADES = [{ id: 'ace', name: 'ACE' }, { id: 'good', name: 'GOOD (HIT 경계)' }, { id: 'barely', name: 'BARELY' }];
  var MODES = [{ id: 'abs', name: '절대치 ms' }, { id: 'rel', name: '상대치 %' }];
  var PRESETS = [{ id: 'easy', name: 'EASY' }, { id: 'normal', name: 'NORMAL' }, { id: 'hard', name: 'HARD' }];
  // 슬라이더 범위: 절대치 ±5~200 ms (5 단위) / 상대치 2~200 % (1 단위)
  var RANGE = { abs: { min: 5, max: 200, step: 5, scale: 1000 }, rel: { min: 2, max: 200, step: 1, scale: 100 } };

  function slotMs() { return G.BEAT_SEC / 4 * 1000; }
  function pctOf(k) { return G.getJudgeWindows()[k] * 2000 / slotMs() * 100; }   // 창 전체 폭 ÷ 칸 (%)
  function texts(k) {
    var ms = G.getJudgeWindows()[k] * 1000, pct = pctOf(k);
    return G.getJudgeConfig().mode === 'abs'
      ? { val: '±' + Math.round(ms) + 'ms', sub: '칸 ' + Math.round(pct) + '%' }
      : { val: Math.round(pct) + '%', sub: '±' + Math.round(ms) + 'ms' };
  }
  function sliderVal(k) { var c = G.getJudgeConfig(); return Math.round(c[k] * RANGE[c.mode].scale); }

  function buttons(list, active, attr) {
    return list.map(function(b) {
      return '<button class="beat-pattern-btn' + (b.id === active ? ' active' : '') + '" ' + attr + '="' + b.id + '" tabindex="-1">' + b.name + '</button>';
    }).join('');
  }
  function renderNote() {
    if (!note) return;
    var lines = ['현재 ' + Math.round(G.BPM) + ' BPM · 1칸 ' + Math.round(slotMs()) + 'ms'];
    if (pctOf('good') > 100) lines.push('<span class="warn">GOOD 칸 100% 초과 — 구멍은 칸에 꽉 차고 판정은 이웃 칸까지 (막대 표시 한계)</span>');
    if (pctOf('barely') > 100) lines.push('<span class="warn">BARELY 끝선이 이웃 칸으로 넘어감</span>');
    note.innerHTML = lines.join('<br>');
  }
  // 값 표시만 갱신 (슬라이더를 다시 만들지 않는다 — 끄는 중인 슬라이더 유지). skip = 지금 끄는 슬라이더
  function refresh(skip) {
    GRADES.forEach(function(g) {
      var row = rows.querySelector('[data-id="' + g.id + '"]'), t = texts(g.id);
      row.querySelector('.mixer-val').textContent = t.val;
      row.querySelector('.judge-sub').textContent = t.sub;
      if (g.id !== skip) row.querySelector('input').value = sliderVal(g.id);
    });
    if (presetBox) presetBox.innerHTML = buttons(PRESETS, G.getJudgeConfig().preset, 'data-preset');
    renderNote();
  }
  function render() {
    var c = G.getJudgeConfig(), r = RANGE[c.mode];
    if (modeBox) modeBox.innerHTML = buttons(MODES, c.mode, 'data-mode');
    rows.innerHTML = GRADES.map(function(g) {
      // [이름 환산값 값] / [슬라이더]
      return '<div class="mixer-row" data-id="' + g.id + '">' +
        '<div class="mixer-head"><label>' + g.name + '</label><span class="judge-sub"></span><span class="mixer-val judge-val"></span></div>' +
        '<input type="range" min="' + r.min + '" max="' + r.max + '" step="' + r.step + '"></div>';
    }).join('');
    refresh(null);
  }

  rows.addEventListener('input', function(e) {
    var row = e.target.closest('.mixer-row');
    if (!row || e.target.type !== 'range') return;
    var id = row.getAttribute('data-id');
    G.setJudgeValue(id, e.target.value / RANGE[G.getJudgeConfig().mode].scale);
    save();
    refresh(id);
  });
  // 버튼 묶음: 터치는 touchend에서 처리하고 뒤따르는 click은 무시 (믹서와 같은 방식)
  function bindTap(box, attr, fn) {
    if (!box) return;
    var touched = false;
    var pick = function(e) { var b = e.target.closest('[' + attr + ']'); if (b) { fn(b.getAttribute(attr)); save(); render(); } };
    box.addEventListener('touchend', function(e) { if (!e.target.closest('[' + attr + ']')) return; e.preventDefault(); touched = true; pick(e); }, { passive: false });
    box.addEventListener('click', function(e) { if (touched) { touched = false; return; } pick(e); });
  }
  bindTap(modeBox, 'data-mode', G.setJudgeMode);
  bindTap(presetBox, 'data-preset', G.setUnitType);
  var resetBtn = document.getElementById('judgeReset');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    G.resetJudgeConfig();
    try { localStorage.removeItem(KEY); } catch (e) {}
    render();
  });
  // 설정 탭을 열 때 다시 그림 (세션이 BPM을 바꿨을 수 있음 — 환산값·안내 갱신)
  document.addEventListener('click', function(e) { if (e.target.closest('[data-drawer="config"]')) render(); });
  render();
})();
