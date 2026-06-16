import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';
import { useNavigate } from 'react-router-dom';
import { importMidiFile } from '../utils/midiImport';
import { playPianoNotes } from '../utils/pianoPlayback';

function frequencyToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function midiToNoteName(midi) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const noteName = noteNames[((midi % 12) + 12) % 12];
  return `${noteName}${octave}`;
}

function noteNameToMidi(noteName) {
  const match = noteName.match(/([A-G])(#?)(-?\d+)/);
  if (!match) return 60;
  const name = match[1];
  const sharp = match[2] === '#';
  const octave = Number(match[3]);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name];
  return base + (sharp ? 1 : 0) + (octave + 1) * 12;
}

const STYLE_MODELS = {
  ambient: {
    scale: [0, 2, 4, 7, 9],
    transitions: [[0, 4], [2, 3], [4, 3], [7, 5], [9, 2], [12, 2], [-3, 1], [-5, 1]],
  },
  upbeat: {
    scale: [0, 2, 4, 7, 9],
    transitions: [[2, 5], [4, 4], [7, 5], [12, 3], [-2, 3], [-5, 2], [0, 1]],
  },
  jazz: {
    scale: [0, 2, 3, 5, 7, 9, 10],
    transitions: [[2, 3], [3, 4], [5, 3], [7, 5], [10, 2], [-2, 4], [-3, 3], [-5, 2]],
  },
  minimalist: {
    scale: [0, 2, 7, 9],
    transitions: [[0, 6], [2, 5], [7, 4], [12, 2], [-5, 3], [-7, 2]],
  },
};

function weightedSample(entries, temperature) {
  const adjusted = entries.map(([value, weight]) => ({
    value,
    weight: Math.pow(weight, 1 / Math.max(0.15, temperature)),
  }));
  const total = adjusted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;
  for (const entry of adjusted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.value;
  }
  return adjusted[adjusted.length - 1].value;
}

function snapToScale(midi, root, scale) {
  let best = midi;
  let bestDistance = Infinity;
  for (let candidate = midi - 6; candidate <= midi + 6; candidate += 1) {
    const pitchClass = ((candidate - root) % 12 + 12) % 12;
    if (scale.includes(pitchClass) && Math.abs(candidate - midi) < bestDistance) {
      best = candidate;
      bestDistance = Math.abs(candidate - midi);
    }
  }
  return best;
}

export function ComposerLab({ moduleHandoff = null, sendModuleHandoff = null, clearModuleHandoff = null }) {
  const navigate = useNavigate();
  const [seedNote, setSeedNote] = useState('C');
  const [seedOctave, setSeedOctave] = useState(4);
  const [style, setStyle] = useState('ambient');
  const [length, setLength] = useState(16);
  const [temperature, setTemperature] = useState(0.5);
  const [melody, setMelody] = useState([]);
  const [playingIdx, setPlayingIdx] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [playbackStatus, setPlaybackStatus] = useState('');
  const pianoRef = useRef(null);
  const midiXmlRef = useRef('');
  const importedHandoffRef = useRef(null);
  const midiInputRef = useRef(null);
  const playbackCleanupRef = useRef(null);

  useEffect(() => {
    if (moduleHandoff?.type !== 'melody' || importedHandoffRef.current === moduleHandoff.id) return;
    const incoming = moduleHandoff.payload?.melody;
    if (!Array.isArray(incoming) || !incoming.length) return;
    importedHandoffRef.current = moduleHandoff.id;
    const normalized = incoming.map((event) => ({
      midi: Number(event.midi),
      duration: Math.max(0.125, Number(event.duration || 0.5)),
      time: Number.isFinite(Number(event.time)) ? Number(event.time) : 0,
      velocity: Math.max(0.2, Math.min(0.95, Number(event.velocity || 0.75))),
      note: event.note || midiToNoteName(Number(event.midi)),
    }));
    setMelody(normalized);
    setLength(Math.min(32, Math.max(4, normalized.length)));
    exportMidiXml(normalized);
    clearModuleHandoff?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleHandoff]);

  function generateMelody() {
    const seed = `${seedNote}${seedOctave}`;
    const startMidi = noteNameToMidi(seed);
    const generated = [{ midi: startMidi, duration: 0.5, time: 0, velocity: 0.8, note: midiToNoteName(startMidi) }];

    const model = STYLE_MODELS[style] || STYLE_MODELS.ambient;
    let current = startMidi;

    for (let i = 1; i < length; i += 1) {
      const interval = weightedSample(model.transitions, temperature);
      let next = snapToScale(current + interval, startMidi, model.scale);

      // constrain to range C3-C6
      while (next < 36) next += 12;
      while (next > 84) next -= 12;

      const durationChoices = temperature > 0.7
        ? [[0.25, 3], [0.5, 4], [0.75, 2], [1, 1]]
        : [[0.25, 1], [0.5, 6], [0.75, 2], [1, 2]];
      const dur = weightedSample(durationChoices, temperature);

      generated.push({
        midi: next,
        duration: dur,
        time: generated.reduce((sum, event) => sum + event.duration, 0),
        velocity: 0.75,
        note: midiToNoteName(next),
      });
      current = next;
    }

    setMelody(generated);
    exportMidiXml(generated);
  }

  function drawPianoRoll(events) {
    const canvas = pianoRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(canvas.clientWidth * dpr);
    const height = Math.floor(140 * dpr);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, width, height);

    if (events.length === 0) return;

    const midis = events.map((e) => e.midi);
    const minMidi = Math.min(...midis, 48);
    const maxMidi = Math.max(...midis, 84);
    const midiRange = Math.max(12, maxMidi - minMidi + 1);

    let xPos = 0;
    const totalDur = events.reduce((s, e) => s + e.duration, 0);

    events.forEach((ev, i) => {
      const w = (ev.duration / totalDur) * width;
      const y = height - ((ev.midi - minMidi) / midiRange) * height - 20;
      const h = 16;
      ctx.fillStyle = 'rgba(110,240,209,0.9)';
      ctx.fillRect(xPos, y, w, h);
      xPos += w;
    });
  }

  async function playMelody() {
    if (melody.length === 0) return;
    playbackCleanupRef.current?.();
    setPlaybackStatus('Loading piano playback...');
    try {
      playbackCleanupRef.current = await playPianoNotes(melody, {
        onProgress: (elapsed) => {
          const activeIndex = melody.findIndex((note) => elapsed >= (note.time || 0) && elapsed < ((note.time || 0) + note.duration));
          setPlayingIdx(activeIndex >= 0 ? activeIndex : null);
        },
        onComplete: () => {
          setPlayingIdx(null);
          setPlaybackStatus('');
          playbackCleanupRef.current = null;
        },
      });
      setPlaybackStatus('Playing with sampled piano');
    } catch (error) {
      console.error(error);
      setPlaybackStatus('Piano playback could not start.');
    }
  }

  async function handleMidiImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing MIDI...');
    try {
      const imported = await importMidiFile(file);
      if (!imported.melody.length) {
        setImportStatus('No playable notes found in this MIDI file.');
        return;
      }
      setMelody(imported.melody);
      setLength(Math.min(32, Math.max(4, imported.melody.length)));
      exportMidiXml(imported.melody);
      setPlaybackStatus(Number.isFinite(imported.tempo) ? `Imported around ${Math.round(imported.tempo)} BPM` : 'Imported MIDI melody');
      setImportStatus(`Imported ${imported.melody.length} notes from ${file.name}`);
    } catch (error) {
      console.error(error);
      setImportStatus('Could not import that MIDI file.');
    } finally {
      event.target.value = '';
    }
  }

  function exportMidiXml(events) {
    const divisions = 480;
    const tempo = 120;
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n  <part-list>\n    <score-part id="P1">\n      <part-name>Composed Melody</part-name>\n    </score-part>\n  </part-list>\n  <part id="P1">\n    <measure number="1">\n      <attributes>\n        <divisions>${divisions}</divisions>\n        <key><fifths>0</fifths></key>\n        <time><beats>4</beats><beat-type>4</beat-type></time>\n        <clef><sign>G</sign><line>2</line></clef>\n      </attributes>\n`;

    let body = '';
    events.forEach((ev) => {
      const quarters = ev.duration * (tempo / 60);
      const durationDivs = Math.max(1, Math.round(quarters * divisions));
      const match = ev.note.match(/([A-G]#?)(-?\d+)/);
      const step = match ? match[1].replace('#', '') : 'C';
      const octave = match ? match[2] : '4';
      const alter = match && match[1].includes('#') ? 1 : 0;
      body += `      <note>\n        <pitch>\n          <step>${step}</step>\n          ${alter ? '<alter>1</alter>' : ''}\n          <octave>${octave}</octave>\n        </pitch>\n        <duration>${durationDivs}</duration>\n      </note>\n`;
    });

    const footer = '    </measure>\n  </part>\n</score-partwise>';
    const xml = header + body + footer;
    midiXmlRef.current = xml;
  }

  function downloadMusicXML() {
    if (!midiXmlRef.current) return;
    const blob = new Blob([midiXmlRef.current], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'composed-melody.musicxml';
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMidi() {
    if (melody.length === 0) return;
    const divisions = 480;
    const tempo = 120;

    const bytes = [];
    function pushByte(b) {
      bytes.push(b & 0xff);
    }
    function pushBytes(arr) {
      arr.forEach((b) => pushByte(b));
    }
    function pushString(s) {
      for (let i = 0; i < s.length; i++) pushByte(s.charCodeAt(i));
    }
    function writeVarLen(value) {
      let buffer = value & 0x7f;
      while ((value >>= 7)) {
        buffer <<= 8;
        buffer |= ((value & 0x7f) | 0x80);
      }
      while (true) {
        pushByte(buffer & 0xff);
        if (buffer & 0x80) buffer >>= 8;
        else break;
      }
    }

    // header
    pushString('MThd');
    pushBytes([0x00, 0x00, 0x00, 0x06]);
    pushBytes([0x00, 0x00]);
    pushBytes([0x00, 0x01]);
    pushBytes([(divisions >> 8) & 0xff, divisions & 0xff]);

    // track
    const track = [];
    function tpush(b) {
      track.push(b & 0xff);
    }
    function tpushBytes(arr) {
      arr.forEach((b) => tpush(b));
    }
    function tpushVarLen(v) {
      let buffer = v & 0x7f;
      while ((v >>= 7)) {
        buffer <<= 8;
        buffer |= ((v & 0x7f) | 0x80);
      }
      while (true) {
        tpush(buffer & 0xff);
        if (buffer & 0x80) buffer >>= 8;
        else break;
      }
    }

    // tempo
    const microPerQuarter = Math.round((60 / tempo) * 1000000);
    tpushVarLen(0);
    tpushBytes([0xff, 0x51, 0x03, (microPerQuarter >> 16) & 0xff, (microPerQuarter >> 8) & 0xff, microPerQuarter & 0xff]);

    // note events
    const events = [];
    melody.forEach((ev) => {
      const tick = Math.round(events.length > 0 ? events[events.length - 1].tick + (ev.duration * divisions * (tempo / 60)) : 0);
      const durTicks = Math.max(1, Math.round(ev.duration * divisions * (tempo / 60)));
      events.push({ tick, type: 'on', midi: ev.midi, vel: 80 });
      events.push({ tick: tick + durTicks, type: 'off', midi: ev.midi, vel: 64 });
    });

    let lastTick = 0;
    events.forEach((ev) => {
      const delta = ev.tick - lastTick;
      tpushVarLen(delta);
      if (ev.type === 'on') {
        tpushBytes([0x90, ev.midi & 0xff, ev.vel & 0xff]);
      } else {
        tpushBytes([0x80, ev.midi & 0xff, ev.vel & 0xff]);
      }
      lastTick = ev.tick;
    });

    // end
    tpushVarLen(0);
    tpushBytes([0xff, 0x2f, 0x00]);

    // chunk
    pushString('MTrk');
    const len = track.length;
    pushBytes([(len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    pushBytes(track);

    const arr = new Uint8Array(bytes);
    const blob = new Blob([arr], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'composed-melody.mid';
    a.click();
    URL.revokeObjectURL(url);
  }

  function sendToInstrument() {
    if (!melody.length || !sendModuleHandoff) return;
    sendModuleHandoff('performance', {
      melody,
      tempo: 120,
      title: 'Composer melody',
    }, 'Composer');
    navigate('/feature/instrument');
  }

  function sendToPractice() {
    if (!melody.length || !sendModuleHandoff) return;
    sendModuleHandoff('practice-melody', {
      melody,
      tempo: 120,
      title: 'Composer melody',
    }, 'Composer');
    navigate('/feature/practice');
  }
  const { t } = useLocale();

  useEffect(() => {
    drawPianoRoll(melody);
  }, [melody]);

  useEffect(() => () => {
    playbackCleanupRef.current?.();
  }, []);

  return (
    <section className="composer-lab">
      <div className="composer-grid">
        <article className="panel panel--filled">
          <div className="section-heading">
            <p className="eyebrow">{t('composer.title', 'Generative Composer')}</p>
            <h4>{t('composer.subtitle', 'Create melodies by setting a seed note, style, and generation parameters.')}</h4>
          </div>

          <div className="composer-controls">
            <div className="composer-control-row">
              <label className="slider-card">
                <span>{t('composer.seedNote', 'Seed note')}</span>
                <select value={seedNote} onChange={(e) => setSeedNote(e.target.value)}>
                  {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="slider-card">
                <span>{t('composer.octave', 'Octave')}</span>
                <select value={seedOctave} onChange={(e) => setSeedOctave(Number(e.target.value))}>
                  {[3, 4, 5, 6].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="slider-card">
                <span>{t('composer.style', 'Style')}</span>
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="ambient">{t('composer.style.ambient', 'Ambient')}</option>
                  <option value="upbeat">{t('composer.style.upbeat', 'Upbeat')}</option>
                  <option value="jazz">{t('composer.style.jazz', 'Jazz')}</option>
                  <option value="minimalist">{t('composer.style.minimalist', 'Minimalist')}</option>
                </select>
              </label>
            </div>

            <div className="composer-control-row">
              <label className="slider-card">
                <span>{t('composer.length', 'Length')}</span>
                <strong>{length}</strong>
                <input type="range" min="4" max="32" step="1" value={length} onChange={(e) => setLength(Number(e.target.value))} />
              </label>
              <label className="slider-card">
                <span>{t('composer.temperature', 'Temperature')}</span>
                <strong>{temperature.toFixed(2)}</strong>
                <input type="range" min="0.1" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
              </label>
            </div>

            <div className="composer-actions">
              <button className="button button--primary" onClick={generateMelody}>
                {t('composer.generate', 'Generate')}
              </button>
              <button className="button button--ghost" onClick={() => midiInputRef.current?.click()}>
                Import MIDI
              </button>
              <input
                ref={midiInputRef}
                type="file"
                accept=".mid,.midi,audio/midi,audio/x-midi"
                hidden
                onChange={handleMidiImport}
              />
              {melody.length > 0 && (
                <>
                  <button className="button button--ghost" onClick={playMelody}>
                    {t('composer.play', 'Play')}
                  </button>
                  <button className="button button--ghost" onClick={downloadMusicXML}>
                    {t('composer.exportXml', 'Export MusicXML')}
                  </button>
                  <button className="button button--ghost" onClick={downloadMidi}>
                    {t('composer.exportMidi', 'Export MIDI')}
                  </button>
                  <button className="button button--ghost" onClick={sendToInstrument}>
                    {t('common.openInstrument', 'Open in Instrument')}
                  </button>
                  <button className="button button--ghost" onClick={sendToPractice}>
                    {t('common.openPractice', 'Open in Practice')}
                  </button>
                </>
              )}
            </div>
            {importStatus ? <p className="practice-note">{importStatus}</p> : null}
            {playbackStatus ? <p className="practice-note">{playbackStatus}</p> : null}

            {melody.length > 0 && (
              <div className="composer-info">
                <p className="eyebrow">{t('composer.generated', 'Generated melody')}</p>
                <div className="melody-stats">
                  <span>{t('composer.notes', 'Notes')}: {melody.length}</span>
                  <span>{t('composer.duration', 'Duration')}: {melody.reduce((s, e) => s + e.duration, 0).toFixed(1)}s</span>
                </div>
                <canvas ref={pianoRef} className="piano-roll-canvas" />
                <div className="melody-notes">
                  {melody.map((note, i) => (
                    <div key={i} className={`melody-note ${playingIdx === i ? 'playing' : ''}`}>
                      <strong>{note.note}</strong>
                      <span>{note.duration.toFixed(2)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <p className="eyebrow">{t('composer.howItWorks', 'How it works')}</p>
            <h4>{t('composer.tips', 'Music generation tips')}</h4>
          </div>
          <div className="composer-tips">
            <p className="practice-note">
              <strong>{t('composer.tip.seed', 'Seed note:')}</strong> {t('composer.tip.seed', 'Not goc: Cao do bat dau cho giai dieu.')}
            </p>
            <p className="practice-note">
              <strong>{t('composer.tip.style', 'Style:')}</strong> {t('composer.tip.style', 'Phong cach: Dinh nghia tap khoang. Ambient em diu, Upbeat nhay, Jazz co chromatic, Minimalist lap lai.')}
            </p>
            <p className="practice-note">
              <strong>{t('composer.tip.temp', 'Temperature:')}</strong> Controls probabilistic interval and rhythm sampling. Lower values favor common transitions; higher values explore less likely ones.
            </p>
            <p className="practice-note">
              <strong>{t('composer.tip.export', 'Export:')}</strong> {t('composer.tip.export', 'Xuat: MusicXML va MIDI dung tot voi phan mem soan nhac va DAW.')}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
