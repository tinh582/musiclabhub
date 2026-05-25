import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardCards, roadmap, systemLayers, topStats } from '../data/siteContent';
import { CATALOG } from '../data/catalog';
import { useAudioFeatures } from '../hooks/useAudioFeatures';
import { formatDuration } from '../utils/audioFeatures';

export function DashboardPage() {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [activeId, setActiveId] = useState(CATALOG[0]?.id || null);
  const activeTrack = CATALOG.find((t) => t.id === activeId);
  const { data: audioInfo, loading: audioLoading } = useAudioFeatures(activeTrack?.audioUrl);

  function playDemoFor(id) {
    const track = CATALOG.find((t) => t.id === id);
    if (!track || !track.audioUrl) return;
    setActiveId(track.id);
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
      return;
    }
    audio.src = track.audioUrl;
    audio.play().then(() => {
      setPlayingId(id);
    }).catch(() => {
      setPlayingId(null);
    });
  }

  return (
    <div className="page-stack">
      <section className="hero-card hero-card--wide">
        <div className="hero-copy">
          <p className="eyebrow">Project design</p>
          <h3>A thesis-ready music platform built as a polished Vite website.</h3>
          <p>
            The dashboard acts as the entry point for a single graduation project that can present multiple music
            functions from one cohesive interface. Each module can be a full demo or a conceptual page depending on
            your time and scope.
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/feature/practice">
              Open best-fit feature
            </Link>
            <Link className="button button--ghost" to="/feature/recommendation">
              View recommendation lab
            </Link>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-orb hero-orb--one" />
          <div className="hero-orb hero-orb--two" />
          <div className="hero-side-card">
            <p className="eyebrow">Suggested thesis angle</p>
            <strong>Interactive Practice Room</strong>
            <p>
              It is practical, easy to explain, visually rich, and strong for live demonstration because the user can
              see feedback immediately.
            </p>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {topStats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="mini-analytics panel">
          <div className="section-heading">
            <p className="eyebrow">Mini analytics</p>
            <h4>Catalog feature scatter — click to play demo</h4>
          </div>
          <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
          <svg viewBox="0 0 360 140" style={{ width: '100%', marginTop: 12 }}>
            <rect x="0" y="0" width="360" height="140" rx="10" fill="rgba(255,255,255,0.02)" />
            {CATALOG.map((t, i) => {
              const x = 36 + t.energy * 288;
              const y = 110 - t.valence * 80;
              const isPlaying = playingId === t.id;
              return (
                <g key={t.id} transform={`translate(${x}, ${y})`} style={{ cursor: 'pointer' }} onClick={() => playDemoFor(t.id)}>
                  <circle r={isPlaying ? 8 : 6} fill={isPlaying ? 'var(--teal)' : 'rgba(134,183,255,0.9)'} />
                  <text x={10} y={5} fill="var(--muted)" fontSize="11">{t.title}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ marginTop: 12 }}>
            <p className="eyebrow">Sample info</p>
            <div className="mini-analytics" style={{ padding: 12 }}>
              <strong>{activeTrack ? activeTrack.title : 'No track selected'}</strong>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <span style={{ color: 'var(--muted)' }}>Duration: {audioLoading || !audioInfo ? 'Loading...' : formatDuration(audioInfo.duration)}</span>
                <span style={{ color: 'var(--muted)' }}>Peak: {audioLoading || !audioInfo ? 'Loading...' : `${audioInfo.peakDb.toFixed(1)} dB`}</span>
                <span style={{ color: 'var(--muted)' }}>RMS: {audioLoading || !audioInfo ? 'Loading...' : `${audioInfo.rmsDb.toFixed(1)} dB`}</span>
                <span style={{ color: 'var(--muted)' }}>Tempo: {audioLoading || !audioInfo ? 'Loading...' : (audioInfo.tempo ? `${audioInfo.tempo} BPM` : 'n/a')}</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">Website structure</p>
            <h4>Pages are grouped by music workflow rather than random features.</h4>
          </div>
          <div className="module-grid">
            {dashboardCards.map((card) => (
              <Link key={card.slug} to={`/feature/${card.slug}`} className={`module-card accent-${card.accent}`}>
                <span className="module-chip">{card.label}</span>
                <p>{card.summary}</p>
                <span className="module-link">Open page</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">Recommended build plan</p>
            <h4>A simple roadmap keeps the project achievable.</h4>
          </div>
          <div className="roadmap-list">
            {roadmap.map((item, index) => (
              <div key={item.title} className="roadmap-item">
                <span className="roadmap-index">0{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <p className="eyebrow">System layout</p>
            <h4>One frontend, one shared data model, and feature-specific demos behind it.</h4>
          </div>
          <div className="layer-list">
            {systemLayers.map((layer) => (
              <div key={layer.title} className="layer-item">
                <strong>{layer.title}</strong>
                <p>{layer.text}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel--accent">
          <div className="section-heading">
            <p className="eyebrow">Best scope choices</p>
            <h4>If you want this to feel complete, build one primary module and treat the others as polished companions.</h4>
          </div>
          <div className="priority-list">
            <div>
              <strong>Primary</strong>
              <p>Interactive Practice Room or Recommendation Studio</p>
            </div>
            <div>
              <strong>Secondary</strong>
              <p>Analytics, Classification, and Transcription pages</p>
            </div>
            <div>
              <strong>Bonus</strong>
              <p>Composer, Effects Rack, and Smart Instrument concepts</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
