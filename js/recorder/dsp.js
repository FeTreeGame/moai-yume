// ========== DSP (from loop-finder.html) ==========
function applyHanning(data, offset, size) {
  var out = new Float32Array(size);
  for (var i = 0; i < size; i++) {
    var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    out[i] = data[offset + i] * w;
  }
  return out;
}

function reverseBits(x, bits) {
  var result = 0;
  for (var i = 0; i < bits; i++) {
    result = (result << 1) | (x & 1);
    x >>= 1;
  }
  return result;
}

function fftMagnitude(real) {
  var N = real.length;
  var out = new Float32Array(N / 2 + 1);
  var re = new Float32Array(N);
  var im = new Float32Array(N);
  for (var i = 0; i < N; i++) re[i] = real[i];
  var bits = Math.log2(N);
  for (var i = 0; i < N; i++) {
    var j = reverseBits(i, bits);
    if (j > i) { var tmp = re[i]; re[i] = re[j]; re[j] = tmp; }
  }
  for (var s = 1; s <= bits; s++) {
    var m = 1 << s, halfm = m >> 1;
    var wRe = Math.cos(-2 * Math.PI / m), wIm = Math.sin(-2 * Math.PI / m);
    for (var k = 0; k < N; k += m) {
      var curRe = 1, curIm = 0;
      for (var j = 0; j < halfm; j++) {
        var tRe = curRe * re[k+j+halfm] - curIm * im[k+j+halfm];
        var tIm = curRe * im[k+j+halfm] + curIm * re[k+j+halfm];
        re[k+j+halfm] = re[k+j] - tRe;
        im[k+j+halfm] = im[k+j] - tIm;
        re[k+j] += tRe; im[k+j] += tIm;
        var newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe; curRe = newCurRe;
      }
    }
  }
  for (var i = 0; i <= N / 2; i++) out[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
  return out;
}

function vecDot(a, b) {
  var s = 0, len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

function vecNorm(a) {
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function smoothArray(arr, size) {
  var out = new Array(arr.length);
  var half = Math.floor(size / 2);
  for (var i = 0; i < arr.length; i++) {
    var sum = 0, count = 0;
    for (var j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j]; count++;
    }
    out[i] = sum / count;
  }
  return out;
}

function findPeaks(positions, values, sr, minHeight, minProminence, minDist) {
  var peaks = [];
  for (var i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i-1] && values[i] >= values[i+1] && values[i] >= minHeight) {
      var leftMin = values[i], rightMin = values[i];
      for (var l = i - 1; l >= 0; l--) {
        if (values[l] < leftMin) leftMin = values[l];
        if (values[l] > values[i]) break;
      }
      for (var r = i + 1; r < values.length; r++) {
        if (values[r] < rightMin) rightMin = values[r];
        if (values[r] > values[i]) break;
      }
      var prominence = values[i] - Math.max(leftMin, rightMin);
      if (prominence >= minProminence) {
        peaks.push({ index: i, sample: positions[i], time: positions[i] / sr, height: values[i], prominence: prominence });
      }
    }
  }
  var filtered = [];
  for (var p = 0; p < peaks.length; p++) {
    var dominated = false;
    for (var q = 0; q < filtered.length; q++) {
      if (Math.abs(peaks[p].index - filtered[q].index) < minDist) {
        if (peaks[p].height <= filtered[q].height) { dominated = true; break; }
        else { filtered.splice(q, 1); q--; }
      }
    }
    if (!dominated) filtered.push(peaks[p]);
  }
  return filtered;
}

