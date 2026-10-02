// 몸 — 플레이어 입력(소리·동작)을 수행할 몸과 몸별 목소리. 이 파일에는 성격이 다른 둘이 있다:
//   [본 기능] 몸의 목소리·동작 연결: M.body.act / voice / voiceFor / presets — original.js(소리·동작)와 세션 NPC 몸(rhythm/session.js 연주자)이 쓴다.
//     실제 게임에서 몸은 늘 메인 모아이(플레이어). 미니 모아이는 NPC — 플레이어가 조작하지 않는다 (NPC를 이미 있는 것으로 경제적으로 만들기)
//   [개발용 시험 장치 "빙의"] index.html?possess 에서만: [ · ] = 몸 바꾸기 (메인 → 미니 보라 … 빨강 → 메인) + 화면 아래 표시.
//     미니 모아이가 플레이어와 똑같이 동작하는 객체인지 확인하려고 만든 것 (동작·목소리·높이 ↑/↓ 모두 그 몸으로 — 탑다운).
//     바꿀 때 누르던 입력은 무음으로 놓고(M.releaseAllInput), 떠나는 몸은 대기로. 세션 중엔 안 바뀌고, 세션이 시작되면 메인 모아이로
//     라이브 튜닝 기록: docs/LIVE-TUNING.md §4
//   목소리: 몸 → 프리셋 이름(BODY_VOICE) → 프로필(VOICE_PRESETS). semis = 재생 속도(반음 — 음높이·길이·포먼트가 함께), 나머지는 효과 체인 (js/voice-fx.js)
//     지금: 미니 모아이 일곱 모두 '얇은 목소리'. 나머지 프리셋은 목록으로 둔다 — 이후 녹음한 목소리 커스터마이징(프리셋 + 대표 노브)의 출발점
//     trim = 효과 뒤 음량 보정 (프리셋마다 렌더해 맞춘 값). 목록·느낌: docs/VOICE-PROCESSING-RESEARCH.md §5.6
//   이후: 스테이지 NPC 발신 턴의 오토 = 몸이 스스로 움직이는 다른 입력원 (같은 act·목소리)
(function() {
  const M = window.Moai;

  // 목소리 프리셋. trim(dB) = 떽·뚜·엉을 렌더해 순간 최대 라우드니스를 원래 목소리에 맞춘 값 (0.5 dB 단위)
  const VOICE_PRESETS = {
    plain:   { name: '원래 목소리' },
    thin:    { name: '얇은 목소리', semis: 4, trim: 0.5 },
    sing:    { name: '노래하는 목소리', vibrato: { hz: 6, cents: 25 } },
    radio:   { name: '무전기', band: { freq: 1200, q: 0.7 }, drive: 0.3, trim: -7 },
    robot:   { name: '로봇', ring: { hz: 50, mix: 0.5 }, comb: { ms: 8, fb: 0.3 }, trim: 1 },
    chorus:  { name: '합창', chorus: { ms: [15, 25], depth: 3, hz: 0.6, mix: 0.5 }, trim: 4.5 },
    echo:    { name: '메아리', echo: { beats: 0.5, fb: 0.25, mix: 0.3 }, trim: 2.5 },
    monster: { name: '괴물', semis: -4, drive: 0.5, lowshelf: { freq: 200, db: 4 }, trim: -11 },
  };
  // 몸 → 프리셋: player = 메인 모아이, mini = 미니 모아이 기본, 계열 이름을 넣으면 그 계열만 따로
  const BODY_VOICE = { player: 'plain', mini: 'thin' };
  const SPRITE_ACT = { tap: 'spritePlayTap', hold: 'spriteStartHold', release: 'spritePlayRelease', idle: 'spriteIdle' };

  let body = null;                   // null = 메인 모아이, 아니면 미니 모아이의 계열

  function bodies() {
    const minis = M.fieldActors ? M.fieldActors.list().filter(function(a) { return a.kind === 'mini'; }).map(function(a) { return a.stage; }) : [];
    return [null].concat(minis);
  }
  function withRate(v) { return Object.assign({ rate: Math.pow(2, (v.semis || 0) / 12) }, v); }
  function voiceOf(b) {
    const key = b === null ? BODY_VOICE.player : (BODY_VOICE[b] || BODY_VOICE.mini);
    return VOICE_PRESETS[key] || VOICE_PRESETS.plain;
  }
  function act(action) {
    if (body === null) { const f = M[SPRITE_ACT[action]]; if (f) f(); }
    else if (M.fieldActors) M.fieldActors.act(body, action);
  }
  function setBody(next) {
    if (next === body) return;
    if (M.releaseAllInput) M.releaseAllInput();   // 누르던 입력은 무음으로 놓음 (그 안에서 떠나는 몸이 대기로)
    act('idle');
    body = next;
    if (M.updateVoiceGain) M.updateVoiceGain();   // 목소리 게인 = 새 몸의 높이
    show();
  }
  function step(dir) {
    const list = bodies(), i = list.indexOf(body);
    setBody(list[((i < 0 ? 0 : i) + dir + list.length) % list.length]);
  }

  // 표시: 바꿀 때 잠깐 (화면 아래)
  let label = null, hideTimer = null;
  const NAMES = ['보라', '남', '파랑', '초록', '노랑', '주황', '빨강'];
  function nameOf(stage) {
    if (stage === null) return '메인 모아이';
    const i = M.session && M.session.families ? M.session.families().indexOf(stage) : -1;
    return '미니 모아이 ' + (NAMES[i] || '') + ' (' + stage + ') — ' + voiceOf(stage).name;
  }
  function show() {
    if (!document.body) return;
    if (!label) {
      label = document.createElement('div');
      label.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:10001;background:rgba(0,0,0,.78);color:#39ff14;font:13px monospace;padding:4px 10px;border-radius:4px;pointer-events:none;white-space:nowrap;transition:opacity .4s';
      document.body.appendChild(label);
    }
    label.textContent = '몸: ' + nameOf(body) + '   ([ ] 바꾸기)';
    label.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function() { label.style.opacity = '0'; }, 1500);
  }

  // 개발용 시험 장치: ?possess 주소에서만 키로 몸을 바꾼다 (평소엔 몸 = 메인 모아이 고정)
  const DEV_POSSESS = typeof location !== 'undefined' && /[?&]possess\b/.test(location.search || '');
  if (DEV_POSSESS) document.addEventListener('keydown', function(e) {
    if (e.repeat || (e.code !== 'BracketLeft' && e.code !== 'BracketRight')) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (M.sessionActive) return;                  // 세션 중엔 메인 모아이 고정
    e.preventDefault();
    step(e.code === 'BracketRight' ? 1 : -1);
  });
  document.addEventListener('moai:session', function(e) { if (e.detail.active && body !== null) setBody(null); });

  M.body = {
    act: act,                                     // 지금 몸이 동작 ('tap'|'hold'|'release'|'idle')
    voice: function() { return withRate(voiceOf(body)); },   // 지금 몸의 프로필 + rate
    voiceFor: function(b) { return withRate(voiceOf(b === undefined ? null : b)); },   // 그 몸(계열 — null = 메인)의 목소리 (세션 NPC 몸 등)
    current: function() { return body; },
    height: function() { return body === null ? M.moaiHeight : (M.fieldActors && M.fieldActors.height(body)) || 0; },
    setHeight: function(h) {
      if (body === null) M.moaiHeight = h;
      else if (M.fieldActors) M.fieldActors.setHeight(body, h);
    },
    set: setBody,                                 // 시험·이후 사건용 (null = 메인 모아이)
    presets: VOICE_PRESETS,                       // 프리셋 목록 (이후 커스터마이징·시험용)
    policy: BODY_VOICE,
  };
})();
