// UI 헬퍼: 값 넘기기 줄
(function() {
  var M = window.Moai;

  // 값 넘기기 줄: [<] 지금 값 [>] — 선택지 둘·셋을 한 줄에서 넘겨 고른다 (모양은 BPM 줄과 같음 — style.css .stepper)
  //   stepper(box, { items(): [{ id, name }], get(): 지금 id, set(id), wrap }) → { render }
  //     items는 부를 때마다 읽는다 (목록이 바뀔 수 있음 — 예: 판정 창의 CUSTOM은 값을 바꾼 뒤에 생김)
  //     wrap (기본 참) = 끝에서 처음으로 돌아감. 거짓이면 끝에서 그쪽 버튼이 꺼짐
  //     지금 값이 목록에 없으면 > 는 첫 항목, < 는 끝 항목으로
  //   값을 바꾼 쪽(set)이 저장·다시 그리기를 맡고, 밖에서 값이 바뀌면 render()를 부른다
  function stepper(box, o) {
    if (!box) return { render: function() {} };
    var prev = document.createElement('button'), label = document.createElement('div'), next = document.createElement('button');
    [[prev, '<', -1], [next, '>', 1]].forEach(function(b) {
      b[0].className = 'ctrl-btn step-btn';
      b[0].type = 'button';
      b[0].textContent = b[1];
      b[0].setAttribute('tabindex', '-1');
      var touched = false;
      b[0].addEventListener('touchend', function(e) { e.preventDefault(); touched = true; step(b[2]); }, { passive: false });
      b[0].addEventListener('click', function() { if (touched) { touched = false; return; } step(b[2]); });
    });
    label.className = 'stepper-value';
    box.classList.add('stepper');
    box.appendChild(prev); box.appendChild(label); box.appendChild(next);
    function indexOf(list) { var cur = o.get(); for (var i = 0; i < list.length; i++) if (list[i].id === cur) return i; return -1; }
    function render() {
      var list = o.items(), i = indexOf(list);
      label.textContent = i >= 0 ? list[i].name : '';
      if (o.wrap === false) { prev.disabled = i <= 0; next.disabled = i >= list.length - 1; }
    }
    function step(d) {
      var list = o.items(), n = list.length, i = indexOf(list);
      if (!n) return;
      var j = i < 0 ? (d > 0 ? 0 : n - 1) : i + d;
      j = o.wrap === false ? Math.max(0, Math.min(n - 1, j)) : (j % n + n) % n;
      if (j !== i) o.set(list[j].id);
      render();
    }
    render();
    return { render: render };
  }

  M.ui = {
    stepper: stepper,
  };
})();
