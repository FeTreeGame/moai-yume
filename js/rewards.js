// 보상 카드 — 필드 미션(진행 표 js/field-progress.js)과 세션(미니 모아이 스테이지 단계 성공)이 같은 카드를 준다. 명세 docs/index/content.md §6
//   카드 = { name, can() (지금 줄 수 있나), give(opts) } — 등록: M.rewards.register(id, card)
//     기본 카드(bar·bgm·part·mini·none)는 진행 표가, 배경 보상 카드(scn.<자리>)는 js/scenery.js가, 악세사리 카드는 그 모듈이 등록
//   세션 보상: 데이터 파일 missions.session[계열].rewards = 그 계열이 줄 것의 차례 [{ give: [카드…], when }] — 무엇을 언제 주나
//     when = 'enter' (그 계열의 세션에 들어감 = 상호작용 — 깨지 못해도) · 'clear' (끝 단계까지 다 깸) · 숫자 n (n단계 성공)
//       지금 값: 곡 = 'enter', 자기 색 무지개 띠 · 주 보상 = 'clear' (단계마다 주지 않는다 — 단계 표시는 얼마나 남았나만. 단계마다 주려면 when을 숫자로)
//     give의 카드들은 같은 순간에 같이 준다 (받침 + 물체 세트). 옛 형식 [1단계 카드, 2단계, 3단계] (문자열 · null)도 읽는다 = when이 그 단계 번호
//     때가 되면 기록만 하고 (세션 들어감 'moai:session' · 단계 성공 'moai:stage-step' — 핑퐁), 세션이 끝나면(필드로 돌아오면) 기록한 것을 SESSION.delay초 뒤 차례로 준다
//       (세션 중엔 카메라가 미니·투샷을 봐서 배경 변화가 묻힘 — 끝나고 그 자리에서 페이드인). 항목마다 한 번만 (다시 해도 다시 주지 않음)
//   모두 해금 (시험 — 보상의 순서를 정하려고): ALL.key 키 = 세션 보상 표의 카드를 표의 차례(계열 → 단계)대로 전부 그 자리에서 준다 + ALL.extra (표에 아직 없는 것)
//     받은 것으로 기록하므로 그 뒤에 세션을 깨도 다시 나오지 않는다. 이미 받은 카드는 건너뛴다 (카드의 can)
//   알림: document 'moai:field-event' { kind: 'reward', actor: 'session', card, family, stage } — 세션 보상을 준 때 (필드 미션은 진행 표가 actor 'progress'로)
(function() {
  const M = window.Moai;
  const cards = {};
  const SESSION = { delay: 1.0, gap: 0.6 };   // 세션이 끝나고 첫 보상까지(초 — 카메라가 돌아오는 동안), 보상 사이 간격
  const ALL = { key: 'KeyU', extra: [] };   // 모두 해금: 키, 세션 표에 없지만 같이 줄 카드
  const pending = [], given = {};

  function can(id) { const c = cards[id]; return !!c && c.can(); }
  function give(id, opts) { const c = cards[id]; if (!c || !c.can()) return false; c.give(opts || {}); return true; }
  function families() { const D = window.MoaiData || {}; return (D.missions && D.missions.session) || []; }
  function familyOf(family) { return families().filter(function(f) { return f.family === family; })[0] || null; }
  // 계열의 보상 차례 → [{ give: [카드…], when } | null] (자리 번호 = 표의 차례 — 받은 기록의 열쇠)
  function entriesOf(fam) {
    return ((fam && fam.rewards) || []).map(function(r, i) {
      if (!r) return null;
      if (typeof r === 'string') return { give: [r], when: i + 1 };
      return { give: r.give || (r.card ? [r.card] : []), when: r.when != null ? r.when : i + 1 };
    });
  }
  function sessionRewardOf(family, stage) {      // n단계 성공 때 주는 카드 (첫 것 — 없으면 null)
    const e = entriesOf(familyOf(family)).filter(function(en) { return en && en.when === stage; })[0];
    return e ? e.give[0] || null : null;
  }
  // 때가 된 항목을 기록 (test(when) → 지금인가)
  function queue(family, stage, test) {
    entriesOf(familyOf(family)).forEach(function(en, i) {
      const key = family + ':' + i;
      if (!en || given[key] || !test(en.when)) return;
      given[key] = true;
      pending.push({ ids: en.give, family: family, stage: stage });
    });
  }
  function emit(card, family, stage) {
    if (typeof CustomEvent !== 'function' || !document.dispatchEvent) return;
    document.dispatchEvent(new CustomEvent('moai:field-event', { detail: { kind: 'reward', actor: 'session', card: card, family: family, stage: stage } }));
  }

  document.addEventListener('moai:stage-step', function(e) {
    const d = e.detail;
    if (d.mode !== 'pingpong') return;
    const fam = familyOf(d.family), last = fam ? (fam.stages || []).length : 0;
    queue(d.family, d.stage, function(when) { return when === d.stage || (when === 'clear' && last > 0 && d.stage >= last); });
  });
  document.addEventListener('moai:session', function(e) {
    const d = e.detail;
    if (d.active) { if (d.mode === 'pingpong' && d.family) queue(d.family, 0, function(when) { return when === 'enter'; }); return; }
    if (!pending.length) return;
    const list = pending.splice(0);
    list.forEach(function(r, i) {
      setTimeout(function() { r.ids.forEach(function(id) { if (give(id, { fade: true })) emit(id, r.family, r.stage); }); }, (SESSION.delay + i * SESSION.gap) * 1000);
    });
  });

  function grantAll() {
    const out = [];
    families().forEach(function(fam) {
      entriesOf(fam).forEach(function(en, i) {
        if (!en) return;
        given[fam.family + ':' + i] = true;
        en.give.forEach(function(id) { if (give(id, { fade: false })) { out.push(id); emit(id, fam.family, 0); } });
      });
    });
    ALL.extra.forEach(function(id) { if (give(id, { fade: false })) { out.push(id); emit(id, null, 0); } });
    return out;
  }
  document.addEventListener('keydown', function(e) {
    if (e.repeat || e.code !== ALL.key || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault(); grantAll();
  });

  M.rewards = {
    cards: cards,
    register: function(id, card) { cards[id] = card; },
    can: can, give: give, grantAll: grantAll, all: ALL,
    pending: function() { return pending.slice(); },
    sessionRewardOf: sessionRewardOf,
    policy: SESSION,
    reset: function() { pending.length = 0; Object.keys(given).forEach(function(k) { delete given[k]; }); },   // 시험용
  };
})();
