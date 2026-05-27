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

  const features = useMemo(
    () => (localizedCatalog || CATALOG).map((c) => [c.energy, c.valence, c.danceability, c.tempo / 140, c.popularity / 100, c.collaborative]),
    [],
  );

  const genres = useMemo(() => {
    const set = Array.from(new Set((localizedCatalog || CATALOG).map((c) => c.genre)));
    return set;
  }, [localizedCatalog]);

  const labels = useMemo(() => (localizedCatalog || CATALOG).map((c) => genres.indexOf(c.genre)), [genres, localizedCatalog]);

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
          predict(CATALOG[0]);
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
      predict(CATALOG[0]);
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

  const selected = useMemo(() => (localizedCatalog.find((t) => t.id === selectedId) || CATALOG.find((t) => t.id === selectedId)), [selectedId, localizedCatalog]);
  const { data: audioInfo, loading: audioLoading } = useAudioFeatures(selected?.audioUrl);
  const { t } = useLocale();

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
                {(localizedCatalog || CATALOG).map((t) => (
                  <option key={t.id} value={t.id}>{`${t.title} — ${t.artist}`}</option>
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
                          await predict(CATALOG[0]);
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

        <aside className="panel">
          <div className="section-heading">
            <p className="eyebrow">{t('class.featureSpace', 'Feature space')}</p>
            <h4>{t('class.scatter', 'Energy vs Valence scatter')}</h4>
          </div>
          <svg viewBox="0 0 300 240" style={{ width: '100%', marginTop: 12 }}>
            <rect x="0" y="0" width="300" height="240" fill="rgba(255,255,255,0.02)" rx="12" />
            {CATALOG.map((t, i) => {
              const x = 40 + t.energy * 220;
              const y = 200 - t.valence * 160;
              const isSelected = t.id === selectedId;
              return (
                <g key={t.id} transform={`translate(${x}, ${y})`}>
                  <circle r={isSelected ? 8 : 6} fill={isSelected ? 'var(--teal)' : 'rgba(134,183,255,0.9)'} />
                  <text x={12} y={6} fill="var(--muted)" fontSize="11">{t.title}</text>
                </g>
              );
            })}
          </svg>
        </aside>
      </div>
    </section>
  );
}
