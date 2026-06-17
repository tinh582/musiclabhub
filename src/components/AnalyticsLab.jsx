import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { buildCatalog } from '../data/catalog';

function groupByGenre(catalog) {
  const map = {};
  catalog.forEach((t) => {
    if (!t.genre) return;
    if (!map[t.genre]) map[t.genre] = [];
    map[t.genre].push(t);
  });
  return map;
}

function avg(arr, key) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((s, x) => s + Number(x[key] || 0), 0) / arr.length;
}

function parseCSV(text) {
  // very small CSV parser: header row, comma-separated, no quoting handling beyond basic
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cols = ln.split(',').map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => {
      let v = cols[i] ?? '';
      // try convert numbers
      if (h.match(/tempo|energy|valence|danceability|popularity/i)) {
        v = parseFloat(v) || 0;
      }
      obj[h] = v;
    });
    return obj;
  });
}

function clusterTracks(tracks, clusterCount = 3, iterations = 12) {
  if (!clusterCount || tracks.length < clusterCount) return [];
  const vectors = tracks.map((track) => [
    Number(track.energy || 0),
    Number(track.valence || 0),
    Number(track.danceability || 0),
    Number(track.tempo || 0) / 200,
  ]);
  let centroids = Array.from({ length: clusterCount }, (_, index) =>
    vectors[Math.floor((index * vectors.length) / clusterCount)].slice());
  let assignments = new Array(vectors.length).fill(0);

  for (let step = 0; step < iterations; step += 1) {
    assignments = vectors.map((vector) => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      centroids.forEach((centroid, index) => {
        const distance = Math.sqrt(vector.reduce((sum, value, dim) => sum + ((value - centroid[dim]) ** 2), 0));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    });
    centroids = centroids.map((centroid, cluster) => {
      const members = vectors.filter((_, index) => assignments[index] === cluster);
      if (!members.length) return centroid;
      return centroid.map((_, dim) => members.reduce((sum, vector) => sum + vector[dim], 0) / members.length);
    });
  }

  return centroids.map((centroid, cluster) => {
    const energy = centroid[0];
    const valence = centroid[1];
    const label = energy > 0.65
      ? (valence > 0.55 ? 'Energetic bright' : 'Energetic dark')
      : (valence > 0.55 ? 'Gentle bright' : 'Calm moody');
    return {
      label,
      count: assignments.filter((assignment) => assignment === cluster).length,
      tempo: centroid[3] * 200,
    };
  });
}

export function AnalyticsLab({
  saveAnalysis = null,
  moduleHandoff = null,
  clearModuleHandoff = null,
  moduleState = null,
  setModuleState = null,
}) {
  const { t } = useLocale();
  const [dataset, setDataset] = useState(() => buildCatalog(t || ((k, f) => f)));
  const [selectedGenres, setSelectedGenres] = useState(null);
  const [tempoRange, setTempoRange] = useState([40, 200]);

  const tempoRef = useRef(null);
  const scatterRef = useRef(null);

  const allGenres = useMemo(() => Array.from(new Set(dataset.map((d) => d.genre).filter(Boolean))).sort(), [dataset]);

  const colorMap = useMemo(() => {
    const map = {};
    const n = allGenres.length || 1;
    allGenres.forEach((g, i) => {
      const h = Math.round((i * 360) / n);
      map[g] = `hsl(${h}deg 80% 60%)`;
    });
    return map;
  }, [allGenres]);

  const filtered = useMemo(() => {
    return dataset.filter((d) => {
      const tempo = Number(d.tempo || 0);
      if (tempo < tempoRange[0] || tempo > tempoRange[1]) return false;
      if (selectedGenres && selectedGenres.length) return selectedGenres.includes(d.genre);
      return true;
    });
  }, [dataset, selectedGenres, tempoRange]);

  const byGenre = useMemo(() => groupByGenre(filtered), [filtered]);

  const genreStats = useMemo(() => {
    return Object.keys(byGenre).map((g) => ({
      genre: g,
      energy: avg(byGenre[g], 'energy'),
      valence: avg(byGenre[g], 'valence'),
      danceability: avg(byGenre[g], 'danceability'),
      tempo: avg(byGenre[g], 'tempo'),
      count: byGenre[g].length,
    }));
  }, [byGenre]);

  const tempoBins = useMemo(() => {
    const tempos = filtered.map((c) => Number(c.tempo || 0)).filter(Boolean);
    if (!tempos.length) return [];
    const min = Math.min(...tempos);
    const max = Math.max(...tempos);
    const bins = 8;
    const size = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);
    tempos.forEach((tempo) => {
      let idx = Math.floor((tempo - min) / size);
      if (idx >= bins) idx = bins - 1;
      counts[idx] += 1;
    });
    const ranges = counts.map((c, i) => ({ label: `${Math.round(min + i * size)}-${Math.round(min + (i + 1) * size)}`, count: c }));
    return ranges;
  }, [filtered]);

  const scatterPoints = useMemo(() => filtered.map((track) => ({ x: Number(track.energy || 0), y: Number(track.valence || 0), genre: track.genre, title: `${track.title || ''} — ${track.artist || ''}` })), [filtered]);
  const discoveredClusters = useMemo(() => clusterTracks(filtered, Math.min(3, filtered.length)), [filtered]);

  useEffect(() => {
    if (moduleHandoff?.type !== 'restore-analysis' || moduleHandoff.payload?.slug !== 'analytics') return;
    const snapshot = moduleHandoff.payload.snapshot || {};
    if (Array.isArray(snapshot.dataset) && snapshot.dataset.length) setDataset(snapshot.dataset);
    setSelectedGenres(Array.isArray(snapshot.selectedGenres) ? snapshot.selectedGenres : null);
    if (Array.isArray(snapshot.tempoRange) && snapshot.tempoRange.length === 2) setTempoRange(snapshot.tempoRange);
    clearModuleHandoff?.();
  }, [moduleHandoff, clearModuleHandoff]);

  useEffect(() => {
    if (!moduleState) return;
    if (Array.isArray(moduleState.dataset) && moduleState.dataset.length) setDataset(moduleState.dataset);
    setSelectedGenres(Array.isArray(moduleState.selectedGenres) ? moduleState.selectedGenres : null);
    if (Array.isArray(moduleState.tempoRange) && moduleState.tempoRange.length === 2) setTempoRange(moduleState.tempoRange);
  }, [moduleState]);

  function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(String(ev.target.result || ''));
        if (parsed.length) setDataset(parsed);
      } catch (err) {
        // ignore
      }
    };
    reader.readAsText(f);
  }

  function toggleGenre(g) {
    if (!selectedGenres) setSelectedGenres([g]);
    else {
      if (selectedGenres.includes(g)) setSelectedGenres(selectedGenres.filter((x) => x !== g));
      else setSelectedGenres([...selectedGenres, g]);
    }
  }

  function saveCurrentAnalysis() {
    if (!filtered.length || !saveAnalysis) return;
    saveAnalysis({
      module: 'Analytics',
      slug: 'analytics',
      title: `${filtered.length}-track dataset analysis`,
      source: 'Current dataset',
      metrics: [
        { label: 'Genres', value: String(Object.keys(byGenre).length) },
        { label: 'Clusters', value: String(discoveredClusters.length) },
        { label: 'Tempo min', value: `${tempoRange[0]} BPM` },
        { label: 'Tempo max', value: `${tempoRange[1]} BPM` },
      ],
      snapshot: { dataset, selectedGenres, tempoRange },
    });
  }

  useEffect(() => {
    setModuleState?.({
      dataset,
      selectedGenres,
      tempoRange,
    });
  }, [dataset, selectedGenres, tempoRange, setModuleState]);

  function downloadSVG(svgEl, name) {
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPNG(svgEl, name) {
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 1200;
      canvas.height = img.height || 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0b0b0b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = png;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <section className="analytics-lab">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="eyebrow">{t('analytics.title', 'Music Analytics')}</p>
          <h4>{t('analytics.subtitle', 'Upload datasets, filter and export visuals')}</h4>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
          <button className="btn" onClick={() => { if (tempoRef.current) downloadSVG(tempoRef.current, 'tempo.svg'); }}>{t('analytics.export.tempoSvg', 'Export Tempo SVG')}</button>
          <button className="btn" onClick={() => { if (tempoRef.current) downloadPNG(tempoRef.current, 'tempo.png'); }}>{t('analytics.export.tempoPng', 'Export Tempo PNG')}</button>
          <button className="btn" onClick={saveCurrentAnalysis} disabled={!filtered.length}>{t('common.saveAnalysis', 'Save analysis')}</button>
        </div>
      </div>

      <div className="analytics-grid" style={{ marginTop: 14 }}>
        <article className="panel panel--filled">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <p className="eyebrow">{t('analytics.tempoRange', 'Tempo range')}</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="range" min={20} max={240} value={tempoRange[0]} onChange={(e) => setTempoRange([Number(e.target.value), tempoRange[1]])} />
                    <input type="range" min={20} max={240} value={tempoRange[1]} onChange={(e) => setTempoRange([tempoRange[0], Number(e.target.value)])} />
                    <div style={{ minWidth: 80, textAlign: 'right' }}>{tempoRange[0]}-{tempoRange[1]} BPM</div>
                  </div>
                </div>

                <div style={{ width: 220 }}>
                  <p className="eyebrow">{t('analytics.genres', 'Genres')}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allGenres.map((g) => (
                      <button key={g} className={`chip ${selectedGenres && selectedGenres.includes(g) ? 'chip--active' : ''}`} onClick={() => toggleGenre(g)} style={{ borderColor: colorMap[g] }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, background: colorMap[g], borderRadius: 3, marginRight: 6 }} />{g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <p className="eyebrow">{t('analytics.tempoDistribution', 'Tempo distribution')}</p>
                <svg ref={tempoRef} id="tempoSvg" viewBox="0 0 720 180" style={{ width: '100%', marginTop: 8 }}>
                  {tempoBins.map((b, i) => {
                    const w = 720 / tempoBins.length;
                    const maxCount = Math.max(...tempoBins.map((bb) => bb.count)) || 1;
                    const h = (b.count / maxCount) * 120;
                    return (
                      <g key={b.label} transform={`translate(${i * w}, ${140 - h})`}>
                        <rect x={8} y={0} width={w - 16} height={h} fill="rgba(134,183,255,0.95)" rx={6} />
                        <text x={w / 2} y={h + 16} fill="var(--muted)" fontSize={12} textAnchor="middle">{b.label}</text>
                      </g>
                    );
                  })}
                </svg>

                <div style={{ marginTop: 18 }}>
                  <p className="eyebrow">{t('analytics.energyValence', 'Energy vs Valence')}</p>
                  <svg ref={scatterRef} id="scatterSvg" viewBox="0 0 720 320" style={{ width: '100%', marginTop: 8 }}>
                    <rect x="0" y="0" width="720" height="320" fill="rgba(255,255,255,0.02)" rx="12" />
                    {scatterPoints.map((p, i) => {
                      const x = 40 + p.x * 640;
                      const y = 260 - p.y * 180;
                      const c = colorMap[p.genre] || 'rgba(255,255,255,0.6)';
                      return (
                        <g key={`${p.title}-${i}`} transform={`translate(${x}, ${y})`}>
                          <circle r={7} fill={c} stroke="#000" strokeOpacity={0.08} />
                          <title>{p.title}</title>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <p className="eyebrow">{t('analytics.byGenre', 'By genre')}</p>
            <h4>{t('analytics.avgFeatures', 'Average features')}</h4>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 18 }}>
              <p className="eyebrow">AI-discovered clusters</p>
              <div className="practice-log">
                {discoveredClusters.map((cluster, index) => (
                  <div key={`${cluster.label}-${index}`} className="practice-log__item">
                    <strong>{cluster.label}</strong>
                    <span>{cluster.count} tracks</span>
                    <span>{Math.round(cluster.tempo)} BPM</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{t('analytics.legend', 'Legend')}</strong>
                {allGenres.map((g) => (
                  <div key={g} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 120 }}>
                    <div style={{ width: 12, height: 12, background: colorMap[g], borderRadius: 3 }} />
                    <div style={{ fontSize: 13 }}>{g}</div>
                  </div>
                ))}
              </div>

              {genreStats.map((g) => (
                <div key={g.genre} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 10, height: 10, background: colorMap[g.genre], borderRadius: 2 }} />
                      <strong>{g.genre}</strong>
                    </div>
                    <div style={{ color: 'var(--muted)' }}>{g.count}</div>
                  </div>

                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 76 }}>{t('analytics.energy', 'Energy')}</div>
                      <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 999 }}>
                        <div style={{ width: `${Math.round(g.energy * 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--teal),var(--blue))' }} />
                      </div>
                      <div style={{ width: 36, textAlign: 'right' }}>{Math.round(g.energy * 100)}%</div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 76 }}>{t('analytics.valence', 'Valence')}</div>
                      <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 999 }}>
                        <div style={{ width: `${Math.round(g.valence * 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--gold),var(--coral))' }} />
                      </div>
                      <div style={{ width: 36, textAlign: 'right' }}>{Math.round(g.valence * 100)}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
