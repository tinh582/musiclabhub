import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lab = readFileSync(new URL('./components/TranscriptionLab.jsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('./workers/pitchWorker.js', import.meta.url), 'utf8');

describe('transcription responsiveness and stability', () => {
  it('does not run the full shared feature analyzer on the UI thread', () => {
    expect(lab).not.toContain('computeAudioBufferFeatures');
  });

  it('bounds waveform sampling to display resolution', () => {
    expect(lab).toContain('samplesPerColumn');
    expect(lab).toContain('sampleStride');
  });

  it('segments fallback events by stable quantized pitch', () => {
    expect(worker).toContain('frequencyToMidi');
    expect(worker).toContain('YIN({ sampleRate');
    expect(worker).toContain('agreement >= 0.5');
    expect(worker).toContain('duration >= 0.1');
  });
});
