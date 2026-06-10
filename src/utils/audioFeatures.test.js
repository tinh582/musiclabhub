import { describe, expect, it } from 'vitest';
import { detectChordFromChroma, detectKeyFromChroma } from './audioFeatures';

function chromaWith(notes) {
  const chroma = Array(12).fill(0.02);
  notes.forEach(([pitchClass, weight]) => {
    chroma[pitchClass] = weight;
  });
  return chroma;
}

describe('harmonic detection', () => {
  it('detects a C major triad', () => {
    const result = detectChordFromChroma(chromaWith([[0, 1], [4, 0.85], [7, 0.9]]));
    expect(result.chord).toBe('C');
    expect(result.confidence).toBeGreaterThan(0.25);
  });

  it('detects an A minor triad', () => {
    const result = detectChordFromChroma(chromaWith([[9, 1], [0, 0.9], [4, 0.85]]));
    expect(result.chord).toBe('Am');
  });

  it('distinguishes major and minor keys using tonal profiles', () => {
    const cMajor = detectKeyFromChroma([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]);
    const aMinor = detectKeyFromChroma([6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
      .map((_, index, profile) => profile[((index - 9) % 12 + 12) % 12]));
    expect(cMajor.key).toBe('C major');
    expect(aMinor.key).toBe('A minor');
  });
});
