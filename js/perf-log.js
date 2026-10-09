// 성능 기록 (개발용 — 주소에 ?perf) — 목표 기기에서 '얼마나 그리라고 시키는가'와 그 결과를 숫자로 모은다 (소스 저장소 docs/RENDER-COST.md)
//   화면 위쪽 가운데의 한 줄 = 지금 값 (1초마다): 상태 · 화면이 새로 그려진 횟수/초 · 그림 캔버스를 다시 그린 횟수/초 · 긴 프레임 · 배터리
//   그 줄을 누르면 요약이 열린다 — '복사'로 글을 넘기거나, 화면을 찍는다. '초기화'로 처음부터 다시
//   모으는 것 (상태별 — 대기 / 필드 / 필드+곡 / 패턴 미션 / 세션):
//     프레임 간격의 분포 (주사율이 실제로 어떻게 오가는가) · 긴 프레임 (33ms · 50ms 넘는 것 — 밀림)
//     그림 캔버스 다시 그리기: 초당 횟수 · 한 프레임 안의 횟수 (2번 이상이면 낭비) · 막대 캔버스 다시 그리기
//     프레임 콜백에 든 스크립트 시간 (프레임당)
//   1분마다의 흐름: 위의 값들 + 배터리 잔량 — 오래 할수록 느려지는가 (열로 인한 속도 제한의 단서) · 분당 몇 %가 주는가 (전력의 단서)
//   기기 정보: 화면 배율 · 캔버스의 실제 화소 · 화면 크기 · 코어 수 · 메모리 · 압력 관찰자(있으면)
//   재는 것 자체의 값: 프레임 콜백 하나(간격 재기)와 1초마다의 글자 갱신. 이것이 켜져 있는 동안 프레임 루프가 멈추지 않는다 — 대기 상태의 값은 그만큼 높게 나온다
//   지난 기록은 기기에 남는다 (localStorage 'moai.perf') — 새로 열어도 요약에서 앞의 판을 볼 수 있다
(function() {
  const M = window.Moai;
  if (!M) return;
  const B = [7, 9.5, 13, 20, 40], BN = ['144↑', '120', '90', '60', '30', '30↓'];   // 프레임 간격의 칸 (ms 경계) · 이름 (그 간격에 해당하는 주사율)
  const mk = function() { return { sec: 0, frames: 0, hist: [0, 0, 0, 0, 0, 0], long33: 0, long50: 0, redraw: 0, multi: 0, maxIn: 0, bars: 0, cb: 0, req: 0 }; };
  let S = {}, minutes = [], cur = null, started = Date.now(), batt = null, press = [];
  const st = function(k) { return S[k] || (S[k] = mk()); };

  // 상태
  function stateNow() {
    if (M.sessionActive) return '세션';
    if (M.fxRules && M.fxRules.patternMission && M.fxRules.patternMission()) return '패턴 미션';
    const tl = M.fieldBgm && M.fieldBgm.timeline ? M.fieldBgm.timeline() : null;
    return tl && tl.running ? '필드+곡' : '대기·필드';
  }

  // 세는 곳: 그림 캔버스 · 막대 캔버스의 다시 그리기, 프레임 콜백의 시간
  //   그림 = 실제로 그린 횟수 (M.spriteFlush — 프레임당 한 번이어야 한다) · 요청 = 다시 그려 달라고 부른 횟수 (M.spriteRedraw — 표시만 한다)
  let inFrame = 0, barsN = 0, cbMs = 0, reqN = 0;
  if (M.spriteFlush) { const o = M.spriteFlush; M.spriteFlush = function() { inFrame++; return o.apply(this, arguments); }; const r = M.spriteRedraw; M.spriteRedraw = function() { reqN++; return r.apply(this, arguments); }; }
  else if (M.spriteRedraw) { const o = M.spriteRedraw; M.spriteRedraw = function() { inFrame++; reqN++; return o.apply(this, arguments); }; }
  if (M.renderBars) { const o = M.renderBars; M.renderBars = function() { barsN++; return o.apply(this, arguments); }; }
  const oraf = window.requestAnimationFrame;
  window.requestAnimationFrame = function(f) { return oraf.call(window, function(t) { const a = performance.now(); try { f(t); } finally { cbMs += performance.now() - a; } }); };

  let last = null, m = mk(), mStart = performance.now();
  function frame(t) {
    oraf.call(window, frame);
    if (last != null) {
      const dt = t - last, a = st(stateNow()), n = inFrame;
      let b = 0; while (b < B.length && dt >= B[b]) b++;
      [a, m].forEach(function(x) {
        x.sec += Math.min(dt, 250) / 1000; x.frames++; x.hist[b]++; if (dt > 33) x.long33++; if (dt > 50) x.long50++;
        x.redraw += n; if (n > 1) x.multi++; if (n > x.maxIn) x.maxIn = n; x.bars += barsN; x.cb += cbMs; x.req += reqN;
      });
    }
    last = t; inFrame = 0; barsN = 0; cbMs = 0; reqN = 0;
  }
  oraf.call(window, frame);

  // 배터리 · 압력
  if (navigator.getBattery) navigator.getBattery().then(function(b) { batt = b; }).catch(function() {});
  try {
    if (typeof PressureObserver === 'function') new PressureObserver(function(rs) { rs.forEach(function(r) { press.push([Math.round((Date.now() - started) / 1000), r.state]); }); }).observe('cpu').catch(function() {});
  } catch (e) {}
  const battNow = function() { return batt ? Math.round(batt.level * 100) + '%' + (batt.charging ? '(충전)' : '') : '?'; };

  // 1분마다의 흐름
  setInterval(function() {
    const s = (performance.now() - mStart) / 1000;
    if (m.frames) minutes.push({ t: Math.round((Date.now() - started) / 60000), fps: +(m.frames / s).toFixed(0), redraw: +(m.redraw / s).toFixed(0), l33: m.long33, l50: m.long50, cb: +(m.cb / m.frames).toFixed(2), batt: battNow(), at: stateNow() });
    m = mk(); mStart = performance.now(); save();
  }, 60000);

  // 요약
  function device() {
    const c = document.querySelector('.sprite-canvas'), b = document.querySelector('.sprite-box');
    return '배율 ' + (window.devicePixelRatio || 1) + ' · 화면 ' + window.innerWidth + 'x' + window.innerHeight + ' · 캔버스 ' + (c ? c.width + 'x' + c.height : '?') + ' (' + (c ? (c.width * c.height / 1e6).toFixed(1) : '?') + '백만 화소) · 상자 ' + (b ? Math.round(b.clientWidth) + 'x' + Math.round(b.clientHeight) : '?') +
      ' · 코어 ' + (navigator.hardwareConcurrency || '?') + ' · 메모리 ' + (navigator.deviceMemory || '?') + 'GB · 연출 ' + (M.fxRules && M.fxRules.impact ? (M.fxRules.impact.on ? '켬' : '끔') : '?') + fxOff() + '\n' + navigator.userAgent;
  }
  function summary() {
    const L = ['[모아이 성능 기록] ' + new Date(started).toLocaleString() + ' ~ ' + Math.round((Date.now() - started) / 60000) + '분 · 배터리 ' + battNow(), device(), ''];
    L.push('상태 | 초 | 화면/초 | 간격 분포 (' + BN.join(' · ') + ') % | 긴 프레임 33ms · 50ms | 그림 다시 그리기/초 · 2번 이상인 프레임 % · 최대 | 요청/초 | 막대/초 | 스크립트 ms/프레임');
    Object.keys(S).forEach(function(k) {
      const a = S[k]; if (!a.frames) return;
      L.push(k + ' | ' + a.sec.toFixed(0) + ' | ' + (a.frames / a.sec).toFixed(0) + ' | ' + a.hist.map(function(v) { return Math.round(v / a.frames * 100); }).join(' · ') + ' | ' + a.long33 + ' · ' + a.long50 +
        ' | ' + (a.redraw / a.sec).toFixed(0) + ' · ' + Math.round(a.multi / a.frames * 100) + '% · ' + a.maxIn + ' | ' + (a.req / a.sec).toFixed(0) + ' | ' + (a.bars / a.sec).toFixed(0) + ' | ' + (a.cb / a.frames).toFixed(2));
    });
    L.push('', '분 | 화면/초 | 그림/초 | 긴 33 · 50 | 스크립트 | 배터리 | 그때의 상태');
    minutes.forEach(function(x) { L.push(x.t + ' | ' + x.fps + ' | ' + x.redraw + ' | ' + x.l33 + ' · ' + x.l50 + ' | ' + x.cb + ' | ' + x.batt + ' | ' + x.at); });
    if (press.length) L.push('', '압력 (초, 상태): ' + press.map(function(p) { return p[0] + ' ' + p[1]; }).join(' / '));
    return L.join('\n');
  }
  function save() { try { localStorage.setItem('moai.perf', summary()); } catch (e) {} }
  let prev = ''; try { prev = localStorage.getItem('moai.perf') || ''; } catch (e) {}

  // 타격 연출을 끈 채로 재기: 주소에 fxoff를 같이 붙이거나 (?perf&fxoff), 요약 창의 '연출' 단추 — J 키와 같은 스위치 (js/fx-rules.js setImpact: 분위기 층 · 테두리 · 막대의 이펙트 · 모아이와 세계의 반응 · 큰 파티클)
  const fxSet = function(on) { if (M.fxRules && M.fxRules.setImpact) M.fxRules.setImpact(on); };
  const fxOn = function() { return !!(M.fxRules && M.fxRules.impact && M.fxRules.impact.on); };
  if (/[?&]fxoff\b/.test(location.search)) fxSet(false);
  //   묶음별: 주소에 off=이름,이름 (?perf&off=beams,filter) 또는 요약 창의 묶음 단추 — js/fx-rules.js setFx (beams · filter · frame · particles · bar · react · camera)
  const FX = M.fxRules && M.fxRules.fx ? M.fxRules.fx : null;
  const offParam = /[?&]off=([a-z,]+)/.exec(location.search);
  if (FX && offParam) offParam[1].split(',').forEach(function(g) { FX.set(g, false); });
  const fxOff = function() { if (!FX) return ''; const s = FX.get(), o = Object.keys(s).filter(function(k) { return !s[k]; }).map(function(k) { return FX.names[k]; }); return o.length ? ' (끈 묶음: ' + o.join(' · ') + ')' : ''; };

  // 화면
  const line = document.createElement('div');
  line.style.cssText = 'position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:20000;font:10px/1.3 monospace;color:#9f9;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:3px;white-space:nowrap;cursor:pointer;-webkit-user-select:none;user-select:none';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:6% 4%;z-index:20001;display:none;flex-direction:column;gap:6px;background:rgba(0,0,0,.92);border:1px solid #4a4;border-radius:6px;padding:8px;font:11px/1.4 monospace;color:#cfc';
  panel.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap"><button data-a="copy">복사</button><button data-a="prev">지난 판</button><button data-a="reset">초기화</button><button data-a="fx">연출</button>' + (FX ? Object.keys(FX.names).map(function(k) { return '<button data-g="' + k + '">' + FX.names[k] + '</button>'; }).join('') : '') + '<button data-a="close" style="margin-left:auto">닫기</button></div><textarea readonly style="flex:1;width:100%;box-sizing:border-box;background:#000;color:#cfc;border:1px solid #363;font:11px/1.4 monospace;white-space:pre;overflow:auto"></textarea>';
  document.body.appendChild(line); document.body.appendChild(panel);
  const ta = panel.querySelector('textarea');
  [].forEach.call(panel.querySelectorAll('button'), function(b) { b.style.cssText = 'font:12px monospace;padding:6px 10px;background:#132;color:#cfc;border:1px solid #4a4;border-radius:4px'; });
  function paint() {
    if (FX) [].forEach.call(panel.querySelectorAll('button[data-g]'), function(b) { const on = FX.get()[b.getAttribute('data-g')]; b.style.opacity = on ? 1 : 0.45; b.style.textDecoration = on ? '' : 'line-through'; });
    const f = panel.querySelector('button[data-a=fx]'); if (f) f.textContent = '연출 ' + (fxOn() ? '켬' : '끔');
  }
  function open() { ta.value = summary(); panel.style.display = 'flex'; paint(); }
  line.addEventListener('click', open);
  panel.addEventListener('click', function(e) {
    const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'), g = e.target && e.target.getAttribute && e.target.getAttribute('data-g');
    if (g && FX) { FX.set(g, !FX.get()[g]); paint(); ta.value = summary(); return; }
    if (a === 'close') panel.style.display = 'none';
    else if (a === 'prev') ta.value = prev || '(지난 기록 없음)';
    else if (a === 'fx') { fxSet(!fxOn()); paint(); ta.value = summary(); }
    else if (a === 'reset') { S = {}; minutes = []; press = []; started = Date.now(); m = mk(); mStart = performance.now(); ta.value = summary(); }
    else if (a === 'copy') { ta.select(); const t = ta.value; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function() { try { document.execCommand('copy'); } catch (e2) {} }); e.target.textContent = '복사됨'; setTimeout(function() { e.target.textContent = '복사'; }, 1200); }
  });
  // 지금 값 (1초마다 — 그 1초의 값)
  let pf = 0, pr = 0, pl = 0;
  setInterval(function() {
    let f = 0, r = 0, l = 0; Object.keys(S).forEach(function(k) { f += S[k].frames; r += S[k].redraw; l += S[k].long33; });
    line.textContent = (fxOn() ? (fxOff() ? '[일부 끔] ' : '') : '[연출 끔] ') + stateNow() + ' · 화면 ' + (f - pf) + '/s · 그림 ' + (r - pr) + '/s · 긴 ' + (l - pl) + ' · ' + battNow() + ' · ' + Math.round((Date.now() - started) / 60000) + '분 ▾';
    pf = f; pr = r; pl = l;
  }, 1000);
  window.addEventListener('pagehide', save);
  M.perfLog = { summary: summary, state: function() { return { S: S, minutes: minutes }; } };
})();
