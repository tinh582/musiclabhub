import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import { useSiteContent } from '../hooks/useSiteContent';
import { CATALOG, buildCatalog } from '../data/catalog';

export function DashboardPage() {
  const { t } = useLocale();
  const { dashboardCards, systemLayers, topStats } = useSiteContent();
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const localizedCatalog = buildCatalog(t);
  const catalog = localizedCatalog || CATALOG;
  const [activeId, setActiveId] = useState(localizedCatalog[0]?.id || CATALOG[0]?.id || null);
  const activeTrack = (catalog.find((tt) => tt.id === activeId) || CATALOG.find((tt) => tt.id === activeId));
  const genres = useMemo(() => Array.from(new Set(catalog.map((track) => track.genre))), [catalog]);
  const genreColors = ['var(--teal)', 'var(--blue)', 'var(--gold)', 'var(--coral)', '#b69cff', '#8fe388', '#ffb3d1', '#9fe7ff'];
  const activeGenreIndex = Math.max(0, genres.indexOf(activeTrack?.genre));
  const nearestTracks = useMemo(() => {
    if (!activeTrack) return [];
    return catalog
      .filter((track) => track.id !== activeTrack.id)
      .map((track) => ({
        ...track,
        distance: Math.hypot(
          track.energy - activeTrack.energy,
          track.valence - activeTrack.valence,
          track.danceability - activeTrack.danceability,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [activeTrack, catalog]);

  function playDemoFor(id) {
    const track = (catalog.find((t) => t.id === id) || CATALOG.find((t) => t.id === id));
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
          <p className="eyebrow">{t('dashboard.hero.eyebrow', 'Project design')}</p>
          <h3>{t('dashboard.hero.title', 'A thesis-ready music platform built as a polished Vite website.')}</h3>
          <p>
            {t('dashboard.hero.body', 'The dashboard acts as the entry point for a single graduation project that can present multiple music functions from one cohesive interface. Each module can be a full demo or a conceptual page depending on your time and scope.')}
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/feature/practice">
              {t('dashboard.hero.primary', 'Open best-fit feature')}
            </Link>
            <Link className="button button--ghost" to="/feature/recommendation">
              {t('dashboard.hero.secondary', 'View recommendation lab')}
            </Link>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-orb hero-orb--one" />
          <div className="hero-orb hero-orb--two" />
          <div className="hero-side-card">
            <p className="eyebrow">{t('dashboard.hero.suggested.eyebrow', 'Suggested thesis angle')}</p>
            <strong>{t('dashboard.hero.suggested.title', 'Interactive Practice Room')}</strong>
            <p>
              {t('dashboard.hero.suggested.body', 'It is practical, easy to explain, visually rich, and strong for live demonstration because the user can see feedback immediately.')}
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
            <p className="eyebrow">{t('dashboard.mini.title', 'Mini analytics')}</p>
            <h4>{t('dashboard.mini.subtitle', 'Catalog feature map - click a point to play')}</h4>
          </div>
          <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
          <div className="dashboard-feature-map">
            <div className="dashboard-feature-chart">
              <svg viewBox="0 0 520 220" role="img" aria-label={t('dashboard.mini.subtitle', 'Catalog feature map')}>
                <rect className="feature-space-bg" x="0" y="0" width="520" height="220" rx="18" />
                <line className="feature-space-midline" x1="58" y1="106" x2="480" y2="106" />
                <line className="feature-space-midline" x1="269" y1="30" x2="269" y2="176" />
                {[0.25, 0.5, 0.75].map((tick) => (
                  <g key={tick}>
                    <line className="feature-space-gridline" x1={58 + tick * 422} y1="30" x2={58 + tick * 422} y2="176" />
                    <line className="feature-space-gridline" x1="58" y1={176 - tick * 146} x2="480" y2={176 - tick * 146} />
                  </g>
                ))}
                <text className="feature-space-axis" x="58" y="202">Low energy</text>
                <text className="feature-space-axis" x="398" y="202">High energy</text>
                <text className="feature-space-quadrant" x="72" y="52">bright / calm</text>
                <text className="feature-space-quadrant" x="344" y="52">bright / driving</text>
                <text className="feature-space-quadrant" x="72" y="164">soft / moody</text>
                <text className="feature-space-quadrant" x="334" y="164">high push</text>
                {catalog.map((track) => {
                  const x = 58 + track.energy * 422;
                  const y = 176 - track.valence * 146;
                  const isActive = activeTrack?.id === track.id;
                  const isPlaying = playingId === track.id;
                  const color = genreColors[Math.max(0, genres.indexOf(track.genre)) % genreColors.length];
                  const radius = 7 + track.danceability * 5;
                  return (
                    <g
                      key={track.id}
                      className="feature-point-wrap"
                      onClick={() => playDemoFor(track.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') playDemoFor(track.id);
                      }}
                      role="button"
                      tabIndex="0"
                      aria-label={`${track.title} - ${track.genre}`}
                    >
                      <title>{`${track.title} - ${track.artist}`}</title>
                      <circle cx={x} cy={y} r={radius + 12} fill="transparent" />
                      {isActive && <circle cx={x} cy={y} r={radius + 10} className="feature-point-ring" />}
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive || isPlaying ? radius + 2 : radius}
                        fill={isActive || isPlaying ? 'var(--teal)' : color}
                        className="feature-point"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="dashboard-feature-side">
              <div className="feature-selected-card">
                <span className="feature-dot" style={{ background: genreColors[activeGenreIndex % genreColors.length] }} />
                <div>
                  <p>{activeTrack?.genre || t('dashboard.mini.noTrack', 'No track selected')}</p>
                  <strong>{activeTrack ? activeTrack.title : t('dashboard.mini.noTrack', 'No track selected')}</strong>
                  <small>{activeTrack?.artist}</small>
                </div>
              </div>
              <div className="feature-metric-grid dashboard-feature-metrics">
                <span>Energy <strong>{activeTrack ? Math.round(activeTrack.energy * 100) : 0}%</strong></span>
                <span>Valence <strong>{activeTrack ? Math.round(activeTrack.valence * 100) : 0}%</strong></span>
                <span>Dance <strong>{activeTrack ? Math.round(activeTrack.danceability * 100) : 0}%</strong></span>
              </div>
              <div className="dashboard-neighbor-row">
                {nearestTracks.map((track) => (
                  <button key={track.id} type="button" className="mini-button" onClick={() => playDemoFor(track.id)}>
                    {track.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--two">
        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">{t('dashboard.structure.eyebrow', 'Website structure')}</p>
            <h4>{t('dashboard.structure.title', 'Pages are grouped by music workflow rather than random features.')}</h4>
          </div>
          <div className="module-grid">
            {dashboardCards.map((card) => (
              <Link key={card.slug} to={`/feature/${card.slug}`} className={`module-card accent-${card.accent}`}>
                <span className="module-chip">{card.label}</span>
                <p>{card.summary}</p>
                <span className="module-link">{t('dashboard.module.open', 'Open page')}</span>
              </Link>
            ))}
          </div>
        </article>

      </section>

      <section className="content-grid content-grid--two">
        <article className="panel">
          <div className="section-heading">
            <p className="eyebrow">{t('dashboard.system.eyebrow', 'System layout')}</p>
            <h4>{t('dashboard.system.title', 'One frontend, one shared data model, and feature-specific demos behind it.')}</h4>
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
            <p className="eyebrow">{t('dashboard.scope.eyebrow', 'Best scope choices')}</p>
            <h4>{t('dashboard.scope.title', 'If you want this to feel complete, build one primary module and treat the others as polished companions.')}</h4>
          </div>
          <div className="priority-list">
            <div>
              <strong>{t('dashboard.scope.primary', 'Primary')}</strong>
              <p>{t('dashboard.scope.primary.body', 'Interactive Practice Room or Recommendation Studio')}</p>
            </div>
            <div>
              <strong>{t('dashboard.scope.secondary', 'Secondary')}</strong>
              <p>{t('dashboard.scope.secondary.body', 'Analytics, Classification, and Transcription pages')}</p>
            </div>
            <div>
              <strong>{t('dashboard.scope.bonus', 'Bonus')}</strong>
              <p>{t('dashboard.scope.bonus.body', 'Composer, Effects Rack, and Smart Instrument concepts')}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
