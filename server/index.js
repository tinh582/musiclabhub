import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 5174);
const clientOrigin = process.env.CLIENT_ORIGIN || 'https://localhost:5173';
const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://localhost:5173/callback';
const authScopes = process.env.SPOTIFY_SCOPES || 'user-read-email';

app.use(cors({
  origin: clientOrigin,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedExpiry - now > 30_000) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify credentials.');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify request failed (${response.status}) for ${url}: ${errorText}`);
  }

  return response.json();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/spotify/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    res.status(500).send('Missing Spotify client ID.');
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: authScopes,
    show_dialog: 'true',
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get('/api/spotify/exchange', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      res.status(400).json({ error: 'Missing code.' });
      return;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Missing Spotify credentials.' });
      return;
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(500).json({ error: `Token exchange failed (${response.status}): ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      scope: data.scope,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error.' });
  }
});

app.get('/api/spotify/recommendations', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = userToken || await getAccessToken();
    const seedGenre = req.query.seedGenre || 'pop';
    const energy = Number(req.query.energy || 0.7);
    const mood = Number(req.query.mood || 0.6);
    const tempo = Number(req.query.tempo || 120);
    const params = new URLSearchParams({
      q: seedGenre,
      type: 'track',
    });

    const searchResults = await fetchJson(
      `https://api.spotify.com/v1/search?${params.toString()}`,
      token,
    );

    const tracksFromSearch = searchResults.tracks?.items || [];
    const trackIds = tracksFromSearch.map((track) => track.id).filter(Boolean);

    let featureMap = new Map();
    if (userToken && trackIds.length) {
      try {
        const audioFeatures = await fetchJson(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
          token,
        );
        featureMap = new Map(
          (audioFeatures.audio_features || [])
            .filter(Boolean)
            .map((feature) => [feature.id, feature]),
        );
      } catch (error) {
        featureMap = new Map();
      }
    }

    const tracks = tracksFromSearch.map((track) => {
      const features = featureMap.get(track.id);
      return {
        id: track.id,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(', '),
        album: track.album?.name || 'Spotify',
        previewUrl: track.preview_url,
        popularity: track.popularity ?? 50,
        energy: features?.energy ?? energy,
        valence: features?.valence ?? mood,
        danceability: features?.danceability ?? (mood * 0.6 + energy * 0.4),
        tempo: features?.tempo ?? tempo,
        collaborative: features?.liveness ?? 0.4,
        seedGenre,
      };
    });

    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error.' });
  }
});

function resolveCertPath(value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(rootDir, selected);
}

const keyPath = resolveCertPath(process.env.SSL_KEY_PATH, 'localhost+2-key.pem');
const certPath = resolveCertPath(process.env.SSL_CERT_PATH, 'localhost+2.pem');

https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  },
  app,
).listen(port, () => {
  console.log(`Spotify backend running at https://localhost:${port}`);
});
