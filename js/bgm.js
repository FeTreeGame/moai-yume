// 비트 탭 = 필드 BGM 리모컨 — 비트(드럼만 있는 곡)와 BGM 곡을 하나의 엔진(rhythm/bgm-player.js, Conductor 연주자)으로
//   대상 하나 선택 → 음색 풀 선택 → BPM (대상의 기본값, 재생 전·중 모두 적용) → 재생/정지 (한 번에 하나)
//   리모컨은 설정(곡·음색·BPM·켜짐)만 들고, 조작마다 타이밍 정책을 붙여 Conductor에 요청한다 (시각은 Conductor가 확정):
//     재생(멈춘 상태) = 즉시 / 곡 전환(재생 중) = 즉시 옛 곡 페이드아웃(연주 계속) → 끝나는 시각에 새 곡 (인스턴스 둘을 번갈아 — SWAP) /
//     BPM = 그 곡의 다음 마디 (연속 입력은 마지막 값만) / 정지 = 즉시 페이드 / 음색 = 다음 예약 tick부터
//   비트 5종 = 이전 비트 시퀀서(beat.js) 패턴, BGM = assets/bgm/*.json (필드 테마 + 친구 테마 7곡, 본편 게임과 같은 에셋)
//   엔진은 Conductor 연주자 (rhythm/bgm-player.js) — 재생 하나 = 곡 BPM 타임라인 하나 (세션 타임라인과 템포가 달라도 된다)
//   필드 ↔ 스테이지: 켜짐(on) = 사용자 의도. 세션(스테이지)이 M.fieldBgm.suspend로 멈춰 두고 끝나면 resume으로 되돌린다
//   내려 두기: 이유(세션·샘플 탭)가 하나라도 있으면 내려 두고 모두 풀리면 켜짐일 때 되돌린다 (HOLD, lower/raise)
//     내려 둔 동안 조작은 설정만 바꾸고 풀린 뒤에 적용.
//   메인 BGM 파트: 첫 제스처는 오디오 정책만 풀고 재생하지 않는다 (FIELD.autoStart). 메인 BGM(FIELD.id)은 첫 파트를 필드 보상으로
//     얻는 순간 재생이 시작되고 (M.fieldBgm.addPart — 진행 표 js/field-progress.js 'bgm' 카드), 그 뒤 파트(MAIN_PARTS 순서 — 킥부터)는
//     **곡 연출로 저절로 쌓인다** (드럼 쌓기 BUILD — 미션과 비동기): 울리는 메인 BGM 타임라인의 BUILD.loops루프 경계마다 하나씩, 그 첫 박부터 소리.
//     정지·곡 전환이면 멈추고 다시 울리면 새 타임라인에서 이어서, 템포 고정(세션) 중이면 그 경계는 건너뛰고 다음에.
//     addPart로 직접 더하면 다음 마디에 합류 (PART_WHEN). 메인 BGM 버튼은 첫 파트 전까지 🔒, 이후 "이름 n/전체"
//   비트 잠금 장치 (M.beats): 잠긴 비트 = 🔒, 고를 수 없음 — 사운드 해금형 보상의 자리. 지금 잠긴 것은 메인 BGM(첫 파트 전)뿐
//   새로고침하면 파트·잠금이 처음으로 (저장은 아직 없음)
//   필드 템포 = BPM 슬라이더 (M.fieldBgm.tempo): 처음 FIELD_TEMPO(100 — 명시적 기본값), 이후 언제나 다음 것이 덮어쓴다 —
//     곡 선택(그 곡의 BPM)·메인 BGM 첫 파트(메인 곡의 BPM)·슬라이더. BGM이 없어도 슬라이더가 필드 템포를 보여 준다
//   템포 고정 (M.fieldBgm.lockTempo/unlockTempo — 스테이지 진입이 부른다): 고정 중엔 BPM·곡 선택·재생/정지를 바꿀 수 없다
//     (비트 탭 흐리게 — 음색은 템포와 무관해 그대로). 스테이지의 가이드 막대·핑퐁이 고정된 템포와 격자를 쓴다 첫 사용자 조작에 자동 재생 (FIELD — 곡·음색·페이드인은 디테일, 여기서 바꾼다)
(function() {
  const G = window.G;
  const C = G.conductor;
  const INSTS = ['player-a', 'player-b'];   // 곡 전환 크로스페이드용 두 인스턴스 (번갈아)
  const META = 'player-meta';                // 곡 BPM만 알아보는 로드 (재생 안 함)
  // 타이밍 정책 (conductor.js C.when)
  const WHEN = { start: 'now', bpm: 'bar', stop: 'now' };
  const FADE = { stop: 0.4 };
  // 곡 전환 순서: when에 옛 곡이 out초 페이드아웃(자기 템포로 계속 연주) 시작, when + gap에 새 곡 입장(fadeIn초)
  //   gap = out → 순차 (사라진 뒤 시작) / gap < out → 겹침 (크로스페이드) / gap > out → 사이에 정적
  //   layer: 'new' = 새 곡이 자기 레이어(타임라인) / 'reuse' = 옛 곡의 레이어를 이어받아 새 템포로 (순차일 때만 —
  //          겹침이면 두 격자가 동시에 울려야 하므로 자동으로 'new'). 레이어 수는 시간 관계의 성격이 정한다
  const SWAP = { when: 'now', out: 0.4, gap: 0.4, fadeIn: 0, layer: 'new' };
  const PATH = 'assets/bgm/';
  // 내려 두는 이유별 정책 (세션은 rhythm/session.js가 suspend/resume에 시각·페이드를 넘긴다)
  //   sample = 샘플 탭(녹음)이 보이는 동안 — 드로어가 열려 있고 샘플 페이지 (main.js 'moai:drawer'가 상태를 알린다)
  //     녹음은 샘플 탭 안에서만 이어진다 (녹음 중엔 떠나기를 막고, 막지 못한 이탈이면 중지 — recorder.js) → 녹음에 BGM이 섞이지 않는다
  //   out = 내릴 때 페이드아웃, back = 풀릴 때 페이드인 (초)
  const HOLD = { sample: { out: 0.4, back: 0.5 } };

  // ── 비트: 16스텝 드럼 패턴 (이전 beat.js 프리셋) → 드럼만 있는 곡 ──
  function beat(name, bpm, k, s, h, o) {
    return { name: name, bpm: bpm, synthTheme: 'punch',
      tracks: { kick: { pattern: k }, snare: { pattern: s }, hihat: { pattern: h }, openHH: { pattern: o } } };
  }
  const BEATS = {
    basic:  beat('기본 4/4', 105,
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]),
    funky:  beat('펑키', 110,
      [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,1,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
      [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1]),
    moai:   beat('모아이 셔플', 100,
      [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1]),
    march:  beat('행진', 120,
      [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]),
    island: beat('섬 리듬', 95,
      [1,0,0,1, 0,0,0,0, 1,0,0,0, 0,1,0,0], [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1], [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0]),
  };
  const SONGS = ['FIELD', 'TROPY', 'COMFORT', 'TRASH', 'CHICK', 'PIGEON', 'HOWTO', 'FETREE'];   // 필드 테마 + 친구 테마 7곡
  // 필드(메인) BGM = **보상용 메인 BGM 자리** (첫 BGM 보상으로 시작하고 드럼이 쌓이는 곡). id는 그 자리에 넣은 값 — 지금 'island'(섬 리듬)는 시험용.
  //   값만 바꾸면 잠금·드럼 쌓기·필드 템포·시험(sim_stage — main()으로 읽음)이 따라감. 곡·음색, 첫 사용자 조작에 바로 재생할지(false = 오디오 정책만 —
  //   첫 파트 획득 때 시작), 시작 페이드인
  const FIELD = { id: 'island', theme: 'auto', autoStart: false, fadeIn: 2.0 };
  // 메인 BGM 파트: 얻는 순서 (트랙 id — 비트는 kick·snare·hihat·openHH), 표시 이름, 합류 시각 (메인 BGM 타임라인 기준)
  const MAIN_PARTS = ['kick', 'snare', 'hihat', 'openHH'];
  const PART_NAMES = { kick: '킥', snare: '스네어', hihat: '하이햇', openHH: '오픈 하이햇', bass: '베이스', melody: '멜로디', arp: '아르페지오', pad: '패드' };
  const PART_WHEN = 'bar';
  const BUILD = { loops: 2 };              // 드럼 쌓기 간격 (메인 BGM 타임라인의 루프 수 — 1루프 = 16 tick). 0 = 끔
  // 비트 잠금: 처음부터 풀려 있는 비트 — 메인 BGM은 첫 파트를 얻을 때 풀린다
  const BEAT_START = Object.keys(BEATS).filter(function(id) { return id !== FIELD.id; });
  // 음색 = 스타일 (엔진 SYNTH_THEMES). 기본 = 대상에 어울리는 것 (비트 → 펀치, 곡 → 산뜻)
  // 필드 템포 처음 값 (명시적 기본값 — BGM이 한 번도 울리지 않았을 때 스테이지가 따르는 템포)
  const FIELD_TEMPO = 100;
  const THEMES = [
    { id: 'auto',  name: '기본' },
    { id: 'light', name: '산뜻' },
    { id: 'warm',  name: '포근' },
    { id: 'punch', name: '펀치' },
  ];

  // ── 라우드니스 정규화: 측정 LUFS(게인 1, ffmpeg ebur128) → REF로 맞춘다. BGM 채널 프리셋 보정이 목표로 올린다 (js/mixer.js) ──
  //   곡은 원본 encounter 음색으로, 비트는 펀치 음색으로 측정한 값 (FIELD = 2026-09-30 채널 측정 -11.1 − 플랫 보정 6.9)
  const REF_LUFS = -20;
  const LUFS = { FIELD: -18.0, TROPY: -19.1, COMFORT: -19.4, TRASH: -21.6, CHICK: -20.4, PIGEON: -22.4, HOWTO: -20.9, FETREE: -18.8,
    basic: -20.8, funky: -19.9, moai: -21.6, march: -22.5, island: -21.2 };
  // 음색별 라우드니스 (원본 encounter 음색 대비 dB) — 측정: 곡(TROPY·PIGEON) 산뜻 -0.85 포근 +1.3 펀치 +1.9 /
  //   비트(기본 4/4·펑키, 펀치 대비) 산뜻 -3.6 포근 -1.55 → 곡·비트 오차를 반씩 나눈 값 (오차 0.5 dB 이내)
  const THEME_DB = { light: -1.3, warm: 0.8, punch: 1.9 };
  function gainFor(id, theme) {
    const l = LUFS[id] === undefined ? REF_LUFS : LUFS[id];
    const measured = BEATS[id] ? THEME_DB.punch : 0;           // 측정 당시 음색의 크기
    const t = theme === 'auto' ? (BEATS[id] ? 'punch' : 'light') : theme;
    return Math.pow(10, (REF_LUFS - l - (THEME_DB[t] || 0) + measured) / 20);
  }

  const beatBox = document.getElementById('bgmBeats');
  const songBox = document.getElementById('bgmSongs');
  const themeBox = document.getElementById('bgmThemes');
  const slider = document.getElementById('bgmBpm');
  const bpmVal = document.getElementById('bgmBpmVal');
  const playBtn = document.getElementById('bgmPlay');
  const stopBtn = document.getElementById('bgmStop');
  if (!songBox || !playBtn || !stopBtn || !slider) return;

  let selected = FIELD.id;     // 비트 키 또는 곡 ID
  let theme = FIELD.theme;
  let bpm = FIELD_TEMPO;       // 필드 템포 (슬라이더) — 언제나 다음 것이 덮어씀
  let on = false;              // 켜짐 (사용자 의도) — 세션이 멈춰 둬도 켜짐이면 세션 뒤 돌아온다
  let token = 0;               // 연타 시 늦게 도착한 로드 결과 무시
  let cur = INSTS[0];          // 지금 울리는(또는 마지막) 인스턴스
  const songBpm = {};          // 곡 ID → 기본 BPM (로드 후)
  function inSession() { return !!(window.Moai && window.Moai.sessionActive); }
  const holds = {};            // 내려 두는 이유 → true (세션은 Moai.sessionActive로 본다)
  function held() { return inSession() || Object.keys(holds).length > 0; }

  function defaultBpm(id) { return BEATS[id] ? BEATS[id].bpm : (songBpm[id] || null); }
  function playTheme() {
    if (theme !== 'auto') return theme;
    return BEATS[selected] ? 'punch' : null;   // null = 곡 지정 또는 산뜻 (bgm-player 기본)
  }

  const unlocked = {};
  BEAT_START.forEach(function(id) { unlocked[id] = true; });
  function beatLocked(id) { return !!BEATS[id] && !unlocked[id]; }
  let partsOn = 0;             // 메인 BGM의 얻은 파트 수 (MAIN_PARTS 앞에서부터)
  function partMap() {
    const m = {};
    MAIN_PARTS.slice(0, partsOn).forEach(function(p) { m[p] = true; });
    return m;
  }
  function partsFor(id) { return id === FIELD.id && partsOn < MAIN_PARTS.length ? partMap() : null; }   // 다 모이면 전부 (null)

  const itemBtns = [];          // 비트·곡 버튼 (button()이 만든 것 — 문서 조회 없이)
  const tempoLocks = {};       // 템포 고정 이유 → true (스테이지)
  function tempoLocked() { return Object.keys(tempoLocks).length > 0; }
  const beatPage = document.getElementById('drawerBeat');

  function render() {
    if (beatPage) beatPage.classList.toggle('tempo-locked', tempoLocked());
    slider.disabled = tempoLocked();
    itemBtns.forEach(function(b) {
      const id = b.getAttribute('data-id');
      b.classList.toggle('active', id === selected);
      if (BEATS[id]) {
        b.classList.toggle('locked', beatLocked(id));
        const prog = id === FIELD.id && partsOn < MAIN_PARTS.length ? ' ' + partsOn + '/' + MAIN_PARTS.length : '';
        b.textContent = (beatLocked(id) ? '🔒 ' : '') + BEATS[id].name + prog;
      }
    });
    document.querySelectorAll('#bgmThemes .beat-pattern-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-id') === theme);
    });
    if (bpm) { slider.value = bpm; bpmVal.textContent = bpm; }
    playBtn.classList.toggle('playing', on);
  }

  function load(inst, id, cb) {
    if (BEATS[id]) { G.loadBgm(inst, BEATS[id], cb); return; }
    G.loadBgm(inst, PATH + id + '.json', function(err, data) {
      if (!err && data) songBpm[id] = data.bpm;
      cb(err, data);
    });
  }

  // 엔진에 올리기: 멈춘 상태면 즉시, 재생 중이면 다음 마디에 크로스페이드 (지금 인스턴스 퇴장 + 다른 인스턴스 입장, 같은 시각)
  //   whenSpec·fadeIn을 주면 그 타이밍·페이드인으로 (세션 뒤 복귀·자동 재생). 로드 사이 세션이 시작됐으면 올리지 않는다
  function start(whenSpec, fadeIn) {
    G.ensureCtx();               // 누른 순간(사용자 조작 안)에 오디오 준비 — 안드로이드 자동 재생 제한, 시각 확정 전에
    const my = ++token;
    const next = cur === INSTS[0] ? INSTS[1] : INSTS[0];
    load(next, selected, function(err, data) {
      if (my !== token) return;
      if (err) { console.warn('[bgm] 로드 실패', selected, err.message); return; }
      if (!bpm) bpm = data.bpm;
      if (held()) { render(); return; }
      const swapping = G.isBgmPlaying(cur);
      let at, layer = null;
      if (swapping) {
        const t0 = G.bgmWhen(cur, whenSpec || SWAP.when);   // 전환 시작 (박 경계 지정이면 지금 곡의 타임라인 기준)
        const reuse = SWAP.layer === 'reuse' && SWAP.gap >= SWAP.out ? G.bgmTimeline(cur) : null;   // 순차면 레이어 하나로 충분
        G.stopBgm(cur, SWAP.out, { at: t0 });               // 옛 곡: 계속 연주하며 페이드아웃
        at = t0 + SWAP.gap;                                  // 새 곡: gap 뒤 입장
        if (reuse) layer = { timeline: reuse, takeover: true };
      } else {
        at = C.when(whenSpec || WHEN.start);
      }
      const opts = { when: { at: at }, gain: gainFor(selected, theme), bpmOverride: bpm,
        fadeIn: fadeIn != null ? fadeIn : (swapping ? SWAP.fadeIn : 0), parts: partsFor(selected) };
      if (layer) Object.assign(opts, layer);
      const t = playTheme();
      if (t) opts.synthTheme = t;
      cur = next;
      G.playBgm(cur, opts);
      render();
    });
  }

  // 리모컨 조작 알림 'moai:bgm' { kind: 'play' | 'stop' } — 사용자가 재생·정지 버튼을 누름 (곡이 실제로 울리는지(moai:beat)와 따로).
  //   듣는 쪽: 연결표 js/field-events.js (조작에 역할 붙이기 — 예: 게이지 미션을 받는 상태). 보상으로 저절로 켜짐(첫 파트)은 조작이 아님
  function announceOp(kind) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;
    document.dispatchEvent(new CustomEvent('moai:bgm', { detail: { kind: kind } }));
  }

  // 재생 버튼: 켜짐 — 내려 둔 동안이면 풀린 뒤에
  function play() {
    if (tempoLocked()) return;           // 스테이지 중엔 바꿀 수 없음
    G.ensureCtx();
    on = true;
    announceOp('play');
    if (held()) { render(); return; }
    start();
    render();
  }

  function stop() {
    if (tempoLocked()) return;
    on = false;
    announceOp('stop');
    token++;
    G.stopBgm(cur, FADE.stop, WHEN.stop);
    render();
  }

  function select(id) {
    if (beatLocked(id) || tempoLocked()) return;          // 잠긴 비트·템포 고정 중엔 고를 수 없음
    selected = id;
    const d = defaultBpm(id);
    if (d) { bpm = d; }
    else {
      // 곡 BPM은 로드해야 안다 — 로드 후 기본값으로
      const my = ++token;
      load(META, id, function(err, data) { if (my === token && !err && data) { bpm = data.bpm; if (G.isBgmPlaying(cur)) start(); render(); } });
      render();
      return;
    }
    if (G.isBgmPlaying(cur)) start();   // 재생 중이면 전환 (다음 마디) — 세션 중엔 멈춰 있으니 설정만
    render();
  }

  function selectTheme(id) {
    theme = id;
    if (G.isBgmPlaying(cur)) {
      G.setBgmTheme(cur, playTheme() || 'light');
      G.setBgmGain(cur, gainFor(selected, theme));
    }
    render();
  }

  // 터치: touchend에서 처리하고 뒤따르는 click은 무시 (드로어 버튼 공통 방식)
  function bind(el, fn) {
    let touched = false;
    el.addEventListener('touchend', function(e) { e.preventDefault(); touched = true; fn(); }, { passive: false });
    el.addEventListener('click', function() { if (touched) { touched = false; return; } fn(); });
  }
  function button(box, id, label, fn) {
    const b = document.createElement('button');
    b.className = 'beat-pattern-btn';
    b.textContent = label;
    b.setAttribute('data-id', id);
    b.setAttribute('tabindex', '-1');
    bind(b, fn);
    box.appendChild(b);
    if (box !== themeBox) itemBtns.push(b);
  }

  if (beatBox) Object.keys(BEATS).forEach(function(k) { button(beatBox, k, BEATS[k].name, function() { select(k); }); });
  SONGS.forEach(function(id) { button(songBox, id, id, function() { select(id); }); });
  if (themeBox) THEMES.forEach(function(t) { button(themeBox, t.id, t.name, function() { selectTheme(t.id); }); });
  slider.addEventListener('input', function() {
    if (tempoLocked()) { render(); return; }   // 고정 중 — 값 되돌림
    bpm = parseInt(slider.value, 10);
    if (G.isBgmPlaying(cur)) G.setBgmBpm(cur, bpm, WHEN.bpm);   // 재생 중이면 다음 마디부터
    render();
  });
  bind(playBtn, play);
  bind(stopBtn, stop);

  // ── 내려 두기 · 되돌리기 (모든 이유가 이 한 쌍을 거친다 — 지금 방식 = 페이드아웃 뒤 정지, 복귀 시 처음부터 페이드인) ──
  //   lower(when, fade): 울리고 있으면 when(Conductor 타이밍)부터 fade초 페이드아웃. 켜짐은 그대로
  //     (로드 중인 재생은 로드 뒤 held()를 보고 올리지 않는다)
  //   raise(when, fadeIn): 켜짐이고 내려 둘 이유가 없으면 when에 페이드인으로 다시 (내려 둔 동안 바꾼 설정 반영)
  function lower(when, fade) {
    if (!G.isBgmPlaying(cur)) return false;
    token++;
    G.stopBgm(cur, fade, when);
    return true;
  }
  function raise(when, fadeIn) {
    if (on && !held() && !G.isBgmPlaying(cur)) start(when, fadeIn);
  }
  function hold(reason, active) {
    if (!!holds[reason] === active) return;
    if (active) { holds[reason] = true; lower('now', HOLD[reason].out); }
    else { delete holds[reason]; raise('now', HOLD[reason].back); }
  }
  document.addEventListener('moai:drawer', function(e) { hold('sample', !!(e.detail.open && e.detail.page === 'sample')); });

  // ── 메인 BGM 파트 획득 (필드 보상 — 연결표 js/field-events.js) ──
  //   다음 파트를 얻고 { part, name, index, total, bgm } (다 모았으면 null)
  //   첫 파트: 메인 BGM 잠금 풀림 + 켜짐 + 재생 시작 (내려 둔 동안이면 풀린 뒤). 이후: 메인 BGM이 울리고 있으면 다음 마디에 합류
  function addPart() {
    if (partsOn >= MAIN_PARTS.length || tempoLocked()) return null;   // 템포 고정 중(스테이지)엔 받지 않음
    const part = MAIN_PARTS[partsOn++];
    const info = { part: part, name: PART_NAMES[part] || part, index: partsOn, total: MAIN_PARTS.length,
      bgm: BEATS[FIELD.id] ? BEATS[FIELD.id].name : FIELD.id };
    if (partsOn === 1) unlocked[FIELD.id] = true;
    if (selected === FIELD.id && G.isBgmPlaying(cur)) {
      const name = cur, map = partsFor(FIELD.id);
      C.request({ at: G.bgmWhen(name, PART_WHEN) }, function() { G.setBgmParts(name, map); });
    } else if (partsOn === 1) {
      selected = FIELD.id;
      theme = FIELD.theme;
      bpm = defaultBpm(FIELD.id) || bpm;
      on = true;
      if (!held()) start(null, FIELD.fadeIn);
    }
    render();
    return info;
  }

  // ── 드럼 쌓기 (메인 BGM의 곡 연출 — 미션과 비동기) ──
  //   메인 BGM 타임라인이 (다시) 시작되면 그 타임라인의 BUILD.loops루프 경계마다 다음 파트 하나 (Conductor 요청 — 같은 시각의 tick보다 먼저 → 그 첫 박부터 소리)
  //   요청은 절대 시각에 실행되므로 그때 그 곡이 아직 울리는지 스스로 확인 (정지·전환이면 그만 — 다시 울릴 때 새로)
  let buildReq = null, buildTl = null;
  function scheduleBuild(tl) {
    if (buildReq) { C.cancel(buildReq); buildReq = null; }
    buildTl = tl;
    if (!tl || !(BUILD.loops > 0) || selected !== FIELD.id || partsOn < 1 || partsOn >= MAIN_PARTS.length) return;
    const step = BUILD.loops * 16;
    const k = Math.floor(Math.max(tl.nextTick, tl.tickAt(G.actx.currentTime)) / step) + 1;   // 아직 예약하지 않은 다음 쌓기 경계
    buildReq = C.request({ at: tl.timeOf(k * step) }, function() {
      buildReq = null;
      if (buildTl !== tl || window.Moai.fieldBgm.timeline() !== tl || selected !== FIELD.id) return;
      if (!tempoLocked() && partsOn < MAIN_PARTS.length) {
        partsOn++;
        G.setBgmParts(cur, partsFor(FIELD.id));
        render();
      }
      scheduleBuild(tl);                   // 다음 경계 (템포 고정 중이었으면 건너뛰고 다음에)
    });
  }

  // ── 비트 잠금 (사운드 해금형 보상의 자리) ──
  //   unlock(id) = 그 비트를 풀고 { id, name } (이미 풀렸거나 없는 비트면 null)
  //   unlockRandom() = 잠긴 비트 중 하나를 무작위로 풀기 (모두 풀렸으면 null)
  window.Moai.beats = {
    list: function() { return Object.keys(BEATS).map(function(id) { return { id: id, name: BEATS[id].name, locked: beatLocked(id) }; }); },
    locked: beatLocked,
    unlock: function(id) {
      if (!beatLocked(id)) return null;
      unlocked[id] = true;
      render();
      return { id: id, name: BEATS[id].name };
    },
    unlockRandom: function() {
      const ids = Object.keys(BEATS).filter(beatLocked);
      if (!ids.length) return null;
      return window.Moai.beats.unlock(ids[Math.floor(Math.random() * ids.length)]);
    },
  };

  // ── 필드 ↔ 스테이지 (세션이 부른다 — rhythm/session.js) ──
  //   suspend(from, fade): from(세션이 Conductor에서 받은 시각)부터 내려 둔다. resume(when, fadeIn): 세션 뒤 되돌리기
  window.Moai.fieldBgm = {
    addPart: addPart,                                           // 메인 BGM 파트 획득 (필드 보상)
    tempo: function() { return bpm; },                          // 필드 템포 (BPM 슬라이더)
    timeline: function() { return G.isBgmPlaying(cur) ? G.bgmTimeline(cur) : null; },   // 울리는 곡의 타임라인 (격자 기준)
    // 템포 고정: 이유(예: 'stage')로 잠그고 고정된 템포를 돌려준다 / 이유가 모두 풀리면 다시 바꿀 수 있음
    lockTempo: function(reason) { tempoLocks[reason || 'stage'] = true; render(); return bpm; },
    unlockTempo: function(reason) { delete tempoLocks[reason || 'stage']; render(); },
    tempoLocked: tempoLocked,
    parts: function() { return { on: partsOn, total: MAIN_PARTS.length, list: MAIN_PARTS.slice(0, partsOn) }; },
    build: BUILD,                                               // 드럼 쌓기 간격 (조정·시험용)
    // 보상용 메인 BGM 자리의 지금 값 (읽기 — 시험·표시가 특정 곡을 박아 두지 않게): { id, name, bpm, parts(쌓는 순서), partNames, patterns(파트 → 16칸) }
    main: function() {
      const b = BEATS[FIELD.id], pat = {};
      if (b) MAIN_PARTS.forEach(function(p) { pat[p] = b.tracks[p] ? b.tracks[p].pattern.slice() : null; });
      return { id: FIELD.id, name: b ? b.name : FIELD.id, bpm: defaultBpm(FIELD.id), parts: MAIN_PARTS.slice(),
        partNames: MAIN_PARTS.map(function(p) { return PART_NAMES[p] || p; }), patterns: b ? pat : null };
    },
    setBuild: function(loops) { BUILD.loops = loops; scheduleBuild(window.Moai.fieldBgm.timeline()); },   // 간격 바꾸고 지금 곡에서 다시 잡기 (0 = 끔)
    isPlaying: function() { return G.isBgmPlaying(cur); },
    when: function(spec) { return G.bgmWhen(cur, spec); },    // 필드 곡 타임라인 기준 타이밍 (예: 'bar')
    suspend: function(from, fade) { return lower({ at: from }, fade); },
    resume: function(when, fadeIn) { raise(when, fadeIn); },
  };

  // ── 필드 비트 알림 'moai:beat' { timeline (null = 비트 없음), bpm, kind: 'start' | 'restart' | 'stop' } ──
  //   필드의 비트 = 울리는 메인 곡의 타임라인 (M.fieldBgm.timeline()). 곡 시작·전환, 템포 변경으로 같은 타임라인이 다시 시작, 정지(페이드 끝)에 알림
  //   듣는 쪽: 필드에서 비트가 필요한 것 (예정: 필드 평가 — 리듬 코어 rhythm/core.js에 붙고 뗌). 세션은 이 비트를 따라감 (rhythm/session.js)
  let beatTl = null;
  function announceBeat(kind) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;   // 알림을 받을 곳이 없는 환경(시뮬레이션 등)
    document.dispatchEvent(new CustomEvent('moai:beat', { detail: { timeline: beatTl, bpm: beatTl ? beatTl.bpm : 0, kind: kind } }));
  }
  if (G.conductor && G.conductor.onTimeline) G.conductor.onTimeline(function(kind, tl) {
    const now = window.Moai.fieldBgm.timeline();
    if (now !== beatTl) { beatTl = now; announceBeat(now ? 'start' : 'stop'); scheduleBuild(now); }
    else if (now && tl === now && kind === 'start') { announceBeat('restart'); scheduleBuild(now); }   // 같은 곡이 새 격자로 (템포 변경 등)
  });

  // 첫 사용자 조작: 오디오 준비 (조작 안에서 — 안드로이드 자동 재생 제한. 이후 보상으로 조작 밖에서 시작해도 울리게).
  //   FIELD.autoStart면 그때 필드 BGM 재생 (지금은 끔 — 첫 파트 획득 때 시작). 다른 처리보다 먼저(캡처 단계)
  const first = function() {
    ['pointerdown', 'keydown'].forEach(function(t) { document.removeEventListener(t, first, true); });
    G.ensureCtx();
    if (!FIELD.autoStart || on) return;
    on = true;
    start(null, FIELD.fadeIn);
    render();
  };
  ['pointerdown', 'keydown'].forEach(function(t) { document.addEventListener(t, first, true); });
  render();
})();
