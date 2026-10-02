// 목소리 굽기 — 녹음 탭에서 채택한 소리를 게임 목소리 파일로 (모아이 목소리 = 사용자 녹음 — 원작 음원을 쓰지 않음). 명세 docs/index/content.md §9
//   채택본(adoptedBuffers — 뚜~는 루프 XF 포함) → WAV(16비트) → 개발 서버 POST /upload → assets/voice/<doo|pah|wop>.wav
//   뚜~ 루프 지점·파일 경로는 데이터 파일 voice(js/data/voice.js)에 저장 → 게임(js/original.js)이 불러올 때 읽음
//   서버에 못 쓰면(폰·다른 서버) 파일을 내려받기로 — assets/voice/에 넣고, voice.js도 함께 받음
function wavBytes(buf) {
  var ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length, bytes = 44 + n * ch * 2;
  var dv = new DataView(new ArrayBuffer(bytes)), o = 0;
  function str(s) { for (var i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); }
  function u32(v) { dv.setUint32(o, v, true); o += 4; }
  function u16(v) { dv.setUint16(o, v, true); o += 2; }
  str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(sr); u32(sr * ch * 2); u16(ch * 2); u16(16);
  str('data'); u32(n * ch * 2);
  var data = []; for (var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  for (var i = 0; i < n; i++) for (var k = 0; k < ch; k++) { var v = Math.max(-1, Math.min(1, data[k][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return dv.buffer;
}
function downloadBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}
function bakeVoice(name) {
  var buf = adoptedBuffers[name], M = window.Moai;
  if (!buf) { setSlotStatus(name, '먼저 채택'); return; }
  var file = name + '.wav', bytes = wavBytes(buf);
  var meta = window.MoaiData.voice = window.MoaiData.voice || {};   // 같은 객체를 고침 (여럿을 잇달아 구워도 서로 덮지 않게)
  meta[name] = { file: 'assets/voice/' + file };
  if (buf._loopStart !== undefined) { meta[name].loopStart = +buf._loopStart.toFixed(5); meta[name].loopEnd = +buf._loopEnd.toFixed(5); }
  setSlotStatus(name, '굽는 중…');
  fetch('/upload?name=' + file, { method: 'POST', body: bytes })
    .then(function(r) { return r.json(); })
    .catch(function(e) { return { ok: false, error: String(e) }; })
    .then(function(r) {
      if (!r || !r.ok) {
        downloadBlob(new Blob([bytes], { type: 'audio/wav' }), file);
        M.data.save('voice', meta);   // 서버가 없으면 voice.js도 내려받기
        setSlotStatus(name, '💾 내려받음 — ' + file + '를 assets/voice/에, voice.js를 js/data/에');
        return;
      }
      M.data.save('voice', meta).then(function(s) {
        setSlotStatus(name, s.ok ? '💾 구움 → ' + r.path + ' (새로고침하면 게임 목소리)' : '파일은 구움, voice.js 저장 실패: ' + s.error);
      });
    });
}
