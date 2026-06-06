import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

const TARGET_NOTES = [
  { name: 'A3', frequency: 220 },
  { name: 'C4', frequency: 261.63 },
  { name: 'E4', frequency: 329.63 },
  { name: 'A4', frequency: 440 },
  { name: 'C5', frequency: 523.25 },
];

const DEMO_SEQUENCE = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66];

function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) {
    return -1;
  }

  let lastCorrelation = 1;
  let bestOffset = -1;
  let bestCorrelation = 0;
  const correlations = new Array(size).fill(0);

  for (let offset = 0; offset < size; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < size - offset; i += 1) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / size;
    correlations[offset] = correlation;
    if (correlation > 0.9 && correlation > lastCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    } else if (bestOffset > -1 && correlation < bestCorrelation) {
      const shift = correlations.slice(bestOffset, offset);
      let maxVal = -1;
      let maxPos = -1;
      shift.forEach((value, index) => {
        if (value > maxVal) {
          maxVal = value;
          maxPos = index;
        }
      });
      return sampleRate / (bestOffset + maxPos);
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01 && bestOffset > -1) {
    return sampleRate / bestOffset;
  }

  return -1;
}

function frequencyToNoteName(frequency) {
  const noteNumber = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
  const roundedNumber = Math.round(noteNumber);
  const octave = Math.floor(roundedNumber / 12) - 1;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = noteNames[((roundedNumber % 12) + 12) % 12];
  const cents = Math.round((noteNumber - roundedNumber) * 100);
  return {
    name: `${noteName}${octave}`,
    cents,
  };
}

function getPitchScore(targetFrequency, detectedFrequency) {
  if (!detectedFrequency) {
    return 0;
  }

  const centsOff = Math.abs(1200 * Math.log2(detectedFrequency / targetFrequency));
  return Math.max(0, Math.round(100 - Math.min(centsOff, 100)));
}

function formatFrequency(value) {
  return value ? `${value.toFixed(1)} Hz` : '--';
}

