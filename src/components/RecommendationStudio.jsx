import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAudioFeatures } from '../hooks/useAudioFeatures';
import { formatDuration } from '../utils/audioFeatures';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function scoreTrack(track, profile, mode) {
  const energyMatch = 1 - Math.abs(track.energy - profile.energy);
  const valenceMatch = 1 - Math.abs(track.valence - profile.valence);
  const danceMatch = 1 - Math.abs(track.danceability - profile.danceability);
  const tempoMatch = 1 - Math.min(Math.abs(track.tempo - profile.tempo) / 120, 1);
  const collaborative = track.collaborative;
  const popularity = track.popularity / 100;

  if (mode === 'content') {
    return energyMatch * 0.34 + valenceMatch * 0.3 + danceMatch * 0.2 + tempoMatch * 0.16;
  }

  if (mode === 'collab') {
    return collaborative * 0.55 + popularity * 0.25 + energyMatch * 0.12 + valenceMatch * 0.08;
  }

  return energyMatch * 0.24 + valenceMatch * 0.24 + danceMatch * 0.16 + tempoMatch * 0.14 + collaborative * 0.16 + popularity * 0.06;
}

function buildReason(track, profile, mode) {
  const reasons = [];
  if (Math.abs(track.energy - profile.energy) < 0.15) reasons.push('energy fits');
  if (Math.abs(track.valence - profile.valence) < 0.15) reasons.push('mood fits');
  if (Math.abs(track.danceability - profile.danceability) < 0.15) reasons.push('rhythm fits');
  if (Math.abs(track.tempo - profile.tempo) < 18) reasons.push('tempo fits');

  if (mode === 'collab') {
    reasons.push('similar listener behavior');
  } else if (mode === 'content') {
    reasons.push('content similarity');
  } else {
    reasons.push('hybrid ranking');
  }

  return reasons.slice(0, 3).join(' • ');
}

const STORAGE_KEYS = {
  saved: 'mlh_saved_recommendations',
  state: 'mlh_recommendation_state',
};

const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXPIRY_KEY = 'spotify_access_token_expiry';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getSpotifyToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
  if (!token || Date.now() > expiry - 30_000) {
    return null;
  }
  return token;
}

const DEFAULTS = {
  seedIndex: 0,
  mood: 0.7,
  energy: 0.8,
  mode: 'hybrid',
  likedIds: [],
  blockedIds: [],
};

const SPOTIFY_SEEDS = [
  { label: 'Pop', seedGenre: 'pop', energy: 0.72, valence: 0.66, danceability: 0.7, tempo: 118 },
  { label: 'R&B', seedGenre: 'r-n-b', energy: 0.55, valence: 0.52, danceability: 0.68, tempo: 102 },
  { label: 'Indie', seedGenre: 'indie', energy: 0.5, valence: 0.46, danceability: 0.52, tempo: 108 },
  { label: 'Hip Hop', seedGenre: 'hip-hop', energy: 0.68, valence: 0.54, danceability: 0.78, tempo: 95 },
  { label: 'Dance', seedGenre: 'dance', energy: 0.78, valence: 0.6, danceability: 0.82, tempo: 124 },
];

const API_BASE = import.meta.env.VITE_API_BASE || 'https://localhost:5174';

