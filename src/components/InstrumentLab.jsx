import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

const baseNotes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const keyToCode = { KeyA: 0, KeyW:1, KeyS:2, KeyE:3, KeyD:4, KeyF:5, KeyT:6, KeyG:7, KeyY:8, KeyH:9, KeyU:10, KeyJ:11, KeyK:12 };

function noteName(octave, index) {
  return `${baseNotes[index]}${octave}`;
}

function noteToFreqFromMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteNameToMidi(name) {
  const m = name.match(/([A-G])(#?)(-?\d+)/);
  if (!m) return 60;
  const base = m[1];
  const sharp = m[2] === '#';
  const octave = Number(m[3]);
  const baseMap = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  return baseMap[base] + (sharp ? 1 : 0) + (octave + 1) * 12;
}

export function InstrumentLab({ moduleHandoff = null, clearModuleHandoff = null }) {
  const [ctx, setCtx] = useState(null);
  const voices = useRef({});
  const [wave, setWave] = useState('sine');
  const [attack, setAttack] = useState(0.01);
  const [release, setRelease] = useState(0.4);
  const [masterGain, setMasterGain] = useState(0.6);
  const masterRef = useRef(null);
  const eventsRef = useRef([]);
  const recorderRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState(null);
  const recordedBlobRef = useRef(null);

  const [octaves, setOctaves] = useState(3);
  const [baseOctave, setBaseOctave] = useState(3);
  const keyboardRef = useRef(null);
  const pointerState = useRef({ dragging:false, startX:0, startBase:3 });

  const [activeKeys, setActiveKeys] = useState({});
  const [velocityCurve, setVelocityCurve] = useState(1.0);
  const [sustain, setSustain] = useState(false);
  const sustainedNotesRef = useRef([]);
  const [midiAccessState, setMidiAccessState] = useState(null);
  const [midiOutputs, setMidiOutputs] = useState([]);
  const [selectedMidiOut, setSelectedMidiOut] = useState(null);
  const [quantizeRes, setQuantizeRes] = useState(16);
  const [quantizeTempo, setQuantizeTempo] = useState(120);
  const [importedPerformance, setImportedPerformance] = useState(null);
  const importedHandoffRef = useRef(null);

  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('instr-presets') || '[]'); } catch (e) { return []; }
  });

  useEffect(() => {
    function onKey(e) {
      const code = e.code;
      if (e.type === 'keydown') {
        if (e.repeat) return;
        if (code in keyToCode) playByIndex(keyToCode[code], 0.9);
      } else if (e.type === 'keyup') {
        if (code in keyToCode) stopByIndex(keyToCode[code]);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [ctx, wave, attack, release, baseOctave, octaves]);

  useEffect(() => {
    if (moduleHandoff?.type !== 'performance' || importedHandoffRef.current === moduleHandoff.id) return;
    const melody = moduleHandoff.payload?.melody;
    if (!Array.isArray(melody) || !melody.length) return;
    importedHandoffRef.current = moduleHandoff.id;
    const tempo = Number(moduleHandoff.payload?.tempo || 120);
    let cursor = 0;
    const events = [];
    melody.forEach((note) => {
      const duration = Math.max(0.125, Number(note.duration || 0.5));
      events.push({ time: cursor, type: 'on', note: Number(note.midi), vel: 90 });
      events.push({ time: cursor + duration, type: 'off', note: Number(note.midi), vel: 64 });
      cursor += duration;
    });
    eventsRef.current = events;
    setQuantizeTempo(tempo);
    setImportedPerformance({
      title: moduleHandoff.payload?.title || 'Imported melody',
      melody,
      duration: cursor,
    });
    clearModuleHandoff?.();
  }, [clearModuleHandoff, moduleHandoff]);

  function playImportedPerformance() {
    if (!importedPerformance?.melody?.length) return;
    const audioCtx = ensureCtx();
    let cursor = audioCtx.currentTime + 0.08;
    importedPerformance.melody.forEach((note, index) => {
      const duration = Math.max(0.125, Number(note.duration || 0.5));
      const id = `imported-${index}-${cursor}`;
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = noteToFreqFromMidi(Number(note.midi));
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(0.35, cursor + Math.max(0.01, attack));
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      oscillator.connect(gain);
      gain.connect(masterRef.current);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.02);
      cursor += duration;
      void id;
    });
  }

  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = masterGain;
  }, [masterGain]);

  function ensureCtx() {
    if (ctx) return ctx;
    const Ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = Ctx.createGain();
    master.gain.value = masterGain;
    master.connect(Ctx.destination);
    masterRef.current = master;
    // media stream for recording
    const msDest = Ctx.createMediaStreamDestination();
    master.connect(msDest);
    masterRef.current.stream = msDest.stream;
    setCtx(Ctx);
    return Ctx;
  }

  function startVoice(id, midi, velocity=1) {
    const audioCtx = ensureCtx();
    if (!audioCtx) return;
    if (voices.current[id]) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = wave;
    o.frequency.value = noteToFreqFromMidi(midi);
    // velocity scales gain
    const velGain = Math.max(0.0001, velocity);
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(masterRef.current);
    const now = audioCtx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(velGain, now + Math.max(0.001, attack));
    o.start(now);
    voices.current[id] = { o, g, midi };
    // capture event
    eventsRef.current.push({ time: now, type: 'on', note: midi, vel: Math.round(velGain * 127) });
    setActiveKeys((s) => ({ ...s, [midi]: true }));
    // WebMIDI output if selected
    if (selectedMidiOut && midiAccessState) {
      try { selectedMidiOut.send([0x90, midi & 0xff, Math.round(velGain * 127)]); } catch (e) { /* ignore */ }
    }
  }

  function stopVoiceImmediate(id) {
    if (!ctx) return;
    const v = voices.current[id];
    if (!v) return;
    const now = ctx.currentTime;
    const releaseTime = Math.max(0.01, release);
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(v.g.gain.value, now);
    v.g.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
    try { v.o.stop(now + releaseTime + 0.02); } catch (e) {}
    eventsRef.current.push({ time: now + releaseTime, type: 'off', note: v.midi, vel: 64 });
    delete voices.current[id];
    setActiveKeys((s) => { const nxt = { ...s }; delete nxt[v.midi]; return nxt; });
    if (selectedMidiOut && midiAccessState) {
      try { selectedMidiOut.send([0x80, v.midi & 0xff, 64]); } catch (e) { /* ignore */ }
    }
  }

  function stopVoice(id) {
    if (sustain) {
      const v = voices.current[id];
      if (!v) return;
      if (!sustainedNotesRef.current.some((item) => item.id === id)) {
        sustainedNotesRef.current.push({ id, midi: v.midi });
      }
      return;
    }
    stopVoiceImmediate(id);
  }

  function playByIndex(index, velocity=1) {
    // index refers to single-octave index (0..12)
    const midi = noteNameToMidi(noteName(baseOctave, index));
    startVoice(`${index}-${Date.now()}`, midi, velocity);
  }
  function stopByIndex(index) {
    // stop any voice with same midi
    const expectedMidi = noteNameToMidi(noteName(baseOctave, index));
    Object.keys(voices.current).forEach((k) => {
      const v = voices.current[k];
      if (!v) return;
      if (v.midi === expectedMidi) stopVoice(k);
    });
  }

  function onPointerDownKey(e, octaveIdx, noteIdx) {
    e.preventDefault();
    const id = `${octaveIdx}-${noteIdx}-${Date.now()}`;
    const midi = noteNameToMidi(noteName(baseOctave + octaveIdx, noteIdx));
    let velocity = e.pressure || 0;
    if (!velocity) {
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      velocity = 0.2 + rel * 0.8;
    }
    const velAdj = Math.pow(velocity, velocityCurve || 1.0);
    startVoice(id, midi, velAdj);
    // attach pointer capture
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    e.currentTarget._playingId = id;
  }

  function onPointerUpKey(e) {
    e.preventDefault();
    const id = e.currentTarget._playingId;
    if (id) stopVoice(id);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  // keyboard panning (drag to change baseOctave)
  function onPointerDownKeyboard(e) {
    pointerState.current.dragging = true;
    pointerState.current.startX = e.clientX;
    pointerState.current.startBase = baseOctave;
  }
  function onPointerMoveKeyboard(e) {
    if (!pointerState.current.dragging) return;
    const dx = e.clientX - pointerState.current.startX;
    const shift = Math.floor(dx / 80); // each 80px = one octave
    setBaseOctave(Math.max(0, Math.min(6, pointerState.current.startBase + shift)));
  }
  function onPointerUpKeyboard() { pointerState.current.dragging = false; }

  // recording processed audio (webm) and MIDI export
  function startRecording() {
    if (!masterRef.current || !masterRef.current.stream) return;
    eventsRef.current = [];
    const mr = new MediaRecorder(masterRef.current.stream);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      recordedBlobRef.current = blob;
      setRecordUrl(url);
    };
    recorderRef.current = mr;
    mr.start();
    setIsRecording(true);
  }
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setIsRecording(false);
  }

  function exportMIDI() {
    if (!eventsRef.current || eventsRef.current.length === 0) return;
    const events = eventsRef.current.slice().sort((a,b) => a.time - b.time);
    const t0 = events[0].time;
    const tempo = quantizeTempo || 120; // default or user selection
    const divisions = 480;
    const bytes = [];
    function pushByte(b) { bytes.push(b & 0xff); }
    function pushBytes(arr) { arr.forEach((b) => pushByte(b)); }
    function pushString(s) { for (let i = 0; i < s.length; i++) pushByte(s.charCodeAt(i)); }
    function writeVarLen(value, push) {
      let buffer = value & 0x7f;
      while ((value >>= 7)) {
        buffer <<= 8;
        buffer |= ((value & 0x7f) | 0x80);
      }
      while (true) {
        push(buffer & 0xff);
        if (buffer & 0x80) buffer >>= 8; else break;
      }
    }
    // header
    pushString('MThd'); pushBytes([0,0,0,6]); pushBytes([0,0]); pushBytes([0,1]); pushBytes([(divisions>>8)&0xff, divisions&0xff]);
    // track
    const track = [];
    function tpush(b){ track.push(b & 0xff); }
    function tpushBytes(arr){ arr.forEach((b)=>tpush(b)); }
    function tpushVarLen(v){ writeVarLen(v, tpush); }
    const microPerQuarter = Math.round((60/tempo)*1000000);
    tpushVarLen(0); tpushBytes([0xff,0x51,0x03, (microPerQuarter>>16)&0xff, (microPerQuarter>>8)&0xff, microPerQuarter&0xff]);
    let lastTick=0;
    const q = quantizeRes || 16;
    events.forEach((ev)=>{
      const beats = (ev.time - t0) * (tempo / 60);
      const qBeats = Math.round(beats * q) / q;
      const tick = Math.round(qBeats * divisions);
      const delta = tick - lastTick;
      tpushVarLen(delta);
      if (ev.type === 'on') tpushBytes([0x90, ev.note & 0xff, ev.vel & 0xff]); else tpushBytes([0x80, ev.note & 0xff, ev.vel & 0xff]);
      lastTick = tick;
    });
    tpushVarLen(0); tpushBytes([0xff,0x2f,0x00]);
    pushString('MTrk'); const len = track.length; pushBytes([(len>>24)&0xff,(len>>16)&0xff,(len>>8)&0xff,len&0xff]); pushBytes(track);
    const arr = new Uint8Array(bytes);
    const blob = new Blob([arr], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'performance.mid'; a.click(); URL.revokeObjectURL(url);
  }

  // convert AudioBuffer to WAV ArrayBuffer
  function audioBufferToWav(buffer, opt) {
    opt = opt || {};
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = opt.float32 ? 3 : 1; // 3 = IEEE float, 1 = PCM
    const bitsPerSample = format === 3 ? 32 : 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const bufferLength = buffer.length * blockAlign + 44;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + buffer.length * blockAlign, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // subchunk1Size
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitsPerSample, true); offset += 2;
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, buffer.length * blockAlign, true); offset += 4;

    // write interleaved data
    const channels = [];
    for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));
    const sampleCount = buffer.length;
    if (format === 1) {
      // PCM 16
      for (let i = 0; i < sampleCount; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          let sample = Math.max(-1, Math.min(1, channels[ch][i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        }
      }
    } else {
      // float32
      for (let i = 0; i < sampleCount; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          view.setFloat32(offset, channels[ch][i], true);
          offset += 4;
        }
      }
    }
    return arrayBuffer;
  }

  async function exportWavFromRecordedBlob() {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const aCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuf = await aCtx.decodeAudioData(arrayBuffer);
      const wavBuf = audioBufferToWav(audioBuf);
      const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a'); a.href = url; a.download = 'synth.wav'; a.click(); URL.revokeObjectURL(url);
      try { aCtx.close(); } catch (e) {}
    } catch (err) {
      console.error('WAV export failed', err);
    }
  }

  async function requestMidiAccess() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const access = await navigator.requestMIDIAccess();
      setMidiAccessState(access);
      const outs = Array.from(access.outputs.values());
      setMidiOutputs(outs);
      if (outs.length) setSelectedMidiOut(outs[0]);
      access.onstatechange = () => {
        setMidiOutputs(Array.from(access.outputs.values()));
      };
    } catch (e) {
      console.warn('MIDI not available', e);
    }
  }

  function releaseSustained() {
    const list = sustainedNotesRef.current.slice();
    sustainedNotesRef.current = [];
    list.forEach((it) => {
      try { stopVoiceImmediate(it.id); } catch (e) {}
    });
  }

  function savePreset(name) {
    const p = { name, wave, attack, release, masterGain, octaves, baseOctave };
    const next = [...presets.filter((x)=>x.name!==name), p];
    setPresets(next); localStorage.setItem('instr-presets', JSON.stringify(next));
  }
  function loadPreset(name) {
    const p = presets.find((x)=>x.name===name); if (!p) return;
    setWave(p.wave); setAttack(p.attack); setRelease(p.release); setMasterGain(p.masterGain); setOctaves(p.octaves); setBaseOctave(p.baseOctave);
  }
  function deletePreset(name) { const next = presets.filter((x)=>x.name!==name); setPresets(next); localStorage.setItem('instr-presets', JSON.stringify(next)); }

  const { t } = useLocale();

  return (
    <section className="instrument-lab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">{t('instrument.title', 'Smart Instrument')}</p>
          <h4>{t('instrument.subtitle', 'Polyphonic synth — play with mouse, pointer or keyboard')}</h4>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => ensureCtx()}>{t('instrument.initAudio', 'Init Audio')}</button>
          <label className="form-label" style={{ marginLeft: 8 }}>{t('instrument.wave', 'Wave')}</label>
          <select value={wave} onChange={(e) => setWave(e.target.value)}>
            <option value="sine">sine</option>
            <option value="square">square</option>
            <option value="sawtooth">sawtooth</option>
            <option value="triangle">triangle</option>
          </select>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
            <button className="btn" onClick={() => { if (!isRecording) startRecording(); else stopRecording(); }}>{isRecording ? t('instrument.stopRec', 'Stop Rec') : t('instrument.record', 'Record')}</button>
            {recordUrl && <a className="btn" href={recordUrl} download="synth.webm">{t('instrument.download', 'Download')}</a>}
            <button className="btn" onClick={() => exportWavFromRecordedBlob()}>{t('instrument.exportWav', 'Export WAV')}</button>
            <button className="btn" onClick={() => exportMIDI()}>{t('instrument.exportMidi', 'Export MIDI')}</button>
            <button className="btn" onClick={() => requestMidiAccess()}>{t('instrument.midiConnect', 'MIDI Connect')}</button>
            {midiOutputs.length > 0 && (
              <select value={selectedMidiOut ? selectedMidiOut.id : ''} onChange={(e) => { const out = midiOutputs.find(o => o.id === e.target.value); setSelectedMidiOut(out || null); }}>
                <option value="">{t('instrument.midiSelect', 'Select MIDI Out')}</option>
                {midiOutputs.map((o) => (<option key={o.id} value={o.id}>{o.name || o.id}</option>))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        {importedPerformance ? (
          <div className="analysis-summary" style={{ marginBottom: 12 }}>
            <span>{importedPerformance.title}</span>
            <span>{importedPerformance.melody.length} notes</span>
            <span>{importedPerformance.duration.toFixed(1)}s</span>
            <button type="button" className="mini-button" onClick={playImportedPerformance}>Play imported</button>
          </div>
        ) : null}
        <div className="controls-row">
          <div>
            <label className="form-label">{t('instrument.attack', 'Attack')}</label>
            <input type="range" min={0.001} max={0.5} step={0.001} value={attack} onChange={(e) => setAttack(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.release', 'Release')}</label>
            <input type="range" min={0.01} max={1.5} step={0.01} value={release} onChange={(e) => setRelease(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.master', 'Master')}</label>
            <input type="range" min={0} max={1} step={0.01} value={masterGain} onChange={(e) => setMasterGain(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.octaves', 'Octaves')}</label>
            <input type="range" min={1} max={6} step={1} value={octaves} onChange={(e) => setOctaves(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.baseOctave', 'Base octave')}</label>
            <input type="number" min={0} max={8} value={baseOctave} onChange={(e) => setBaseOctave(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.velocity', 'Velocity curve')}</label>
            <input type="range" min={0.2} max={3} step={0.01} value={velocityCurve} onChange={(e)=> setVelocityCurve(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.sustain', 'Sustain')}</label>
            <input type="checkbox" checked={sustain} onChange={(e)=> { setSustain(e.target.checked); if (!e.target.checked) releaseSustained(); }} />
          </div>
          <div>
            <label className="form-label">{t('instrument.quantizeTempo', 'Quantize tempo')}</label>
            <input type="number" min={30} max={300} value={quantizeTempo} onChange={(e)=> setQuantizeTempo(Number(e.target.value))} />
          </div>
          <div>
            <label className="form-label">{t('instrument.resolution', 'Resolution')}</label>
            <select value={quantizeRes} onChange={(e)=> setQuantizeRes(Number(e.target.value))}>
              <option value={1}>1/1</option>
              <option value={2}>1/2</option>
              <option value={4}>1/4</option>
              <option value={8}>1/8</option>
              <option value={16}>1/16</option>
              <option value={32}>1/32</option>
            </select>
          </div>
        </div>

        <div ref={keyboardRef} className="keyboard" role="application" aria-label="Synth keyboard" onPointerDown={onPointerDownKeyboard} onPointerMove={onPointerMoveKeyboard} onPointerUp={onPointerUpKeyboard} onPointerCancel={onPointerUpKeyboard}>
          {Array.from({length: octaves}).map((_, oi) => (
            <div key={oi} style={{ display: 'flex', position: 'relative' }}>
              {baseNotes.map((n, ni) => {
                const isSharp = n.includes('#');
                const midi = noteNameToMidi(noteName(baseOctave + oi, ni));
                const active = !!activeKeys[midi];
                const cls = `key ${isSharp ? 'black' : 'white'} ${active ? 'active' : ''}`;
                return (
                  <div key={`${oi}-${ni}`} className={cls}
                    onPointerDown={(e) => onPointerDownKey(e, oi, ni)}
                    onPointerUp={(e) => onPointerUpKey(e)}
                    onPointerLeave={(e) => onPointerUpKey(e)}
                    style={{ marginLeft: isSharp ? -12 : 0 }}>
                    <div className="key-label">{noteName(baseOctave + oi, ni)}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder={t('instrument.presetName', 'Preset name')} id="presetName" />
          <button className="btn" onClick={() => { const el = document.getElementById('presetName'); if (el && el.value) savePreset(el.value); }}>{t('instrument.savePreset', 'Save Preset')}</button>
          <select onChange={(e)=> loadPreset(e.target.value)}>
            <option value="">{t('instrument.loadPreset', 'Load preset')}</option>
            {presets.map((p)=> (<option key={p.name} value={p.name}>{p.name}</option>))}
          </select>
          <select onChange={(e)=> deletePreset(e.target.value)}>
            <option value="">{t('instrument.deletePreset', 'Delete preset')}</option>
            {presets.map((p)=> (<option key={p.name} value={p.name}>{p.name}</option>))}
          </select>
        </div>

        <p style={{ marginTop: 10, color: 'var(--muted)' }}>{t('instrument.tip', 'Tip: Use keys A/W/S/E... to play the center octave. Drag horizontally on the keyboard to shift octaves. Use pointer pressure or vertical position for velocity.')}</p>
      </div>
    </section>
  );
}
