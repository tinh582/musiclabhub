import { useMemo, useState, useRef, useEffect } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { CATALOG, buildCatalog } from '../data/catalog';
import { useAudioFeatures } from '../hooks/useAudioFeatures';
import { formatDuration } from '../utils/audioFeatures';

export function ClassificationLab() {
  const { t } = useLocale();
  const localizedCatalog = buildCatalog(t);
  const [selectedId, setSelectedId] = useState(localizedCatalog[0].id);
  const [playing, setPlaying] = useState(false);
  const [trainProgress, setTrainProgress] = useState(0);
  const [probs, setProbs] = useState([]);
  const modelRef = useRef(null);
  const tfRef = useRef(null); // will hold imported tf module
  const audioRef = useRef(null);
  const [usePretrained, setUsePretrained] = useState(false);
  const [modelUrl, setModelUrl] = useState('');
  const [loadingModel, setLoadingModel] = useState(false);
  const catalog = localizedCatalog || CATALOG;

  const features = useMemo(
    () => catalog.map((c) => [c.energy, c.valence, c.danceability, c.tempo / 140, c.popularity / 100, c.collaborative]),
    [catalog],
  );

  const genres = useMemo(() => {
    const set = Array.from(new Set(catalog.map((c) => c.genre)));
    return set;
  }, [catalog]);

  const labels = useMemo(() => catalog.map((c) => genres.indexOf(c.genre)), [genres, catalog]);
  const selected = useMemo(() => catalog.find((track) => track.id === selectedId) || CATALOG.find((track) => track.id === selectedId), [selectedId, catalog]);
  const genreColors = ['var(--teal)', 'var(--blue)', 'var(--gold)', 'var(--coral)', '#b69cff', '#8fe388', '#ffb3d1', '#9fe7ff'];
  const selectedGenreIndex = Math.max(0, genres.indexOf(selected?.genre));

  const nearestTracks = useMemo(() => {
    if (!selected) return [];
    return catalog
      .filter((track) => track.id !== selected.id)
      .map((track) => ({
        ...track,
        distance: Math.hypot(
          track.energy - selected.energy,
          track.valence - selected.valence,
          track.danceability - selected.danceability,
          (track.tempo - selected.tempo) / 140,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [catalog, selected]);

  const genreProfiles = useMemo(() => genres.map((genre, index) => {
    const tracks = catalog.filter((track) => track.genre === genre);
    const average = (key) => tracks.reduce((sum, track) => sum + track[key], 0) / Math.max(1, tracks.length);
    return {
      genre,
      color: genreColors[index % genreColors.length],
      count: tracks.length,
      energy: average('energy'),
      valence: average('valence'),
    };
  }), [catalog, genres]);

  useEffect(() => {
    let mounted = true;
    async function prepare() {
      // lazy-load tf only when needed
      const tf = await import('@tensorflow/tfjs');
      tfRef.current = tf;

      if (usePretrained && modelUrl) {
        try {
          setLoadingModel(true);
          const model = await tf.loadLayersModel(modelUrl);
          modelRef.current = model;
          predict(catalog[0]);
        } catch (e) {
          // fall back to training if load fails
          console.warn('Failed to load pretrained model', e);
        } finally {
          setLoadingModel(false);
        }
        return;
      }

      // train in-browser
      const xs = tf.tensor2d(features);
      const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), genres.length);

      const model = tf.sequential();
      model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape: [features[0].length] }));
      model.add(tf.layers.dropout({ rate: 0.2 }));
      model.add(tf.layers.dense({ units: genres.length, activation: 'softmax' }));

      model.compile({ optimizer: tf.train.adam(0.01), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });

      await model.fit(xs, ys, {
        epochs: 120,
        batchSize: 4,
        callbacks: {
          onEpochEnd: async (epoch) => {
            if (!mounted) return;
            setTrainProgress(Math.round(((epoch + 1) / 120) * 100));
            await tf.nextFrame();
          },
        },
      });

      modelRef.current = model;
      // warm predict first item
      predict(catalog[0]);
      xs.dispose();
      ys.dispose();
    }

    prepare();

    return () => {
      mounted = false;
      if (modelRef.current) {
        try { modelRef.current.dispose(); } catch (e) {}
        modelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePretrained, modelUrl]);

  async function predict(track) {
    if (!modelRef.current) return;
    const tf = tfRef.current || (await import('@tensorflow/tfjs'));
    const input = tf.tensor2d([[track.energy, track.valence, track.danceability, track.tempo / 140, track.popularity / 100, track.collaborative]]);
    const out = modelRef.current.predict(input);
    const arr = await out.array();
    const outArr = arr[0];
    const res = outArr.map((p, i) => ({ genre: genres[i], prob: p }));
    res.sort((a, b) => b.prob - a.prob);
    setProbs(res);
    input.dispose();
    out.dispose();
  }

  const { data: audioInfo, loading: audioLoading } = useAudioFeatures(selected?.audioUrl);

  function playDemo(track) {
    const audio = audioRef.current;
    if (!audio || !track || !track.audioUrl) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      return;
    }
    audio.src = track.audioUrl;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  useEffect(() => {
    if (selected) predict(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <section className="classification-lab">
      <div className="classification-grid">
        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">{t('class.title', 'Classification Lab')}</p>
            <h4>{t('class.subtitle', 'Genre prediction using a tiny TF.js classifier')}</h4>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="slider-card">
              <span>{t('class.selectTrack', 'Select track')}</span>
                <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ width: '100%', marginTop: 8 }}>
                {catalog.map((track) => (
                  <option key={track.id} value={track.id}>{`${track.title} — ${track.artist}`}</option>
                ))}
              </select>
            </label>

            <div style={{ marginTop: 12 }}>
              <div className="mini-analytics" style={{ padding: 12 }}>
                <p className="eyebrow">{t('class.model', 'Model')}</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={usePretrained} onChange={(e) => setUsePretrained(e.target.checked)} />
                    <span style={{ color: 'var(--muted)' }}>{t('class.usePretrained', 'Use pretrained model')}</span>
                  </label>
                  {usePretrained ? (
                    <>
                      <input placeholder={t('class.modelUrl', 'Model URL (tfjs model.json)')} value={modelUrl} onChange={(e) => setModelUrl(e.target.value)} style={{ flex: 1 }} />
                      <button className="button button--primary" onClick={async () => {
                        if (!modelUrl) return;
                        setLoadingModel(true);
                        try {
                          const tf = tfRef.current || (await import('@tensorflow/tfjs'));
                          const m = await tf.loadLayersModel(modelUrl);
                          modelRef.current = m;
                          await predict(catalog[0]);
                        } catch (err) {
                          console.error('Load model failed', err);
                        } finally {
                          setLoadingModel(false);
                        }
                      }}>{loadingModel ? t('class.loading', 'Loading...') : t('class.load', 'Load')}</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ width: `${trainProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--teal), var(--blue))' }} />
                      </div>
                      <strong>{trainProgress}%</strong>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-strip" style={{ marginTop: 12 }}>
              <article className="profile-card">
                <p>{t('class.energy', 'Energy')}</p>
                <strong>{Math.round(selected.energy * 100)}%</strong>
              </article>
              <article className="profile-card">
                <p>{t('class.valence', 'Valence')}</p>
                <strong>{Math.round(selected.valence * 100)}%</strong>
              </article>
              <article className="profile-card">
                <p>{t('class.danceability', 'Danceability')}</p>
                <strong>{Math.round(selected.danceability * 100)}%</strong>
              </article>
            </div>

            <div style={{ marginTop: 12 }}>
              <audio ref={audioRef} onEnded={() => setPlaying(false)} />
              <button className="button button--primary" onClick={() => playDemo(selected)}>{playing ? t('rec.stop', 'Stop') : t('class.playDemo', 'Play demo')}</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <p className="eyebrow">{t('class.sampleInfo', 'Sample info')}</p>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: 'var(--muted)' }}>{t('class.duration', 'Duration')}: {audioLoading || !audioInfo ? t('class.loading', 'Loading...') : formatDuration(audioInfo.duration)}</span>
                <span style={{ color: 'var(--muted)' }}>{t('class.peak', 'Peak')}: {audioLoading || !audioInfo ? t('class.loading', 'Loading...') : `${audioInfo.peakDb.toFixed(1)} dB`}</span>
                <span style={{ color: 'var(--muted)' }}>{t('class.rms', 'RMS')}: {audioLoading || !audioInfo ? t('class.loading', 'Loading...') : `${audioInfo.rmsDb.toFixed(1)} dB`}</span>
                <span style={{ color: 'var(--muted)' }}>{t('class.tempo', 'Tempo')}: {audioLoading || !audioInfo ? t('class.loading', 'Loading...') : (audioInfo.tempo ? `${audioInfo.tempo} BPM` : 'n/a')}</span>
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <p className="eyebrow">{t('class.predicted', 'Predicted genres')}</p>
              <div className="prob-list">
                {probs.map((p) => (
                  <div key={p.genre} className="prob-item">
                    <strong>{p.genre}</strong>
                    <div className="prob-bar">
                      <div className="prob-fill" style={{ width: `${Math.round(p.prob * 100)}%` }} />
                    </div>
                    <span>{Math.round(p.prob * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <aside className="panel feature-space-panel">
          <div className="section-heading">
            <p className="eyebrow">{t('class.featureSpace', 'Feature space')}</p>
            <h4>{t('class.scatter', 'Energy / Valence map')}</h4>
          </div>
          <div className="feature-space-card">
            <svg className="feature-space-chart" viewBox="0 0 420 320" role="img" aria-label={t('class.scatter', 'Energy / Valence map')}>
              <defs>
                <linearGradient id="feature-space-selected" x1="0" x2="1">
                  <stop offset="0%" stopColor="var(--teal)" />
                  <stop offset="100%" stopColor="var(--blue)" />
                </linearGradient>
              </defs>
              <rect className="feature-space-bg" x="0" y="0" width="420" height="320" rx="18" />
              <line className="feature-space-midline" x1="62" y1="160" x2="380" y2="160" />
              <line className="feature-space-midline" x1="221" y1="38" x2="221" y2="266" />
              {[0.25, 0.5, 0.75].map((tick) => (
                <g key={tick}>
                  <line className="feature-space-gridline" x1={62 + tick * 318} y1="38" x2={62 + tick * 318} y2="266" />
                  <line className="feature-space-gridline" x1="62" y1={266 - tick * 228} x2="380" y2={266 - tick * 228} />
                </g>
              ))}
              <text className="feature-space-axis" x="62" y="292">Low energy</text>
              <text className="feature-space-axis" x="304" y="292">High energy</text>
              <text className="feature-space-axis" x="18" y="246" transform="rotate(-90 18 246)">Low valence</text>
              <text className="feature-space-axis" x="18" y="124" transform="rotate(-90 18 124)">High valence</text>
              <text className="feature-space-quadrant" x="76" y="62">gentle / bright</text>
              <text className="feature-space-quadrant" x="266" y="62">lifted / driving</text>
              <text className="feature-space-quadrant" x="76" y="250">soft / shadowed</text>
              <text className="feature-space-quadrant" x="262" y="250">intense / moody</text>
              {catalog.map((track) => {
                const x = 62 + track.energy * 318;
                const y = 266 - track.valence * 228;
                const isSelected = track.id === selectedId;
                const color = genreColors[Math.max(0, genres.indexOf(track.genre)) % genreColors.length];
                const radius = 7 + track.danceability * 5;
                return (
                  <g key={track.id} className="feature-point-wrap" onClick={() => setSelectedId(track.id)} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedId(track.id);
                  }} role="button" tabIndex="0" aria-label={`${track.title} - ${track.genre}`}>
                    <title>{`${track.title} - ${track.genre}`}</title>
                    <circle cx={x} cy={y} r={radius + 12} fill="transparent" />
                    {isSelected && <circle cx={x} cy={y} r={radius + 10} className="feature-point-ring" />}
                    <circle cx={x} cy={y} r={isSelected ? radius + 2 : radius} fill={isSelected ? 'url(#feature-space-selected)' : color} className="feature-point" />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="feature-space-summary">
            <article className="feature-selected-card">
              <span className="feature-dot" style={{ background: genreColors[selectedGenreIndex % genreColors.length] }} />
              <div>
                <p>{selected.genre}</p>
                <strong>{selected.title}</strong>
                <small>{selected.artist}</small>
              </div>
            </article>
            <div className="feature-metric-grid">
              <span>Energy <strong>{Math.round(selected.energy * 100)}%</strong></span>
              <span>Valence <strong>{Math.round(selected.valence * 100)}%</strong></span>
              <span>Dance <strong>{Math.round(selected.danceability * 100)}%</strong></span>
            </div>
          </div>

          <div className="feature-space-section">
            <p className="eyebrow">{t('class.nearest', 'Nearest tracks')}</p>
            <div className="feature-neighbor-list">
              {nearestTracks.map((track) => (
                <button key={track.id} type="button" className="feature-neighbor" onClick={() => setSelectedId(track.id)}>
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.genre}</small>
                  </span>
                  <em>{Math.round((1 - Math.min(track.distance, 1)) * 100)}%</em>
                </button>
              ))}
            </div>
          </div>

          <div className="feature-space-section">
            <p className="eyebrow">{t('class.genreClusters', 'Genre clusters')}</p>
            <div className="feature-cluster-list">
              {genreProfiles.map((profile) => (
                <div key={profile.genre} className="feature-cluster">
                  <span className="feature-dot" style={{ background: profile.color }} />
                  <strong>{profile.genre}</strong>
                  <small>{Math.round(profile.energy * 100)}E / {Math.round(profile.valence * 100)}V</small>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
