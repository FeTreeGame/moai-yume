// 이펙트 자리 조정 도구 (개발용 — 주소에 ?fxtune) — 맞힘 · 콜 이펙트가 나오는 자리를 눈으로 맞추고 값을 출력한다
//   대상 = 연출 연결표의 SPOT (js/fx-rules.js): 메인 모아이의 고리 · 빛살 · 하트 / 미니 모아이의 작은 고리 · 큰 고리 · 빛살
//   흐름: 항목을 고른다 → 화살표 단추(또는 숫자를 직접)로 옮긴다 → '터뜨리기'로 본다 (되풀이를 켜면 저절로) → '값 출력'의 글을 넘긴다 → 연결표에 굳힌다
//   화면의 십자 = 고른 항목이 지금 나오는 자리 (미니는 일곱 모두). 미니 모아이는 열 때 일곱을 세운다
//   심도는 여기서 고르지 않는다 — 전경보다 앞으로 정해져 있다 (연결표 SPOT.z)
//   카메라가 기본 샷일 때 (필드) 맞춘다 — 십자는 화면 자리이고 이펙트는 월드 자리라, 세션처럼 카메라가 움직이면 어긋나 보인다
(function() {
  const M = window.Moai;
  const box = document.querySelector && document.querySelector('.sprite-box');
  if (!box || !M.fxRules || !M.fxRules.spot) return;
  const SPOT = M.fxRules.spot, T = M.fxRules.test, OF = M.fxRules.spotOf;
  const ITEMS = [
    ['main', 'gather', '메인 — 홀드: 모여드는 흰 점'],
    ['main', 'shock', '메인 — 고리'], ['main', 'rays', '메인 — 빛살'], ['main', 'hearts', '메인 — 하트'],
    ['mini', 'ring', '미니 — 작은 고리'], ['mini', 'shock', '미니 — 큰 고리'], ['mini', 'rays', '미니 — 빛살'],
  ];
  const STEP = { fine: 0.002, coarse: 0.01 };
  let cur = 0, loop = null;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:8px;top:64px;z-index:10000;width:290px;max-height:calc(100vh - 80px);overflow:auto;padding:10px;background:rgba(10,10,18,0.92);color:#fff;font:13px/1.5 sans-serif;border:1px solid #39ff14;border-radius:8px';
  panel.innerHTML = '<div style="font-weight:bold;margin-bottom:6px">이펙트 자리 조정 (?fxtune)</div>' +
    '<select id="fxtSel" style="width:100%;margin-bottom:6px"></select>' +
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><label>가로 <input id="fxtX" type="number" step="0.001" style="width:78px"></label><label>세로 <input id="fxtY" type="number" step="0.001" style="width:78px"></label></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,40px);gap:4px;justify-content:center;margin-bottom:6px">' +
    '<span></span><button data-d="0,-1">▲</button><span></span><button data-d="-1,0">◀</button><button id="fxtFire">●</button><button data-d="1,0">▶</button><span></span><button data-d="0,1">▼</button><span></span></div>' +
    '<label style="display:block;margin-bottom:4px"><input id="fxtCoarse" type="checkbox"> 크게 옮기기 (0.01 — 끄면 0.002)</label>' +
    '<label style="display:block;margin-bottom:4px"><input id="fxtLoop" type="checkbox"> 되풀이해서 터뜨리기</label>' +
    '<label style="display:block;margin-bottom:6px"><input id="fxtFlip" type="checkbox"> 메인 모아이를 왼쪽으로 (뒤집었을 때도 맞는지)</label>' +
    '<label style="display:block;margin-bottom:6px;padding-top:6px;border-top:1px solid #333">메인 고리의 시작 반지름 <input id="fxtFromN" type="number" step="0.005" min="0" max="0.6" style="width:64px"><input id="fxtFrom" type="range" min="0" max="0.6" step="0.005" style="width:100%"></label>' +
    '<div style="margin-bottom:6px;padding-top:6px;border-top:1px solid #333"><b>필터</b> (화면 전체의 색 · 어둠) — 턴 <select id="fxtAtmoTurn"><option value="listen">세션의 바탕 (대기 · 콜 · 리스폰스 내내)</option><option value="respond">필드의 패턴 미션 (내내)</option></select>' +
    '<div id="fxtAtmoRows"></div><label style="display:block;font-size:12px"><input id="fxtAtmoOff" type="checkbox"> 필터 없이 보기 (견주기)</label></div>' +
    '<div style="margin-bottom:6px;padding-top:6px;border-top:1px solid #333"><b>빛줄기</b> (모양은 하나 — 메인 · 미니 공통)<select id="fxtBeamTurn" style="display:none"><option value="base">바탕</option></select>' +
    '<div id="fxtBeamRows"></div><div style="margin-top:4px;font-size:12px;opacity:0.8">메인 빛줄기의 밝기 (길이를 따라)</div><div id="fxtGlowRows"></div></div>' +
    '<div style="margin-bottom:6px;padding-top:6px;border-top:1px solid #333"><b>홀드 유지 중의 맥박</b><div id="fxtPulseRows"></div><button id="fxtPulseFire" style="width:100%">맥박 한 번 보기</button></div>' +
    '<div style="display:flex;gap:6px;margin-bottom:6px"><button id="fxtOut" style="flex:1">값 출력</button><button id="fxtCopy" style="flex:1">복사</button></div>' +
    '<textarea id="fxtText" readonly style="width:100%;height:170px;font:11px/1.4 monospace;background:#000;color:#39ff14;border:1px solid #333"></textarea>' +
    '<div style="opacity:0.7;font-size:11px">●  = 터뜨리기. 가로 · 세로 = 기준에서 얼마나 (캔버스 비 — 세로는 아래가 +). 메인의 기준 = 모아이 그림 상자의 가운데, 미니의 기준 = 그 미니의 자리</div>';
  document.body.appendChild(panel);
  const $ = function(id) { return panel.querySelector('#' + id); };
  const sel = $('fxtSel'), inX = $('fxtX'), inY = $('fxtY');
  ITEMS.forEach(function(it, i) { const o = document.createElement('option'); o.value = i; o.textContent = it[2]; sel.appendChild(o); });

  // 십자: 고른 항목이 나오는 자리
  const marks = document.createElement('div'); marks.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50'; box.appendChild(marks);
  function cross(x, y) { return '<i style="position:absolute;left:' + (x * 100) + '%;top:' + (y * 100) + '%;width:22px;height:22px;margin:-11px 0 0 -11px;background:linear-gradient(#f0f,#f0f) center/2px 100% no-repeat,linear-gradient(#f0f,#f0f) center/100% 2px no-repeat;filter:drop-shadow(0 0 1px #000)"></i>'; }
  function minis() { return M.fieldActors ? M.fieldActors.list().filter(function(a) { return a.kind === 'mini'; }) : []; }
  function item() { return ITEMS[cur]; }
  function val() { const it = item(); return SPOT[it[0]][it[1]]; }
  function read() { const v = val(); inX.value = +v.dx.toFixed(4); inY.value = +v.dy.toFixed(4); draw(); }
  function write(x, y) { const v = val(); v.dx = x; v.dy = y; read(); }
  function draw() {
    const it = item(); let h = '';
    if (it[0] === 'main') { const q = OF.main(it[1]); if (q) h = cross(q.x, q.y); }
    else minis().forEach(function(a) { const q = OF.mini(a, it[1]); h += cross(q.x, q.y); });
    const c = OF.main('shock'), d = SHOCK.from * 2 * marks.clientHeight;      // 분홍 원 = 메인 고리가 나타나는 둘레 (시작 반지름)
    if (c && d > 2) h += '<i style="position:absolute;left:' + (c.x * 100) + '%;top:' + (c.y * 100) + '%;width:' + d + 'px;height:' + d + 'px;margin:' + (-d / 2) + 'px 0 0 ' + (-d / 2) + 'px;border:2px dashed #f0f;border-radius:50%;box-sizing:border-box;filter:drop-shadow(0 0 1px #000)"></i>';
    marks.innerHTML = h;
  }
  const SHOCK = M.fxRules.resp.shock;
  function setFrom(v, quiet) { SHOCK.from = Math.max(0, Math.min(0.6, +v || 0)); $('fxtFrom').value = SHOCK.from; $('fxtFromN').value = +SHOCK.from.toFixed(3); draw(); if (!quiet) T.hit('ace'); }
  function fire() {
    const it = item();
    if (it[1] === 'gather') T.gather();
    else if (it[0] === 'main') T.hit('ace'); else T.call('session', minis()[0] ? minis()[0].stage : null);   // 미니의 고리 · 빛살은 세션의 콜에만 있다 — 첫 미니 하나로 본다
  }
  function text() {
    const r = function(n) { return +n.toFixed(4); }, m = SPOT.main, n = SPOT.mini;
    return 'main: { shock: { dx: ' + r(m.shock.dx) + ', dy: ' + r(m.shock.dy) + ' }, rays: { dx: ' + r(m.rays.dx) + ', dy: ' + r(m.rays.dy) + ' }, hearts: { dx: ' + r(m.hearts.dx) + ', dy: ' + r(m.hearts.dy) + ' },\n' +
      '        gather: { dx: ' + r(m.gather.dx) + ', dy: ' + r(m.gather.dy) + ' } },\n' +
      'mini: { ring: { dx: ' + r(n.ring.dx) + ', dy: ' + r(n.ring.dy) + ' }, shock: { dx: ' + r(n.shock.dx) + ', dy: ' + r(n.shock.dy) + ' }, rays: { dx: ' + r(n.rays.dx) + ', dy: ' + r(n.rays.dy) + ' } }\n' +
      'shock.from: ' + r(SHOCK.from) + '\n' +
      'hold.pulse: { every: ' + r(M.fxRules.impact.hold.pulse.every) + ', amp: ' + r(M.fxRules.impact.hold.pulse.amp) + ', hearts: ' + r(M.fxRules.impact.hold.pulse.hearts) + ' }\n' +
      ['listen', 'respond'].map(function(t) { const o = M.fxRules.atmo[t]; return 'atmo.' + t + ": { color: '" + o.color + "', a: " + r(o.a) + (o.shade != null ? ", shade: '" + o.shade + "', sa: " + r(o.sa) : '') + ', spot: ' + r(o.spot) + ' }'; }).join('\n') + '\n' +
      'atmo.heat: { a: ' + r(M.fxRules.atmo.heat.a) + ', spot: ' + r(M.fxRules.atmo.heat.spot) + ' } · heat.level: ' + r(M.fxRules.impact.heat.level) + '\n' +
      'beam.glow.main: { hold: ' + r(BEAM.glow.main.hold) + ', mid: ' + r(BEAM.glow.main.mid) + ', a: ' + r(BEAM.glow.main.a) + ' }\n' +
      ['base'].map(function(m) { const b = BEAM[m]; return 'beam.' + m + ': { w: ' + r(b.w) + ', tilt: ' + r(b.tilt) + ', spread: ' + r(b.spread) + ', dx: ' + r(b.dx) + ', dy: ' + r(b.dy) + ' }'; }).join('\n');
  }
  // 빛줄기: 턴마다 닿는 자리 · 오는 방향 · 퍼진 정도 · 폭 — 턴을 고르면 그 턴의 분위기로 바꿔 보여 준다
  const BEAM = M.fxRules.beam;
  const BEAM_KEYS = [['dx', '닿는 자리 — 가로 (대상 폭의 비)', -1, 1, 0.01], ['dy', '닿는 자리 — 세로 (대상 폭의 비)', -1, 1, 0.01], ['tilt', '오는 방향 (기울기 — 도)', -50, 50, 1], ['spread', '퍼진 정도 (0 기둥 ~ 1 부채)', 0, 1, 0.01], ['w', '폭 (대상 폭의 몇 배)', 0.3, 3, 0.01]];
  function beamTurn() { return $('fxtBeamTurn').value; }
  function beamShow() { T.mood(beamTurn() === 'base' ? 'none' : beamTurn()); }
  function beamRows() {
    const b = BEAM[beamTurn()];
    $('fxtBeamRows').innerHTML = BEAM_KEYS.map(function(k) {
      return '<label style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:1">' + k[1] + '</span><input data-k="' + k[0] + '" type="number" min="' + k[2] + '" max="' + k[3] + '" step="' + k[4] + '" value="' + (+(+b[k[0]] || 0).toFixed(3)) + '" style="width:62px"></label>' +
        '<input data-k="' + k[0] + '" type="range" min="' + k[2] + '" max="' + k[3] + '" step="' + k[4] + '" value="' + (+b[k[0]] || 0) + '" style="width:100%;margin:0 0 2px">';
    }).join('');
    $('fxtBeamRows').querySelectorAll('input').forEach(function(el) {
      el.addEventListener('input', function() {
        BEAM[beamTurn()][el.dataset.k] = +el.value || 0;
        $('fxtBeamRows').querySelectorAll('input[data-k="' + el.dataset.k + '"]').forEach(function(o) { if (o !== el) o.value = el.value; });
        beamShow();
      });
    });
  }
  $('fxtBeamTurn').addEventListener('change', function() { beamRows(); beamShow(); });
  beamRows();
  // 메인 빛줄기의 밝기 분포: 위에서 hold까지 가장 밝게 → mid에서 a → 아래 끝에서 0
  const GLOW = BEAM.glow.main, GLOW_KEYS = [['hold', '가장 밝은 구간의 끝 (0 위 ~ 1 아래)', 0, 0.95, 0.01], ['mid', '중간 자리', 0, 0.99, 0.01], ['a', '중간 자리의 밝기', 0, 0.95, 0.01]];
  $('fxtGlowRows').innerHTML = GLOW_KEYS.map(function(k) {
    return '<label style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:1">' + k[1] + '</span><input data-g="' + k[0] + '" type="number" min="' + k[2] + '" max="' + k[3] + '" step="' + k[4] + '" value="' + GLOW[k[0]] + '" style="width:62px"></label>' +
      '<input data-g="' + k[0] + '" type="range" min="' + k[2] + '" max="' + k[3] + '" step="' + k[4] + '" value="' + GLOW[k[0]] + '" style="width:100%;margin:0 0 2px">';
  }).join('');
  $('fxtGlowRows').querySelectorAll('input').forEach(function(el) {
    el.addEventListener('input', function() {
      GLOW[el.dataset.g] = +el.value || 0;
      $('fxtGlowRows').querySelectorAll('input[data-g="' + el.dataset.g + '"]').forEach(function(o) { if (o !== el) o.value = el.value; });
      T.mood(M.fxRules.mood());
    });
  });
  // 필터 (분위기 층 — 연결표의 ATMO): 턴을 고르면 그 턴의 필터를 바로 보여 준다. 리스폰스는 단계(달아오른 정도)가 더하는 양까지
  //   값: 입히는 색 · 그 세기 (겹쳐서 — 진해진다) / 누르는 색 · 그 세기 (곱해서 — 가라앉는다: 콜 · 놓침) / 둘레의 어둠
  const ATMO = M.fxRules.atmo, HEAT = M.fxRules.impact.heat;
  function atmoTurn() { return $('fxtAtmoTurn').value; }
  function atmoShow() {
    const t = atmoTurn();
    if ($('fxtAtmoOff').checked) { M.atmo.tone({ dur: 0.15 }); return; }
    if (t === 'respond') M.atmo.tone({ color: ATMO.respond.color, a: ATMO.respond.a + ATMO.heat.a * HEAT.level, spot: Math.max(0, ATMO.respond.spot + ATMO.heat.spot * HEAT.level), dur: 0.15 });   // 필드의 패턴 미션 — 단계까지 더한 실제 값으로
    else if (t === 'listen') M.atmo.tone(Object.assign({ dur: 0.15 }, ATMO.listen, minis()[0] && minis()[0].color ? { color: minis()[0].color } : null));   // 세션의 바탕 — 첫 미니의 계열 색으로 본다 (세션에서는 그 세션의 미니의 색)
    else M.atmo.tone(Object.assign({ dur: 0.15 }, ATMO[t]));
  }
  function atmoRows() {
    const t = atmoTurn(), o = ATMO[t], rows = [];
    const num = function(obj, k, label, min, max, step, id) { rows.push('<label style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:1">' + label + '</span><input data-o="' + id + '" data-k="' + k + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + (+(+obj[k] || 0).toFixed(3)) + '" style="width:62px"></label><input data-o="' + id + '" data-k="' + k + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + (+obj[k] || 0) + '" style="width:100%;margin:0 0 2px">'); };
    const col = function(k, label) { rows.push('<label style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:1">' + label + '</span><input data-o="turn" data-k="' + k + '" type="color" value="' + (o[k] || '#ffffff') + '"></label>'); };
    col('color', '입히는 색'); num(o, 'a', '입히는 세기', 0, 1, 0.01, 'turn');
    if (o.shade != null) { col('shade', '누르는 색'); num(o, 'sa', '누르는 세기', 0, 1, 0.01, 'turn'); }
    num(o, 'spot', '둘레의 어둠', 0, 1, 0.01, 'turn');
    if (t === 'respond') { num(HEAT, 'level', '단계 (달아오른 정도 0 ~ 1)', 0, 1, 0.05, 'level'); num(ATMO.heat, 'a', '단계가 1일 때 더하는 세기', 0, 1, 0.01, 'heat'); num(ATMO.heat, 'spot', '단계가 1일 때 둘레의 어둠 (−면 걷힘)', -1, 1, 0.01, 'heat'); }
    $('fxtAtmoRows').innerHTML = rows.join('') + (t === 'respond' ? '<div id="fxtAtmoSum" style="font-size:11px;opacity:0.75"></div>' : '');
    const sum = function() { const el = $('fxtAtmoSum'); if (el) el.textContent = '지금 실제 값: 세기 ' + (ATMO.respond.a + ATMO.heat.a * HEAT.level).toFixed(2) + ' · 둘레 ' + Math.max(0, ATMO.respond.spot + ATMO.heat.spot * HEAT.level).toFixed(2); };
    sum();
    $('fxtAtmoRows').querySelectorAll('input').forEach(function(el) {
      el.addEventListener('input', function() {
        const obj = el.dataset.o === 'heat' ? ATMO.heat : el.dataset.o === 'level' ? HEAT : ATMO[atmoTurn()];
        obj[el.dataset.k] = el.type === 'color' ? el.value : (+el.value || 0);
        $('fxtAtmoRows').querySelectorAll('input[data-o="' + el.dataset.o + '"][data-k="' + el.dataset.k + '"]').forEach(function(x) { if (x !== el) x.value = el.value; });
        sum(); atmoShow();
      });
    });
  }
  $('fxtAtmoTurn').addEventListener('change', function() { atmoRows(); atmoShow(); });
  $('fxtAtmoOff').addEventListener('change', atmoShow);
  atmoRows();
  // 홀드 유지 중의 맥박 (연결표 IMPACT.hold.pulse): 누른 음표에서부터 몇 칸마다 · 모아이가 튀는 정도 · 하트 수
  const PULSE = M.fxRules.impact.hold.pulse, PULSE_KEYS = [['every', '몇 칸마다 (16분음표 — 0 = 없음)', 0, 8, 1], ['amp', '모아이가 튀는 정도', 0, 0.1, 0.005], ['hearts', '하트 수', 0, 10, 1]];
  $('fxtPulseRows').innerHTML = PULSE_KEYS.map(function(k) {
    return '<label style="display:flex;align-items:center;gap:4px;font-size:12px"><span style="flex:1">' + k[1] + '</span><input data-p="' + k[0] + '" type="number" min="' + k[2] + '" max="' + k[3] + '" step="' + k[4] + '" value="' + PULSE[k[0]] + '" style="width:62px"></label>';
  }).join('');
  $('fxtPulseRows').querySelectorAll('input').forEach(function(el) { el.addEventListener('input', function() { PULSE[el.dataset.p] = +el.value || 0; }); });
  $('fxtPulseFire').addEventListener('click', function() { T.pulse(); });
  $('fxtFrom').addEventListener('change', function(e) { setFrom(e.target.value); });
  $('fxtFrom').addEventListener('input', function(e) { setFrom(e.target.value, true); });
  $('fxtFromN').addEventListener('change', function(e) { setFrom(e.target.value); });
  setFrom(SHOCK.from, true);

  sel.addEventListener('change', function() { cur = +sel.value; read(); });
  [inX, inY].forEach(function(el) { el.addEventListener('input', function() { write(+inX.value || 0, +inY.value || 0); }); });
  panel.querySelectorAll('button[data-d]').forEach(function(b) {
    b.addEventListener('click', function() { const d = b.dataset.d.split(',').map(Number), k = $('fxtCoarse').checked ? STEP.coarse : STEP.fine; write((+inX.value || 0) + d[0] * k, (+inY.value || 0) + d[1] * k); fire(); });
  });
  $('fxtFire').addEventListener('click', fire);
  $('fxtLoop').addEventListener('change', function(e) { clearInterval(loop); loop = e.target.checked ? setInterval(fire, 900) : null; });
  $('fxtFlip').addEventListener('change', function(e) { if (M.facing && M.facing.lock) M.facing.lock(e.target.checked ? 'left' : null); setTimeout(draw, 60); });
  $('fxtOut').addEventListener('click', function() { $('fxtText').value = text(); });
  $('fxtCopy').addEventListener('click', function() { $('fxtText').value = text(); $('fxtText').select(); try { document.execCommand('copy'); } catch (e) {} if (navigator.clipboard) navigator.clipboard.writeText(text()).catch(function() {}); });
  ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'keyup'].forEach(function(n) { panel.addEventListener(n, function(e) { e.stopPropagation(); }); });   // 도구를 만지는 것이 연주 입력으로 가지 않게

  setTimeout(function() { if (M.fieldActors && M.fieldActors.placeMinis) M.fieldActors.placeMinis(); if (M.fieldActors && M.fieldActors.spawning) M.fieldActors.spawning(false); setTimeout(read, 600); }, 1500);
  setInterval(draw, 500);            // 미니가 늦게 서거나 모아이의 높이가 바뀌어도 십자가 따라가게
  M.fxTuner = { text: text, fire: fire, select: function(i) { cur = i; sel.value = i; read(); } };
})();