// ========== Loop Point Analysis ==========
function analyzeLoopPoint(channelData, sr) {
  var n = channelData.length;
  var windows = [512, 1024, 2048, 4096];
  var hop = 128;
  var searchStart = Math.floor(0.05 * sr);

  var tailSpecs = {};
  for (var wi = 0; wi < windows.length; wi++) {
    var win = windows[wi];
    if (win > n) continue;
    var tailFrame = applyHanning(channelData, n - win, win);
    var spec = fftMagnitude(tailFrame);
    var norm = vecNorm(spec);
    tailSpecs[win] = { spec: spec, norm: norm };
  }

  var validWindows = Object.keys(tailSpecs).map(Number);
  var positions = [], ensembleVals = [];
  var maxPos = n - Math.max.apply(null, validWindows);

  for (var pos = searchStart; pos < maxPos; pos += hop) {
    var simSum = 0, count = 0;
    for (var wi = 0; wi < validWindows.length; wi++) {
      var win = validWindows[wi];
      if (pos + win > n) continue;
      var frame = applyHanning(channelData, pos, win);
      var spec = fftMagnitude(frame);
      var norm = vecNorm(spec);
      var dot = vecDot(tailSpecs[win].spec, spec);
      var sim = dot / (tailSpecs[win].norm * norm + 1e-10);
      simSum += sim; count++;
    }
    positions.push(pos);
    ensembleVals.push(count > 0 ? simSum / count : 0);
  }

  var smoothed = smoothArray(ensembleVals, 15);
  var peakCandidates = findPeaks(positions, smoothed, sr, 0.75, 0.03, Math.floor(0.08 * sr / hop));

  var loopEnd = (n - 1) / sr;
  var loopStart = 0;

  // Refine peaks
  var endSample = n - 1;
  var valEnd = channelData[endSample];
  var derivEnd = channelData[endSample] - channelData[Math.max(0, endSample - 1)];
  var refineRadius = Math.round(0.006 * sr);

  for (var pi = 0; pi < peakCandidates.length; pi++) {
    var center = peakCandidates[pi].sample;
    var bestSample = center, bestScore = Infinity;
    for (var s = Math.max(0, center - refineRadius); s <= Math.min(n - 1, center + refineRadius); s++) {
      var valS = channelData[s];
      var derivS = channelData[Math.min(s + 1, n - 1)] - channelData[s];
      var score = Math.abs(valEnd - valS) + 0.3 * Math.abs(derivEnd - derivS);
      if (score < bestScore) { bestScore = score; bestSample = s; }
    }
    peakCandidates[pi].sample = bestSample;
    peakCandidates[pi].time = bestSample / sr;
    peakCandidates[pi].jump = bestScore;
  }

  if (peakCandidates.length > 0) {
    var best = peakCandidates[peakCandidates.length - 1];
    loopStart = best.time;
  }

  return { loopStart: loopStart, loopEnd: loopEnd, peaks: peakCandidates };
}

// ========== Loop Point Analysis (녹음본용) ==========
// 지속음 특성: 후반부는 스펙트럼이 균일한 고원 → 피크 탐색 무의미
// 50%~70% 구간에서 최고 유사도 지점을 loopStart로 선택
function analyzeLoopPointForRecording(channelData, sr) {
  var n = channelData.length;
  var windows = [512, 1024, 2048, 4096];
  var hop = 128;
  var searchStart = Math.floor(n * 0.5);
  var searchEnd = Math.floor(n * 0.7);

  var tailSpecs = {};
  for (var wi = 0; wi < windows.length; wi++) {
    var win = windows[wi];
    if (win > n) continue;
    var tailFrame = applyHanning(channelData, n - win, win);
    var spec = fftMagnitude(tailFrame);
    var norm = vecNorm(spec);
    tailSpecs[win] = { spec: spec, norm: norm };
  }

  var validWindows = Object.keys(tailSpecs).map(Number);
  var maxWin = Math.max.apply(null, validWindows);
  var maxPos = Math.min(searchEnd, n - maxWin);
  var positions = [], ensembleVals = [];

  for (var pos = searchStart; pos < maxPos; pos += hop) {
    var simSum = 0, count = 0;
    for (var wi = 0; wi < validWindows.length; wi++) {
      var win = validWindows[wi];
      if (pos + win > n) continue;
      var frame = applyHanning(channelData, pos, win);
      var spec = fftMagnitude(frame);
      var norm = vecNorm(spec);
      var dot = vecDot(tailSpecs[win].spec, spec);
      var sim = dot / (tailSpecs[win].norm * norm + 1e-10);
      simSum += sim; count++;
    }
    positions.push(pos);
    ensembleVals.push(count > 0 ? simSum / count : 0);
  }

  var smoothed = smoothArray(ensembleVals, 15);

  var loopEnd = (n - 1) / sr;
  var loopStart = searchStart / sr;
  var maxSim = 0;
  var bestIdx = 0;

  for (var fi = 0; fi < smoothed.length; fi++) {
    if (smoothed[fi] > maxSim) {
      maxSim = smoothed[fi];
      bestIdx = fi;
    }
  }

  if (positions.length > 0 && maxSim >= 0.7) {
    loopStart = positions[bestIdx] / sr;
  }

  console.log('[LoopRec] loopStart=' + loopStart.toFixed(4) +
    's, maxSim=' + maxSim.toFixed(4) + ', frames=' + positions.length);

  return {
    loopStart: loopStart, loopEnd: loopEnd, peaks: [],
    debug: { maxSim: maxSim }
  };
}

