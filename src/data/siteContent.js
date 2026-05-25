export const navigationItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'Recommendation', path: '/feature/recommendation' },
  { label: 'Transcription', path: '/feature/transcription' },
  { label: 'Classification', path: '/feature/classification' },
  { label: 'Visualizations', path: '/feature/visualizations' },
  { label: 'Composer', path: '/feature/composer' },
  { label: 'Practice', path: '/feature/practice' },
  { label: 'Analytics', path: '/feature/analytics' },
  { label: 'Effects', path: '/feature/effects' },
  { label: 'Instrument', path: '/feature/instrument' },
];

export const topStats = [
  { label: 'Feature modules', value: '9' },
  { label: 'Primary experience', value: '1 site' },
  { label: 'Core demo flow', value: 'Dashboard -> lab page -> result' },
  { label: 'Best thesis fit', value: 'Hybrid music platform' },
];

export const roadmap = [
  {
    title: 'Discovery',
    text: 'Define the research problem, dataset choice, and evaluation method for the selected music feature.',
  },
  {
    title: 'Prototype',
    text: 'Build the dashboard, navigation, feature pages, and one or two working ML or audio demos.',
  },
  {
    title: 'Integration',
    text: 'Connect the pages to one shared layout and one consistent visual language for the final website.',
  },
  {
    title: 'Presentation',
    text: 'Package the demo, write the report, and show how the site supports a complete graduation project.',
  },
];

export const systemLayers = [
  {
    title: 'Frontend',
    text: 'Vite + React + router-based navigation with a polished, responsive dashboard and lab pages.',
  },
  {
    title: 'Audio and ML',
    text: 'Transcription, classification, recommendation, and generation services exposed through feature-specific pages or APIs.',
  },
  {
    title: 'Data',
    text: 'Spotify audio features, public datasets, user recordings, and generated results for each module.',
  },
  {
    title: 'Delivery',
    text: 'A thesis-friendly demo flow with clear outcomes, charts, previews, and session summaries.',
  },
];

