import { useEffect, useState } from 'react';
import { NavLink, useOutletContext } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import { resolveApiBase } from '../utils/apiBase';

const STORAGE_KEYS = {
  saved: 'mlh_saved_recommendations',
  state: 'mlh_recommendation_state',
};

const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXPIRY_KEY = 'spotify_access_token_expiry';
const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.PROD);

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
  const { t } = useLocale();
  const { currentUser, currentUserName, logoutUser, updateDisplayName } = useOutletContext();
  const [savedSets, setSavedSets] = useState([]);
  const [recState, setRecState] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState(getSpotifyToken());
  const [displayName, setDisplayName] = useState(currentUserName || '');
  const [nameMessage, setNameMessage] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

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
    setDisplayName(currentUserName || '');
    setNameMessage('');
  }, [currentUserName, currentUser]);

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

  const handleSaveName = async (event) => {
    event.preventDefault();
    const nextName = displayName.trim();
    if (!nextName) {
      setNameMessage(t('account.nameRequired', 'Please enter a display name.'));
      return;
    }

    setIsSavingName(true);
    const result = await updateDisplayName(nextName);
    setIsSavingName(false);

    if (!result.ok) {
      setNameMessage(result.message || t('account.nameUpdateFailed', 'Unable to update your name.'));
      return;
    }

    setDisplayName(nextName);
    setNameMessage(t('account.nameSaved', 'Display name updated.'));
  };

  if (!currentUser) {
    return (
      <section className="account-page">
        <article className="panel auth-page-panel">
          <div className="section-heading">
            <p className="eyebrow">{t('login.account', 'Account')}</p>
            <h4>{t('account.loginRequired', 'Login required')}</h4>
          </div>
          <p className="muted">{t('account.signInToView', 'Sign in to view your saved recommendations and preferences.')}</p>
          <div className="auth-actions">
            <NavLink to="/login" className="btn">{t('account.goLogin', 'Go to login')}</NavLink>
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
            <p className="eyebrow">{t('account.profile', 'Profile')}</p>
            <h4>{t('account.yourAccount', 'Your account')}</h4>
          </div>
          <form className="auth-form" onSubmit={handleSaveName}>
            <label className="auth-field">
              <span>{t('account.nameLabel', 'Display name')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t('account.namePlaceholder', 'Your display name')}
                autoComplete="name"
                required
              />
            </label>
            <p className="muted">{t('account.nameHelper', 'This is the name shown across your account.')}</p>
            {nameMessage ? <p className="auth-message">{nameMessage}</p> : null}
            <div className="auth-actions">
              <button type="submit" className="btn" disabled={isSavingName}>
                {isSavingName ? t('account.nameSaving', 'Saving...') : t('account.nameSave', 'Save name')}
              </button>
            </div>
          </form>
          <p className="muted">{t('account.signedInAs', 'Signed in as')} <strong>{currentUserName || currentUser}</strong>.</p>
          <p className="muted">{t('account.email', 'Email')} <strong>{currentUser}</strong></p>
          <div className="auth-actions">
            <button type="button" className="btn" onClick={() => logoutUser()}>{t('login.logout', 'Logout')}</button>
          </div>
        </article>

        <article className="panel account-card">
          <div className="section-heading">
            <p className="eyebrow">{t('account.spotify', 'Spotify')}</p>
            <h4>{t('account.connectionStatus', 'Connection status')}</h4>
          </div>
          <p className="muted">
            {spotifyToken
              ? t('account.spotify.connected', 'Spotify is connected for audio features.')
              : t('account.spotify.disconnected', 'Connect Spotify to unlock full audio features.')}
          </p>
          <div className="auth-actions">
            {spotifyToken ? (
              <button type="button" className="btn" onClick={handleDisconnectSpotify}>{t('account.spotify.disconnect', 'Disconnect Spotify')}</button>
            ) : (
              <button type="button" className="btn" onClick={handleConnectSpotify}>{t('account.spotify.connect', 'Connect Spotify')}</button>
            )}
          </div>
        </article>

        <article className="panel account-card">
          <div className="section-heading">
            <p className="eyebrow">{t('account.recState', 'Recommendation state')}</p>
            <h4>{t('account.lastSaved', 'Last saved settings')}</h4>
          </div>
          {recState ? (
            <div className="account-list">
              <div className="account-row">
                <span>{t('account.mode', 'Mode')}</span>
                <strong>{recState.mode?.toUpperCase() || 'Hybrid'}</strong>
              </div>
              <div className="account-row">
                <span>{t('account.mood', 'Mood')}</span>
                <strong>{formatPercent(recState.mood ?? 0)}</strong>
              </div>
              <div className="account-row">
                <span>{t('account.energy', 'Energy')}</span>
                <strong>{formatPercent(recState.energy ?? 0)}</strong>
              </div>
              <div className="account-row">
                <span>{t('account.liked', 'Liked tracks')}</span>
                <strong>{recState.likedIds?.length || 0}</strong>
              </div>
              <div className="account-row">
                <span>{t('account.blocked', 'Blocked tracks')}</span>
                <strong>{recState.blockedIds?.length || 0}</strong>
              </div>
            </div>
          ) : (
            <p className="muted">{t('account.noSavedState', 'No saved recommendation state yet.')}</p>
          )}
        </article>

        <article className="panel account-card account-card--wide">
          <div className="section-heading">
            <p className="eyebrow">{t('account.savedLists', 'Saved lists')}</p>
            <h4>{t('account.history', 'Your recommendation history')}</h4>
          </div>
          {savedSets.length === 0 ? (
            <p className="muted">{t('account.noSavedLists', 'No saved lists yet.')}</p>
          ) : (
            <div className="account-history">
              {savedSets.map((set) => (
                <div key={set.id} className="saved-card">
                  <div>
                    <strong>{set.seed} · {set.mode?.toUpperCase()}</strong>
                    <p>{t('account.mood', 'Mood')} {formatPercent(set.mood)} · {t('account.energy', 'Energy')} {formatPercent(set.energy)}</p>
                    <span>{new Date(set.createdAt).toLocaleString()}</span>
                  </div>
                  <span className="account-pill">{set.trackIds?.length || 0} {t('account.tracks', 'tracks')}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
