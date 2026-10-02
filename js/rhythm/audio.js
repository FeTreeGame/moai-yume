// rhythm/audio.js — AudioContext 공유 + 출력 버스 (NPC 목소리 = noteSfxOut, 메트로놈 = metroOut, BGM = bgmOut)
// 출처: reference/ra/audio.js — index 이식 시:
//   - AudioContext는 index(Moai.ctx)와 공유
//   - 필드 비트 틱, 범용 sfx, 플레이어 OGG 사운드(→ index original.js), 바람/팬 채널 제거
//   - 볼륨 단계(sfxVol/bgmVol, setSfxVol/setBgmVol) 제거 → 믹서(js/mixer.js) 채널로. 메트로놈 버스를 BGM과 분리
(function(){
'use strict';
var G = window.G;

G.actx = null;

G.ensureCtx = function() {
  if (!G.actx) {
    G.actx = window.Moai.ensureCtx(); // index와 AudioContext 공유
    var mix = window.Moai.mixer;      // 볼륨은 믹서 채널이 담당 (js/mixer.js) — 여기 버스는 게인 1
    // SFX 버스 → 믹서 NPC 채널
    G.sfxOut = G.actx.createGain();
    G.sfxOut.connect(mix ? mix.bus('npc') : G.actx.destination);
    // 노트 전용 게인 (sfxOut 하위 — 인카운터 exit 페이드용)
    G.noteSfxOut = G.actx.createGain();
    G.noteSfxOut.gain.value = 1;
    G.noteSfxOut.connect(G.sfxOut);
    // 메트로놈 / BGM — 채널 분리
    G.metroOut = G.actx.createGain();
    G.metroOut.connect(mix ? mix.bus('metro') : G.actx.destination);
    G.bgmOut = G.actx.createGain();
    G.bgmOut.connect(mix ? mix.bus('bgm') : G.actx.destination);
  }
  if (G.actx.state === 'suspended') G.actx.resume();
};

})();
