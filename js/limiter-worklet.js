// 마스터 룩어헤드 리미터 (AudioWorklet) — 넘칠 때만 누르는 안전장치 (js/mixer.js가 마스터 뒤에 끼움)
// 근거: docs/AUDIO-LOUDNESS-RESEARCH.md §6 — DynamicsCompressorNode는 자동 메이크업 게인이 있어 리미터가 아님
//
// 동작 (샘플 단위, 좌우 공통 감쇠):
//   1. 사이드체인 = 좌우 중 큰 절댓값 → 필요 게인 r = min(1, 한계 / 피크)
//   2. 최솟값 유지: 최근 L+1 샘플의 r 최솟값 (L = 룩어헤드)
//   3. 구간 평균: 최근 L 샘플의 2)를 평균 → 피크가 출력되는 순간 정확히 r에 닿는 선형 진입 (L 샘플에 걸쳐)
//   4. 복귀: 감쇠는 즉시(이미 3에서 부드럽게 준비됨), 풀림은 release 시간상수
//   5. 출력 = L 샘플 지연된 입력 × 게인 — 모든 소리가 똑같이 L(5ms) 늦는다 (박자 간 어긋남 없음)
// 한계 아래 신호는 게인 1 그대로 통과 (평소 음색·음량 불변)
// 옵션 (processorOptions): ceilingDb (샘플 기준, 기본 -2.0), lookaheadMs (5), releaseMs (100)
//   샘플 기준 한계 -2.0 = 트루 피크 -1 dBTP + 여유 1 dB — 합성 하이햇 등 고역 노이즈의 샘플 사이 피크가 최대 +0.9 dB (실측)
class MoaiLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.ceil = Math.pow(10, (o.ceilingDb === undefined ? -2.0 : o.ceilingDb) / 20);
    this.L = Math.max(1, Math.round(sampleRate * (o.lookaheadMs || 5) / 1000));
    this.rel = 1 - Math.exp(-1 / (sampleRate * (o.releaseMs || 100) / 1000));
    const n = this.L + 1;
    this.delay = [new Float32Array(n), new Float32Array(n)];   // 좌우 지연선 (원형)
    this.wp = 0;
    // 최솟값 유지용 단조 덱 (값·위치) — 최근 L+1 샘플
    this.dqVal = new Float32Array(n + 1); this.dqPos = new Float64Array(n + 1);
    this.dqHead = 0; this.dqLen = 0;
    // 구간 평균용 원형 버퍼 + 합
    this.box = new Float32Array(this.L).fill(1); this.boxSum = this.L; this.boxIdx = 0;
    this.pos = 0;          // 누적 샘플 위치
    this.g = 1;            // 현재 게인
    this.sumTick = 0;      // 합 재계산 주기 (부동소수 누적 오차 방지)
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const frames = out[0].length;
    const inL = inp[0] || null, inR = inp[1] || inp[0] || null;
    const outL = out[0], outR = out[1] || null;
    const L = this.L, n = L + 1, cap = n + 1;
    for (let i = 0; i < frames; i++) {
      const xl = inL ? inL[i] : 0, xr = inR ? inR[i] : 0;
      // 1) 필요 게인
      const pk = Math.max(Math.abs(xl), Math.abs(xr));
      const r = pk > this.ceil ? this.ceil / pk : 1;
      // 2) 최솟값 유지 (단조 덱: 뒤에서 r 이상인 값 제거 → r 추가, 앞에서 창 밖 제거)
      while (this.dqLen > 0) {
        const last = (this.dqHead + this.dqLen - 1) % cap;
        if (this.dqVal[last] >= r) this.dqLen--; else break;
      }
      const tail = (this.dqHead + this.dqLen) % cap;
      this.dqVal[tail] = r; this.dqPos[tail] = this.pos; this.dqLen++;
      while (this.dqPos[this.dqHead] <= this.pos - n) { this.dqHead = (this.dqHead + 1) % cap; this.dqLen--; }
      const m = this.dqVal[this.dqHead];
      // 3) 구간 평균 (L 샘플)
      this.boxSum += m - this.box[this.boxIdx];
      this.box[this.boxIdx] = m;
      this.boxIdx = (this.boxIdx + 1) % L;
      if (++this.sumTick >= 48000) { this.sumTick = 0; let s = 0; for (let k = 0; k < L; k++) s += this.box[k]; this.boxSum = s; }
      const a = Math.min(1, this.boxSum / L);
      // 4) 감쇠 즉시, 복귀 release
      this.g = a < this.g ? a : this.g + (a - this.g) * this.rel;
      // 5) 지연 출력
      const rp = (this.wp + 1) % n;          // L 샘플 전
      this.delay[0][this.wp] = xl; this.delay[1][this.wp] = xr;
      outL[i] = this.delay[0][rp] * this.g;
      if (outR) outR[i] = this.delay[1][rp] * this.g;
      this.wp = rp;
      this.pos++;
    }
    return true;
  }
}
registerProcessor('moai-limiter', MoaiLimiter);
