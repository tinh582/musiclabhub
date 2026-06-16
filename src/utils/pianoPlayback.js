const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';
const SAMPLE_URLS = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
};

let toneModulePromise = null;
let samplerPromise = null;

async function getToneModule() {
  if (!toneModulePromise) {
    toneModulePromise = import('tone');
  }
  return toneModulePromise;
}

export async function ensurePianoSampler() {
  if (!samplerPromise) {
    samplerPromise = (async () => {
      const Tone = await getToneModule();
      await Tone.start();
      const sampler = new Tone.Sampler({
        urls: SAMPLE_URLS,
        release: 1.4,
        baseUrl: SAMPLE_BASE_URL,
        volume: -7,
      }).toDestination();
      await Tone.loaded();
      return { Tone, sampler };
    })();
  }
  return samplerPromise;
}

export async function playPianoNotes(notes, { onProgress, onComplete, lookAhead = 0.12 } = {}) {
  const playable = (notes || []).filter((note) => Number.isFinite(note.midi));
  if (!playable.length) return () => {};

  const { Tone, sampler } = await ensurePianoSampler();
  const start = Tone.now() + lookAhead;
  const totalDuration = Math.max(...playable.map((note) => Number(note.time || 0) + Number(note.duration || 0.25))) + 0.15;
  let frameId = null;
  let timeoutId = null;

  playable.forEach((note) => {
    sampler.triggerAttackRelease(
      midiNumberToNoteName(note.midi),
      Math.max(0.08, Number(note.duration || 0.25)),
      start + Number(note.time || 0),
      Math.max(0.2, Math.min(0.95, Number(note.velocity || 0.75))),
    );
  });

  if (onProgress) {
    const tick = () => {
      const elapsed = Tone.now() - start;
      onProgress(Math.max(0, elapsed), totalDuration);
      if (elapsed < totalDuration) {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);
  }

  timeoutId = window.setTimeout(() => {
    sampler.releaseAll(Tone.now());
    if (frameId) cancelAnimationFrame(frameId);
    onComplete?.();
  }, Math.max(0, totalDuration) * 1000);

  return () => {
    if (frameId) cancelAnimationFrame(frameId);
    if (timeoutId) window.clearTimeout(timeoutId);
    sampler.releaseAll(Tone.now());
  };
}

function midiNumberToNoteName(midi) {
  const roundedMidi = Math.round(Number(midi) || 60);
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${noteNames[((roundedMidi % 12) + 12) % 12]}${Math.floor(roundedMidi / 12) - 1}`;
}