export function RecommendationStudio() {
  const outletContext = useOutletContext();
  const currentUser = outletContext?.currentUser || null;
  const [savedSets, setSavedSets] = useState([]);
  const [seedIndex, setSeedIndex] = useState(DEFAULTS.seedIndex);
  const [mood, setMood] = useState(DEFAULTS.mood);
  const [energy, setEnergy] = useState(DEFAULTS.energy);
  const [mode, setMode] = useState(DEFAULTS.mode);
  const [likedIds, setLikedIds] = useState(DEFAULTS.likedIds);
  const [blockedIds, setBlockedIds] = useState(DEFAULTS.blockedIds);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [spotifyTracks, setSpotifyTracks] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(true);
  const [spotifyError, setSpotifyError] = useState('');
  const [spotifyToken, setSpotifyToken] = useState(getSpotifyToken());

  useEffect(() => {
    if (!currentUser) {
      setSavedSets([]);
      setSeedIndex(DEFAULTS.seedIndex);
      setMood(DEFAULTS.mood);
      setEnergy(DEFAULTS.energy);
      setMode(DEFAULTS.mode);
      setLikedIds(DEFAULTS.likedIds);
      setBlockedIds(DEFAULTS.blockedIds);
      setHasLoadedState(false);
      return;
    }
    const savedByUser = readJson(STORAGE_KEYS.saved, {});
    setSavedSets(savedByUser[currentUser] || []);

    const stateByUser = readJson(STORAGE_KEYS.state, {});
    const userState = stateByUser[currentUser];
    if (userState) {
      setSeedIndex(userState.seedIndex ?? DEFAULTS.seedIndex);
      setMood(userState.mood ?? DEFAULTS.mood);
      setEnergy(userState.energy ?? DEFAULTS.energy);
      setMode(userState.mode ?? DEFAULTS.mode);
      setLikedIds(Array.isArray(userState.likedIds) ? userState.likedIds : DEFAULTS.likedIds);
      setBlockedIds(Array.isArray(userState.blockedIds) ? userState.blockedIds : DEFAULTS.blockedIds);
    } else {
      setSeedIndex(DEFAULTS.seedIndex);
      setMood(DEFAULTS.mood);
      setEnergy(DEFAULTS.energy);
      setMode(DEFAULTS.mode);
      setLikedIds(DEFAULTS.likedIds);
      setBlockedIds(DEFAULTS.blockedIds);
    }
    setHasLoadedState(true);
  }, [currentUser]);

  useEffect(() => {
    const refreshToken = () => setSpotifyToken(getSpotifyToken());
    window.addEventListener('focus', refreshToken);
    return () => window.removeEventListener('focus', refreshToken);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSpotifyTracks() {
      setSpotifyLoading(true);
      setSpotifyError('');
      const seed = SPOTIFY_SEEDS[seedIndex] || SPOTIFY_SEEDS[0];
      const params = new URLSearchParams({
        seedGenre: seed.seedGenre,
        energy: energy.toString(),
        mood: mood.toString(),
        tempo: (seed.tempo + Math.round((energy - 0.5) * 28)).toString(),
      });

      try {
        const response = await fetch(`${API_BASE}/api/spotify/recommendations?${params.toString()}`,
          spotifyToken
            ? { headers: { Authorization: `Bearer ${spotifyToken}` } }
            : undefined,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load Spotify recommendations.');
        }
        if (!cancelled) {
          setSpotifyTracks(data.tracks || []);
        }
      } catch (error) {
        if (!cancelled) {
          setSpotifyError(error.message || 'Unable to load Spotify recommendations.');
          setSpotifyTracks([]);
        }
      } finally {
        if (!cancelled) {
          setSpotifyLoading(false);
        }
      }
    }

    loadSpotifyTracks();
    return () => {
      cancelled = true;
    };
  }, [energy, mood, seedIndex, spotifyToken]);

  useEffect(() => {
    if (!currentUser || !hasLoadedState) return;
    const stateByUser = readJson(STORAGE_KEYS.state, {});
    stateByUser[currentUser] = {
      seedIndex,
      mood,
      energy,
      mode,
      likedIds,
      blockedIds,
    };
    writeJson(STORAGE_KEYS.state, stateByUser);
  }, [blockedIds, currentUser, energy, hasLoadedState, likedIds, mode, mood, seedIndex]);

  const profile = useMemo(() => {
    const seed = SPOTIFY_SEEDS[seedIndex];
    return {
      energy: clamp((seed.energy * 0.5) + (energy * 0.5), 0, 1),
      valence: clamp((seed.valence * 0.5) + (mood * 0.5), 0, 1),
      danceability: clamp((seed.danceability * 0.6) + (mood * 0.2) + (energy * 0.2), 0, 1),
      tempo: seed.tempo + Math.round((energy - 0.5) * 28),
    };
  }, [seedIndex, mood, energy]);

  const rankedTracks = useMemo(() => {
    return spotifyTracks.filter((track) => !blockedIds.includes(track.id))
      .map((track) => {
        const base = scoreTrack(track, profile, mode);
        const likeBoost = likedIds.includes(track.id) ? 0.08 : 0;
        const score = clamp(base + likeBoost, 0, 1);
        return {
          ...track,
          score,
          explanation: buildReason(track, profile, mode),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [blockedIds, likedIds, mode, profile, spotifyTracks]);

  const activeTrack = playingId
    ? spotifyTracks.find((t) => t.id === playingId)
    : rankedTracks[0];
  const { data: audioInfo, loading: audioLoading } = useAudioFeatures(activeTrack?.previewUrl);

  const toggleLike = (id) => {
    setLikedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setBlockedIds((current) => current.filter((item) => item !== id));
  };

  const toggleBlock = (id) => {
    setBlockedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setLikedIds((current) => current.filter((item) => item !== id));
  };

  const resetControls = () => {
    setSeedIndex(DEFAULTS.seedIndex);
    setMood(DEFAULTS.mood);
    setEnergy(DEFAULTS.energy);
    setMode(DEFAULTS.mode);
    setLikedIds(DEFAULTS.likedIds);
    setBlockedIds(DEFAULTS.blockedIds);
  };

  const handleSaveSet = () => {
    if (!currentUser) return;
    const savedByUser = readJson(STORAGE_KEYS.saved, {});
    const nextSet = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      seed: SPOTIFY_SEEDS[seedIndex]?.label,
      mood,
      energy,
      mode,
      trackIds: rankedTracks.map((track) => track.id),
    };
    const nextSaved = [nextSet, ...(savedByUser[currentUser] || [])].slice(0, 6);
    savedByUser[currentUser] = nextSaved;
    writeJson(STORAGE_KEYS.saved, savedByUser);
    setSavedSets(nextSaved);
  };

  const handleConnectSpotify = () => {
    window.location.href = `${API_BASE}/api/spotify/login`;
  };

  const handleDisconnectSpotify = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    setSpotifyToken(null);
  };

  const removeSavedSet = (id) => {
    if (!currentUser) return;
    const savedByUser = readJson(STORAGE_KEYS.saved, {});
    const nextSaved = (savedByUser[currentUser] || []).filter((set) => set.id !== id);
    savedByUser[currentUser] = nextSaved;
    writeJson(STORAGE_KEYS.saved, savedByUser);
    setSavedSets(nextSaved);
  };

  function playTrack(track) {
    const audio = audioRef.current;
    if (!audio || !track || !track.previewUrl) return;
    if (playingId === track.id) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
      return;
    }
    audio.src = track.previewUrl;
    audio.play().then(() => setPlayingId(track.id)).catch(() => setPlayingId(null));
  }

  return (
    <section className="recommendation-studio">
      <div className="recommendation-layout">
        <article className="recommendation-main">
          <div className="practice-stage__header">
            <div>
              <p className="eyebrow">Hybrid playlist generator</p>
              <h4>Recommendation Studio</h4>
            </div>
            <span className="status-pill status-pill--live">Working in browser</span>
          </div>

          <div className="recommendation-controls">
            <div className="control-card">
              <p className="eyebrow">Seed track</p>
              <div className="seed-grid">
                {SPOTIFY_SEEDS.map((seed, index) => (
                  <button
                    key={seed.label}
                    type="button"
                    className={`target-chip${index === seedIndex ? ' active' : ''}`}
                    onClick={() => setSeedIndex(index)}
                  >
                    {seed.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-card">
              <p className="eyebrow">Recommendation mode</p>
              <div className="seed-grid">
                {['hybrid', 'content', 'collab'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`target-chip${mode === item ? ' active' : ''}`}
                    onClick={() => setMode(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="slider-grid">
              <label className="slider-card">
                <span>Mood</span>
                <strong>{formatPercent(mood)}</strong>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={mood}
                  onChange={(event) => setMood(Number(event.target.value))}
                />
              </label>

              <label className="slider-card">
                <span>Energy</span>
                <strong>{formatPercent(energy)}</strong>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={energy}
                  onChange={(event) => setEnergy(Number(event.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="profile-strip">
            <article className="profile-card">
              <p>Target energy</p>
              <strong>{formatPercent(profile.energy)}</strong>
            </article>
            <article className="profile-card">
              <p>Target valence</p>
              <strong>{formatPercent(profile.valence)}</strong>
            </article>
            <article className="profile-card">
              <p>Target tempo</p>
              <strong>{profile.tempo} BPM</strong>
            </article>
            <article className="profile-card">
              <p>Top signals</p>
              <strong>{mode.toUpperCase()}</strong>
            </article>
            <article className="profile-card">
              <p>Catalog state</p>
              <strong>{blockedIds.length} blocked</strong>
            </article>
          </div>
        </article>

        <aside className="recommendation-sidebar">
          <article className="panel">
            <div className="section-heading">
              <p className="eyebrow">Spotify</p>
              <h4>Audio features</h4>
            </div>
            <p className="muted">
              {spotifyToken ? 'Spotify connected. Audio features enabled.' : 'Connect Spotify to unlock full audio features.'}
            </p>
            <div className="auth-actions">
              {spotifyToken ? (
                <button type="button" className="btn" onClick={handleDisconnectSpotify}>Disconnect Spotify</button>
              ) : (
                <button type="button" className="btn" onClick={handleConnectSpotify}>Connect Spotify</button>
              )}
            </div>
          </article>

          <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
          <article className="panel" style={{ marginBottom: 14 }}>
            <div className="section-heading">
              <p className="eyebrow">Sample info</p>
              <h4>{activeTrack ? activeTrack.title : 'No track selected'}</h4>
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              <span style={{ color: 'var(--muted)' }}>Artist: {activeTrack ? activeTrack.artist : 'n/a'}</span>
              <span style={{ color: 'var(--muted)' }}>Album: {activeTrack ? activeTrack.album : 'n/a'}</span>
              <span style={{ color: 'var(--muted)' }}>Popularity: {activeTrack ? activeTrack.popularity : 'n/a'}</span>
              <span style={{ color: 'var(--muted)' }}>Preview: {activeTrack?.previewUrl ? 'Available' : 'Not available'}</span>
              <span style={{ color: 'var(--muted)' }}>Duration: {audioLoading || !audioInfo ? 'Loading...' : formatDuration(audioInfo.duration)}</span>
              <span style={{ color: 'var(--muted)' }}>Tempo: {audioLoading || !audioInfo ? 'Loading...' : (audioInfo.tempo ? `${audioInfo.tempo} BPM` : 'n/a')}</span>
            </div>
          </article>
          <article className="panel panel--filled">
            <div className="section-heading">
              <p className="eyebrow">Recommended playlist</p>
              <h4>Top 5 tracks</h4>
            </div>
            <div className="recommendation-list">
              {spotifyLoading ? (
                <div className="recommendation-empty">Loading Spotify recommendations...</div>
              ) : null}
              {spotifyError ? (
                <div className="recommendation-empty">{spotifyError}</div>
              ) : null}
              {rankedTracks.map((track, index) => (
                <div key={track.id} className="recommendation-item">
                  <div className="recommendation-rank">0{index + 1}</div>
                  <div className="recommendation-body">
                    <strong>{track.title}</strong>
                    <p>
                      {track.artist} · {track.album}
                    </p>
                    <span>{track.explanation}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                    <div className="recommendation-score">{Math.round(track.score * 100)}</div>
                    <button type="button" className={`mini-button${playingId === track.id ? ' active' : ''}`} onClick={() => playTrack(track)}>
                      {playingId === track.id ? 'Stop' : (track.previewUrl ? 'Play' : 'No preview')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="recommendation-actions">
              <button
                type="button"
                className="btn"
                onClick={handleSaveSet}
                disabled={!currentUser}
              >
                Save this list
              </button>
              {!currentUser ? <span className="auth-hint">Login required to save.</span> : null}
            </div>
          </article>

          <article className="panel">
            <div className="section-heading">
              <p className="eyebrow">Saved sets</p>
              <h4>Recommendation history</h4>
            </div>
            {currentUser ? (
              <div className="saved-list">
                {savedSets.length === 0 ? (
                  <p className="muted">No saved lists yet.</p>
                ) : (
                  savedSets.map((set) => (
                    <div key={set.id} className="saved-card">
                      <div>
                        <strong>{set.seed} · {set.mode.toUpperCase()}</strong>
                        <p>Mood {formatPercent(set.mood)} · Energy {formatPercent(set.energy)}</p>
                        <span>{new Date(set.createdAt).toLocaleString()}</span>
                      </div>
                      <button type="button" className="mini-button" onClick={() => removeSavedSet(set.id)}>Remove</button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="muted">Login to view saved sets.</p>
            )}
          </article>

          <article className="panel panel--accent">
            <div className="section-heading">
              <p className="eyebrow">Catalog controls</p>
              <h4>Like or block tracks to change the ranking.</h4>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={resetControls}>Reset controls</button>
            </div>
            <div className="catalog-grid">
              {spotifyTracks.map((track) => {
                const isLiked = likedIds.includes(track.id);
                const isBlocked = blockedIds.includes(track.id);
                return (
                  <div key={track.id} className="catalog-card">
                    <div>
                      <strong>{track.title}</strong>
                      <p>
                        {track.artist} · {track.album}
                      </p>
                    </div>
                    <div className="catalog-actions">
                      <button type="button" className={`mini-button${isLiked ? ' active' : ''}`} onClick={() => toggleLike(track.id)}>
                        {isLiked ? 'Liked' : 'Like'}
                      </button>
                      <button type="button" className={`mini-button${isBlocked ? ' active' : ''}`} onClick={() => toggleBlock(track.id)}>
                        {isBlocked ? 'Blocked' : 'Block'}
                      </button>
                      <button type="button" className={`mini-button${playingId === track.id ? ' active' : ''}`} onClick={() => playTrack(track)}>
                        {playingId === track.id ? 'Stop' : (track.previewUrl ? 'Play' : 'No preview')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
