import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function VisualizationsLab() {
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const spectroXRef = useRef(0);
  const objectUrlRef = useRef(null);

  const oscRef = useRef(null);
  const spectrumRef = useRef(null);
  const spectrogramRef = useRef(null);

  const [audioUrlInput, setAudioUrlInput] = useState('');
  const [loadedLabel, setLoadedLabel] = useState('No audio loaded');
  const [playing, setPlaying] = useState(false);
  const [peak, setPeak] = useState(0);
  const [vu, setVu] = useState(0);
  const [fftSize, setFftSize] = useState(2048);
  const [smoothing, setSmoothing] = useState(0.82);
  const [minDb, setMinDb] = useState(-90);
  const [maxDb, setMaxDb] = useState(-10);
  const [oscZoom, setOscZoom] = useState(0.36);
  const [oscLineWidth, setOscLineWidth] = useState(2);
  const [spectrumBars, setSpectrumBars] = useState(90);
  const [spectrumFloor, setSpectrumFloor] = useState(0.06);
  const [spectroSpeed, setSpectroSpeed] = useState(1);
  const [spectroDecay, setSpectroDecay] = useState(0.03);
  const [spectroContrast, setSpectroContrast] = useState(1);

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
    const analyser = analyserRef.current;
    if (!analyser) return;
    const safeMin = Math.min(minDb, maxDb - 1);
    const safeMax = Math.max(maxDb, safeMin + 1);
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;
    analyser.minDecibels = safeMin;
    analyser.maxDecibels = safeMax;
  }, [fftSize, smoothing, minDb, maxDb]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    if (loadedLabel === 'No audio loaded') {
      loadObjectUrl(sampleTracks[0].url, sampleTracks[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { t } = useLocale();

  function ensureAudioGraph() {
    const audio = audioRef.current;
    if (!audio) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!analyserRef.current) {
      const analyser = audioCtxRef.current.createAnalyser();
      const safeMin = Math.min(minDb, maxDb - 1);
      const safeMax = Math.max(maxDb, safeMin + 1);
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothing;
      analyser.minDecibels = safeMin;
      analyser.maxDecibels = safeMax;
      analyserRef.current = analyser;
    }
    if (!sourceRef.current) {
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    return analyserRef.current;
  }

  function fitCanvas(canvasRef, heightPx) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(canvas.clientWidth * dpr));
    const height = Math.floor(heightPx * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    return { canvas, ctx, width, height, dpr };
  }

  function drawOscilloscope(timeData) {
    const info = fitCanvas(oscRef, 140);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(110,240,209,0.92)';
    ctx.lineWidth = oscLineWidth;
    ctx.beginPath();
    const slice = width / timeData.length;
    for (let i = 0; i < timeData.length; i += 1) {
      const v = (timeData[i] - 128) / 128;
      const x = i * slice;
      const y = (height / 2) + v * (height * oscZoom);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawSpectrum(freqData) {
    const info = fitCanvas(spectrumRef, 140);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, width, height);

    const bars = spectrumBars;
    const step = Math.max(1, Math.floor(freqData.length / bars));
    const barW = width / bars;

    for (let i = 0; i < bars; i += 1) {
      const idx = i * step;
      const raw = freqData[idx] / 255;
      const v = clamp((raw - spectrumFloor) / (1 - spectrumFloor), 0, 1);
      const h = Math.max(1, v * height);
      ctx.fillStyle = `rgba(134,183,255,${0.3 + v * 0.7})`;
      ctx.fillRect(i * barW, height - h, barW * 0.82, h);
    }
  }

  function drawSpectrogram(freqData) {
    const info = fitCanvas(spectrogramRef, 180);
    if (!info) return;
    const { ctx, width, height } = info;

    const speed = Math.max(1, Math.floor(spectroSpeed));
    const x = spectroXRef.current % width;
    for (let y = 0; y < height; y += 1) {
      const bin = Math.floor((y / height) * (freqData.length - 1));
      const raw = freqData[bin] / 255;
      const v = clamp(raw * spectroContrast, 0, 1);
      const hue = Math.floor((1 - v) * 240);
      const light = Math.floor(16 + v * 62);
      ctx.fillStyle = `hsl(${hue}, 90%, ${light}%)`;
      ctx.fillRect(x, height - y, speed, 1);
    }
    spectroXRef.current += speed;

    // soft trail fade
    ctx.fillStyle = `rgba(7,16,25,${clamp(spectroDecay, 0.005, 0.2)})`;
    ctx.fillRect(0, 0, width, height);
  }

  function tick() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const timeData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    // Peak and VU from time-domain samples
    let peakVal = 0;
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const normalized = (timeData[i] - 128) / 128;
      const abs = Math.abs(normalized);
      if (abs > peakVal) peakVal = abs;
      sumSq += normalized * normalized;
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    setPeak((prev) => Math.max(peakVal, prev * 0.94));
    setVu((prev) => (prev * 0.75) + (rms * 0.25));

    drawOscilloscope(timeData);
    drawSpectrum(freqData);
    drawSpectrogram(freqData);

    rafRef.current = requestAnimationFrame(tick);
  }

  async function startPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    const analyser = ensureAudioGraph();
    if (!analyser) return;

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    try {
      await audio.play();
      setPlaying(true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error(err);
    }
  }

  function pausePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function handleEnded() {
    setPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function loadObjectUrl(url, label) {
    const audio = audioRef.current;
    if (!audio) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    objectUrlRef.current = url.startsWith('blob:') ? url : null;
    audio.src = url;
    audio.load();
    setLoadedLabel(label);
    setPeak(0);
    setVu(0);
    spectroXRef.current = 0;
    const spec = fitCanvas(spectrogramRef, 180);
    if (spec) spec.ctx.clearRect(0, 0, spec.width, spec.height);
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadObjectUrl(url, file.name);
  }

  function loadRemoteUrl() {
    const trimmed = audioUrlInput.trim();
    if (!trimmed) return;
    loadObjectUrl(trimmed, 'URL source');
  }

  function loadSampleByValue(value) {
    const track = sampleTracks.find((t) => t.url === value);
    if (!track) return;
    loadObjectUrl(track.url, track.label);
  }

  const peakPct = clamp(Math.round(peak * 100), 0, 100);
  const vuPct = clamp(Math.round(vu * 100), 0, 100);
  const ballScale = (1 + peak * 0.28).toFixed(3);
  const ballGlow = (0.22 + vu * 0.85).toFixed(3);

  return (
    <section className="visualizations-lab">
      <div className="visualizations-grid">
        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">{t('viz.title', 'Visualizations Lab')}</p>
            <h4>{t('viz.subtitle', 'Analyze one selected/uploaded song with live audio visual outputs.')}</h4>
          </div>

          <div className="viz-controls">
            <input type="file" accept="audio/*" onChange={handleFileUpload} />
            <select onChange={(e) => loadSampleByValue(e.target.value)} defaultValue="">
              <option value="">{t('viz.selectSample', 'Select sample')}</option>
              {sampleTracks.map((t) => (
                <option key={t.url} value={t.url}>{t.label}</option>
              ))}
            </select>
            <div className="viz-url-row">
              <input
                type="text"
                placeholder={t('viz.urlPlaceholder', 'Or paste an audio URL')}
                value={audioUrlInput}
                onChange={(e) => setAudioUrlInput(e.target.value)}
              />
              <button type="button" className="button button--ghost" onClick={loadRemoteUrl}>{t('viz.loadUrl', 'Load URL')}</button>
            </div>
            <audio ref={audioRef} onEnded={handleEnded} controls style={{ width: '100%' }} />
            <div className="viz-actions">
              <button type="button" className="button button--primary" onClick={startPlayback}>
                {playing ? t('viz.resume', 'Resume') : t('viz.play', 'Play')}
              </button>
              <button type="button" className="button button--ghost" onClick={pausePlayback}>{t('viz.pause', 'Pause')}</button>
              <button type="button" className="button button--ghost" onClick={stopPlayback}>{t('viz.stop', 'Stop')}</button>
            </div>
            <p className="practice-note">{t('viz.loaded', 'Loaded')}: {loadedLabel}</p>
          </div>

          <div
            className="viz-center"
            aria-hidden="true"
            style={{
              '--ball-scale': ballScale,
              '--ball-glow': ballGlow,
            }}
          >
            <div className={`viz-orb ${playing ? 'viz-orb--playing' : ''}`}>
              <div className="viz-orb__halo viz-orb__halo--outer" />
              <div className="viz-orb__halo viz-orb__halo--inner" />
              <div className="viz-orb__ring viz-orb__ring--back" />
              <div className="viz-orb__ring viz-orb__ring--front" />
              <div className="viz-orb__core">
                <span className="viz-orb__glass" />
                <span className="viz-orb__shine" />
              </div>
              <div className="viz-orb__ticks">
                {Array.from({ length: 32 }).map((_, index) => (
                  <span key={index} style={{ '--tick-index': index }} />
                ))}
              </div>
              <div className="viz-orb__meter">
                <span>{vuPct}%</span>
              </div>
            </div>
          </div>

          <div className="viz-panel-grid">
            <article className="viz-card">
              <p className="eyebrow">{t('viz.oscilloscope', 'Oscilloscope')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.zoom', 'Zoom')}</span>
                <input type="range" min="0.2" max="0.48" step="0.01" value={oscZoom} onChange={(e) => setOscZoom(Number(e.target.value))} />
                <strong>{oscZoom.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.line', 'Line')}</span>
                <input type="range" min="1" max="4" step="0.5" value={oscLineWidth} onChange={(e) => setOscLineWidth(Number(e.target.value))} />
                <strong>{oscLineWidth.toFixed(1)}</strong>
              </div>
              <canvas ref={oscRef} className="viz-canvas" />
            </article>
            <article className="viz-card">
              <p className="eyebrow">{t('viz.spectrum', 'Spectrum')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.bars', 'Bars')}</span>
                <input type="range" min="24" max="180" step="2" value={spectrumBars} onChange={(e) => setSpectrumBars(Number(e.target.value))} />
                <strong>{spectrumBars}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.floor', 'Floor')}</span>
                <input type="range" min="0" max="0.35" step="0.01" value={spectrumFloor} onChange={(e) => setSpectrumFloor(Number(e.target.value))} />
                <strong>{spectrumFloor.toFixed(2)}</strong>
              </div>
              <canvas ref={spectrumRef} className="viz-canvas" />
            </article>
            <article className="viz-card">
              <p className="eyebrow">{t('viz.spectrogram', 'Spectrogram')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.speed', 'Speed')}</span>
                <input type="range" min="1" max="4" step="1" value={spectroSpeed} onChange={(e) => setSpectroSpeed(Number(e.target.value))} />
                <strong>{spectroSpeed}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.decay', 'Decay')}</span>
                <input type="range" min="0.005" max="0.12" step="0.005" value={spectroDecay} onChange={(e) => setSpectroDecay(Number(e.target.value))} />
                <strong>{spectroDecay.toFixed(3)}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.contrast', 'Contrast')}</span>
                <input type="range" min="0.6" max="2.2" step="0.05" value={spectroContrast} onChange={(e) => setSpectroContrast(Number(e.target.value))} />
                <strong>{spectroContrast.toFixed(2)}</strong>
              </div>
              <canvas ref={spectrogramRef} className="viz-canvas viz-canvas--tall" />
            </article>
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <p className="eyebrow">{t('viz.meters', 'Meters')}</p>
            <h4>{t('viz.meter.subtitle', 'Realtime level feedback')}</h4>
          </div>

          <div className="meter-block" style={{ marginTop: 14 }}>
            <p className="eyebrow">Analyzer controls</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.fft', 'FFT')}</span>
                <input
                  type="range"
                  min="9"
                  max="13"
                  step="1"
                  value={Math.log2(fftSize)}
                  onChange={(e) => setFftSize(2 ** Number(e.target.value))}
                />
                <strong>{fftSize}</strong>
              </label>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.smooth', 'Smooth')}</span>
                <input type="range" min="0" max="0.98" step="0.01" value={smoothing} onChange={(e) => setSmoothing(Number(e.target.value))} />
                <strong>{smoothing.toFixed(2)}</strong>
              </label>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.minDb', 'Min dB')}</span>
                <input type="range" min="-120" max="-40" step="1" value={minDb} onChange={(e) => setMinDb(Number(e.target.value))} />
                <strong>{minDb}</strong>
              </label>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>{t('viz.maxDb', 'Max dB')}</span>
                <input type="range" min="-60" max="0" step="1" value={maxDb} onChange={(e) => setMaxDb(Number(e.target.value))} />
                <strong>{maxDb}</strong>
              </label>
            </div>
          </div>

          <div className="meter-block" style={{ marginTop: 14 }}>
            <p className="eyebrow">Peak Meter</p>
            <div className="meter-track">
              <div className="meter-fill meter-fill--peak" style={{ width: `${peakPct}%` }} />
            </div>
            <strong>{peakPct}%</strong>
          </div>

          <div className="meter-block" style={{ marginTop: 16 }}>
            <p className="eyebrow">VU Meter (RMS)</p>
            <div className="meter-track">
              <div className="meter-fill meter-fill--vu" style={{ width: `${vuPct}%` }} />
            </div>
            <strong>{vuPct}%</strong>
          </div>

          <p className="practice-note" style={{ marginTop: 16 }}>
            {t('viz.tip', 'Tip: Use clean songs with clear dynamics for better meter and spectrogram detail.')}
          </p>
        </aside>
      </div>
    </section>
  );
}
