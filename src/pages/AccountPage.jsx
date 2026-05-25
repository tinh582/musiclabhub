import { useEffect, useState } from 'react';
import { NavLink, useOutletContext } from 'react-router-dom';

const STORAGE_KEYS = {
  saved: 'mlh_saved_recommendations',
  state: 'mlh_recommendation_state',
};

const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXPIRY_KEY = 'spotify_access_token_expiry';
const API_BASE = import.meta.env.VITE_API_BASE || 'https://localhost:5174';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getSpotifyToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
  if (!token || Date.now() > expiry - 30_000) {
    return null;
  }
  return token;
}

export function AccountPage() {
  const { currentUser, logoutUser } = useOutletContext();
  const [savedSets, setSavedSets] = useState([]);
  const [recState, setRecState] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState(getSpotifyToken());

  useEffect(() => {
    if (!currentUser) {
      setSavedSets([]);
      setRecState(null);
      return;
    }

    const savedByUser = readJson(STORAGE_KEYS.saved, {});
    setSavedSets(savedByUser[currentUser] || []);

    const stateByUser = readJson(STORAGE_KEYS.state, {});
    setRecState(stateByUser[currentUser] || null);
  }, [currentUser]);

  useEffect(() => {
    const refreshToken = () => setSpotifyToken(getSpotifyToken());
    window.addEventListener('focus', refreshToken);
    return () => window.removeEventListener('focus', refreshToken);
  }, []);

  const handleConnectSpotify = () => {
    window.location.href = `${API_BASE}/api/spotify/login`;
  };

  const handleDisconnectSpotify = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    setSpotifyToken(null);
  };

  if (!currentUser) {
    return (
      <section className="account-page">
        <article className="panel auth-page-panel">
          <div className="section-heading">
            <p className="eyebrow">Account</p>
            <h4>Login required</h4>
          </div>
          <p className="muted">Sign in to view your saved recommendations and preferences.</p>
          <div className="auth-actions">
            <NavLink to="/login" className="btn">Go to login</NavLink>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="account-page">
      <div className="account-grid">
        <article className="panel account-card">
          <div className="section-heading">
            <p className="eyebrow">Profile</p>
            <h4>Your account</h4>
          </div>
          <p className="muted">Signed in as <strong>{currentUser}</strong>.</p>
          <div className="auth-actions">
            <button type="button" className="btn" onClick={() => logoutUser()}>Logout</button>
          </div>
        </article>

        <article className="panel account-card">
          <div className="section-heading">
            <p className="eyebrow">Spotify</p>
            <h4>Connection status</h4>
          </div>
          <p className="muted">
            {spotifyToken ? 'Spotify is connected for audio features.' : 'Connect Spotify to unlock full audio features.'}
          </p>
          <div className="auth-actions">
            {spotifyToken ? (
              <button type="button" className="btn" onClick={handleDisconnectSpotify}>Disconnect Spotify</button>
            ) : (
              <button type="button" className="btn" onClick={handleConnectSpotify}>Connect Spotify</button>
            )}
          </div>
        </article>

        <article className="panel account-card">
          <div className="section-heading">
            <p className="eyebrow">Recommendation state</p>
            <h4>Last saved settings</h4>
          </div>
          {recState ? (
            <div className="account-list">
              <div className="account-row">
                <span>Mode</span>
                <strong>{recState.mode?.toUpperCase() || 'Hybrid'}</strong>
              </div>
              <div className="account-row">
                <span>Mood</span>
                <strong>{formatPercent(recState.mood ?? 0)}</strong>
              </div>
              <div className="account-row">
                <span>Energy</span>
                <strong>{formatPercent(recState.energy ?? 0)}</strong>
              </div>
              <div className="account-row">
                <span>Liked tracks</span>
                <strong>{recState.likedIds?.length || 0}</strong>
              </div>
              <div className="account-row">
                <span>Blocked tracks</span>
                <strong>{recState.blockedIds?.length || 0}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">No saved recommendation state yet.</p>
          )}
        </article>

        <article className="panel account-card account-card--wide">
          <div className="section-heading">
            <p className="eyebrow">Saved lists</p>
            <h4>Your recommendation history</h4>
          </div>
          {savedSets.length === 0 ? (
            <p className="muted">No saved lists yet.</p>
          ) : (
            <div className="account-history">
              {savedSets.map((set) => (
                <div key={set.id} className="saved-card">
                  <div>
                    <strong>{set.seed} · {set.mode?.toUpperCase()}</strong>
                    <p>Mood {formatPercent(set.mood)} · Energy {formatPercent(set.energy)}</p>
                    <span>{new Date(set.createdAt).toLocaleString()}</span>
                  </div>
                  <span className="account-pill">{set.trackIds?.length || 0} tracks</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
