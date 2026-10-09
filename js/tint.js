// 색 입히기 — 같은 에셋에 계열 색 (합성 모드 'color': 원본의 밝기 + 목표색의 색상·채도, 모양(알파)은 원본)
//   M.tinted(이미지, 색) → 구운 캔버스 (이미지 × 색마다 한 번 굽고 캐시). 이미지가 로드 전이면 null
//   작게 그리는 용도라 (그림이 놓이는 상자의) 높이가 MAX_H가 되게 줄여 굽는다 (원본 1080×1920 한 장 ≈ 8MB → 288×512 ≈ 0.6MB)
//     보이는 부분만 남긴 그림(img.__box — layout.js M.drawAt)은 그 부분만 굽고 자리를 물려준다 → 사본도 빈 곳을 들지 않는다 (절반쯤)
//   방법 선택: docs/SPRITE-FX-RESEARCH.md §2 (메인 모아이 시험 — multiply·ctx.filter보다 색 정확·입체감 유지)
(function() {
  const M = window.Moai;
  const MAX_H = 512;
  const cache = new Map();           // 이미지 → Map(색 → 캔버스)

  M.tinted = function(img, color) {
    if (!img || !img.complete || !img.naturalWidth) return null;
    let byColor = cache.get(img);
    if (!byColor) cache.set(img, byColor = new Map());
    let c = byColor.get(color);
    if (!c) {
      const box = img.__box, s = Math.min(1, MAX_H / (img.naturalHeight / (box ? box[3] : 1)));   // 배율의 기준 = 상자 전체의 높이
      c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'color';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0, c.width, c.height);
      if (box) c.__box = box;
      byColor.set(color, c);
    }
    return c;
  };
  // 지금 들고 있는 사본의 수 · 크기 (시험 · 조사용)
  M.tintStats = function() {
    let count = 0, bytes = 0;
    cache.forEach(function(byColor) { byColor.forEach(function(c) { count++; bytes += c.width * c.height * 4; }); });
    return { count: count, bytes: bytes };
  };
})();
