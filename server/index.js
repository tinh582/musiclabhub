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
const authScopes = process.env.SPOTIFY_SCOPES || 'user-read-email user-top-read';
const transcriptionServiceUrl = process.env.TRANSCRIPTION_SERVICE_URL || 'http://127.0.0.1:8000';
const useHttps = process.env.USE_HTTPS === 'true';

app.use(cors({
  origin: clientOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Sample-Rate',
    'X-Duration',
    'X-File-Name',
    'X-Tempo',
  ],
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, token, options = {}) {
  const retries = Number(options.retries ?? 2);
  const baseDelayMs = Number(options.baseDelayMs ?? 500);
  const timeoutMs = Number(options.timeoutMs ?? 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Spotify request failed (${response.status}) for ${url}: ${errorText}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Spotify request timed out for ${url}.`);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  throw new Error(`Spotify request failed (429) for ${url}: Too many requests`);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/transcription/health', async (req, res) => {
  try {
    const response = await fetch(`${transcriptionServiceUrl}/api/health`);
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message || 'Transcription service unavailable.' });
  }
});

app.get('/api/transcription/analyze', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Transcription analyze endpoint is available. Use POST with audio bytes.',
    expectedMethod: 'POST',
  });
});

app.post('/api/transcription/analyze', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const response = await fetch(`${transcriptionServiceUrl}/api/transcription/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'X-Sample-Rate': req.headers['x-sample-rate'] || '',
        'X-Duration': req.headers['x-duration'] || '',
        'X-File-Name': req.headers['x-file-name'] || '',
      },
      body: req.body,
    });

    const text = await response.text();
    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(503).json({ error: error.message || 'Transcription service unavailable.' });
  }
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

app.get('/api/spotify/top-tracks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) {
      res.status(401).json({ error: 'Missing user token.' });
      return;
    }

    const limit = Math.min(Number(req.query.limit || 20), 50);
    const timeRange = req.query.timeRange || 'medium_term';

    const topTracks = await fetchJson(
      `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
      userToken,
    );

    const tracks = topTracks.items || [];
    const trackIds = tracks.map((track) => track.id).filter(Boolean);
    let featureMap = new Map();

    if (trackIds.length) {
      try {
        const audioFeatures = await fetchJson(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
          userToken,
        );
        featureMap = new Map(
          (audioFeatures.audio_features || [])
            .filter(Boolean)
            .map((feature) => [feature.id, feature]),
        );
      } catch (error) {
        try {
          const appToken = await getAccessToken();
          const audioFeatures = await fetchJson(
            `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
            appToken,
          );
          featureMap = new Map(
            (audioFeatures.audio_features || [])
              .filter(Boolean)
              .map((feature) => [feature.id, feature]),
          );
        } catch (fallbackError) {
          featureMap = new Map();
        }
      }
    }

    const results = tracks.map((track) => {
      const features = featureMap.get(track.id);
      return {
        id: track.id,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(', '),
        energy: features?.energy ?? null,
        valence: features?.valence ?? null,
        danceability: features?.danceability ?? null,
        tempo: features?.tempo ?? null,
      };
    });

    res.json({ tracks: results });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error.' });
  }
});

app.get('/api/spotify/seeds', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!userToken) {
      res.json({ artists: [], genres: [] });
      return;
    }

    const topArtists = await fetchJson(
      'https://api.spotify.com/v1/me/top/artists?limit=12&time_range=medium_term',
      userToken,
    );

    const artists = (topArtists.items || []).map((artist) => ({
      id: artist.id,
      name: artist.name,
      genres: artist.genres || [],
    }));

    const genreCount = new Map();
    artists.forEach((artist) => {
      (artist.genres || []).forEach((genre) => {
        genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
      });
    });

    const genres = [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre);

    res.json({
      artists: artists.map((artist) => ({ id: artist.id, name: artist.name })),
      genres,
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
    const seedArtistName = req.query.seedArtistName || '';
    const energy = Number(req.query.energy || 0.7);
    const mood = Number(req.query.mood || 0.6);
    const tempo = Number(req.query.tempo || 120);
    const requestedLimit = Math.min(Number(req.query.limit || 30), 40);
    const offsets = [0, 20].filter((offset) => offset < requestedLimit);

    const queries = seedArtistName
      ? [`artist:"${seedArtistName}"`, seedArtistName]
      : [seedGenre, `${seedGenre} new`, `${seedGenre} playlist`];

    const searchPromises = offsets.map(async (offset) => {
      const q = queries[offset % queries.length];
      const batchLimit = Math.min(20, Math.max(0, requestedLimit - offset));
      if (batchLimit === 0) {
        return { tracks: { items: [] } };
      }

      const params = new URLSearchParams({
        q,
        type: 'track',
        limit: String(batchLimit),
        offset: String(offset),
      });

      try {
        return await fetchJson(
          `https://api.spotify.com/v1/search?${params.toString()}`,
          token,
          { retries: 1, baseDelayMs: 400, timeoutMs: 12000 },
        );
      } catch (error) {
        if (String(error.message || '').includes('Invalid limit')) {
          const fallbackParams = new URLSearchParams({ q, type: 'track' });
          return fetchJson(
            `https://api.spotify.com/v1/search?${fallbackParams.toString()}`,
            token,
            { retries: 1, baseDelayMs: 400, timeoutMs: 12000 },
          );
        }
        return { tracks: { items: [] } };
      }
    });

    const searchResults = (await Promise.allSettled(searchPromises))
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const tracksFromSearch = searchResults
      .flatMap((result) => result.tracks?.items || [])
      .filter(Boolean);
    const uniqueTracks = new Map();
    tracksFromSearch.forEach((track) => {
      if (track?.id && !uniqueTracks.has(track.id)) {
        uniqueTracks.set(track.id, track);
      }
    });

    const dedupedTracks = [...uniqueTracks.values()];
    const trackIds = dedupedTracks.map((track) => track.id).filter(Boolean);

    let featureMap = new Map();
    if (userToken && trackIds.length) {
      try {
        const audioFeatures = await fetchJson(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
          token,
          { retries: 1, baseDelayMs: 400, timeoutMs: 12000 },
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

    const featuresEnabled = userToken && featureMap.size > 0;

    const tracks = dedupedTracks.map((track) => {
      const features = featureMap.get(track.id);
      return {
        id: track.id,
        title: track.name,
        artist: track.artists.map((artist) => artist.name).join(', '),
        album: track.album?.name || 'Spotify',
        previewUrl: track.preview_url,
        spotifyUrl: track.external_urls?.spotify,
        popularity: track.popularity ?? 50,
        energy: features?.energy ?? energy,
        valence: features?.valence ?? mood,
        danceability: features?.danceability ?? (mood * 0.6 + energy * 0.4),
        tempo: features?.tempo ?? tempo,
        collaborative: features?.liveness ?? 0.4,
        seedGenre,
      };
    });

    res.json({
      meta: {
        source: userToken ? 'user' : 'app',
        audioFeatures: featuresEnabled,
      },
      tracks,
    });
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

if (useHttps) {
  https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    app,
  ).listen(port, () => {
    console.log(`Spotify backend running at https://localhost:${port}`);
  });
} else {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Spotify backend running at http://0.0.0.0:${port}`);
  });
}
