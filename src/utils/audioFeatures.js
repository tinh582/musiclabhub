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

  return {
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    zeroCrossRate: zcr,
    tempo,
  };
}

export async function extractAudioFeatures(url) {
  if (!url) return null;
  if (featureCache.has(url)) return featureCache.get(url);

  const res = await fetch(url);
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
