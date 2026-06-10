# Deployment

## Railway

The root Railway service builds the Vite client and starts the Express server. Express serves `dist/` and all `/api/*` routes from one public URL.

Required variables:

- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://your-service.up.railway.app`
- `VITE_API_BASE=https://your-service.up.railway.app`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Spotify features additionally require:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI=https://your-service.up.railway.app/callback`

Set `TRANSCRIPTION_SERVICE_URL` to the deployed Python service. `/api/ready` reports configuration state and `/api/transcription/health` checks connectivity.

## Vercel

`vercel.json` deploys the frontend as an SPA. Set `VITE_API_BASE` to a separately deployed backend URL and include the Vercel domain in the backend `CLIENT_ORIGIN` list.

## Operational checks

- Liveness: `GET /api/health`
- Readiness/configuration: `GET /api/ready`
- Transcription dependency: `GET /api/transcription/health`

The server handles `SIGTERM` and `SIGINT`, allowing in-flight connections up to 10 seconds before forced exit.