export const featurePages = [
  {
    slug: 'recommendation',
    label: 'Recommendation Studio',
    title: 'Playlist generation that blends audio similarity with listener signals.',
    summary:
      'Use content-based audio features, collaborative filtering, and mood controls to generate playlists that feel personal and explainable.',
    accent: 'teal',
    metrics: [
      { label: 'Inputs', value: 'Audio features, likes, skips' },
      { label: 'Output', value: 'Ranked playlist queue' },
      { label: 'Demo mode', value: 'Search, seed track, regenerate' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Seed track selector', 'Similarity score preview', 'Hybrid ranking explanation', 'Playlist export summary'],
      },
      {
        title: 'Implementation notes',
        items: ['Spotify-style feature vectors', 'Collaborative user-item matrix', 'Mood slider for energy and valence', 'Explainable recommendation badges'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Precision@K', 'User preference surveys', 'A/B tests against a baseline playlist'],
      },
    ],
    stack: ['React UI', 'Python recommender service', 'Spotify API', 'Similarity ranking'],
    evaluation: 'Measure how well the system ranks songs users keep, save, or replay during the demo.',
  },
  {
    slug: 'transcription',
    label: 'Transcription Lab',
    title: 'Convert audio into notes, bars, and MusicXML with onset and pitch analysis.',
    summary:
      'Upload a performance, detect onsets and pitch, and display a note preview that can be exported to sheet music.',
    accent: 'gold',
    metrics: [
      { label: 'Inputs', value: 'Audio clips, microphone capture' },
      { label: 'Output', value: 'Note timeline and MusicXML' },
      { label: 'Demo mode', value: 'Upload, detect, export' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Waveform preview', 'Detected note blocks', 'Pitch contour', 'Export/download card'],
      },
      {
        title: 'Implementation notes',
        items: ['Onset detection', 'Pitch tracking', 'Quantization to beats', 'Sheet-music rendering'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Note-level F1 score', 'Timing error in milliseconds', 'Export fidelity against reference score'],
      },
    ],
    stack: ['librosa', 'CREPE or similar model', 'MusicXML export', 'Visualization layer'],
    evaluation: 'Use a small monophonic dataset or your own recordings to compare predicted notes against ground truth.',
  },
  {
    slug: 'classification',
    label: 'Classification Lab',
    title: 'Predict genre or mood and visualize the feature space in a clean research view.',
    summary:
      'Build a classifier that identifies mood or genre, then show how the clusters separate across tempo, energy, and timbre.',
    accent: 'coral',
    metrics: [
      { label: 'Inputs', value: 'Spectral and rhythm features' },
      { label: 'Output', value: 'Genre or emotion label' },
      { label: 'Demo mode', value: 'Upload track, inspect score' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Prediction badge', 'Confidence bars', 'Feature radar or scatter plot', 'Similar tracks list'],
      },
      {
        title: 'Implementation notes',
        items: ['MFCCs and chroma', 'Model training and inference', 'Confidence visualization', 'Dataset labeling strategy'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Accuracy', 'Macro F1', 'Confusion matrix analysis'],
      },
    ],
    stack: ['Feature extraction', 'Classification model', 'Chart layer', 'Dataset dashboard'],
    evaluation: 'Compare genre and emotion results across multiple algorithms and show a confusion matrix in the report.',
  },
  {
    slug: 'visualizations',
    label: 'Visualizations Lab',
    title: 'Explore audio behavior with realtime signal and frequency visualizations.',
    summary:
      'Upload or select a song source, then inspect oscilloscopes, peak and VU levels, spectrum bars, and a scrolling spectrogram.',
    accent: 'blue',
    metrics: [
      { label: 'Inputs', value: 'Uploaded file or URL source' },
      { label: 'Output', value: 'Realtime visual diagnostics' },
      { label: 'Demo mode', value: 'Load, play, inspect' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Oscilloscope waveform', 'Peak meter', 'VU meter', 'Spectrum analyzer', 'Scrolling spectrogram'],
      },
      {
        title: 'Implementation notes',
        items: ['WebAudio AnalyserNode', 'Time and frequency buffers', 'Canvas drawing loop', 'Level smoothing and decay'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Responsiveness (frame smoothness)', 'Meter stability', 'Frequency readability across genres'],
      },
    ],
    stack: ['WebAudio API', 'Canvas 2D', 'AnalyserNode FFT', 'Realtime animation loop'],
    evaluation: 'Use this module to demonstrate practical DSP intuition and clear visual explanation of audio dynamics.',
  },
  {
    slug: 'composer',
    label: 'Generative Composer',
    title: 'Generate melodies or accompaniments from a seed phrase or motif.',
    summary:
      'Let the user pick a style, tempo, and seed motif, then generate musical phrases with repeat controls and variation tools.',
    accent: 'blue',
    metrics: [
      { label: 'Inputs', value: 'Seed notes and style prompts' },
      { label: 'Output', value: 'Melody, motif, accompaniment' },
      { label: 'Demo mode', value: 'Prompt, generate, replay' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Prompt panel', 'Generated phrase timeline', 'Regeneration button', 'MIDI export card'],
      },
      {
        title: 'Implementation notes',
        items: ['RNN or Transformer', 'Temperature and sampling controls', 'Phrase length options', 'Playback preview'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Human listening study', 'Novelty versus coherence', 'Motif repetition quality'],
      },
    ],
    stack: ['Sequence model', 'MIDI playback', 'Prompt controls', 'Variation generator'],
    evaluation: 'Focus on whether generated phrases are musical, consistent, and interesting rather than only statistically correct.',
  },
  {
    slug: 'practice',
    label: 'Practice Room',
    title: 'Give real-time pitch and timing feedback for singing or instrument practice.',
    summary:
      'Capture microphone input, detect pitch drift, and show timing cues so the user can improve in a structured practice loop.',
    accent: 'teal',
    metrics: [
      { label: 'Inputs', value: 'Microphone and reference melody' },
      { label: 'Output', value: 'Live pitch and timing feedback' },
      { label: 'Demo mode', value: 'Warmup, loop, review' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Pitch meter', 'Timing guide', 'Practice session score', 'Session history'],
      },
      {
        title: 'Implementation notes',
        items: ['Real-time audio capture', 'Pitch detection windowing', 'Metronome or beat guide', 'Performance summary charts'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Pitch accuracy over time', 'User progress across sessions', 'Feedback latency'],
      },
    ],
    stack: ['WebAudio API', 'Pitch tracking', 'Session logging', 'Practice analytics'],
    evaluation: 'This is one of the strongest choices for a graduation project because it is practical, visual, and easy to demo live.',
  },
  {
    slug: 'analytics',
    label: 'Music Intelligence',
    title: 'Turn a dataset into charts, trends, and research insights.',
    summary:
      'Use visual analytics to show trends across genres, tempos, popularity, and feature relationships in the music dataset.',
    accent: 'gold',
    metrics: [
      { label: 'Inputs', value: 'Dataset rows and track metadata' },
      { label: 'Output', value: 'Charts, clusters, insights' },
      { label: 'Demo mode', value: 'Filter, compare, export' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Summary cards', 'Trends and distributions', 'Cluster plot', 'Insight notes'],
      },
      {
        title: 'Implementation notes',
        items: ['Feature aggregation', 'Interactive filtering', 'Comparison panel', 'Insight annotations'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Data coverage', 'Clarity of findings', 'Usefulness of visual explanations'],
      },
    ],
    stack: ['Charts', 'Filters', 'Dataset profiling', 'Insight summaries'],
    evaluation: 'A good fallback module if you want a polished, lower-risk feature that still looks academic and complete.',
  },
  {
    slug: 'effects',
    label: 'Effects Rack',
    title: 'Design a small audio effects page for creative processing demos.',
    summary:
      'Show how a saturation, gate, delay, or rhythm effect changes the sound and expose just enough controls for a clear demo.',
    accent: 'coral',
    metrics: [
      { label: 'Inputs', value: 'Dry audio signal' },
      { label: 'Output', value: 'Processed audio preview' },
      { label: 'Demo mode', value: 'Toggle, tweak, compare' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Effect chain layout', 'Knob controls', 'Waveform comparison', 'Preset cards'],
      },
      {
        title: 'Implementation notes',
        items: ['Signal routing', 'Dry/wet control', 'Preset switching', 'Simple UI metering'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Audio response curve', 'Usability feedback', 'Creative effect quality'],
      },
    ],
    stack: ['Audio processing', 'Knob UI', 'Preset manager', 'Comparison playback'],
    evaluation: 'Use this as a companion page if you want to show applied signal-processing knowledge in the website.',
  },
  {
    slug: 'instrument',
    label: 'Smart Instrument',
    title: 'Prototype a connected instrument page for sensors or microcontroller input.',
    summary:
      'Present sensor readings, mapping logic, and companion app behavior for an Arduino or Raspberry Pi music instrument.',
    accent: 'blue',
    metrics: [
      { label: 'Inputs', value: 'Sensors and microcontroller data' },
      { label: 'Output', value: 'Mapped musical response' },
      { label: 'Demo mode', value: 'Connect, calibrate, play' },
    ],
    panels: [
      {
        title: 'What the page shows',
        items: ['Sensor map', 'Live telemetry', 'Calibration actions', 'Playback status'],
      },
      {
        title: 'Implementation notes',
        items: ['Serial or web connection', 'Gesture to note mapping', 'Calibration panel', 'Companion app overview'],
      },
      {
        title: 'Evaluation ideas',
        items: ['Latency', 'Mapping accuracy', 'Expressive usability'],
      },
    ],
    stack: ['Hardware bridge', 'Sensor visualization', 'Calibration workflow', 'Music output mapping'],
    evaluation: 'This page is perfect if your project includes hardware, but it can also remain a high-fidelity concept page if hardware is optional.',
  },
];

export const dashboardCards = featurePages.map(({ slug, label, summary, accent }) => ({
  slug,
  label,
  summary,
  accent,
}));
