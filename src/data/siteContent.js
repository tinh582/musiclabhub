export function buildSiteContent(t) {
  const navigationItems = [
    { label: t('nav.dashboard', 'Dashboard'), path: '/' },
    { label: t('nav.recommendation', 'Recommendation'), path: '/feature/recommendation' },
    { label: t('nav.transcription', 'Transcription'), path: '/feature/transcription' },
    { label: t('nav.classification', 'Classification'), path: '/feature/classification' },
    { label: t('nav.visualizations', 'Visualizations'), path: '/feature/visualizations' },
    { label: t('nav.composer', 'Composer'), path: '/feature/composer' },
    { label: t('nav.practice', 'Practice'), path: '/feature/practice' },
    { label: t('nav.analytics', 'Analytics'), path: '/feature/analytics' },
    { label: t('nav.effects', 'Effects'), path: '/feature/effects' },
    { label: t('nav.instrument', 'Instrument'), path: '/feature/instrument' },
  ];

  const topStats = [
    { label: t('dashboard.stats.title1', 'Feature modules'), value: t('dashboard.stats.value1', '9') },
    { label: t('dashboard.stats.title2', 'Primary experience'), value: t('dashboard.stats.value2', '1 site') },
    { label: t('dashboard.stats.title3', 'Core demo flow'), value: t('dashboard.stats.value3', 'Dashboard -> lab page -> result') },
    { label: t('dashboard.stats.title4', 'Best thesis fit'), value: t('dashboard.stats.value4', 'Hybrid music platform') },
  ];

  const systemLayers = [
    {
      title: t('system.frontend', 'Frontend'),
      text: t('system.frontend.text', 'Vite + React + router-based navigation with a polished, responsive dashboard and lab pages.'),
    },
    {
      title: t('system.audioMl', 'Audio and ML'),
      text: t('system.audioMl.text', 'Transcription, classification, recommendation, and generation services exposed through feature-specific pages or APIs.'),
    },
    {
      title: t('system.data', 'Data'),
      text: t('system.data.text', 'Spotify audio features, public datasets, user recordings, and generated results for each module.'),
    },
    {
      title: t('system.delivery', 'Delivery'),
      text: t('system.delivery.text', 'A thesis-friendly demo flow with clear outcomes, charts, previews, and session summaries.'),
    },
  ];

  const featurePages = [
    {
      slug: 'recommendation',
      label: t('feature.recommendation.label', 'Recommendation Studio'),
      title: t('feature.recommendation.title', 'Playlist generation that blends audio similarity with listener signals.'),
      summary: t('feature.recommendation.summary', 'Use content-based audio features, collaborative filtering, and mood controls to generate playlists that feel personal and explainable.'),
      accent: 'teal',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.recommendation.inputs', 'Audio features, likes, skips') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.recommendation.output', 'Ranked playlist queue') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.recommendation.demo', 'Search, seed track, regenerate') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.recommendation.panel.seed', 'Seed track selector'),
            t('feature.recommendation.panel.similarity', 'Similarity score preview'),
            t('feature.recommendation.panel.hybrid', 'Hybrid ranking explanation'),
            t('feature.recommendation.panel.export', 'Playlist export summary'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.recommendation.impl.vectors', 'Spotify-style feature vectors'),
            t('feature.recommendation.impl.matrix', 'Collaborative user-item matrix'),
            t('feature.recommendation.impl.mood', 'Mood slider for energy and valence'),
            t('feature.recommendation.impl.badges', 'Explainable recommendation badges'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.recommendation.eval.precision', 'Precision@K'),
            t('feature.recommendation.eval.surveys', 'User preference surveys'),
            t('feature.recommendation.eval.ab', 'A/B tests against a baseline playlist'),
          ],
        },
      ],
      stack: [
        t('feature.recommendation.stack.ui', 'React UI'),
        t('feature.recommendation.stack.service', 'Python recommender service'),
        t('feature.recommendation.stack.api', 'Spotify API'),
        t('feature.recommendation.stack.rank', 'Similarity ranking'),
      ],
      evaluation: t('feature.recommendation.evaluation', 'Measure how well the system ranks songs users keep, save, or replay during the demo.'),
    },
    {
      slug: 'transcription',
      label: t('feature.transcription.label', 'Transcription Lab'),
      title: t('feature.transcription.title', 'Convert audio into notes, bars, and MusicXML with onset and pitch analysis.'),
      summary: t('feature.transcription.summary', 'Upload a performance, detect onsets and pitch, and display a note preview that can be exported to sheet music.'),
      accent: 'gold',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.transcription.inputs', 'Audio clips, microphone capture') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.transcription.output', 'Note timeline and MusicXML') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.transcription.demo', 'Upload, detect, export') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.transcription.panel.wave', 'Waveform preview'),
            t('feature.transcription.panel.blocks', 'Detected note blocks'),
            t('feature.transcription.panel.pitch', 'Pitch contour'),
            t('feature.transcription.panel.export', 'Export/download card'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.transcription.impl.onset', 'Onset detection'),
            t('feature.transcription.impl.pitch', 'Pitch tracking'),
            t('feature.transcription.impl.quantize', 'Quantization to beats'),
            t('feature.transcription.impl.sheet', 'Sheet-music rendering'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.transcription.eval.f1', 'Note-level F1 score'),
            t('feature.transcription.eval.timing', 'Timing error in milliseconds'),
            t('feature.transcription.eval.fidelity', 'Export fidelity against reference score'),
          ],
        },
      ],
      stack: [
        t('feature.transcription.stack.librosa', 'librosa'),
        t('feature.transcription.stack.model', 'CREPE or similar model'),
        t('feature.transcription.stack.xml', 'MusicXML export'),
        t('feature.transcription.stack.viz', 'Visualization layer'),
      ],
      evaluation: t('feature.transcription.evaluation', 'Use a small monophonic dataset or your own recordings to compare predicted notes against ground truth.'),
    },
    {
      slug: 'classification',
      label: t('feature.classification.label', 'Classification Lab'),
      title: t('feature.classification.title', 'Predict genre or mood and visualize the feature space in a clean research view.'),
      summary: t('feature.classification.summary', 'Build a classifier that identifies mood or genre, then show how the clusters separate across tempo, energy, and timbre.'),
      accent: 'coral',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.classification.inputs', 'Spectral and rhythm features') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.classification.output', 'Genre or emotion label') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.classification.demo', 'Upload track, inspect score') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.classification.panel.prediction', 'Prediction badge'),
            t('feature.classification.panel.confidence', 'Confidence bars'),
            t('feature.classification.panel.plot', 'Feature radar or scatter plot'),
            t('feature.classification.panel.similar', 'Similar tracks list'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.classification.impl.mfcc', 'MFCCs and chroma'),
            t('feature.classification.impl.training', 'Model training and inference'),
            t('feature.classification.impl.conf', 'Confidence visualization'),
            t('feature.classification.impl.labels', 'Dataset labeling strategy'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.classification.eval.acc', 'Accuracy'),
            t('feature.classification.eval.f1', 'Macro F1'),
            t('feature.classification.eval.cm', 'Confusion matrix analysis'),
          ],
        },
      ],
      stack: [
        t('feature.classification.stack.features', 'Feature extraction'),
        t('feature.classification.stack.model', 'Classification model'),
        t('feature.classification.stack.chart', 'Chart layer'),
        t('feature.classification.stack.dashboard', 'Dataset dashboard'),
      ],
      evaluation: t('feature.classification.evaluation', 'Compare genre and emotion results across multiple algorithms and show a confusion matrix in the report.'),
    },
    {
      slug: 'visualizations',
      label: t('feature.visualizations.label', 'Visualizations Lab'),
      title: t('feature.visualizations.title', 'Explore audio behavior with realtime signal and frequency visualizations.'),
      summary: t('feature.visualizations.summary', 'Upload or select a song source, then inspect oscilloscopes, peak and VU levels, spectrum bars, and a scrolling spectrogram.'),
      accent: 'blue',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.visualizations.inputs', 'Uploaded file or URL source') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.visualizations.output', 'Realtime visual diagnostics') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.visualizations.demo', 'Load, play, inspect') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.visualizations.panel.osc', 'Oscilloscope waveform'),
            t('feature.visualizations.panel.peak', 'Peak meter'),
            t('feature.visualizations.panel.vu', 'VU meter'),
            t('feature.visualizations.panel.spectrum', 'Spectrum analyzer'),
            t('feature.visualizations.panel.spectrogram', 'Scrolling spectrogram'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.visualizations.impl.node', 'WebAudio AnalyserNode'),
            t('feature.visualizations.impl.buffers', 'Time and frequency buffers'),
            t('feature.visualizations.impl.canvas', 'Canvas drawing loop'),
            t('feature.visualizations.impl.smoothing', 'Level smoothing and decay'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.visualizations.eval.fps', 'Responsiveness (frame smoothness)'),
            t('feature.visualizations.eval.stability', 'Meter stability'),
            t('feature.visualizations.eval.readability', 'Frequency readability across genres'),
          ],
        },
      ],
      stack: [
        t('feature.visualizations.stack.api', 'WebAudio API'),
        t('feature.visualizations.stack.canvas', 'Canvas 2D'),
        t('feature.visualizations.stack.fft', 'AnalyserNode FFT'),
        t('feature.visualizations.stack.loop', 'Realtime animation loop'),
      ],
      evaluation: t('feature.visualizations.evaluation', 'Use this module to demonstrate practical DSP intuition and clear visual explanation of audio dynamics.'),
    },
    {
      slug: 'composer',
      label: t('feature.composer.label', 'Generative Composer'),
      title: t('feature.composer.title', 'Generate melodies or accompaniments from a seed phrase or motif.'),
      summary: t('feature.composer.summary', 'Let the user pick a style, tempo, and seed motif, then generate musical phrases with repeat controls and variation tools.'),
      accent: 'blue',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.composer.inputs', 'Seed notes and style prompts') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.composer.output', 'Melody, motif, accompaniment') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.composer.demo', 'Prompt, generate, replay') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.composer.panel.prompt', 'Prompt panel'),
            t('feature.composer.panel.timeline', 'Generated phrase timeline'),
            t('feature.composer.panel.regen', 'Regeneration button'),
            t('feature.composer.panel.export', 'MIDI export card'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.composer.impl.model', 'RNN or Transformer'),
            t('feature.composer.impl.temp', 'Temperature and sampling controls'),
            t('feature.composer.impl.length', 'Phrase length options'),
            t('feature.composer.impl.preview', 'Playback preview'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.composer.eval.study', 'Human listening study'),
            t('feature.composer.eval.novelty', 'Novelty versus coherence'),
            t('feature.composer.eval.motif', 'Motif repetition quality'),
          ],
        },
      ],
      stack: [
        t('feature.composer.stack.model', 'Sequence model'),
        t('feature.composer.stack.midi', 'MIDI playback'),
        t('feature.composer.stack.prompt', 'Prompt controls'),
        t('feature.composer.stack.variation', 'Variation generator'),
      ],
      evaluation: t('feature.composer.evaluation', 'Focus on whether generated phrases are musical, consistent, and interesting rather than only statistically correct.'),
    },
    {
      slug: 'practice',
      label: t('feature.practice.label', 'Practice Room'),
      title: t('feature.practice.title', 'Give real-time pitch and timing feedback for singing or instrument practice.'),
      summary: t('feature.practice.summary', 'Capture microphone input, detect pitch drift, and show timing cues so the user can improve in a structured practice loop.'),
      accent: 'teal',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.practice.inputs', 'Microphone and reference melody') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.practice.output', 'Live pitch and timing feedback') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.practice.demo', 'Warmup, loop, review') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.practice.panel.pitch', 'Pitch meter'),
            t('feature.practice.panel.timing', 'Timing guide'),
            t('feature.practice.panel.score', 'Practice session score'),
            t('feature.practice.panel.history', 'Session history'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.practice.impl.capture', 'Real-time audio capture'),
            t('feature.practice.impl.pitch', 'Pitch detection windowing'),
            t('feature.practice.impl.metro', 'Metronome or beat guide'),
            t('feature.practice.impl.summary', 'Performance summary charts'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.practice.eval.accuracy', 'Pitch accuracy over time'),
            t('feature.practice.eval.progress', 'User progress across sessions'),
            t('feature.practice.eval.latency', 'Feedback latency'),
          ],
        },
      ],
      stack: [
        t('feature.practice.stack.api', 'WebAudio API'),
        t('feature.practice.stack.pitch', 'Pitch tracking'),
        t('feature.practice.stack.logging', 'Session logging'),
        t('feature.practice.stack.analytics', 'Practice analytics'),
      ],
      evaluation: t('feature.practice.evaluation', 'This is one of the strongest choices for a graduation project because it is practical, visual, and easy to demo live.'),
    },
    {
      slug: 'analytics',
      label: t('feature.analytics.label', 'Music Intelligence'),
      title: t('feature.analytics.title', 'Turn a dataset into charts, trends, and research insights.'),
      summary: t('feature.analytics.summary', 'Use visual analytics to show trends across genres, tempos, popularity, and feature relationships in the music dataset.'),
      accent: 'gold',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.analytics.inputs', 'Dataset rows and track metadata') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.analytics.output', 'Charts, clusters, insights') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.analytics.demo', 'Filter, compare, export') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.analytics.panel.summary', 'Summary cards'),
            t('feature.analytics.panel.trends', 'Trends and distributions'),
            t('feature.analytics.panel.cluster', 'Cluster plot'),
            t('feature.analytics.panel.insight', 'Insight notes'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.analytics.impl.aggregate', 'Feature aggregation'),
            t('feature.analytics.impl.filter', 'Interactive filtering'),
            t('feature.analytics.impl.compare', 'Comparison panel'),
            t('feature.analytics.impl.insight', 'Insight annotations'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.analytics.eval.coverage', 'Data coverage'),
            t('feature.analytics.eval.clarity', 'Clarity of findings'),
            t('feature.analytics.eval.usefulness', 'Usefulness of visual explanations'),
          ],
        },
      ],
      stack: [
        t('feature.analytics.stack.charts', 'Charts'),
        t('feature.analytics.stack.filters', 'Filters'),
        t('feature.analytics.stack.profiling', 'Dataset profiling'),
        t('feature.analytics.stack.insights', 'Insight summaries'),
      ],
      evaluation: t('feature.analytics.evaluation', 'A good fallback module if you want a polished, lower-risk feature that still looks academic and complete.'),
    },
    {
      slug: 'effects',
      label: t('feature.effects.label', 'Effects Rack'),
      title: t('feature.effects.title', 'Design a small audio effects page for creative processing demos.'),
      summary: t('feature.effects.summary', 'Show how a saturation, gate, delay, or rhythm effect changes the sound and expose just enough controls for a clear demo.'),
      accent: 'coral',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.effects.inputs', 'Dry audio signal') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.effects.output', 'Processed audio preview') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.effects.demo', 'Toggle, tweak, compare') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.effects.panel.chain', 'Effect chain layout'),
            t('feature.effects.panel.knobs', 'Knob controls'),
            t('feature.effects.panel.wave', 'Waveform comparison'),
            t('feature.effects.panel.presets', 'Preset cards'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.effects.impl.routing', 'Signal routing'),
            t('feature.effects.impl.mix', 'Dry/wet control'),
            t('feature.effects.impl.presets', 'Preset switching'),
            t('feature.effects.impl.meter', 'Simple UI metering'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.effects.eval.curve', 'Audio response curve'),
            t('feature.effects.eval.usability', 'Usability feedback'),
            t('feature.effects.eval.creative', 'Creative effect quality'),
          ],
        },
      ],
      stack: [
        t('feature.effects.stack.audio', 'Audio processing'),
        t('feature.effects.stack.knob', 'Knob UI'),
        t('feature.effects.stack.preset', 'Preset manager'),
        t('feature.effects.stack.compare', 'Comparison playback'),
      ],
      evaluation: t('feature.effects.evaluation', 'Use this as a companion page if you want to show applied signal-processing knowledge in the website.'),
    },
    {
      slug: 'instrument',
      label: t('feature.instrument.label', 'Smart Instrument'),
      title: t('feature.instrument.title', 'Prototype a connected instrument page for sensors or microcontroller input.'),
      summary: t('feature.instrument.summary', 'Present sensor readings, mapping logic, and companion app behavior for an Arduino or Raspberry Pi music instrument.'),
      accent: 'blue',
      metrics: [
        { label: t('feature.metrics.inputs', 'Inputs'), value: t('feature.instrument.inputs', 'Sensors and microcontroller data') },
        { label: t('feature.metrics.output', 'Output'), value: t('feature.instrument.output', 'Mapped musical response') },
        { label: t('feature.metrics.demo', 'Demo mode'), value: t('feature.instrument.demo', 'Connect, calibrate, play') },
      ],
      panels: [
        {
          title: t('feature.panel.what', 'What the page shows'),
          items: [
            t('feature.instrument.panel.sensor', 'Sensor map'),
            t('feature.instrument.panel.telemetry', 'Live telemetry'),
            t('feature.instrument.panel.calibration', 'Calibration actions'),
            t('feature.instrument.panel.playback', 'Playback status'),
          ],
        },
        {
          title: t('feature.panel.implementation', 'Implementation notes'),
          items: [
            t('feature.instrument.impl.serial', 'Serial or web connection'),
            t('feature.instrument.impl.mapping', 'Gesture to note mapping'),
            t('feature.instrument.impl.calibration', 'Calibration panel'),
            t('feature.instrument.impl.companion', 'Companion app overview'),
          ],
        },
        {
          title: t('feature.panel.evaluation', 'Evaluation ideas'),
          items: [
            t('feature.instrument.eval.latency', 'Latency'),
            t('feature.instrument.eval.mapping', 'Mapping accuracy'),
            t('feature.instrument.eval.usability', 'Expressive usability'),
          ],
        },
      ],
      stack: [
        t('feature.instrument.stack.bridge', 'Hardware bridge'),
        t('feature.instrument.stack.viz', 'Sensor visualization'),
        t('feature.instrument.stack.calibration', 'Calibration workflow'),
        t('feature.instrument.stack.mapping', 'Music output mapping'),
      ],
      evaluation: t('feature.instrument.evaluation', 'This page is perfect if your project includes hardware, but it can also remain a high-fidelity concept page if hardware is optional.'),
    },
  ];

  const dashboardCards = featurePages.map(({ slug, label, summary, accent }) => ({
    slug,
    label,
    summary,
    accent,
  }));

  return {
    navigationItems,
    topStats,
    systemLayers,
    featurePages,
    dashboardCards,
  };
}
