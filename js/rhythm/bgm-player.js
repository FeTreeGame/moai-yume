// rhythm/bgm-player.js — JSON 기반 BGM 엔진 (배경음악 재생기)
// 출처: reference/ra/bgm-player.js — 전체를 가져와 index에 필요 없는 부분만 걷어냄:
//   - G.setClock 호출 제거: 공용 시계 값(G.startTime·G.BPM)은 Conductor 소유
//   - 자체 스케줄러(setInterval·nextTime) 제거 → Conductor 연주자 (로드맵 4단계): 재생 하나 = Conductor 타임라인 하나
//     (입장 시각이 원점, 곡 BPM 격자 — 곡마다 템포가 달라도 예약 루프는 Conductor 하나). 스텝 = 그 타임라인의 tick
//     입장·퇴장·페이드·템포 변경은 Conductor 요청이 확정한 시각으로. 퇴장 페이드 동안에도 계속 연주 (진짜 페이드아웃)
//   - 첫박 신호·루프 콜백(bgm-loop-util.js, 인카운터 턴 전환용) 제거
//   - 일시정지/재개, 스텝·nextTime 조작, 데이터 공유, 테마 등록 등 미사용 API 제거
// index 변경:
//   - 스텝 재생을 playStep(play, step, time)로 분리 — 재생 타임라인의 채널이 tick마다 부른다
//   - 재생마다 전용 출력 게인을 새로 만든다 — 곡 전환 시 이전 곡의 페이드아웃과 새 곡이 서로의 게인을 건드리지 않게
//   - 음색을 스타일 이름으로 정리 (산뜻 light · 포근 warm · 펀치 punch — 펀치 = 이전 비트 시퀀서 드럼), 재생 중 BPM·음색·게인 변경 (비트 탭 재생기)
// 곡 스텝 = 16분음표 = Conductor 1틱 (같은 BPM이면 1:1)
// API: G.loadBgm(name, url|json, cb), G.playBgm(name, opts), G.stopBgm(name, fadeTime, when), G.isBgmPlaying(name), G.getBgmData(name)
//      G.setBgmBpm(name, bpm, when), G.setBgmTheme(name, theme), G.setBgmGain(name, gain, when) — 재생 중 변경
//      G.bgmWhen(name, spec) — 그 곡 타임라인 기준 타이밍 확정 (예: 'bar' = 그 곡의 다음 마디)
//      G.bgmTimeline(name) — 지금 재생의 타임라인 (다른 재생이 올라타거나 이어받을 때)
// 레이어 선택 (playBgm opts.timeline·takeover) — 레이어 수는 BPM이 아니라 시간 관계의 성격이 정한다:
//   겹침(교차 페이드·템포가 다른 동시 연주) = 자기 레이어(기본) / 공유 격자(다른 연주자의 박을 따름) = 그 타임라인에 올라탐 /
//   순차(겹치지 않는 전환) = 레이어 하나로 충분 — 이전 곡의 타임라인을 이어받아 입장 시각부터 새 템포로
//      when = Conductor 타이밍 지정 (conductor.js C.when — 생략 = 즉시, 'beat'·'bar'는 그 곡의 타임라인 기준)
(function(){
'use strict';
var G = window.G;

function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

// ══════════════════════════════════════
// 음색 테마 (합성 파라미터 세트)
// ══════════════════════════════════════

// index: 플레이어에게 보이는 스타일 이름으로 정리 (원본 field·encounter → warm·light, 비트 시퀀서 음색 → punch)
var SYNTH_THEMES = {
  // 산뜻: 가볍고 또렷 — 원본 encounter 기반, 하이햇 더 밝게(8→9 kHz), 음 짧게 끊음(유지 0.7→0.6)
  light: {
    kick:  { freqStart: 180, freqEnd: 35, vol: 0.45, decay: 0.12 },
    snare: { freqStart: 220, freqEnd: 140, vol: 0.15, noiseVol: 0.12, decay: 0.06 },
    hihat: { hpFreq: 9000, closedVol: 0.035, closedDur: 0.03, openVol: 0.06, openDur: 0.1 },
    note:  { sustain: 0.6, sustainPos: 0.5 }
  },
  // 포근: 둥글고 부드러움 — 원본 field 기반, 하이햇 어둡고 작게(7→6 kHz), 킥 꼬리 길게, 음 길게 유지(0.8→0.85)
  warm: {
    kick:  { freqStart: 150, freqEnd: 30, vol: 0.5,  decay: 0.18 },
    snare: { freqStart: 200, freqEnd: 120, vol: 0.2, noiseVol: 0.12, decay: 0.09 },
    hihat: { hpFreq: 6000, closedVol: 0.04, closedDur: 0.04, openVol: 0.06, openDur: 0.14 },
    note:  { sustain: 0.85, sustainPos: 0.75 }
  },
  // 펀치: 세고 단단함 — 이전 비트 시퀀서(beat.js) 드럼 그대로
  punch: {
    kick:  { freqStart: 150, freqEnd: 30, vol: 0.7, decay: 0.15 },
    snare: { freqStart: 200, freqEnd: 120, vol: 0.3, noiseVol: 0.25, decay: 0.08 },
    hihat: { hpFreq: 7000, closedVol: 0.08, closedDur: 0.04, openVol: 0.12, openDur: 0.12 },
    note:  { sustain: 0.8, sustainPos: 0.7 }
  }
};

function getTheme(name) {
  return SYNTH_THEMES[name] || SYNTH_THEMES.light;
}

// ══════════════════════════════════════
// 합성 함수 (테마 파라미터 참조)
// ══════════════════════════════════════

function synthKick(c, out, t, th) {
  var p = th.kick;
  var o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(p.freqStart, t);
  o.frequency.exponentialRampToValueAtTime(p.freqEnd, t + 0.1);
  g.gain.setValueAtTime(p.vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + p.decay + 0.01);
}

function synthSnare(c, out, t, th) {
  var p = th.snare;
  var o = c.createOscillator(), g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(p.freqStart, t);
  o.frequency.linearRampToValueAtTime(p.freqEnd, t + 0.03);
  g.gain.setValueAtTime(p.vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + p.decay + 0.01);
  var len = c.sampleRate * 0.05;
  var buf = c.createBuffer(1, len, c.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var n = c.createBufferSource(), ng = c.createGain();
  n.buffer = buf;
  ng.gain.setValueAtTime(p.noiseVol, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  n.connect(ng).connect(out);
  n.start(t); n.stop(t + p.decay + 0.01);
}

function synthHihat(c, out, t, open, th) {
  var p = th.hihat;
  var dur = open ? p.openDur : p.closedDur;
  var len = c.sampleRate * dur;
  var buf = c.createBuffer(1, len, c.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var n = c.createBufferSource(), g = c.createGain();
  var f = c.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = p.hpFreq;
  n.buffer = buf;
  g.gain.setValueAtTime(open ? p.openVol : p.closedVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f).connect(g).connect(out);
  n.start(t); n.stop(t + dur + 0.01);
}

function synthNote(c, out, t, midi, waveform, vol, dur, th) {
  if (!midi || midi < 0) return;
  var p = th.note;
  var o = c.createOscillator(), g = c.createGain();
  o.type = waveform;
  o.frequency.setValueAtTime(midiHz(midi), t);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol * p.sustain, t + dur * p.sustainPos);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.01);
}

function synthPad(c, out, t, midi, dur) {
  if (!midi || midi < 0) return;
  var o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(midiHz(midi), t);
  var attack = Math.min(0.3, dur * 0.15);
  var release = Math.min(0.3, dur * 0.15);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.04, t + attack);
  g.gain.setValueAtTime(0.04, t + dur - release);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.01);
}

// ══════════════════════════════════════
// 드럼 디스패치 맵
// ══════════════════════════════════════

var drumSynth = {
  kick:   function(c, out, t, th) { synthKick(c, out, t, th); },
  snare:  function(c, out, t, th) { synthSnare(c, out, t, th); },
  hihat:  function(c, out, t, th) { synthHihat(c, out, t, false, th); },
  openHH: function(c, out, t, th) { synthHihat(c, out, t, true, th); }
};

// ══════════════════════════════════════
// BGM 인스턴스
// ══════════════════════════════════════

function createInstance() {
  return {
    play: null,       // 지금 재생 (index: 재생 하나 = 타임라인 하나 — 아래 G.playBgm). 퇴장 페이드 중인 이전 재생은 따로 남아 끝까지 연주
    pending: null,    // 대기 중인 입장 요청 id (Conductor)
    tempoReq: null,   // 대기 중인 템포 변경 요청 id
    data: null,       // 파싱된 JSON 데이터
    muteMelody: false, // 멜로디/아르페지오 뮤트 (베이스만 남김) — 재생 중 변경이 지금 재생에 바로 반영
    parts: null,       // 켜진 파트 { kick: true, snare: true, … } (null = 전부) — 트랙 id (kick·snare·hihat·openHH·bass·melody·arp·pad).
                       //   재생 중 변경이 지금 재생에 바로 반영 (바꾸는 시각은 부르는 쪽이 Conductor로 정한다 — 예: 다음 마디)
    synthTheme: null,  // 음색 테마 이름 또는 객체 (null = 'light') — 재생 중 변경이 지금 재생에 바로 반영
    // 구간 재생 (섹션 루프) 기본값
    loopStart: 0,     // 톤 재생 시작 스텝 (0-based)
    loopEnd: 0        // 톤 재생 끝 스텝 (0 = 전곡, 즉 pattern.length 사용)
  };
}

// ══════════════════════════════════════
// 데이터 로드 (JSON → 내부 포맷)
// ══════════════════════════════════════

// JSON 데이터를 스케줄러가 바로 쓸 수 있는 형태로 정리
function parseData(json) {
  var d = (typeof json === 'string') ? JSON.parse(json) : json;
  var tracks = d.tracks;
  var result = {
    name: d.name || 'Untitled',
    bpm: d.bpm || 130,
    synthTheme: d.synthTheme || null,
    sections: d.sections || null,
    drums: {},
    tones: {},
    pad: null
  };

  var drumIds = ['kick', 'snare', 'hihat', 'openHH'];
  var toneIds = ['bass', 'melody', 'arp'];

  for (var i = 0; i < drumIds.length; i++) {
    var id = drumIds[i];
    if (tracks[id] && tracks[id].pattern) {
      result.drums[id] = tracks[id].pattern;
    }
  }

  for (var j = 0; j < toneIds.length; j++) {
    var tid = toneIds[j];
    var tr = tracks[tid];
    if (tr && tr.pattern) {
      result.tones[tid] = {
        pattern:  tr.pattern,
        waveform: tr.waveform || (tid === 'bass' ? 'triangle' : tid === 'arp' ? 'triangle' : 'square'),
        vol:      tr.vol != null ? tr.vol : (tid === 'bass' ? 0.16 : tid === 'arp' ? 0.05 : 0.07),
        dur:      tr.dur != null ? tr.dur : (tid === 'bass' ? 1.2 : tid === 'arp' ? 1.8 : 1.3)
      };
    }
  }

  if (tracks.pad && tracks.pad.chords) {
    // 유효 코드가 하나라도 있는지 확인
    var hasChord = false;
    for (var k = 0; k < tracks.pad.chords.length; k++) {
      var ch = tracks.pad.chords[k];
      if (ch[0] || ch[1] || ch[2]) { hasChord = true; break; }
    }
    if (hasChord) {
      result.pad = { chords: tracks.pad.chords };
    }
  }

  return result;
}

// ══════════════════════════════════════
// 스텝 재생 + 스케줄러
// ══════════════════════════════════════

function resolveTheme(inst) {
  var th = inst.synthTheme;
  if (!th) return getTheme('light');
  if (typeof th === 'string') return getTheme(th);
  return th;
}

// 구간 재생 인덱스: loopEnd > loopStart 이면 [loopStart, loopEnd) 범위만 순환
function loopIndex(inst, step, len) {
  var ls = inst.loopStart || 0;
  var le = inst.loopEnd   || 0;
  if (le > ls) {
    var range = le - ls;
    var rem = (step - ls) % range;
    if (rem < 0) rem += range;
    return ls + rem;
  }
  return step % len;
}

// 스텝 하나 예약 (step = 16분음표 번호, time = 오디오 시각)
// 원본 스케줄러 루프 본문 — 세션 반주로 쓸 때는 Conductor 채널의 onTick(tick, time)이 이 함수를 부르면 된다
function playStep(inst, step, time) {
  var c = G.actx;
  var out = inst.out || G.bgmOut;
  var d = inst.data;
  var stepSec = inst.stepSec;
  var th = resolveTheme(inst);
  var s16 = step % 16;

  // 드럼 (16스텝 고정 반복)
  for (var did in d.drums) {
    if (inst.parts && !inst.parts[did]) continue;
    var dpat = d.drums[did];
    if (dpat[s16] && drumSynth[did]) {
      drumSynth[did](c, out, time, th);
    }
  }

  // 톤 (bass, melody, arp) — 구간 재생 대응. 멜로디 뮤트 시 베이스만
  for (var tid in d.tones) {
    if (inst.muteMelody && tid !== 'bass') continue;
    if (inst.parts && !inst.parts[tid]) continue;
    var tone = d.tones[tid];
    var pat = tone.pattern;
    var idx = loopIndex(inst, step, pat.length);
    if (idx < pat.length && pat[idx] && pat[idx] > 0) {
      synthNote(c, out, time, pat[idx], tone.waveform, tone.vol, tone.dur * stepSec, th);
    }
  }

  // 패드 (마디 첫 스텝에서 코드 3음 발음, 1마디 지속)
  if (d.pad && s16 === 0 && (!inst.parts || inst.parts.pad)) {
    var chords = d.pad.chords;
    var chordBar = Math.floor(step / 16);
    var chordIdx;
    var ls = inst.loopStart || 0, le = inst.loopEnd || 0;
    if (le > ls) {
      var barS = Math.floor(ls / 16);
      var barE = Math.floor(le / 16);
      var barRange = barE - barS;
      var barRem = (chordBar - barS) % barRange;
      if (barRem < 0) barRem += barRange;
      chordIdx = barS + barRem;
    } else {
      chordIdx = chordBar % chords.length;
    }
    var chord = chords[chordIdx];
    var padDur = stepSec * 16; // 1마디
    for (var ci = 0; ci < chord.length; ci++) {
      synthPad(c, out, time, chord[ci], padDur);
    }
  }
}

// ══════════════════════════════════════
// 인스턴스 풀 (이름 → 인스턴스)
// ══════════════════════════════════════

var instances = {};

function getInstance(name) {
  if (!instances[name]) instances[name] = createInstance();
  return instances[name];
}

// ══════════════════════════════════════
// 공개 API
// ══════════════════════════════════════

// JSON 파일 경로 또는 데이터 객체로 로드
// name: 인스턴스 이름, source: URL 문자열 또는 JSON 객체, callback(err, data) (선택)
G.loadBgm = function(name, source, callback) {
  var inst = getInstance(name);
  if (typeof source === 'string') {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', source, true);
    xhr.onload = function() {
      if (xhr.status === 200) {
        inst.data = parseData(xhr.responseText);
        if (callback) callback(null, inst.data);
      } else {
        if (callback) callback(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function() { if (callback) callback(new Error('Network error')); };
    xhr.send();
  } else {
    inst.data = parseData(source);
    if (callback) callback(null, inst.data);
  }
};

// ══════════════════════════════════════
// 연주자: 재생 하나 = Conductor 타임라인 하나 (자체 시계 없음)
// ══════════════════════════════════════
// 재생(play) = 인스턴스를 원형으로 한 객체 — 데이터·곡 위치·출력 게인·타임라인은 재생마다 따로, 음색·멜로디 뮤트는 인스턴스 값을 따른다
//   → 같은 인스턴스를 다시 재생해도 퇴장 페이드 중인 이전 재생은 자기 데이터·게인·템포로 끝까지 연주한다
// 곡 스텝 = 16분음표 = 그 타임라인의 1 tick. 곡마다 템포가 달라도 예약은 Conductor 루프 하나가 시각 순서로
var C = G.conductor;

// 게인을 time 시점 값에서 끊고 target으로 ramp초 동안 (진행 중인 페이드 위에서도 정확히)
function rampAt(param, time, target, ramp) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
  else { param.cancelScheduledValues(time); param.setValueAtTime(param.value, time); }
  param.linearRampToValueAtTime(target, time + ramp);
}

// 재생 시작 — Conductor가 확정한 시각(opts.when, 생략 = 즉시)에 입장
// opts: { when, fadeIn(초), bpmOverride, synthTheme, muteMelody, gain, section: {loop, count} | loopStart/loopEnd,
//         timeline, takeover }
//   입장 시각에: 전용 GainNode(페이드인), 곡 위치 처음, 레이어:
//     timeline 생략        = 자기 레이어 — 곡 BPM 타임라인을 새로 (그 시각이 tick 0). 다른 레이어와 겹쳐도 각자 템포
//     timeline 지정        = 공유 — 그 타임라인에 올라타 주인의 박·템포로 연주 (입장 시각 이후 첫 tick부터, 템포 변경 불가)
//     timeline + takeover  = 이어받기 — 그 타임라인을 넘겨받아 입장 시각부터 곡 BPM 새 격자 (순차 전환을 레이어 하나로)
G.playBgm = function(name, opts) {
  G.ensureCtx();
  var inst = getInstance(name);
  if (!inst.data || (inst.play && inst.play.active) || inst.pending) return;
  opts = opts || {};
  inst.pending = C.request(opts.when, function(time) {
    inst.pending = null;
    var c = G.actx;
    var play = Object.create(inst);           // 음색·멜로디 뮤트는 인스턴스를 따라감
    play.data = inst.data;
    // 전용 GainNode (G.bgmOut 하위) — 재생마다 새로 (이전 곡 페이드아웃과 분리)
    var target = opts.gain != null ? opts.gain : 1;   // 곡별 라우드니스 정규화 (js/bgm.js)
    play.out = c.createGain();
    if (opts.fadeIn > 0) {
      play.out.gain.setValueAtTime(0, time);
      play.out.gain.linearRampToValueAtTime(target, time + opts.fadeIn);
    } else {
      play.out.gain.setValueAtTime(target, time);
    }
    play.out.connect(G.bgmOut);

    if ('muteMelody' in opts) inst.muteMelody = !!opts.muteMelody;
    if ('parts' in opts) inst.parts = opts.parts || null;
    // 음색 테마: 옵션 > 곡 데이터 > 기존 인스턴스 값
    if (opts.synthTheme) inst.synthTheme = opts.synthTheme;
    else if (inst.data.synthTheme) inst.synthTheme = inst.data.synthTheme;

    // 구간 재생: section { loop, count } 또는 직접 { loopStart, loopEnd }
    if (opts.section) {
      play.loopStart = (opts.section.loop || 0) * 16;
      play.loopEnd   = play.loopStart + (opts.section.count || 0) * 16;
    } else if ('loopStart' in opts || 'loopEnd' in opts) {
      play.loopStart = opts.loopStart || 0;
      play.loopEnd   = opts.loopEnd   || 0;
    } else {
      play.loopStart = 0;
      play.loopEnd   = 0;
    }
    play.step = play.loopStart;
    play.active = true;                        // 퇴장이 확정되면 false (페이드 동안은 계속 연주)
    var bpm = opts.bpmOverride || inst.data.bpm;
    play.ch = {
      onTick: function(tick, t) {
        play.stepSec = play.tl.tickSec;
        playStep(play, play.step, t);
        play.step++;
      }
    };
    inst.play = play;                          // 지금 재생 = 이 곡 — 타임라인 시작 알림(Conductor C.onTimeline)보다 먼저 (듣는 쪽이 새 곡을 보게)
    if (!opts.timeline) {                      // 자기 레이어
      play.tl = C.timeline({ name: 'bgm:' + name, bpm: bpm, unitTicks: 16 });
      play.own = true;
      play.tl.owner = play;
      play.tl.addChannel(play.ch);
      play.tl.start({ startTime: time });
    } else if (opts.takeover) {                // 이어받기 — 이전 주인은 퇴장할 때 채널만 내린다
      play.tl = opts.timeline;
      if (play.tl.owner) play.tl.owner.own = false;
      play.own = true;
      play.tl.owner = play;
      play.tl.addChannel(play.ch);
      play.tl.start({ bpm: bpm, startTime: time });
    } else {                                   // 공유 — 주인의 박·템포
      play.tl = opts.timeline;
      play.own = false;
      play.tl.addChannel(play.ch);
    }
  });
};

// 정지 — Conductor가 확정한 시각(when, 생략 = 즉시)부터 fadeTime초 페이드아웃
//   페이드 동안에도 계속 연주하고(진짜 페이드아웃), 페이드가 끝나는 시각에 퇴장:
//   자기(주인인) 레이어면 타임라인을 멈추고, 공유·넘겨준 레이어면 채널만 내린다
G.stopBgm = function(name, fadeTime, when) {
  var inst = instances[name];
  if (!inst) return;
  if (inst.pending) { C.cancel(inst.pending); inst.pending = null; }
  if (inst.tempoReq) { C.cancel(inst.tempoReq); inst.tempoReq = null; }   // 퇴장하는 곡의 템포 변경은 무효
  var play = inst.play;
  if (!play || !play.active) return;
  play.active = false;
  C.request(when, function(time) {
    var f = fadeTime && fadeTime > 0 ? fadeTime : 0.02;
    rampAt(play.out.gain, time, 0, f);
    C.request({ at: time + f }, function() {
      if (play.own) play.tl.stop();
      else play.tl.removeChannel(play.ch);
    });
    C.at(time + f + 0.1, function() { try { play.out.disconnect(); } catch (e) {} });
  }, play.tl);
};

// 멜로디 뮤트 제어 (베이스만 남김) — 다음에 예약하는 tick부터
// 켜진 파트 바꾸기 (null = 전부) — 지금 재생에 바로 반영. 시각을 맞추려면 Conductor 요청 안에서 부른다
G.setBgmParts = function(name, parts) {
  getInstance(name).parts = parts || null;
};
G.muteBgmMelody = function(name, mute) {
  getInstance(name).muteMelody = mute;
};

// 로드된 데이터 조회
G.getBgmData = function(name) {
  var inst = instances[name];
  return inst ? inst.data : null;
};

// 재생 중 여부 (입장 대기 중 포함, 퇴장이 확정된 재생은 제외)
G.isBgmPlaying = function(name) {
  var inst = instances[name];
  return inst ? !!((inst.play && inst.play.active) || inst.pending) : false;
};

// 그 곡 타임라인 기준 타이밍 확정 (재생 중이 아니면 즉시)
G.bgmWhen = function(name, spec) {
  var inst = instances[name];
  var play = inst && inst.play && inst.play.active ? inst.play : null;
  return C.when(spec, play ? play.tl : { running: false });
};

// 지금 재생의 타임라인 (올라타기·이어받기용, 재생 중이 아니면 null)
G.bgmTimeline = function(name) {
  var inst = instances[name];
  return inst && inst.play && inst.play.active ? inst.play.tl : null;
};

// 재생 중 변경
//   BPM = 그 곡 타임라인 템포 (주인일 때만 — 공유 레이어의 템포는 주인 것) — Conductor가 확정한 시각(when — 'bar'는 그 곡의 다음 마디)부터 새 격자로 이어 달린다 (곡 위치는 그대로)
//   음색 = 다음에 예약하는 tick부터 / 게인 = 확정 시각에 15ms 램프
G.setBgmBpm = function(name, bpm, when) {
  var inst = instances[name];
  var play = inst && inst.play;
  if (!play || !play.active || !play.own || !(bpm > 0)) return;
  if (inst.tempoReq) C.cancel(inst.tempoReq);          // 대기 중인 템포 변경은 마지막 값만 (슬라이더 연속 입력)
  inst.tempoReq = C.request(when, function(time) {
    inst.tempoReq = null;
    if (play.active && play.own) play.tl.start({ bpm: bpm, startTime: time });
  }, play.tl);
};
G.setBgmTheme = function(name, theme) {
  getInstance(name).synthTheme = theme;
};
G.setBgmGain = function(name, gain, when) {
  var inst = instances[name];
  var play = inst && inst.play;
  if (!play || !play.active) return;
  C.request(when, function(time) { rampAt(play.out.gain, time, gain, 0.015); }, play.tl);
};

})();
