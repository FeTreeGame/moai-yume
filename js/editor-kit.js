// 편집기 공용 틀 (개발용 — ?플래그 편집기들이 함께 씀: ?sky · ?patterns · ?accessory …). 명세 docs/index/content.md
//   M.editorKit.panel(제목, { width }) → { el, body, status(글자) } — 오른쪽 위 패널 (제목줄 드래그 이동, _ 접기)
//   M.editorKit.capture(handlers) → 캔버스 위 캡처 층 (연주 입력을 막고 끌기·휠을 편집기로 — { down(pt), move(pt, d), up(), wheel(dir, e) })
//     pt = { x, y } 캔버스 비 (0~1), d = { dx, dy } 이동량 (캔버스 비)
//   M.editorKit.keys(map) → 키 → 함수 (캡처 단계 — 연주·높이 키보다 먼저, 입력창 안에선 무시). 함수가 false를 돌려주면 그 키는 통과
//   M.editorKit.save(이름, 값, panel) → 데이터 파일 저장 (M.data.save) + 패널에 결과 표시
//   M.editorKit.list(폴더) → Promise<[그림 파일 이름…]> (개발 서버 GET /list — assets/ 아래)
(function() {
  const M = window.Moai;
  const css = document.createElement('style');
  css.textContent =
    '.ek-pad{position:fixed;right:8px;top:8px;width:290px;max-height:94vh;overflow:auto;z-index:9999;' +
    'background:rgba(10,14,10,0.92);color:#cfe;font:12px/1.45 monospace;border:1px solid #3a5;border-radius:6px;padding:8px}' +
    '.ek-pad h4{margin:0 0 6px;color:#9f9;font-size:13px;display:flex;justify-content:space-between;cursor:move;user-select:none}' +
    '.ek-pad button{background:#1d2b1d;color:#cfe;border:1px solid #365;border-radius:3px;cursor:pointer;padding:1px 6px;font:inherit;margin:1px}' +
    '.ek-pad button.on{background:#3a6;color:#000}' +
    '.ek-pad select,.ek-pad input{background:#111;color:#cfe;border:1px solid #365;font:inherit}' +
    '.ek-row{display:flex;align-items:center;gap:4px;margin:3px 0;flex-wrap:wrap}' +
    '.ek-sec{border-top:1px solid #253;margin-top:6px;padding-top:6px}' +
    '.ek-help{color:#7a8;font-size:10px;margin-top:6px;white-space:pre-wrap}' +
    '.ek-status{color:#fd6;font-size:11px;margin-top:4px;min-height:1em}' +
    '.ek-pad.min>*:not(h4){display:none}' +
    '.ek-cap{position:absolute;inset:0;z-index:60;cursor:crosshair;touch-action:none}';
  document.head.appendChild(css);

  function panel(title, opts) {
    const el = document.createElement('div');
    el.className = 'ek-pad';
    if (opts && opts.width) el.style.width = opts.width + 'px';
    el.innerHTML = '<h4><span>' + title + '</span><button data-ek="min">_</button></h4><div class="ek-body"></div><div class="ek-status"></div>';
    document.body.appendChild(el);
    const head = el.querySelector('h4'), body = el.querySelector('.ek-body'), st = el.querySelector('.ek-status');
    el.querySelector('[data-ek="min"]').addEventListener('click', function() { el.classList.toggle('min'); });
    let drag = null;
    head.addEventListener('pointerdown', function(e) { if (e.target.tagName === 'BUTTON') return; const r = el.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; el.style.left = (e.clientX - drag.x) + 'px'; el.style.top = (e.clientY - drag.y) + 'px'; el.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { drag = null; });
    return { el: el, body: body, status: function(t) { st.textContent = t || ''; } };
  }

  function capture(h) {
    const box = document.querySelector('.sprite-box'), canvas = document.getElementById('spriteCanvas');
    const cap = document.createElement('div');
    cap.className = 'ek-cap';
    box.appendChild(cap);
    ['mousedown', 'touchstart'].forEach(function(ev) { cap.addEventListener(ev, function(e) { e.stopPropagation(); }, { passive: true }); });
    function pt(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    let last = null;
    cap.addEventListener('pointerdown', function(e) { last = pt(e); cap.setPointerCapture(e.pointerId); if (h.down) h.down(last); });
    cap.addEventListener('pointermove', function(e) { if (!last) return; const p = pt(e), d = { dx: p.x - last.x, dy: p.y - last.y }; last = p; if (h.move) h.move(p, d); });
    function up() { if (last && h.up) h.up(); last = null; }
    cap.addEventListener('pointerup', up);
    cap.addEventListener('pointercancel', up);
    cap.addEventListener('wheel', function(e) { e.preventDefault(); if (h.wheel) h.wheel(e.deltaY < 0 ? 1 : -1, e); }, { passive: false });
    return cap;
  }

  function keys(map) {
    window.addEventListener('keydown', function(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const f = map[e.code];
      if (!f) return;
      if (f(e) === false) return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', function(e) { if (map[e.code]) e.stopImmediatePropagation(); }, true);
  }

  function save(name, value, pad) {
    if (pad) pad.status('저장 중…');
    return M.data.save(name, value).then(function(r) {
      if (pad) pad.status(r.ok ? '저장됨 → ' + r.path : (r.downloaded ? '서버 저장 안 됨 (' + (r.error || '') + ') — 파일을 내려받음: js/data/에 넣으세요' : '실패: ' + r.error));
      return r;
    });
  }

  // 에셋 폴더의 그림 파일 이름들 (개발 서버 GET /list — 없으면 빈 목록)
  function list(dir) {
    return fetch('/list?dir=' + encodeURIComponent(dir)).then(function(r) { return r.json(); })
      .then(function(r) { return r && r.ok ? r.files : []; }).catch(function() { return []; });
  }

  M.editorKit = { panel: panel, capture: capture, keys: keys, save: save, list: list };
})();
