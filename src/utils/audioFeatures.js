const featureCache = new Map();
let sharedCtx = null;

function getAudioContext() {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedCtx;
}

function toDb(value) {
  if (!value || value <= 0) return -120;
  return 20 * Math.log10(value);
}

function getMonoData(buffer) {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels <= 1) return buffer.getChannelData(0);

  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / numberOfChannels;
    }
  }
  return mono;
}

function fftMagnitudes(samples) {
  const size = samples.length;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);

  for (let i = 0; i < size; i += 1) {
    real[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }

  for (let len = 2; len <= size; len *= 2) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < size; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const even = i + j;
        const odd = even + len / 2;
        const oddReal = real[odd] * wReal - imag[odd] * wImag;
        const oddImag = real[odd] * wImag + imag[odd] * wReal;
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }

  const magnitudes = new Float64Array(size / 2);
  for (let i = 1; i < magnitudes.length; i += 1) {
    magnitudes[i] = Math.hypot(real[i], imag[i]);
  }
  return magnitudes;
}

function computeSpectralFeatures(data, sampleRate) {
  const fftSize = 2048;
  const chroma = new Float64Array(12);
  let weightedFrequency = 0;
  let magnitudeTotal = 0;
  let flatnessLog = 0;
  let flatnessCount = 0;
  let strongestMagnitude = 0;
  let strongestFrequency = 0;
  const frameCount = Math.min(24, Math.max(1, Math.floor(data.length / fftSize)));
  const stride = Math.max(fftSize, Math.floor((data.length - fftSize) / frameCount));

  for (let start = 0; start + fftSize <= data.length; start += stride) {
    const magnitudes = fftMagnitudes(data.subarray(start, start + fftSize));
    for (let bin = 1; bin < magnitudes.length; bin += 1) {
      const magnitude = magnitudes[bin];
      const frequency = (bin * sampleRate) / fftSize;
      if (frequency < 45 || frequency > 8000) continue;
      magnitudeTotal += magnitude;
      weightedFrequency += frequency * magnitude;
      flatnessLog += Math.log(Math.max(magnitude, 1e-12));
      flatnessCount += 1;
      if (magnitude > strongestMagnitude) {
        strongestMagnitude = magnitude;
        strongestFrequency = frequency;
      }
      if (frequency <= 5000) {
        const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
        chroma[((midi % 12) + 12) % 12] += magnitude;
      }
    }
  }

  const arithmeticMean = magnitudeTotal / Math.max(1, flatnessCount);
  const geometricMean = Math.exp(flatnessLog / Math.max(1, flatnessCount));
  const spectralFlatness = arithmeticMean ? geometricMean / arithmeticMean : 0;
  const spectralCentroid = magnitudeTotal ? weightedFrequency / magnitudeTotal : 0;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let keyIndex = 0;
  for (let i = 1; i < chroma.length; i += 1) {
    if (chroma[i] > chroma[keyIndex]) keyIndex = i;
  }
  const chromaTotal = chroma.reduce((sum, value) => sum + value, 0);
  const keyConfidence = chromaTotal ? chroma[keyIndex] / chromaTotal : 0;

  return {
    spectralCentroid,
    spectralFlatness,
    dominantFrequency: strongestFrequency,
    estimatedKey: noteNames[keyIndex],
    keyConfidence,
  };
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}

function normalizeTempo(bpm, minBpm = 70, maxBpm = 180) {
  let normalized = bpm;
  while (normalized < minBpm) normalized *= 2;
  while (normalized > maxBpm) normalized /= 2;
  return normalized;
}

