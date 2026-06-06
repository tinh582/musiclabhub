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

function estimateTempo(buffer, minBpm = 60, maxBpm = 180) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frameSize = 1024;
  const hop = 512;
  const env = [];

  for (let i = 0; i + frameSize < data.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < frameSize; j += 1) {
      const v = data[i + j];
      sum += v * v;
    }
    env.push(Math.sqrt(sum / frameSize));
  }

  if (env.length < 8) return null;

  const mean = env.reduce((s, v) => s + v, 0) / env.length;
  for (let i = 0; i < env.length; i += 1) env[i] -= mean;

  const envRate = sampleRate / hop;
  const minLag = Math.max(1, Math.floor((envRate * 60) / maxBpm));
  const maxLag = Math.min(env.length - 1, Math.floor((envRate * 60) / minBpm));

  let bestLag = null;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < env.length - lag; i += 1) {
      sum += env[i] * env[i + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }

  if (!bestLag) return null;
  const bpm = (60 * envRate) / bestLag;
  return Math.round(bpm);
}

function computeFeatures(buffer) {
  const data = buffer.getChannelData(0);
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
  const tempo = estimateTempo(buffer);
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
    tempo,
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
  const features = computeFeatures(audioBuffer);
  featureCache.set(url, features);
  return features;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
