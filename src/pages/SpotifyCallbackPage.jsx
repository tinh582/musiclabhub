import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import { resolveApiBase } from '../utils/apiBase';

const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXPIRY_KEY = 'spotify_access_token_expiry';
const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.PROD);

export function SpotifyCallbackPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [message, setMessage] = useState(t('spotify.connecting', 'Connecting to Spotify...'));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      setMessage(t('spotify.missingCode', 'Missing Spotify authorization code.'));
      return;
    }

    async function exchangeCode() {
      try {
        const response = await fetch(`${API_BASE}/api/spotify/exchange?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || t('spotify.unable', 'Unable to connect to Spotify.'));
        }

        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
        setMessage(t('spotify.connected', 'Spotify connected. Redirecting...'));
        setTimeout(() => navigate('/account'), 600);
      } catch (error) {
        setMessage(error.message || t('spotify.unable', 'Unable to connect to Spotify.'));
      }
    }

    exchangeCode();
  }, [navigate]);

  return (
    <section className="auth-page">
      <article className="panel auth-page-panel">
        <div className="section-heading">
          <p className="eyebrow">{t('account.spotify', 'Spotify')}</p>
          <h4>{t('spotify.status', 'Connection status')}</h4>
        </div>
        <p className="muted">{message}</p>
      </article>
    </section>
  );
}
