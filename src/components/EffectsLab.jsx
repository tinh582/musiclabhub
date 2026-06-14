import { useEffect, useRef, useState } from 'react';
import { CATALOG, buildCatalog } from '../data/catalog';
import { useLocale } from '../i18n/LocaleProvider';
import { useAudioFeatures } from '../hooks/useAudioFeatures';
import { equalPowerMix, processingHeadroom, PROCESSING_QUALITY, qualityConfig } from '../utils/audioProcessing';
import { AIAnalysisStream } from './AIAnalysisStream';

export function EffectsLab({ workspaceAudio = null, saveAnalysis = null, moduleHandoff = null, clearModuleHandoff = null }) {
  const { t } = useLocale();
  const localizedCatalog = buildCatalog(t);
  const [fileUrl, setFileUrl] = useState((localizedCatalog && localizedCatalog[0] && localizedCatalog[0].audioUrl) || '/audio/sample1.mp3');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [wet, setWet] = useState(0.5);
  const [delayTime, setDelayTime] = useState(0.25);
  const [feedback, setFeedback] = useState(0.3);
  const [cutoff, setCutoff] = useState(1200);
  const [distortion, setDistortion] = useState(0);
  const [reverbSize, setReverbSize] = useState(2.5);
  const [quality, setQuality] = useState('balanced');
  const [outputLevel, setOutputLevel] = useState(0.92);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [audioKey, setAudioKey] = useState(0);
  const { data: analysis, loading: analysisLoading } = useAudioFeatures(fileUrl);

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const srcNodeRef = useRef(null);
  const attachedRef = useRef(false);
  const unlockedRef = useRef(false);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const reverbSignatureRef = useRef('');

  useEffect(() => {
    return () => {
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        try { ctxRef.current.close(); } catch (e) {}
      }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, []);

  useEffect(() => {
    if (!workspaceAudio?.url) return;
    setFileUrl(workspaceAudio.url);
    setIsPlaying(false);
    setAudioError(null);
  }, [workspaceAudio]);

  useEffect(() => {
    if (moduleHandoff?.type !== 'restore-analysis' || moduleHandoff.payload?.slug !== 'effects') return;
    const snapshot = moduleHandoff.payload.snapshot || {};
    if (snapshot.fileUrl && !snapshot.fileUrl.startsWith('blob:')) setFileUrl(snapshot.fileUrl);
    if (Number.isFinite(snapshot.wet)) setWet(snapshot.wet);
    if (Number.isFinite(snapshot.delayTime)) setDelayTime(snapshot.delayTime);
    if (Number.isFinite(snapshot.feedback)) setFeedback(snapshot.feedback);
    if (Number.isFinite(snapshot.cutoff)) setCutoff(snapshot.cutoff);
    if (Number.isFinite(snapshot.distortion)) setDistortion(snapshot.distortion);
    if (Number.isFinite(snapshot.reverbSize)) setReverbSize(snapshot.reverbSize);
    if (snapshot.quality && PROCESSING_QUALITY[snapshot.quality]) setQuality(snapshot.quality);
    if (Number.isFinite(snapshot.outputLevel)) setOutputLevel(snapshot.outputLevel);
    clearModuleHandoff?.();
  }, [moduleHandoff, clearModuleHandoff]);

  function ensureAudioContext() {
    if (ctxRef.current && ctxRef.current.state === 'closed') {
      ctxRef.current = null;
      srcNodeRef.current = null;
      attachedRef.current = false;
      nodesRef.current = null;
    }
    if (!ctxRef.current) {
      const Ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = Ctx;

      const wetGain = Ctx.createGain();
      const dryGain = Ctx.createGain();
      const master = Ctx.createGain();
      const compressor = Ctx.createDynamicsCompressor();
      const output = Ctx.createGain();

      const delay = Ctx.createDelay(5.0);
      const fb = Ctx.createGain();
      fb.gain.value = feedback;
      delay.connect(fb);
      fb.connect(delay);

      const biquad = Ctx.createBiquadFilter();
      biquad.type = 'lowpass';
      biquad.frequency.value = cutoff;

      const shaper = Ctx.createWaveShaper();
      const convolver = Ctx.createConvolver();
      compressor.threshold.value = -6;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      nodesRef.current = { wetGain, dryGain, master, compressor, output, delay, fb, biquad, shaper, convolver };

      wetGain.connect(master);
      dryGain.connect(master);
      master.connect(compressor);
      compressor.connect(output);
      output.connect(Ctx.destination);

      const msDest = Ctx.createMediaStreamDestination();
      output.connect(msDest);
      nodesRef.current.mediaStream = msDest.stream;
    }
  }

  function setParams() {
    const n = nodesRef.current;
    if (!n || !n.wetGain) return;
    const config = qualityConfig(quality);
    const now = ctxRef.current.currentTime;
    const mix = equalPowerMix(wet);
    const smooth = (param, value) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, config.smoothingSeconds);
    };
    smooth(n.wetGain.gain, mix.wet);
    smooth(n.dryGain.gain, mix.dry);
    smooth(n.delay.delayTime, delayTime);
    smooth(n.fb.gain, Math.min(0.82, feedback));
    smooth(n.biquad.frequency, cutoff);
    smooth(n.output.gain, Math.min(outputLevel, processingHeadroom(distortion, feedback)));
    n.shaper.curve = distortion > 0.001 ? makeDistortionCurve(distortion * 400) : null;
    n.shaper.oversample = config.oversample;

    const reverbSignature = `${quality}-${reverbSize.toFixed(1)}`;
    if (reverbSignatureRef.current !== reverbSignature) {
      n.convolver.buffer = makeReverbBuffer(ctxRef.current, reverbSize, config);
      reverbSignatureRef.current = reverbSignature;
    }
  }

  function ensureUnlocked() {
    ensureAudioContext();
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    unlockedRef.current = true;
  }

  function handleFileInput(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.volume = 1;
    }
    setIsPlaying(false);
    setAudioError(null);
  }

  function pickCatalog(i) {
    const t = (localizedCatalog && localizedCatalog[i]) || CATALOG[i];
    if (t && t.audioUrl) {
      setFileUrl(t.audioUrl);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = t.audioUrl;
        audioRef.current.load();
        audioRef.current.volume = 1;
      }
      setIsPlaying(false);
      setAudioError(null);
    }
  }

  function attachSource() {
    ensureAudioContext();
    const Ctx = ctxRef.current;
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const n = nodesRef.current;
    if (!n) return;
    if (srcNodeRef.current && srcNodeRef.current.context !== Ctx) {
      srcNodeRef.current = null;
      attachedRef.current = false;
      nodesRef.current = null;
      ensureAudioContext();
    }
    if (attachedRef.current) {
      setParams();
      return;
    }

    if (!srcNodeRef.current) {
      try {
        srcNodeRef.current = Ctx.createMediaElementSource(audioEl);
      } catch (e) {
        setAudioError('Audio element was already connected. Reload the page once.');
        return;
      }
    }

    // Dry stays untouched; effects are isolated on the wet path.
    srcNodeRef.current.connect(n.dryGain);
    srcNodeRef.current.connect(n.biquad);
    n.biquad.connect(n.shaper);
    n.shaper.connect(n.convolver);
    n.convolver.connect(n.wetGain);
    // Parallel delay feeds the wet bus.
    n.biquad.connect(n.delay);
    n.delay.connect(n.wetGain);

    attachedRef.current = true;
    setParams();
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src && fileUrl) {
      audio.src = fileUrl;
      audio.load();
    }
    if (audio.readyState < 2) audio.load();
    ensureUnlocked();
    attachSource();
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        audio.muted = false;
        audio.volume = 1;
        await audio.play();
        setIsPlaying(true);
        setAudioError(null);
      } catch (e) {
        setIsPlaying(false);
        setAudioError('Playback failed. Click the native play button or choose another sample.');
      }
    }
  }

  useEffect(() => {
    if (audioRef.current && fileUrl) {
      audioRef.current.load();
      setIsPlaying(false);
      setAudioError(null);
    }
  }, [fileUrl]);

  useEffect(() => {
    srcNodeRef.current = null;
    attachedRef.current = false;
  }, [audioKey]);

  useEffect(() => {
    function unlockFromGesture() {
      if (unlockedRef.current) return;
      ensureUnlocked();
      attachSource();
    }
    window.addEventListener('pointerdown', unlockFromGesture, { passive: true });
    return () => window.removeEventListener('pointerdown', unlockFromGesture);
  }, []);

  function startRecording() {
    if (!nodesRef.current || !nodesRef.current.mediaStream) return;
    recordedChunksRef.current = [];
    const stream = nodesRef.current.mediaStream;
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    };
    recorderRef.current = mr;
    mr.start();
    setIsRecording(true);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setIsRecording(false);
  }

  function applySmartSettings() {
    if (!analysis) return;
    const brightness = Math.min(1, analysis.spectralCentroid / 4500);
    const noisy = Math.min(1, analysis.spectralFlatness * 2.5);
    const compressed = Math.min(1, Math.max(0, (8 - analysis.dynamicRangeDb) / 8));
    setCutoff(Math.round(1800 + brightness * 7200));
    setWet(Math.max(0.12, Math.min(0.58, 0.2 + (1 - noisy) * 0.24)));
    setDelayTime(analysis.tempo ? Math.max(0.12, Math.min(0.6, 30 / analysis.tempo)) : 0.25);
    setFeedback(Math.max(0.12, Math.min(0.48, 0.18 + (1 - compressed) * 0.18)));
    setDistortion(Math.max(0, Math.min(0.22, noisy * 0.08)));
    setReverbSize(Math.max(0.8, Math.min(4.5, 1.2 + analysis.dynamicRangeDb / 8)));
  }

  function saveCurrentAnalysis() {
    if (!analysis || !saveAnalysis) return;
    saveAnalysis({
      module: 'Effects',
      slug: 'effects',
      title: `${analysis.estimatedKey} smart effects profile`,
      source: workspaceAudio?.name || 'Effects audio',
      metrics: [
        { label: 'Key', value: analysis.estimatedKey },
        { label: 'Quality', value: qualityConfig(quality).label },
        { label: 'Wet', value: `${Math.round(wet * 100)}%` },
        { label: 'Output', value: `${Math.round(Math.min(outputLevel, processingHeadroom(distortion, feedback)) * 100)}%` },
      ],
      snapshot: {
        fileUrl: fileUrl.startsWith('blob:') ? '' : fileUrl,
        wet,
        delayTime,
        feedback,
        cutoff,
        distortion,
        reverbSize,
        quality,
        outputLevel,
      },
    });
  }

  // helpers
  function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function makeReverbBuffer(ctx, seconds = 2.5, config = qualityConfig('balanced')) {
    if (!ctx) return null;
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buffer = ctx.createBuffer(config.impulseChannels, len, rate);
    for (let ch = 0; ch < config.impulseChannels; ch++) {
      const arr = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const noise = Math.random() <= config.impulseDensity ? Math.random() * 2 - 1 : 0;
        arr[i] = noise * Math.pow(1 - i / len, 3);
      }
    }
    return buffer;
  }

  useEffect(() => setParams(), [wet, delayTime, feedback, cutoff, distortion, reverbSize, quality, outputLevel]);

  return (
    <section className="effects-lab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">Audio Effects</p>
          <h4>Apply realtime effects and record processed audio</h4>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="sr-only" htmlFor="effects-file">Upload audio for effects</label>
          <input id="effects-file" type="file" accept="audio/*" onChange={handleFileInput} />
          <select aria-label="Select catalog sample" onChange={(e) => pickCatalog(Number(e.target.value))} defaultValue="">
            <option value="">Select sample from catalog</option>
            {CATALOG.map((t, i) => (<option key={t.title + i} value={i}>{t.title} — {t.artist}</option>))}
          </select>
          <button className="btn" onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
          {!isRecording && <button className="btn" onClick={startRecording}>Record</button>}
          {isRecording && <button className="btn" onClick={stopRecording}>Stop</button>}
          {downloadUrl && <a className="btn" href={downloadUrl} download="processed.webm">Download</a>}
          <button className="btn" onClick={applySmartSettings} disabled={!analysis || analysisLoading}>
            {analysisLoading ? 'Analyzing...' : 'Smart settings'}
          </button>
          <button className="btn" onClick={saveCurrentAnalysis} disabled={!analysis}>Save analysis</button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <audio
          key={audioKey}
          ref={audioRef}
          controls
          crossOrigin="anonymous"
          preload="auto"
          src={fileUrl}
          style={{ width: '100%' }}
          onPointerDown={() => { ensureUnlocked(); attachSource(); }}
          onPlay={() => {
            ensureUnlocked();
            attachSource();
            if (audioRef.current) {
              audioRef.current.muted = false;
              audioRef.current.volume = 1;
            }
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onError={() => setAudioError('Audio failed to load. Check the sample URL or file.')} 
        />
        {audioError ? <p style={{ marginTop: 8, color: 'var(--coral)' }}>{audioError}</p> : null}
        <AIAnalysisStream
          active={analysisLoading}
          title="Designing an intelligent effects profile"
          model="Spectral, dynamic, rhythm, and harmonic feature engine"
          steps={[
            'Decode and inspect signal quality',
            'Measure brightness, noisiness, and dynamics',
            'Estimate tempo, key, and chord movement',
            'Calculate effect-safe gain and timing',
            'Prepare adaptive effect recommendations',
          ]}
          findings={analysis ? [
            { label: 'Tonal center', value: analysis.estimatedKey },
            { label: 'Signal texture', value: analysis.spectralFlatness > 0.22 ? 'Noisy' : 'Tonal' },
            { label: 'Dynamic range', value: `${analysis.dynamicRangeDb.toFixed(1)} dB` },
            { label: 'Suggested profile', value: `${qualityConfig(quality).label} · ${Math.round(wet * 100)}% wet` },
          ] : []}
        />
        {analysis ? (
          <div className="profile-strip" style={{ marginTop: 12 }}>
            <article className="profile-card"><p>Estimated key</p><strong>{analysis.estimatedKey}</strong></article>
            <article className="profile-card"><p>Tempo</p><strong>{analysis.tempo ? `${analysis.tempo} BPM` : 'n/a'}</strong></article>
            <article className="profile-card"><p>Brightness</p><strong>{Math.round(analysis.spectralCentroid)} Hz</strong></article>
            <article className="profile-card"><p>Dynamic range</p><strong>{analysis.dynamicRangeDb.toFixed(1)} dB</strong></article>
            <article className="profile-card"><p>Noisiness</p><strong>{Math.round(analysis.spectralFlatness * 100)}%</strong></article>
            <article className="profile-card"><p>Processing</p><strong>{qualityConfig(quality).label}</strong></article>
            <article className="profile-card"><p>Headroom</p><strong>{Math.round(Math.min(outputLevel, processingHeadroom(distortion, feedback)) * 100)}%</strong></article>
          </div>
        ) : null}
        {analysis?.chordTimeline?.length ? (
          <div className="harmony-strip">
            <p className="eyebrow">Detected chords</p>
            <div className="harmony-strip__timeline">
              {analysis.chordTimeline.slice(0, 16).map((entry) => (
                <span key={`${entry.time}-${entry.chord}`} title={`${entry.time.toFixed(1)}s · ${Math.round(entry.confidence * 100)}% match`}>
                  <strong>{entry.chord}</strong>
                  <small>{entry.time.toFixed(1)}s</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="slider-card">
            <span>Processing quality</span>
            <select aria-label="Processing quality" value={quality} onChange={(event) => setQuality(event.target.value)}>
              {Object.entries(PROCESSING_QUALITY).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
          </label>

          <div>
            <label className="form-label">Output level ({Math.round(outputLevel * 100)}%)</label>
            <input aria-label="Output level" aria-valuetext={`${Math.round(outputLevel * 100)} percent`} type="range" min={0.5} max={1} step={0.01} value={outputLevel} onChange={(e) => setOutputLevel(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Wet/Dry</label>
            <input aria-label="Wet dry mix" aria-valuetext={`${Math.round(wet * 100)} percent wet`} type="range" min={0} max={1} step={0.01} value={wet} onChange={(e) => setWet(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Lowpass cutoff ({Math.round(cutoff)} Hz)</label>
            <input aria-label="Lowpass cutoff" aria-valuetext={`${Math.round(cutoff)} hertz`} type="range" min={200} max={10000} step={1} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Delay time ({delayTime}s)</label>
            <input aria-label="Delay time" aria-valuetext={`${delayTime} seconds`} type="range" min={0} max={2} step={0.01} value={delayTime} onChange={(e) => setDelayTime(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Feedback ({Math.round(feedback * 100)}%)</label>
            <input aria-label="Delay feedback" aria-valuetext={`${Math.round(feedback * 100)} percent`} type="range" min={0} max={0.95} step={0.01} value={feedback} onChange={(e) => setFeedback(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Distortion ({Math.round(distortion * 100)}%)</label>
            <input aria-label="Distortion amount" aria-valuetext={`${Math.round(distortion * 100)} percent`} type="range" min={0} max={1} step={0.01} value={distortion} onChange={(e) => setDistortion(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Reverb size ({reverbSize}s)</label>
            <input aria-label="Reverb size" aria-valuetext={`${reverbSize} seconds`} type="range" min={0.2} max={6} step={0.1} value={reverbSize} onChange={(e) => setReverbSize(Number(e.target.value))} />
          </div>
        </div>

        <p className="practice-note" style={{ marginTop: 10 }}>
          {quality === 'studio'
            ? 'Studio uses stereo reverb and 4x distortion oversampling. It sounds cleaner but uses more CPU.'
            : quality === 'economy'
              ? 'Economy reduces convolution density and oversampling for slower devices.'
              : 'Balanced uses stereo reverb and moderate oversampling for everyday playback.'}
        </p>
        <p style={{ marginTop: 10, color: 'var(--muted)' }}>Recording captures the protected processed output as WebM.</p>
      </div>
    </section>
  );
}