function estimateTempo(data, sampleRate, minBpm = 55, maxBpm = 210) {
  const frameSize = 1024;
  const hop = 512;
  const flux = [];
  let previous = null;

  for (let i = 0; i + frameSize < data.length; i += hop) {
    const magnitudes = fftMagnitudes(data.subarray(i, i + frameSize));
    let positiveFlux = 0;
    if (previous) {
      for (let bin = 1; bin < magnitudes.length; bin += 1) {
        const frequency = (bin * sampleRate) / frameSize;
        if (frequency < 40 || frequency > 5000) continue;
        const diff = Math.log1p(magnitudes[bin]) - Math.log1p(previous[bin]);
        if (diff > 0) positiveFlux += diff;
      }
    }
    previous = magnitudes;
    flux.push(positiveFlux);
  }

  if (flux.length < 16) return { tempo: null, confidence: 0, candidates: [] };

  const floor = median(flux);
  const centered = flux.map((value) => Math.max(0, value - floor));
  const maxFlux = Math.max(...centered);
  if (!maxFlux) return { tempo: null, confidence: 0, candidates: [] };

  const smoothed = centered.map((value, index) => {
    const prev = centered[index - 1] || 0;
    const next = centered[index + 1] || 0;
    return (prev + value * 2 + next) / 4;
  });

  const peaks = [];
  const threshold = median(smoothed) + (Math.max(...smoothed) - median(smoothed)) * 0.22;
  for (let i = 1; i < smoothed.length - 1; i += 1) {
    if (smoothed[i] >= threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] >= smoothed[i + 1]) {
      peaks.push(i);
    }
  }

  const envRate = sampleRate / hop;
  const minLag = Math.max(1, Math.floor((envRate * 60) / maxBpm));
  const maxLag = Math.min(smoothed.length - 2, Math.ceil((envRate * 60) / minBpm));
  const scores = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < smoothed.length - lag; i += 1) {
      sum += smoothed[i] * smoothed[i + lag];
      weight += smoothed[i] * smoothed[i];
    }
    if (sum > 0) {
      const rawBpm = (60 * envRate) / lag;
      const bpm = normalizeTempo(rawBpm);
      const preferredRangeBoost = bpm >= 80 && bpm <= 160 ? 1.08 : 1;
      scores.push({ lag, bpm, rawBpm, score: (sum / Math.max(weight, 1e-9)) * preferredRangeBoost });
    }
  }

  const intervalBpms = [];
  for (let i = 1; i < peaks.length; i += 1) {
    const distance = peaks[i] - peaks[i - 1];
    if (distance <= 0) continue;
    const bpm = normalizeTempo((60 * envRate) / distance);
    if (bpm >= 55 && bpm <= 210) intervalBpms.push(bpm);
  }

  if (intervalBpms.length >= 3) {
    const peakMedian = median(intervalBpms);
    scores.push({
      lag: (60 * envRate) / peakMedian,
      bpm: peakMedian,
      rawBpm: peakMedian,
      score: Math.min(1, intervalBpms.length / Math.max(8, peaks.length)) * 0.9,
    });
  }

  if (!scores.length) return { tempo: null, confidence: 0, candidates: [] };

  const merged = new Map();
  scores.forEach((candidate) => {
    const key = Math.round(candidate.bpm);
    const current = merged.get(key) || { bpm: key, score: 0, votes: 0 };
    current.score += candidate.score;
    current.votes += 1;
    merged.set(key, current);
  });

  const candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const best = candidates[0];
  const second = candidates[1];
  const separation = second ? (best.score - second.score) / Math.max(best.score, 1e-9) : 1;
  const peakDensity = Math.min(1, peaks.length / Math.max(12, smoothed.length / 8));
  const confidence = Math.max(0.05, Math.min(0.98, (0.45 + separation * 0.35 + peakDensity * 0.2) * Math.min(1, best.score)));

  return {
    tempo: best.bpm,
    confidence,
    candidates: candidates.map((candidate) => ({
      tempo: candidate.bpm,
      score: candidate.score,
      votes: candidate.votes,
    })),
  };
}

export function computeAudioBufferFeatures(buffer) {
  const data = getMonoData(buffer);
  let peak = 0;
  let sumSq = 0;
  let zeroCross = 0;
  let last = data[0] || 0;

  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
    if ((v >= 0 && last < 0) || (v < 0 && last >= 0)) zeroCross += 1;
    last = v;
  }

  const rms = Math.sqrt(sumSq / data.length);
  const tempoEstimate = estimateTempo(data, buffer.sampleRate);
  const zcr = zeroCross / data.length;
  const spectral = computeSpectralFeatures(data, buffer.sampleRate);
  const crestFactor = rms ? peak / rms : 0;

  return {
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    zeroCrossRate: zcr,
    tempo: tempoEstimate.tempo,
    tempoConfidence: tempoEstimate.confidence,
    tempoCandidates: tempoEstimate.candidates,
    crestFactor,
    dynamicRangeDb: Math.max(0, toDb(peak) - toDb(rms)),
    ...spectral,
  };
}

export async function extractAudioFeatures(url) {
  if (!url) return null;
  if (featureCache.has(url)) return featureCache.get(url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audio request failed (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const features = computeAudioBufferFeatures(audioBuffer);
  featureCache.set(url, features);
  return features;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