export function PracticeRoom() {
  const [status, setStatus] = useState('Idle');
  const [targetIndex, setTargetIndex] = useState(3);
  const [detectedFrequency, setDetectedFrequency] = useState(null);
  const [detectedNote, setDetectedNote] = useState('--');
  const [cents, setCents] = useState(0);
  const [score, setScore] = useState(0);
  const [sessionLog, setSessionLog] = useState([]);
  const [mode, setMode] = useState('mic');
  const [error, setError] = useState('');

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationRef = useRef(null);
  const oscillatorRef = useRef(null);
  const demoStepRef = useRef(0);
  const lastLoggedRef = useRef(0);

  const targetNote = TARGET_NOTES[targetIndex];

  const { t } = useLocale();

  const targetHint = useMemo(() => {
    if (score >= 90) return t('practice.hint.excellent', 'Excellent control');
    if (score >= 70) return t('practice.hint.good', 'Good stability');
    if (score >= 40) return t('practice.hint.adjust', 'Keep adjusting');
    return t('practice.hint.noPitch', 'No stable pitch yet');
  }, [score, t]);
  const coaching = useMemo(() => {
    if (!sessionLog.length) return { accuracy: 0, stability: 0, feedback: 'Start a session to receive coaching.' };
    const accuracy = Math.round(sessionLog.reduce((sum, entry) => sum + entry.score, 0) / sessionLog.length);
    const frequencies = sessionLog.map((entry) => entry.frequency);
    const mean = frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length;
    const deviation = Math.sqrt(frequencies.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / frequencies.length);
    const stability = Math.max(0, Math.round(100 - Math.min(100, (deviation / Math.max(mean, 1)) * 900)));
    let feedback = 'Pitch is moving around. Hold the note with steadier breath and support.';
    if (accuracy >= 88 && stability >= 82) feedback = 'Accurate and stable. Try sustaining the note for longer.';
    else if (accuracy >= 75) feedback = 'Pitch center is close. Slow the adjustment as you approach the target.';
    else if (stability >= 82) feedback = 'The note is stable but centered away from the target. Adjust gradually.';
    return { accuracy, stability, feedback };
  }, [sessionLog]);

  useEffect(() => {
    return () => {
      stopSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAnimation() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }

  function cleanupAudioNodes() {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }

  function stopSession() {
    stopAnimation();
    cleanupAudioNodes();
    setStatus('Idle');
  }

  function samplePitch() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) {
      return;
    }

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);

    if (frequency > 0) {
      const note = frequencyToNoteName(frequency);
      const newScore = getPitchScore(targetNote.frequency, frequency);
      setDetectedFrequency(frequency);
      setDetectedNote(note.name);
      setCents(note.cents);
      setScore(newScore);

      const now = Date.now();
      if (now - lastLoggedRef.current > 900) {
        lastLoggedRef.current = now;
        setSessionLog((entries) => [
          {
            note: note.name,
            frequency,
            score: newScore,
          },
          ...entries,
        ].slice(0, 8));
      }
    } else {
      setDetectedFrequency(null);
      setDetectedNote('--');
      setCents(0);
    }

    animationRef.current = requestAnimationFrame(samplePitch);
  }

  async function startMicrophoneSession() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setStatus('Listening');
      setMode('mic');
      setSessionLog([]);
      lastLoggedRef.current = 0;
      samplePitch();
    } catch (requestError) {
      setError('Microphone access was blocked, so the demo oscillator will be used instead.');
      startDemoSession();
    }
  }

  async function startDemoSession() {
    stopSession();
    setError('');
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = DEMO_SEQUENCE[demoStepRef.current % DEMO_SEQUENCE.length];
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(analyser);
    analyser.connect(audioContext.destination);
    oscillator.start();

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    oscillatorRef.current = oscillator;
    setStatus('Demo running');
    setMode('demo');
    setSessionLog([]);
    lastLoggedRef.current = 0;

    const tick = () => {
      if (!analyserRef.current || !audioContextRef.current) {
        return;
      }

      const currentFrequency = DEMO_SEQUENCE[demoStepRef.current % DEMO_SEQUENCE.length];
      oscillator.frequency.setTargetAtTime(currentFrequency, audioContext.currentTime, 0.03);
      demoStepRef.current += 1;

      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, audioContext.sampleRate);

      if (frequency > 0) {
        const note = frequencyToNoteName(frequency);
        const newScore = getPitchScore(targetNote.frequency, frequency);
        setDetectedFrequency(frequency);
        setDetectedNote(note.name);
        setCents(note.cents);
        setScore(newScore);
        const now = Date.now();
        if (now - lastLoggedRef.current > 900) {
          lastLoggedRef.current = now;
          setSessionLog((entries) => [
            {
              note: note.name,
              frequency,
              score: newScore,
            },
            ...entries,
          ].slice(0, 8));
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    tick();
  }

  return (
    <div className="practice-room">
      <section className="practice-layout">
        <article className="practice-stage">
          <div className="practice-stage__header">
            <div>
              <p className="eyebrow">{t('practice.liveFeedback', 'Live feedback')}</p>
              <h4>{t('practice.title', 'Pitch and timing practice')}</h4>
            </div>
            <span className={`status-pill status-pill--${status === 'Listening' || status === 'Demo running' ? 'live' : 'idle'}`}>
              {status === 'Listening' ? t('practice.status.listening', 'Listening') : status === 'Demo running' ? t('practice.status.demo', 'Demo running') : t('practice.status.idle', 'Idle')}
            </span>
          </div>

          <div className="practice-meter">
            <div className="practice-meter__target">
              <span>{t('practice.target', 'Target')}</span>
              <strong>{targetNote.name}</strong>
              <small>{targetNote.frequency.toFixed(2)} Hz</small>
            </div>
            <div className="practice-meter__live">
              <span>{t('practice.detected', 'Detected')}</span>
              <strong>{detectedNote}</strong>
              <small>{formatFrequency(detectedFrequency)}</small>
            </div>
          </div>

          <div className="practice-gauge">
            <div className="practice-gauge__scale">
              <span>-50</span>
              <span>0</span>
              <span>+50</span>
            </div>
            <div className="practice-gauge__track">
              <div className="practice-gauge__center" />
              <div className="practice-gauge__needle" style={{ left: `calc(50% + ${Math.max(-50, Math.min(50, cents))}%)` }} />
            </div>
            <p className="practice-gauge__label">{t('practice.centsOffset', 'Cents offset')}: {cents >= 0 ? `+${cents}` : cents}</p>
          </div>

          <div className="practice-actions">
            <button type="button" className="button button--primary" onClick={startMicrophoneSession}>
              {t('practice.startMic', 'Start microphone')}
            </button>
            <button type="button" className="button button--ghost" onClick={startDemoSession}>
              {t('practice.startDemo', 'Start demo tone')}
            </button>
            <button type="button" className="button button--ghost" onClick={stopSession}>
              {t('practice.stop', 'Stop')}
            </button>
          </div>

          {error ? <p className="practice-note practice-note--warning">{error}</p> : null}
        </article>

        <aside className="practice-sidebar">
          <article className="practice-card">
            <p className="eyebrow">{t('practice.score', 'Session score')}</p>
            <strong>{score}</strong>
            <p>{targetHint}</p>
          </article>

          <article className="practice-card">
            <p className="eyebrow">Adaptive coach</p>
            <div className="practice-log">
              <div className="practice-log__item"><strong>Accuracy</strong><span>{coaching.accuracy}%</span></div>
              <div className="practice-log__item"><strong>Stability</strong><span>{coaching.stability}%</span></div>
            </div>
            <p className="practice-note">{coaching.feedback}</p>
          </article>

          <article className="practice-card">
            <p className="eyebrow">{t('practice.targetSelection', 'Target selection')}</p>
            <div className="target-grid">
              {TARGET_NOTES.map((note, index) => (
                <button
                  key={note.name}
                  type="button"
                  className={`target-chip${index === targetIndex ? ' active' : ''}`}
                  onClick={() => setTargetIndex(index)}
                >
                  {note.name}
                </button>
              ))}
            </div>
          </article>

          <article className="practice-card">
            <p className="eyebrow">{t('practice.mode', 'Practice mode')}</p>
            <div className="target-grid">
              <button type="button" className={`target-chip${mode === 'mic' ? ' active' : ''}`} onClick={() => setMode('mic')}>
                {t('practice.mode.mic', 'Microphone')}
              </button>
              <button type="button" className={`target-chip${mode === 'demo' ? ' active' : ''}`} onClick={() => setMode('demo')}>
                {t('practice.mode.demo', 'Demo tone')}
              </button>
            </div>
          </article>

          <article className="practice-card practice-card--log">
            <p className="eyebrow">{t('practice.recent', 'Recent readings')}</p>
            <div className="practice-log">
              {sessionLog.length === 0 ? (
                <p className="practice-note">{t('practice.recent.empty', 'Start a session to collect pitch readings.')}</p>
              ) : (
                sessionLog.map((entry, index) => (
                  <div key={`${entry.note}-${index}`} className="practice-log__item">
                    <strong>{entry.note}</strong>
                    <span>{formatFrequency(entry.frequency)}</span>
                    <span>{entry.score}</span>
                  </div>
                ))
              )}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
