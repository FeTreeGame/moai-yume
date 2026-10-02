// 색 입히기 — 같은 에셋에 계열 색 (합성 모드 'color': 원본의 밝기 + 목표색의 색상·채도, 모양(알파)은 원본)
//   M.tinted(이미지, 색) → 구운 캔버스 (이미지 × 색마다 한 번 굽고 캐시). 이미지가 로드 전이면 null
//   작게 그리는 용도라 높이 MAX_H로 줄여 굽는다 (원본 1080×1920 한 장 ≈ 8MB → 288×512 ≈ 0.6MB)
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
      const s = Math.min(1, MAX_H / img.naturalHeight);
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
      byColor.set(color, c);
    }
    return c;
  };
})();
