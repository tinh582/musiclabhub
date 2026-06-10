import { describe, expect, it } from 'vitest';
import { equalPowerMix, processingHeadroom, qualityConfig } from './audioProcessing';

describe('audio processing quality', () => {
  it('uses equal-power gains at the middle of the wet/dry range', () => {
    const mix = equalPowerMix(0.5);
    expect(mix.wet).toBeCloseTo(Math.SQRT1_2, 5);
    expect(mix.dry).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('clamps invalid wet values', () => {
    expect(equalPowerMix(-1)).toEqual({ dry: 1, wet: 0 });
    expect(equalPowerMix(2).dry).toBeCloseTo(0, 10);
  });

  it('adds headroom as distortion and feedback increase', () => {
    expect(processingHeadroom(0.9, 0.8)).toBeLessThan(processingHeadroom(0, 0.2));
    expect(processingHeadroom(1, 1)).toBeGreaterThanOrEqual(0.58);
  });

  it('falls back to balanced quality', () => {
    expect(qualityConfig('unknown').label).toBe('Balanced');
    expect(qualityConfig('studio').oversample).toBe('4x');
  });
});
