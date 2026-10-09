// 정보 HUD — 지금 상태에서 알아야 하는 것을 화면에 둔다 (연출이 아니라 정보. 타격 연출을 꺼도 남는다)
//   계속 떠 있는 것 (정해진 자리):
//     턴        지금 누구 차례인가 — LISTEN (부르는 것을 듣는다) / YOUR TURN · GO! (내가 친다). 옆의 점 = 이 박이 끝난 뒤 다음 턴까지 남은 박 (한 턴 = 네 박: 셋 → 둘 → 하나 → 다 꺼짐 = 다음 박에 턴이 바뀐다)
//               (처음에는 점이 넷이었다 — 지금 박까지 세어 4 → 3 → 2 → 1 → 다시 4: 하나는 한 번도 꺼지지 않았다)
//   게이지 끝: 다 채우면 얻는 것 (진행 표의 다음 보상)
//   판정(등급 · 빠름/늦음 · 턴 요약)은 여기 두지 않는다 — 판정을 글자로 보인다면 그 음표의 자리에서 (비트 막대: rhythm/guide-fx.js)
//   알림만 듣는다: 'moai:turn' (세션) · 'moai:field-turn' (필드) · 'moai:session' · 'moai:field-event' — 아무것도 바꾸지 않는다
(function() {
  const M = window.Moai, G = window.G;
  const box = document.querySelector && document.querySelector('.sprite-box');
  if (!box) return;
  const INFO = { dots: 3,
    show: { turn: { session: true, field: false }, next: false },   // 무엇을 띄울 것인가 — 필드의 턴(GO! · LISTEN + 점)과 게이지 끝의 다음 보상은 뺐다 (없는 편이 깔끔하다)
    label: { listen: 'LISTEN', respond: 'YOUR TURN', go: 'GO!', wait: 'READY' },
    reward: { bar: '▬', bgm: '♪', part: '♪', mini: 'MOAI', none: '' } };

  const root = document.createElement('div'); root.className = 'hud-info hidden';
  root.innerHTML = '<div class="hud-turn"><span class="hud-turn-label"></span><span class="hud-dots"></span></div>';
  box.appendChild(root);
  const elLabel = root.querySelector('.hud-turn-label'), elDots = root.querySelector('.hud-dots');
  const next = document.createElement('div'); next.className = 'hud-next hidden'; box.appendChild(next);   // 게이지 끝의 다음 보상

  let turn = null;            // { role, nextAt (오디오 시각), beat (초) }
  function actx() { return G && G.actx ? G.actx.currentTime : 0; }
  function show(on) { root.classList.toggle('hidden', !on); root.classList.toggle('in-session', !!M.sessionActive); }
  function label(text) { if (elLabel.textContent !== text) elLabel.textContent = text; }
  function dots(n) {
    if (elDots.dataset.n === String(n)) return;
    elDots.dataset.n = n;
    let h = ''; for (let i = 0; i < INFO.dots; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    elDots.innerHTML = n < 0 ? '' : h;
  }
  function setTurn(role, nextAt, beat, where) {
    turn = role && role !== 'none' && INFO.show.turn[where] ? { role: role, nextAt: nextAt, beat: beat, where: where } : null;
    show(!!turn);
    if (!turn) { label(''); dots(-1); }
    wake();
  }
  function frame() {
    if (!turn) return false;
    label(turn.role === 'respond' ? (turn.where === 'field' ? INFO.label.go : INFO.label.respond) : INFO.label[turn.role] || '');
    dots(turn.nextAt && turn.beat ? Math.max(0, Math.min(INFO.dots, Math.ceil((turn.nextAt - actx()) / turn.beat - 0.02) - 1)) : -1);
    return true;
  }
  function wake() { if (M.frame) M.frame.add(frame); else frame(); }

  document.addEventListener('moai:turn', function(e) { const d = e.detail; setTurn(d.role, d.next ? d.next.time : 0, d.beat, 'session'); });
  document.addEventListener('moai:field-turn', function(e) { const d = e.detail; if (!M.sessionActive) setTurn(d.role, d.nextAt, d.beat, 'field'); });
  document.addEventListener('moai:session', function(e) { if (!e.detail.active) setTurn(null); });
  // 게이지 끝: 다음 보상
  function nextReward() {
    const P = M.fieldProgress, st = P && P.state ? P.state() : null, id = st && st.reward && st.reward[0];
    const txt = id && INFO.show.next ? (INFO.reward[id] != null ? INFO.reward[id] : id.indexOf('song.') === 0 ? '♪' : '?') : '';
    next.textContent = txt; next.classList.toggle('hidden', !txt || !!M.sessionActive);
  }
  document.addEventListener('moai:field-event', function(e) { if (e.detail && (e.detail.kind === 'reward' || e.detail.actor === 'gauge')) setTimeout(nextReward, 50); });
  document.addEventListener('moai:session', function() { setTimeout(nextReward, 50); });
  setTimeout(nextReward, 800);

  M.hudInfo = { policy: INFO, state: function() { return { turn: turn, label: elLabel.textContent, dots: elDots.dataset.n, next: next.textContent }; }, el: root };
})();
