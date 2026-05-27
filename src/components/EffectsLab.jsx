import { useEffect, useRef, useState } from 'react';
import { CATALOG, buildCatalog } from '../data/catalog';
import { useLocale } from '../i18n/LocaleProvider';

export function EffectsLab() {
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
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [audioKey, setAudioKey] = useState(0);

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const srcNodeRef = useRef(null);
  const attachedRef = useRef(false);
  const unlockedRef = useRef(false);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        try { ctxRef.current.close(); } catch (e) {}
      }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, []);

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

      nodesRef.current = { wetGain, dryGain, master, delay, fb, biquad, shaper, convolver };

      wetGain.connect(master);
      dryGain.connect(master);

      master.connect(Ctx.destination);

      const msDest = Ctx.createMediaStreamDestination();
      master.connect(msDest);
      nodesRef.current.mediaStream = msDest.stream;
    }
  }

  function setParams() {
    const n = nodesRef.current;
    if (!n || !n.wetGain) return;
    if (n.wetGain.gain) n.wetGain.gain.value = wet;
    if (n.dryGain.gain) n.dryGain.gain.value = 1 - wet;
    if (n.delay && n.delay.delayTime) n.delay.delayTime.value = delayTime;
    if (n.fb && n.fb.gain) n.fb.gain.value = feedback;
    if (n.biquad) n.biquad.frequency.value = cutoff;
    if (n.shaper) n.shaper.curve = makeDistortionCurve(distortion * 400);
    if (n.convolver) n.convolver.buffer = makeReverbBuffer(ctxRef.current, reverbSize);
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

    // route: src -> biquad -> shaper -> convolver -> wetGain
    srcNodeRef.current.connect(n.biquad);
    n.biquad.connect(n.shaper);
    n.shaper.connect(n.convolver);
    n.convolver.connect(n.wetGain);
    // dry path
    n.biquad.connect(n.dryGain);
    // delay path
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
      attachedRef.current = false;
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

  function makeReverbBuffer(ctx, seconds = 2.5) {
    if (!ctx) return null;
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const arr = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) arr[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buffer;
  }

  useEffect(() => setParams(), [wet, delayTime, feedback, cutoff, distortion, reverbSize]);

  return (
    <section className="effects-lab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">Audio Effects</p>
          <h4>Apply realtime effects and record processed audio</h4>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="file" accept="audio/*" onChange={handleFileInput} />
          <select onChange={(e) => pickCatalog(Number(e.target.value))} defaultValue="">
            <option value="">Select sample from catalog</option>
            {CATALOG.map((t, i) => (<option key={t.title + i} value={i}>{t.title} — {t.artist}</option>))}
          </select>
          <button className="btn" onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
          {!isRecording && <button className="btn" onClick={startRecording}>Record</button>}
          {isRecording && <button className="btn" onClick={stopRecording}>Stop</button>}
          {downloadUrl && <a className="btn" href={downloadUrl} download="processed.webm">Download</a>}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div>
            <label className="form-label">Wet/Dry</label>
            <input type="range" min={0} max={1} step={0.01} value={wet} onChange={(e) => setWet(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Lowpass cutoff ({Math.round(cutoff)} Hz)</label>
            <input type="range" min={200} max={10000} step={1} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Delay time ({delayTime}s)</label>
            <input type="range" min={0} max={2} step={0.01} value={delayTime} onChange={(e) => setDelayTime(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Feedback ({Math.round(feedback * 100)}%)</label>
            <input type="range" min={0} max={0.95} step={0.01} value={feedback} onChange={(e) => setFeedback(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Distortion ({Math.round(distortion * 100)}%)</label>
            <input type="range" min={0} max={1} step={0.01} value={distortion} onChange={(e) => setDistortion(Number(e.target.value))} />
          </div>

          <div>
            <label className="form-label">Reverb size ({reverbSize}s)</label>
            <input type="range" min={0.2} max={6} step={0.1} value={reverbSize} onChange={(e) => setReverbSize(Number(e.target.value))} />
          </div>
        </div>

        <p style={{ marginTop: 10, color: 'var(--muted)' }}>Note: Recording saves processed output as a webm. Use the download button after stopping.</p>
      </div>
    </section>
  );
}
