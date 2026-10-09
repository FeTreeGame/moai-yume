// 판정 창 설정 (설정 탭) — 고르기(EASY·NORMAL·HARD + 직접 바꾼 값 CUSTOM) + 범위 그림 + 손잡이 버튼 셋 (ACE · GOOD · BARELY)
//   단위는 하나: 상대치 = 창 전체 폭 ÷ 칸 (100% = 가이드 막대 구멍이 칸에 꽉 참). 칸은 BPM을 따라가므로 그림은 BPM과 무관하다
//   (절대치(ms) 방식은 화면에 없다 — 판정 쪽 장치는 남아 있다: judge.js setJudgeMode. 절대치로 저장된 값은 읽을 때 상대치로 환산)
//   범위 그림 (보여 주기만): 좌우 대칭이라 한쪽만 — 왼쪽 끝 = 음표의 정박, 오른쪽 끝 = BOUND.max, 점선 = 칸 경계 (100%)
//   손잡이: 등급 버튼을 누른 채 좌우로 밀면 그 등급의 경계가 움직인다 (그림과 같은 축척 — 손가락이 간 만큼)
//     누른 손가락을 기억한다 — 버튼 밖으로 나가도 뗄 때까지 이어지고, 그동안 다른 손가락은 받지 않는다
//     경계조건: 그 등급만 움직인다. 이웃에서 한 단위(BOUND.step) 떨어진 곳에서 멈춤 — 이웃을 밀지 않고, 같아지지도 않는다 (ACE < GOOD < BARELY)
//   고르기 = 값 넘기기 줄 (js/ui.js stepper — 순환). 밀어서 바꾸면 그 값이 CUSTOM에 보관되고 CUSTOM이 고른 것이 된다
//   (CUSTOM은 값을 바꾼 뒤에야 목록에 생김 — 프리셋으로 넘어가도 남아 있어 다시 고를 수 있다. 기본값 버튼 = 기본 프리셋으로, CUSTOM도 지움)
// 값·환산은 judge.js (G.getJudgeConfig·setJudgeValue·setUnitType), 여기는 UI와 저장만 (localStorage, 기기별)
//   안내 한 줄: 지금 템포에서 그 범위가 몇 ms인가 (참고 — 템포가 바뀌면 달라진다)
(function() {
  var G = window.G;
  var KEY = 'moai.judge';
  try { G.loadJudgeConfig(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) {}
  if (G.getJudgeConfig().mode !== 'rel') G.setJudgeMode('rel');   // 화면의 단위는 상대치 하나
  function save() { try { localStorage.setItem(KEY, JSON.stringify(G.getJudgeConfig())); } catch (e) {} }

  var box = document.getElementById('judgeBound');
  var grips = document.getElementById('judgeGrips');
  if (!box || !grips) return;
  var presetBox = document.getElementById('judgePresets');
  var note = document.getElementById('judgeNote');
  var GRADES = [{ id: 'ace', name: 'ACE' }, { id: 'good', name: 'GOOD' }, { id: 'barely', name: 'BARELY' }];   // 안쪽부터. GOOD까지가 맞힘 (HIT)
  // 범위의 한계 (상대치 — 1 = 한 칸): 그림의 오른쪽 끝 = max, 조정 단위이자 이웃과의 최소 간격 = step (가장 안쪽의 최소도 step)
  var BOUND = { max: 2.5, step: 0.05 };

  function slotMs() { return G.BEAT_SEC / 4 * 1000; }
  function val(k) { return G.getJudgeConfig()[k]; }                // 상대치 (창 전체 폭 ÷ 칸)
  function snap(v) { return Math.round(Math.round(v / BOUND.step) * BOUND.step * 100) / 100; }

  var M = window.Moai;
  var presetStep = M && M.ui && M.ui.stepper ? M.ui.stepper(presetBox, {
    items: function() { return G.judgePresets(); },
    get: function() { return G.judgePreset(); },
    set: function(id) { G.setUnitType(id); save(); refresh(); },
  }) : { render: function() {} };

  // 그림 · 수치 · 안내 갱신 (뼈대는 그대로 — 미는 중에도 부른다)
  function refresh() {
    GRADES.forEach(function(g) {
      var v = val(g.id);
      box.querySelector('.jb-' + g.id).style.width = Math.min(100, v / BOUND.max * 100) + '%';   // 한계를 넘는 값(옛 저장값)은 끝까지
      grips.querySelector('[data-id="' + g.id + '"] .jb-num').textContent = Math.round(v * 100);
    });
    presetStep.render();
    if (note) note.textContent = Math.round(G.BPM) + ' BPM에서 ' + GRADES.map(function(g) {
      return '±' + Math.round(val(g.id) * slotMs() / 2);
    }).join(' · ') + 'ms';
  }
  function render() {
    // 띠는 바깥 것부터 (안쪽 것이 위에 그려진다), 칸 경계는 맨 위
    box.innerHTML = GRADES.slice().reverse().map(function(g) { return '<div class="jb-band jb-' + g.id + '"></div>'; }).join('') +
      '<div class="jb-slot" style="width:' + (100 / BOUND.max) + '%"><span>1칸</span></div>';
    grips.innerHTML = GRADES.map(function(g) {
      return '<div class="jb-col jb-' + g.id + '" data-id="' + g.id + '">' +
        '<button class="ctrl-btn jb-grip" type="button" tabindex="-1" aria-label="' + g.name + ' 범위 — 누른 채 좌우로">' + g.name + '</button>' +
        '<span class="jb-num"></span></div>';
    }).join('');
    refresh();
  }

  // ── 밀기 ──
  // 그 등급이 갈 수 있는 범위: 안쪽 이웃 + 한 단위 ~ 바깥 이웃 − 한 단위 (끝은 한 단위 ~ 한계)
  function limits(id) {
    var i = GRADES.map(function(g) { return g.id; }).indexOf(id), s = BOUND.step;
    return { lo: snap(i > 0 ? val(GRADES[i - 1].id) + s : s), hi: snap(i < GRADES.length - 1 ? val(GRADES[i + 1].id) - s : BOUND.max) };
  }
  var drag = null;   // { id, x0, v0, pointer } — 한 번에 손가락 하나
  grips.addEventListener('pointerdown', function(e) {
    var btn = e.target.closest('.jb-grip');
    if (!btn || drag) return;
    var id = btn.parentNode.getAttribute('data-id');
    drag = { id: id, x0: e.clientX, v0: val(id), pointer: e.pointerId, btn: btn };
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}   // 버튼 밖으로 나가도 이 손가락의 움직임을 받는다
    btn.parentNode.classList.add('on');
    e.preventDefault();
  });
  grips.addEventListener('pointermove', function(e) {
    if (!drag || e.pointerId !== drag.pointer) return;
    var w = box.getBoundingClientRect().width;
    if (!w) return;
    var lim = limits(drag.id);
    if (lim.lo > lim.hi) return;                                  // 이웃 사이에 자리가 없음 (옛 저장값) — 이웃부터 벌려야 한다
    var v = Math.min(lim.hi, Math.max(lim.lo, snap(drag.v0 + (e.clientX - drag.x0) / w * BOUND.max)));
    if (Math.abs(v - val(drag.id)) < 1e-9) return;                // 누르기만 한 것으로는 바뀌지 않는다 (CUSTOM이 되지 않게)
    G.setJudgeValue(drag.id, v);
    save();
    refresh();
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag.btn.parentNode.classList.remove('on');
    drag = null;
  }
  grips.addEventListener('pointerup', end);
  grips.addEventListener('pointercancel', end);

  var resetBtn = document.getElementById('judgeReset');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    G.resetJudgeConfig();
    try { localStorage.removeItem(KEY); } catch (e) {}
    refresh();
  });
  // 설정 탭을 열 때 다시 그림 (세션이 BPM을 바꿨을 수 있음 — 안내의 ms 갱신)
  document.addEventListener('click', function(e) { if (e.target.closest('[data-drawer="config"]')) refresh(); });
  render();
})();
