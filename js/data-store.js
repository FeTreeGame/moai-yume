// 데이터 파일 — 콘텐츠 데이터(패턴·미션·보상 자리·하늘 풀 등)를 코드와 떼어 js/data/<이름>.js에 둔다. 형식·목록: docs/index/content.md
//   파일 = `window.MoaiData['<이름>'] = <JSON>;` — index.html이 모듈보다 먼저 읽는다 (DATA 목록). 없으면 쓰는 쪽의 기본값
//   읽기: M.data.get(이름, 기본값) — 파일 값(없으면 기본값)의 복사본. 쓰는 쪽은 받은 값을 고쳐도 원본이 바뀌지 않음
//   저장: M.data.save(이름, 값) → 개발 서버 POST /save (tools/dev-server.py — 이 PC에서 연 페이지만) → js/data/<이름>.js 통째로 씀
//     서버에 못 쓰면(다른 서버·폰·file://) 그 파일 내용을 내려받기로 — 받은 파일을 js/data/에 넣으면 같음
(function() {
  const M = window.Moai;
  window.MoaiData = window.MoaiData || {};

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function text(name, value) {
    return '// 데이터 파일 — 편집기가 통째로 다시 쓴다 (tools/dev-server.py /save). 손으로 고쳐도 되지만 주석은 저장 때 사라짐\n' +
      '// 형식·쓰는 곳: docs/index/content.md\n' +
      'window.MoaiData = window.MoaiData || {};\n' +
      'window.MoaiData[' + JSON.stringify(name) + '] = ' + JSON.stringify(value, null, 2) + ';\n';
  }
  function download(name, value) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text(name, value)], { type: 'text/javascript' }));
      a.download = name + '.js';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
    } catch (e) { console.log(text(name, value)); }
  }

  M.data = {
    get: function(name, fallback) {
      const v = window.MoaiData[name];
      return copy(v !== undefined ? v : fallback);
    },
    has: function(name) { return window.MoaiData[name] !== undefined; },
    // 저장 → Promise<{ ok, path | error, downloaded }>. 저장하면 이 페이지의 값도 바뀜 (다시 읽지 않아도 get이 새 값)
    save: function(name, value) {
      window.MoaiData[name] = copy(value);
      const body = JSON.stringify(value);
      return fetch('/save?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
        .then(function(r) { return r.json().catch(function() { return { ok: false, error: 'HTTP ' + r.status }; }); })
        .catch(function(e) { return { ok: false, error: String(e) }; })
        .then(function(res) {
          if (res && res.ok) return res;
          download(name, value);
          return { ok: false, error: res && res.error, downloaded: true };
        });
    },
    text: text,
  };
})();