// ========== High-Pass Filter ==========
// 2차 Butterworth 하이패스 (12dB/oct), in-place 처리
function applyHighPass(channelData, sr, cutoffHz) {
  cutoffHz = cutoffHz || 150;
  var n = channelData.length;
  if (n < 3) return;

  // Biquad 계수 산출 (Audio EQ Cookbook)
  var w0 = 2 * Math.PI * cutoffHz / sr;
  var cosw0 = Math.cos(w0);
  var alpha = Math.sin(w0) / (2 * 0.7071); // Q = 1/sqrt(2) = Butterworth

  var b0 = (1 + cosw0) / 2;
  var b1 = -(1 + cosw0);
  var b2 = (1 + cosw0) / 2;
  var a0 = 1 + alpha;
  var a1 = -2 * cosw0;
  var a2 = 1 - alpha;

  // 정규화
  b0 /= a0; b1 /= a0; b2 /= a0;
  a1 /= a0; a2 /= a0;

  // Direct Form I
  var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (var i = 0; i < n; i++) {
    var x0 = channelData[i];
    var y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    channelData[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }

  console.log('[HPF] ' + cutoffHz + 'Hz 2nd-order Butterworth applied');
}

// ========== Normalize ==========
// RMS 노멀라이즈: 목표 RMS에 맞춰 증폭, 피크 ceiling 초과 방지
// channelData를 in-place로 수정, 적용된 gain을 반환
function normalizeRMS(channelData, targetRMS, ceiling) {
  targetRMS = targetRMS || 0.15;   // -16.5dB 정도
  ceiling = ceiling || 0.95;

  var n = channelData.length;
  var sumSq = 0, peak = 0;
  for (var i = 0; i < n; i++) {
    var v = channelData[i];
    sumSq += v * v;
    var abs = v < 0 ? -v : v;
    if (abs > peak) peak = abs;
  }
  var rms = Math.sqrt(sumSq / n);

  if (rms < 1e-6) return 1;  // 무음 — 건드리지 않음

  var gain = targetRMS / rms;
  // 피크가 ceiling을 넘지 않도록 제한
  if (peak * gain > ceiling) {
    gain = ceiling / peak;
  }
  // 이미 충분히 크면 증폭하지 않음 (감쇠도 하지 않음)
  if (gain <= 1) return 1;

  for (var i = 0; i < n; i++) {
    channelData[i] *= gain;
  }

  console.log('[Norm] RMS: ' + rms.toFixed(4) + ' → ' + (rms * gain).toFixed(4) +
    ', peak: ' + peak.toFixed(4) + ' → ' + (peak * gain).toFixed(4) +
    ', gain: ' + gain.toFixed(2) + 'x');
  return gain;
}

// ========== XF Bake ==========
// actx는 recorder.js에서 전역으로 제공
function buildXFBuffer(channelData, sr, loopStart, loopEnd, fadeMs, materialMode) {
  materialMode = materialMode || 'loopHead';
  var fadeSec = fadeMs / 1000;
  var fadeSamples = Math.round(fadeSec * sr);
  var startSample = Math.round(loopStart * sr);
  var endSample = Math.round(loopEnd * sr);
  var loopSamples = endSample - startSample;

  if (loopSamples <= fadeSamples * 2) {
    console.warn('[XF] Loop too short for crossfade');
    return null;
  }

  var newEndSample = endSample - fadeSamples;
  var bufLen = newEndSample;
  var bufData = new Float32Array(bufLen);
  for (var i = 0; i < bufLen; i++) bufData[i] = channelData[i];

  // Linear crossfade
  var hasPreLoop = (startSample >= fadeSamples);
  for (var i = 0; i < fadeSamples; i++) {
    var t = i / fadeSamples;
    var gainCur = 1 - t;
    var gainHead = t;
    var xfIdx = newEndSample - fadeSamples + i;
    var headSample;
    if (materialMode === 'preLoop' && hasPreLoop) {
      headSample = channelData[startSample - fadeSamples + i];
    } else {
      headSample = channelData[startSample + i];
    }
    bufData[xfIdx] = bufData[xfIdx] * gainCur + headSample * gainHead;
  }

  var buf = actx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(bufData);
  buf._loopStart = loopStart;
  buf._loopEnd = newEndSample / sr;

  console.log('[XF] Baked: loopStart=' + loopStart.toFixed(4) + 's, loopEnd=' +
    buf._loopEnd.toFixed(4) + 's, fade=' + fadeMs + 'ms, material=' + materialMode);
  return buf;
}
