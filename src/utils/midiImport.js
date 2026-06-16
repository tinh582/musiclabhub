export function midiNumberToNoteName(midi) {
  const roundedMidi = Math.round(Number(midi) || 60);
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${noteNames[((roundedMidi % 12) + 12) % 12]}${Math.floor(roundedMidi / 12) - 1}`;
}

export async function importMidiFile(file) {
  const { Midi } = await import('@tonejs/midi');
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  const tempo = Math.round(midi.header.tempos?.[0]?.bpm || 120);
  const notes = midi.tracks
    .flatMap((track) => track.notes.map((note) => ({
      midi: Math.round(note.midi),
      duration: Math.max(0.05, Number(note.duration || 0.25)),
      time: Number(note.time || 0),
      velocity: Math.max(0.1, Math.min(1, Number(note.velocity || 0.75))),
      note: midiNumberToNoteName(note.midi),
    })))
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  return {
    title: file.name.replace(/\.[^.]+$/, '') || 'Imported MIDI',
    tempo,
    melody: notes,
    duration: notes.length ? Math.max(...notes.map((note) => note.time + note.duration)) : 0,
  };
}
