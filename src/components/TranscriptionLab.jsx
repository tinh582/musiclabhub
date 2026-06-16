import { useMemo, useRef, useState, useEffect } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { resolveApiBase } from '../utils/apiBase';
import { estimateTempo } from '../utils/audioFeatures';
import { AIAnalysisStream } from './AIAnalysisStream';
import { useNavigate } from 'react-router-dom';

const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.PROD);

function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  let bestOffset = -1;
  let bestCorrelation = 0;
  const correlations = new Array(size).fill(0);

  for (let offset = 0; offset < size; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < size - offset; i += 1) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / size;
    correlations[offset] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestCorrelation > 0.01 && bestOffset > 0) {
    return sampleRate / bestOffset;
  }
  return -1;
}

function frequencyToNoteName(frequency) {
  const noteNumber = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
  const roundedNumber = Math.round(noteNumber);
  const octave = Math.floor(roundedNumber / 12) - 1;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[((roundedNumber % 12) + 12) % 12];
  return `${noteName}${octave}`;
}

function frequencyToMidiNumber(frequency) {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${noteNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function inferMelodicProfile(notes) {
  const pitched = notes.filter((note) => note.frequency && note.kind !== 'rest');
  if (!pitched.length) return null;
  const pitchClasses = new Array(12).fill(0);
  const midiValues = pitched.map((note) => {
    const midi = Math.round(69 + 12 * Math.log2(note.frequency / 440));
    pitchClasses[((midi % 12) + 12) % 12] += Number(note.duration || 0.2);
    return midi;
  });
  const scales = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
  };
  let best = { score: -1, root: 0, mode: 'major' };
  for (let root = 0; root < 12; root += 1) {
    Object.entries(scales).forEach(([mode, scale]) => {
      const score = scale.reduce((sum, interval) => sum + pitchClasses[(root + interval) % 12], 0);
      if (score > best.score) best = { score, root, mode };
    });
  }
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const total = pitchClasses.reduce((sum, value) => sum + value, 0);
  return {
    key: `${names[best.root]} ${best.mode}`,
    confidence: total ? best.score / total : 0,
    range: Math.max(...midiValues) - Math.min(...midiValues),
    uniqueNotes: pitchClasses.filter((value) => value > 0).length,
  };
}

export function TranscriptionLab({
  workspaceAudio = null,
  sendModuleHandoff = null,
  saveAnalysis = null,
  moduleHandoff = null,
  clearModuleHandoff = null,
}) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const pianoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const workerRef = useRef(null);
  const bufferRef = useRef(null);
  const audioUrlRef = useRef(null);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [xmlPreview, setXmlPreview] = useState('');
  const [analysisSummary, setAnalysisSummary] = useState(null);
  const [modelMidiBase64, setModelMidiBase64] = useState('');
  const [modelMidiFileName, setModelMidiFileName] = useState('transcription-model.mid');
  const [tempo, setTempo] = useState(null);
  const [tempoSource, setTempoSource] = useState('Not estimated yet');
  const [resolution, setResolution] = useState(16);
  const [triplet, setTriplet] = useState(false);
  const [swing, setSwing] = useState(0); // 0..0.5 fraction
  const scheduledRef = useRef([]);
  const playbackStartRef = useRef(null);
  const animationRef = useRef(null);
  const workspaceLoadedRef = useRef('');
  const workerPendingRef = useRef(false);

  const sampleTracks = [
    { label: 'Sample 1', url: '/audio/sample1.mp3' },
    { label: 'Sample 2', url: '/audio/sample2.mp3' },
    { label: 'Sample 3', url: '/audio/sample3.mp3' },
    { label: 'Sample 4', url: '/audio/sample4.mp3' },
    { label: 'Sample 5', url: '/audio/sample5.mp3' },
    { label: 'Sample 6', url: '/audio/sample6.mp3' },
    { label: 'Sample 7', url: '/audio/sample7.mp3' },
  ];

  useEffect(() => {
    // create worker
    workerRef.current = new Worker(new URL('../workers/pitchWorker.js', import.meta.url), { type: 'module' });
    workerRef.current.postMessage({ cmd: 'init', sampleRate: 44100 });
    workerRef.current.onmessage = (ev) => {
      const data = ev.data;
      if (data.status === 'done') {
        const events = data.events.map((it) => {
          const startTime = Number(it.time || 0);
          const duration = Math.max(0.06, Number(it.duration || 0.2));
          return {
            time: startTime,
            startTime,
            endTime: startTime + duration,
            duration,
            frequency: it.frequency,
            note: it.frequency ? frequencyToNoteName(it.frequency) : 'Rest',
            kind: it.frequency ? 'note' : 'rest',
            confidence: Number(it.confidence || 0),
          };
        });
        setNotes(events);
        setAnalysisSummary(data.summary || null);
        drawPianoRoll(events, data.duration);
        workerPendingRef.current = false;
        setAnalysisProgress({ percent: 100, status: 'Analysis complete' });
        setLoading(false);
      } else if (data.status === 'progress') {
        setAnalysisProgress({
          percent: Math.max(0, Math.min(99, Number(data.progress || 0) * 100)),
          status: data.label || 'Tracking pitch',
        });
      } else if (data.status === 'error') {
        workerPendingRef.current = false;
        setAnalysisProgress(null);
        setLoading(false);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const { t } = useLocale();
  const melodicProfile = useMemo(() => inferMelodicProfile(notes), [notes]);
  const transcriptionFindings = notes.length ? [
    { label: 'Detected events', value: String(analysisSummary?.noteCount || notes.length) },
    { label: 'Pitch confidence', value: `${Math.round((analysisSummary?.averageConfidence || 0) * 100)}%` },
    { label: 'Estimated key', value: melodicProfile?.key || 'n/a', detail: melodicProfile ? `${Math.round(melodicProfile.confidence * 100)}% scale fit` : '' },
    { label: 'Model', value: analysisSummary?.model || 'Local worker' },
    { label: 'Tempo', value: tempo ? `${tempo} BPM` : 'Not estimated', detail: tempoSource },
  ] : [];

  useEffect(() => {
    if (moduleHandoff?.type !== 'restore-analysis' || moduleHandoff.payload?.slug !== 'transcription') return;
    const snapshot = moduleHandoff.payload.snapshot || {};
    if (Array.isArray(snapshot.notes)) setNotes(snapshot.notes);
    if (snapshot.analysisSummary) setAnalysisSummary(snapshot.analysisSummary);
    if (Number.isFinite(snapshot.tempo)) setTempo(snapshot.tempo);
    if (Number.isFinite(snapshot.resolution)) setResolution(snapshot.resolution);
    if (typeof snapshot.triplet === 'boolean') setTriplet(snapshot.triplet);
    if (Number.isFinite(snapshot.swing)) setSwing(snapshot.swing);
    clearModuleHandoff?.();
  }, [moduleHandoff, clearModuleHandoff]);

  function buildHandoffMelody() {
    return notes
      .filter((note) => note.frequency && note.kind !== 'rest')
      .map((note) => ({
        midi: Math.round(69 + 12 * Math.log2(note.frequency / 440)),
        duration: Math.max(0.125, Number(note.duration || 0.5)),
        note: note.note,
      }));
  }

  function sendToComposer() {
    if (!notes.length || !sendModuleHandoff) return;
    const melody = buildHandoffMelody();
    sendModuleHandoff('melody', { melody, tempo: tempo || 120, title: 'Transcribed melody' }, 'Transcription');
    navigate('/feature/composer');
  }

  function sendToPractice() {
    if (!notes.length || !sendModuleHandoff) return;
    const melody = buildHandoffMelody();
    sendModuleHandoff('practice-melody', { melody, tempo: tempo || 120, title: 'Transcribed melody' }, 'Transcription');
    navigate('/feature/practice');
  }

  function saveCurrentAnalysis() {
    if (!notes.length || !saveAnalysis) return;
    saveAnalysis({
      module: 'Transcription',
      slug: 'transcription',
      title: melodicProfile ? `${melodicProfile.key} transcription` : 'Note transcription',
      source: workspaceAudio?.name || 'Uploaded audio',
      metrics: [
        { label: 'Events', value: String(analysisSummary?.noteCount || notes.length) },
        { label: 'Confidence', value: `${Math.round((analysisSummary?.averageConfidence || 0) * 100)}%` },
        { label: 'Range', value: melodicProfile ? `${melodicProfile.range} semitones` : 'n/a' },
        { label: 'Tempo', value: tempo ? `${tempo} BPM` : 'n/a' },
      ],
      snapshot: {
        notes,
        analysisSummary,
        tempo,
        resolution,
        triplet,
        swing,
      },
    });
  }

  function setPlaybackSource(playbackBlob) {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (!playbackBlob || !audioRef.current) return;

    const objectUrl = URL.createObjectURL(playbackBlob);
    audioUrlRef.current = objectUrl;
    audioRef.current.src = objectUrl;
  }

  async function analyzeWithService(audioBuffer, fileName = 'audio', currentTempo = null) {
    const channelData = audioBuffer.numberOfChannels > 0
      ? audioBuffer.getChannelData(0).slice()
      : new Float32Array(0);

    try {
      setAnalysisProgress({ percent: 28, status: 'Checking analysis service' });
      const response = await fetch(`${API_BASE}/api/transcription/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Sample-Rate': String(audioBuffer.sampleRate),
          'X-Duration': String(audioBuffer.duration),
          'X-File-Name': fileName,
          ...(Number.isFinite(currentTempo) ? { 'X-Tempo': String(currentTempo) } : {}),
        },
        body: channelData.buffer,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setAnalysisProgress({ percent: 82, status: 'Reading model output' });
      return response.json();
    } catch (error) {
      console.warn('Transcription service unavailable, falling back to local worker.', error);
      return null;
    }
  }

  async function processArrayBuffer(arrayBuffer, fileName = 'audio', playbackBlob = null) {
    setAnalysisProgress({ percent: 4, status: 'Decoding audio' });
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
    bufferRef.current = audioBuffer;
    setBufferDuration(audioBuffer.duration);
    const tempoEstimate = estimateTempo(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
    const detectedTempo = Number.isFinite(tempoEstimate.tempo) ? tempoEstimate.tempo : null;
    setTempo(detectedTempo);
    setTempoSource(detectedTempo ? tempoEstimate.method : 'Could not estimate reliably');
    setAnalysisProgress({ percent: 16, status: 'Drawing waveform' });
    drawWaveform(audioBuffer);
    setXmlPreview('');
    setAnalysisSummary(null);
    setModelMidiBase64('');
    setModelMidiFileName('transcription-model.mid');
    setPlaybackSource(playbackBlob);

    const serviceResult = await analyzeWithService(audioBuffer, fileName, detectedTempo);
    if (serviceResult && Array.isArray(serviceResult.notes)) {
      setNotes(serviceResult.notes);
      drawPianoRoll(serviceResult.notes, serviceResult.duration || audioBuffer.duration);
      setXmlPreview(serviceResult.musicxml || '');
      setAnalysisSummary(serviceResult.summary || null);
      setModelMidiBase64(serviceResult.midiBase64 || '');
      setModelMidiFileName(serviceResult.midiFileName || 'transcription-model.mid');
      setAnalysisProgress({ percent: 100, status: 'Analysis complete' });
      return;
    }

    // send channel data to worker for fallback detection
    setAnalysisProgress({ percent: 22, status: 'Starting local pitch scan' });
    const channelData = audioBuffer.getChannelData(0).slice();
    workerPendingRef.current = true;
    workerRef.current.postMessage({ cmd: 'detect', audioBuffer: channelData.buffer, sampleRate: audioBuffer.sampleRate }, [channelData.buffer]);
    return 'worker';
  }

  useEffect(() => {
    if (!workspaceAudio?.file || workspaceLoadedRef.current === workspaceAudio.url) return;
    workspaceLoadedRef.current = workspaceAudio.url;
    let active = true;
    setLoading(true);
    workspaceAudio.file.arrayBuffer()
      .then((arrayBuffer) => {
        if (!active) return null;
        return processArrayBuffer(arrayBuffer, workspaceAudio.name, workspaceAudio.file);
      })
      .catch((error) => {
        if (active) console.error(error);
      })
      .then((result) => {
        if (active && result !== 'worker') setLoading(false);
      })
      .finally(() => {
        if (!active) workerPendingRef.current = false;
      });
    return () => {
      active = false;
    };
    // Loading is keyed to the selected workspace file, not quantization controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceAudio]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await processArrayBuffer(arrayBuffer, file.name, file);
      if (result === 'worker') return;
    } catch (err) {
      console.error(err);
    } finally {
      if (!workerPendingRef.current) setLoading(false);
    }
  }

  async function loadSampleByValue(value) {
    const track = sampleTracks.find((t) => t.url === value);
    if (!track) return;
    setLoading(true);
    try {
      if (fileRef.current) fileRef.current.value = '';
      const resp = await fetch(track.url);
      const blob = await resp.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const result = await processArrayBuffer(arrayBuffer, track.label, blob);
      if (result === 'worker') return;
    } catch (err) {
      console.error(err);
    } finally {
      if (!workerPendingRef.current) setLoading(false);
    }
  }

  function playBuffer() {
    if (!audioRef.current) return;
    audioRef.current.play().catch(console.error);
  }

  function stopPlayback() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPlaying(false);
  }

  function seekBy(deltaSeconds) {
    if (!audioRef.current) return;
    const nextTime = Math.min(Math.max(0, audioRef.current.currentTime + deltaSeconds), audioRef.current.duration || bufferDuration || 0);
    audioRef.current.currentTime = nextTime;
    setBufferDuration(audioRef.current.duration || bufferDuration || 0);
  }

  function handleAudioLoadedMetadata() {
    if (audioRef.current) {
      setBufferDuration(audioRef.current.duration || bufferDuration || 0);
    }
  }

  function handleAudioTimeUpdate() {
    if (audioRef.current) {
      setBufferDuration(audioRef.current.duration || bufferDuration || 0);
    }
  }

  function drawWaveform(audioBuffer) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.height = 120 * devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, width, height);

    const data = audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : new Float32Array(0);
    const step = Math.ceil(data.length / width);
    const samplesPerColumn = Math.min(96, step);
    const sampleStride = Math.max(1, Math.floor(step / samplesPerColumn));
    const amp = height / 2;
    ctx.fillStyle = 'rgba(110,240,209,0.6)';
    for (let i = 0; i < width; i += 1) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j += sampleStride) {
        const datum = data[(i * step) + j];
        if (datum === undefined) break;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
  }

  function drawPianoRoll(events, duration, now = null) {
    const canvas = pianoRef.current;
    if (!canvas) return;
    const width = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const height = (canvas.height = 160 * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    // draw keyboard background
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, width, height);

    const midiOf = (note) => {
      const m = note.match(/([A-G])(#?)(-?\d+)/);
      if (!m) return 60;
      const name = m[1];
      const sharp = m[2] === '#';
      const octave = Number(m[3]);
      const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name];
      return base + (sharp ? 1 : 0) + (octave + 1) * 12;
    };

    // find range
    const midis = events.map((ev) => (ev.frequency ? midiOf(frequencyToNoteName(ev.frequency)) : 60));
    const minMidi = Math.min(...midis, 48);
    const maxMidi = Math.max(...midis, 84);
    const midiRange = Math.max(12, maxMidi - minMidi + 1);

    events.forEach((ev) => {
      const midi = ev.frequency ? midiOf(frequencyToNoteName(ev.frequency)) : null;
      const x = (ev.time / duration) * width;
      const dur = ev.qDur || ev.duration || 0.2;
      const w = Math.max(6, (dur / duration) * width);
      const y = height - ((midi - minMidi) / midiRange) * height - 20;
      ctx.fillStyle = 'rgba(110,240,209,0.9)';
      ctx.fillRect(x, y, w, 16);
    });

    // draw playback cursor if now provided (seconds from start)
    if (now != null) {
      const x = (now / duration) * width;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1 * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  function quantizeEvents(events, tempoBPM, resolutionInput = 16, tripletFlag = false, swingFrac = 0) {
    if (!events || events.length === 0) return [];
    const beat = 60 / tempoBPM; // quarter note seconds
    // resolutionInput refers to subdivisions per whole note (e.g., 16 -> 16th notes)
    const unit = (beat * 4) / resolutionInput; // seconds per grid unit
    const q = events.map((ev, i) => {
      // handle triplet subdivision by adjusting unit positions
      let qIndex = Math.round(ev.time / unit);
      if (tripletFlag) {
        // map to nearest triplet grid (3 per quarter -> resolutionInput * 3/4)
        const tripUnit = unit * (2 / 3); // crude triplet spacing
        qIndex = Math.round(ev.time / tripUnit);
      }
      let qTime = qIndex * unit;
      // apply swing: move every other 16th forward by swingFrac of unit
      if (swingFrac > 0) {
        const posInBeat = ((qIndex % (resolutionInput / 4)) + (resolutionInput / 4)) % (resolutionInput / 4);
        // apply swing to off-beats (odd subdivisions)
        if (posInBeat % 2 === 1) {
          qTime += unit * swingFrac;
        }
      }
      const next = events[i + 1];
      const rawDur = next ? Math.max(0.02, next.time - ev.time) : unit;
      const qDur = Math.max(unit, Math.round(rawDur / unit) * unit);
      return { ...ev, qTime, qDur };
    });
    return q;
  }

  function preparePlayableMelody(events, tempoBPM, resolutionInput = 16) {
    if (!events?.length) return [];
    const minDuration = Math.max(0.045, (60 / tempoBPM) / Math.max(8, resolutionInput * 0.75));
    const sorted = events
      .filter((event) => event.frequency && Number(event.confidence ?? 1) >= 0.32)
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
    const deOctaved = [];

    for (const event of sorted) {
      let midi = frequencyToMidiNumber(event.frequency);
      if (deOctaved.length) {
        const previousMidi = deOctaved[deOctaved.length - 1].midi;
        let best = midi;
        for (let shift = -24; shift <= 24; shift += 12) {
          const candidate = midi + shift;
          if (Math.abs(candidate - previousMidi) < Math.abs(best - previousMidi)) best = candidate;
        }
        if (Math.abs(best - previousMidi) <= 12) midi = best;
      }
      deOctaved.push({ ...event, midi });
    }

    const cleaned = [];
    for (const event of deOctaved) {
      const time = Number(event.time || event.startTime || 0);
      const duration = Math.max(0.035, Number(event.duration || 0.12));
      const previous = cleaned[cleaned.length - 1];
      const gap = previous ? time - (previous.time + previous.duration) : Infinity;
      if (previous && Math.abs(previous.midi - event.midi) <= 1 && gap >= -0.03 && gap <= 0.18) {
        const end = Math.max(previous.time + previous.duration, time + duration);
        previous.duration = end - previous.time;
        previous.midi = Math.round((previous.midi + event.midi) / 2);
        previous.frequency = midiToFrequency(previous.midi);
        previous.note = midiToNoteName(previous.midi);
        previous.confidence = Math.max(previous.confidence || 0, event.confidence || 0);
        continue;
      }
      if (duration < minDuration && previous && Math.abs(previous.midi - event.midi) <= 2) {
        previous.duration = Math.max(previous.duration, (time + duration) - previous.time);
        continue;
      }
      cleaned.push({
        ...event,
        time,
        startTime: time,
        duration,
        endTime: time + duration,
        frequency: midiToFrequency(event.midi),
        note: midiToNoteName(event.midi),
      });
    }

    return cleaned.filter((event) => event.duration >= minDuration || Number(event.confidence || 0) >= 0.58);
  }

  function stopScheduledNotes() {
    scheduledRef.current.forEach((n) => {
      try { n.osc.stop(); } catch (e) {}
      try { n.osc.disconnect(); } catch (e) {}
    });
    scheduledRef.current = [];
  }

  function playQuantized() {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtxRef.current;
    stopScheduledNotes();
    const q = quantizeEvents(preparePlayableMelody(notes, tempo || 120, resolution), tempo || 120, resolution, triplet, swing);
    if (q.length === 0) return;
    const start = ctx.currentTime + 0.2;
    q.forEach((ev) => {
      if (!ev.frequency) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = ev.frequency;
      const s = start + ev.qTime;
      const e = s + ev.qDur;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.065, s + 0.012);
      gain.gain.setValueAtTime(0.065, Math.max(s + 0.014, e - 0.035));
      gain.gain.exponentialRampToValueAtTime(0.0001, e);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(s);
      osc.stop(e);
      scheduledRef.current.push({ osc, s, e });
    });
    // set playing state until last note ends
    const last = q[q.length - 1];
    setPlaying(true);
    const stopAt = start + last.qTime + last.qDur + 0.1;
    playbackStartRef.current = { start, duration: Math.max(stopAt - start, 0.1), q };
    // animation loop to update cursor
    function frame() {
      const now = ctx.currentTime - start;
      drawPianoRoll(q, playbackStartRef.current.duration, now);
      if (now < playbackStartRef.current.duration) {
        animationRef.current = requestAnimationFrame(frame);
      }
    }
    animationRef.current = requestAnimationFrame(frame);
    setTimeout(() => {
      stopScheduledNotes();
      setPlaying(false);
      playbackStartRef.current = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }, (stopAt - ctx.currentTime) * 1000);
  }

  function exportQuantizedMusicXML() {
    const exportTempo = tempo || 120;
    const q = quantizeEvents(preparePlayableMelody(notes, exportTempo, 16), exportTempo, 16);
    if (!q || q.length === 0) return;
    const divisions = 480;
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n  <part-list>\n    <score-part id=\"P1\">\n      <part-name>Music</part-name>\n    </score-part>\n  </part-list>\n  <part id=\"P1\">\n    <measure number=\"1\">\n      <attributes>\n        <divisions>${divisions}</divisions>\n        <key>\n          <fifths>0</fifths>\n        </key>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n        <clef>\n          <sign>G</sign>\n          <line>2</line>\n        </clef>\n      </attributes>\n`;
    let body = '';
    q.forEach((cur) => {
      const durSeconds = cur.qDur;
      const quarters = durSeconds * (exportTempo / 60);
      const durationDivs = Math.max(1, Math.round(quarters * divisions));
      if (!cur.frequency) {
        body += `      <note>\n        <rest/>\n        <duration>${durationDivs}</duration>\n      </note>\n`;
      } else {
        const match = cur.note.match(/([A-G]#?)(-?\d+)/);
        const step = match ? match[1].replace('#', '') : 'C';
        const octave = match ? match[2] : '4';
        const alter = match && match[1].includes('#') ? 1 : 0;
        body += `      <note>\n        <pitch>\n          <step>${step}</step>\n          ${alter ? '<alter>1</alter>' : ''}\n          <octave>${octave}</octave>\n        </pitch>\n        <duration>${durationDivs}</duration>\n      </note>\n`;
      }
    });
    const footer = '    </measure>\n  </part>\n</score-partwise>';
    const xml = header + body + footer;
    setXmlPreview(xml);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription-quantized.musicxml';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMidiFile(sourceEvents, fileName, { quantized = false } = {}) {
    if (!sourceEvents || sourceEvents.length === 0) return;
    const exportTempo = tempo || 120;
    const divisions = 480;
    const bytes = [];
    function pushByte(b) { bytes.push(b & 0xff); }
    function pushBytes(arr) { arr.forEach((b) => pushByte(b)); }
    function pushString(s) { for (let i = 0; i < s.length; i++) pushByte(s.charCodeAt(i)); }

    pushString('MThd');
    pushBytes([0x00,0x00,0x00,0x06]);
    pushBytes([0x00,0x00]);
    pushBytes([0x00,0x01]);
    pushBytes([(divisions >> 8) & 0xff, divisions & 0xff]);

    const track = [];
    function tpush(b) { track.push(b & 0xff); }
    function tpushBytes(arr) { arr.forEach((b) => tpush(b)); }
    function tpushVarLen(v) {
      let buffer = v & 0x7f;
      while ((v >>= 7)) {
        buffer <<= 8;
        buffer |= ((v & 0x7f) | 0x80);
      }
      while (true) {
        tpush(buffer & 0xff);
        if (buffer & 0x80) buffer >>= 8; else break;
      }
    }

    const microPerQuarter = Math.round((60 / exportTempo) * 1000000);
    tpushVarLen(0);
    tpushBytes([0xff, 0x51, 0x03, (microPerQuarter >> 16) & 0xff, (microPerQuarter >> 8) & 0xff, microPerQuarter & 0xff]);

    const events = [];
    sourceEvents.forEach((ev) => {
      if (!ev.frequency) return;
      const midi = frequencyToMidiNumber(ev.frequency);
      const startSeconds = quantized ? ev.qTime : Number(ev.startTime ?? ev.time ?? 0);
      const fallbackDuration = Math.max(0.02, Number(ev.endTime ?? 0) - startSeconds) || 0.12;
      const durationSeconds = quantized ? ev.qDur : Number(ev.duration ?? fallbackDuration);
      const tick = Math.max(0, Math.round(startSeconds * divisions * (exportTempo / 60)));
      const durTicks = Math.max(1, Math.round(durationSeconds * divisions * (exportTempo / 60)));
      const velocity = Math.max(24, Math.min(127, Math.round(Number(ev.velocity ?? ((ev.confidence ?? 0.7) * 127)))));
      events.push({ tick, type: 'on', note: midi, vel: velocity });
      events.push({ tick: tick + durTicks, type: 'off', note: midi, vel: 64 });
    });
    events.sort((a,b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));

    let lastTick = 0;
    events.forEach((ev) => {
      const delta = ev.tick - lastTick;
      tpushVarLen(delta);
      if (ev.type === 'on') {
        tpushBytes([0x90, ev.note & 0xff, ev.vel & 0xff]);
      } else {
        tpushBytes([0x80, ev.note & 0xff, ev.vel & 0xff]);
      }
      lastTick = ev.tick;
    });

    // end of track
    tpushVarLen(0);
    tpushBytes([0xff, 0x2f, 0x00]);

    pushString('MTrk');
    const len = track.length;
    pushBytes([(len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    pushBytes(track);

    const arr = new Uint8Array(bytes);
    const blob = new Blob([arr], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportRawMIDI() {
    if (modelMidiBase64) {
      const binary = atob(modelMidiBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = modelMidiFileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    exportMidiFile(notes, 'transcription-model.mid');
  }

  function exportQuantizedMIDI() {
    const exportTempo = tempo || 120;
    const q = quantizeEvents(preparePlayableMelody(notes, exportTempo, resolution), exportTempo, resolution, triplet, swing);
    exportMidiFile(q, 'transcription-quantized.mid', { quantized: true });
  }

  function exportMusicXML() {
    if (notes.length === 0) return;
    const divisions = 480;
    const exportTempo = tempo || 120;
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n  <part-list>\n    <score-part id=\"P1\">\n      <part-name>Music</part-name>\n    </score-part>\n  </part-list>\n  <part id=\"P1\">\n    <measure number=\"1\">\n      <attributes>\n        <divisions>${divisions}</divisions>\n        <key>\n          <fifths>0</fifths>\n        </key>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n        <clef>\n          <sign>G</sign>\n          <line>2</line>\n        </clef>\n      </attributes>\n`;

    let body = '';
    for (let i = 0; i < notes.length; i += 1) {
      const cur = notes[i];
      const next = notes[i + 1];
      const dur = next ? Math.max(0.125, next.time - cur.time) : 0.5;
      // map duration to quarter lengths
      const quarters = Math.round(dur * (exportTempo / 60));
      const durationDivs = Math.max(1, Math.round(quarters * divisions));
      if (!cur.frequency) {
        body += `      <note>\n        <rest/>\n        <duration>${durationDivs}</duration>\n      </note>\n`;
      } else {
        const match = cur.note.match(/([A-G]#?)(-?\d+)/);
        const step = match ? match[1].replace('#', '') : 'C';
        const octave = match ? match[2] : '4';
        const alter = match && match[1].includes('#') ? 1 : 0;
        body += `      <note>\n        <pitch>\n          <step>${step}</step>\n          ${alter ? '<alter>1</alter>' : ''}\n          <octave>${octave}</octave>\n        </pitch>\n        <duration>${durationDivs}</duration>\n      </note>\n`;
      }
    }

    const footer = '    </measure>\n  </part>\n</score-partwise>';
    const xml = header + body + footer;
    setXmlPreview(xml);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcription.musicxml';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="transcription-lab">
      <div className="transcription-grid">
        <article className="transcription-main panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">{t('transcription.title', 'Transcription Lab')}</p>
            <h4>{t('transcription.subtitle', 'Upload a monophonic clip to extract onsets and notes')}</h4>
          </div>

          <div style={{ marginTop: 12 }}>
            <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} />
            <select onChange={(e) => loadSampleByValue(e.target.value)} defaultValue="" style={{ marginLeft: 8 }}>
              <option value="">{t('transcription.selectSample', 'Select sample')}</option>
              {sampleTracks.map((t) => (
                <option key={t.url} value={t.url}>{t.label}</option>
              ))}
            </select>
            <div className="transcription-player" style={{ marginTop: 10 }}>
              <div className="transcription-player__controls">
                <button className="button button--ghost" type="button" onClick={() => seekBy(-10)} disabled={!audioRef.current?.src}>{t('transcription.rewind', 'Rewind 10s')}</button>
                <button className="button button--primary" type="button" onClick={playBuffer} disabled={loading || playing || !audioRef.current?.src}>{t('transcription.play', 'Play')}</button>
                <button className="button button--ghost" type="button" onClick={stopPlayback} disabled={!playing && !audioRef.current?.src}>{t('transcription.stop', 'Stop')}</button>
                <button className="button button--ghost" type="button" onClick={() => seekBy(10)} disabled={!audioRef.current?.src}>{t('transcription.forward', 'Forward 10s')}</button>
              </div>
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                className="transcription-audio"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onLoadedMetadata={handleAudioLoadedMetadata}
                onTimeUpdate={handleAudioTimeUpdate}
              />
              <button className="button button--ghost" type="button" onClick={exportMusicXML} disabled={notes.length === 0}>{t('transcription.exportXml', 'Export MusicXML')}</button>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ color: 'var(--muted)' }}>{t('transcription.tempo', 'Tempo')}</label>
                <input
                  type="number"
                  placeholder="auto"
                  value={tempo ?? ''}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTempo(Number.isFinite(value) && value > 0 ? value : null);
                    setTempoSource(e.target.value ? 'Manual override' : 'Not estimated yet');
                  }}
                  style={{ width: 84 }}
                />
                <span style={{ color: 'var(--muted)' }}>{tempoSource}</span>
                <label style={{ color: 'var(--muted)' }}>Quantize grid</label>
                <select value={resolution} onChange={(e) => setResolution(Number(e.target.value))}>
                  <option value={4}>Quarter</option>
                  <option value={8}>Eighth</option>
                  <option value={16}>16th</option>
                  <option value={32}>32nd</option>
                </select>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={triplet} onChange={(e) => setTriplet(e.target.checked)} /> {t('transcription.triplet', 'Triplet')}
                </label>
                <label style={{ color: 'var(--muted)' }}>Swing</label>
                <input type="range" min="0" max="0.5" step="0.01" value={swing} onChange={(e) => setSwing(Number(e.target.value))} />
                <strong>{Math.round(swing * 100)}%</strong>
                <button className="button button--primary" type="button" onClick={playQuantized} disabled={notes.length === 0}>{t('transcription.playQuantized', 'Play quantized')}</button>
                <button className="button button--ghost" type="button" onClick={exportQuantizedMusicXML} disabled={notes.length === 0}>{t('transcription.exportQuantizedXml', 'Export quantized XML')}</button>
                <button className="button button--primary" type="button" onClick={exportRawMIDI} disabled={notes.length === 0}>Export model MIDI</button>
                <button className="button button--ghost" type="button" onClick={exportQuantizedMIDI} disabled={notes.length === 0}>Export quantized MIDI</button>
                <button className="button button--ghost" type="button" onClick={sendToComposer} disabled={notes.length === 0}>
                  {t('common.openComposer', 'Open in Composer')}
                </button>
                <button className="button button--ghost" type="button" onClick={sendToPractice} disabled={notes.length === 0}>
                  {t('common.openPractice', 'Open in Practice')}
                </button>
                <button className="button button--ghost" type="button" onClick={saveCurrentAnalysis} disabled={notes.length === 0}>
                  {t('common.saveAnalysis', 'Save analysis')}
                </button>
              </div>
            </div>
          </div>

          <AIAnalysisStream
            active={loading}
            title="Listening for notes and musical structure"
            model="librosa pYIN service with local pitch-worker fallback"
            progress={analysisProgress?.percent ?? null}
            status={analysisProgress?.status || ''}
            steps={[
              'Decode audio and build the waveform',
              'Estimate tempo and rhythmic pulse',
              'Track fundamental pitch frame by frame',
              'Group stable pitches into note events',
              'Infer key, range, and notation timing',
            ]}
            findings={transcriptionFindings}
          />

          <canvas ref={canvasRef} className="wave-canvas" style={{ marginTop: 16, width: '100%' }} />

          <div style={{ marginTop: 12 }}>
            <p className="eyebrow">{t('transcription.detected', 'Detected events')}</p>
            {analysisSummary?.warning ? <p className="analysis-summary analysis-summary--warning">{analysisSummary.warning}</p> : null}
            {analysisSummary ? (
              <div className="analysis-summary">
                <span>{`${analysisSummary.noteCount || notes.length} events`}</span>
                <span>{`Voiced ${(Math.round((analysisSummary.voicedRatio || 0) * 100))}%`}</span>
                <span>{`Confidence ${(Math.round((analysisSummary.averageConfidence || 0) * 100))}%`}</span>
                {analysisSummary.model ? <span>{analysisSummary.model}</span> : null}
                {analysisSummary.polyphonicGroups ? <span>{`Polyphony ${analysisSummary.polyphonicGroups}`}</span> : null}
                {analysisSummary.stableNoteCount != null && analysisSummary.traceNoteCount != null ? (
                  <span>{`Stable ${analysisSummary.stableNoteCount} · Trace ${analysisSummary.traceNoteCount}${analysisSummary.hybridNoteCount ? ` · Hybrid ${analysisSummary.hybridNoteCount}` : ''}${analysisSummary.onsetNoteCount != null ? ` · Attack ${analysisSummary.onsetNoteCount}` : ''}`}</span>
                ) : null}
              </div>
            ) : null}
            {melodicProfile ? (
              <div className="analysis-summary">
                <span>{`Estimated key ${melodicProfile.key}`}</span>
                <span>{`Fit ${Math.round(melodicProfile.confidence * 100)}%`}</span>
                <span>{`Range ${melodicProfile.range} semitones`}</span>
                <span>{`${melodicProfile.uniqueNotes} pitch classes`}</span>
              </div>
            ) : null}
            <div className="detected-list">
              {notes.length === 0 ? <p className="practice-note">{t('transcription.detectedEmpty', 'No events detected yet. Upload a short monophonic clip.')}</p> : null}
              <canvas ref={pianoRef} className="wave-canvas" style={{ width: '100%', marginTop: 8 }} />
              {notes.map((n, i) => (
                <div key={`${n.time ?? i}-${i}`} className="detected-item">
                  <strong>{n.kind === 'rest' ? 'Rest' : (n.note || 'Rest')}</strong>
                  <span>{`${Number(n.startTime ?? n.time ?? 0).toFixed(2)}s → ${Number(n.endTime ?? ((n.time ?? 0) + (n.duration ?? 0.2))).toFixed(2)}s`}</span>
                  <span>{`${Number(n.duration ?? Math.max(0.02, (Number(n.endTime ?? 0) - Number(n.startTime ?? n.time ?? 0)) || 0.2)).toFixed(2)}s${n.frequency ? ` · ${Number(n.frequency).toFixed(1)} Hz` : ''}`}</span>
                  <span>{n.confidence != null ? `${Math.round(n.confidence * 100)}%` : '—'}</span>
                </div>
              ))}
              {xmlPreview ? (
                <div style={{ marginTop: 12 }}>
                  <p className="eyebrow">{t('transcription.preview', 'MusicXML preview')}</p>
                  <textarea readOnly value={xmlPreview} style={{ width: '100%', height: 160 }} />
                </div>
              ) : null}
            </div>
          </div>
        </article>

        <aside className="transcription-side">
          <article className="panel">
            <div className="section-heading">
              <p className="eyebrow">Notes</p>
              <h4>Quick tips</h4>
            </div>
            <p className="practice-note">For best results use a clean monophonic recording (voice, whistle, or single instrument). Polyphonic audio will produce noisy or missing notes.</p>
            <p className="practice-note">This demo runs entirely in the browser; export produces a simple MusicXML file for quick inspection.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}
