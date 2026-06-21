# 🎵 Music Lab Hub: AI-Powered Music Ecosystem

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3ECF8E)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

An all-in-one web ecosystem that leverages **Artificial Intelligence (AI)** and **Digital Signal Processing (DSP)** to support music composition, transcription, analysis, and recommendation. Built with a Microservices architecture.

## 🌟 Key Features & Architecture

Unlike traditional monolithic applications, Music Lab Hub operates on a robust decoupled architecture:

### 1. Client-Side SPA (React + Vite)
- **Module Handoff Mechanism:** A custom global state manager that allows seamless transfer of heavy `AudioBuffer` and `Blob` objects across different Labs without memory leaks.
- **Client-Side AI:** Executes Neural Network inferences directly in the browser using `TensorFlow.js` for genre classification and data clustering.
- **Advanced DSP & Web Workers:** Offloads heavy mathematical algorithms (like Auto-correlation for pitch detection) to background Web Workers, preventing Main UI Thread freezes.
- **Quality Configs:** Adaptive audio processing modes (Studio/Balanced/Economy) adjusting oversampling and convolution density based on the user's hardware profile (`isLowPowerDevice`).

### 2. Microservices Backend
- **API Gateway (Node.js/Express):** Handles Spotify OAuth 2.0, Rate Limiting, CORS policies, and acts as a secure proxy for audio data streaming.
- **AI Core Service (Python/Flask):** A dedicated containerized service for heavy Polyphonic Piano Transcription using a **Multi-tier Fallback Mechanism**:
  1. *Tier 1:* Cloud Deep Learning models via Hugging Face/Replicate (`bytedance/piano-transcription`).
  2. *Tier 2:* Local Machine Learning using Spotify Basic Pitch.
  3. *Tier 3:* Local DSP fallback using Librosa (pYIN algorithm).

---

## 🔬 The 9 Core Modules

The ecosystem is divided into 3 main functional groups:

### 🎧 Auth & Recommendation Studio
- **Auth:** Secure user identity and session management via Supabase.
- **Recommendation Studio:** Extracts Audio Features (Valence, Energy, Danceability) via Spotify API. Uses a custom Hybrid Scoring Algorithm (`scoreTrack`) to generate personalized playlists, with a `metadata-estimate` fallback if API limits are reached.

### 🎹 Composer & Transcription Lab
- **Composer Lab:** Generates probabilistic melodies with adjustable Temperature and scales (`snapToScale`). Exports to MIDI and MusicXML.
- **Transcription Lab:** Converts raw audio into sheet music/MIDI. Extracts multi-pitch data using the Python AI Microservice or local Auto-correlation Web Workers for monophonic signals.

### 🎛️ Practice & Analysis 
- **Practice Room:** Real-time microphone pitch detection with an "Adaptive Coach" evaluating singing stability and accuracy.
- **Classification Lab:** TensorFlow.js-powered feature extraction plotting tracks on a 2D/3D scatter map.
- **Visualizations Lab:** Real-time Spectrogram, Spectral Centroid (Brightness), Spectral Flatness (Texture), and Chord Timeline visualizations.
- **Effects Lab:** A full-fledged DSP suite featuring Stereo Reverb, Delay, Filters, and up to 4x Oversampled Distortion.
- **Instrument Lab & Analytics Lab:** Synthesizer playground and statistical review of saved analysis snapshots.
## 🚀 Installation & Local Development

This project consists of a React Frontend and a dual-service Backend (Node.js & Python).

### Prerequisites
- **Node.js** (v18 or newer)
- **Python** (v3.11 or newer)
- **Docker** (Optional, recommended for the AI Microservice)
- A **Supabase** project (for Database & Auth)
- A **Spotify Developer** account (for API credentials)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/music-lab-hub.git
cd music-lab-hub
```

### 2. Environment Setup
Create a `.env` file in the root directory based on the provided `.env.example`:
```env
VITE_API_BASE=https://localhost:5174
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://localhost:5173/callback
```

### 3. Frontend Setup (React/Vite)
```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### 4. Backend Setup - API Gateway (Node.js)
```bash
cd server
npm install
npm start
# Runs the Express proxy on port 5174
```

### 5. Backend Setup - AI Core (Python/Flask)
You can run the AI service locally or via Docker.

**Option A: Local Python Environment**
```bash
cd server
pip install -r requirements.txt
gunicorn -b 0.0.0.0:8000 transcription_service:app
```

**Option B: Docker (Recommended)**
```bash
docker build -f Dockerfile.transcription -t mlh-ai-core .
docker run -p 8000:8000 mlh-ai-core
```

---

## 📂 Project Structure

A high-level overview of the workspace organization:

```text
music-lab-hub/
├── public/                     # Static assets and audio samples
├── src/
│   ├── components/             # React UI components (Labs, Studios, Visualizers)
│   ├── hooks/                  # Custom React hooks (e.g., useAudioFeatures)
│   ├── utils/                  # Core logic: DSP algorithms, model evaluation, MIDI exports
│   ├── workers/                # Web Workers (e.g., pitchWorker.js for auto-correlation)
│   ├── lib/                    # Supabase client initialization
│   └── i18n/                   # Internationalization context
├── server/                     # Microservices Backend
│   ├── index.js                # Node.js API Gateway (CORS, Rate limits, Spotify OAuth)
│   ├── transcription_service.py # Python AI Core (HuggingFace/Basic Pitch/Librosa)
│   ├── requirements.txt        # Python dependencies
│   └── Dockerfile.transcription # Docker config for the AI container
├── .env.example                # Environment variables template
└── package.json
```

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

## 🤝 Acknowledgments
- [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [Hugging Face Spaces](https://huggingface.co/spaces)
