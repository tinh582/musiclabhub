import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TOKEN_KEY = 'spotify_access_token';
const TOKEN_EXPIRY_KEY = 'spotify_access_token_expiry';
const API_BASE = import.meta.env.VITE_API_BASE || 'https://localhost:5174';

export function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Connecting to Spotify...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      setMessage('Missing Spotify authorization code.');
      return;
    }

    async function exchangeCode() {
      try {
        const response = await fetch(`${API_BASE}/api/spotify/exchange?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to connect to Spotify.');
        }

        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
        setMessage('Spotify connected. Redirecting...');
        setTimeout(() => navigate('/account'), 600);
      } catch (error) {
        setMessage(error.message || 'Unable to connect to Spotify.');
      }
    }

    exchangeCode();
  }, [navigate]);

  return (
    <section className="auth-page">
      <article className="panel auth-page-panel">
        <div className="section-heading">
          <p className="eyebrow">Spotify</p>
          <h4>Connection status</h4>
        </div>
        <p className="muted">{message}</p>
      </article>
    </section>
  );
}
