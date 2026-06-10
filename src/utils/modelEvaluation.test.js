import { describe, expect, it } from 'vitest';
import { evaluateClassifications } from './modelEvaluation';

describe('model evaluation', () => {
  it('computes accuracy and per-label metrics', () => {
    const result = evaluateClassifications(
      ['rock', 'rock', 'jazz', 'jazz'],
      ['rock', 'jazz', 'jazz', 'jazz'],
      ['rock', 'jazz'],
    );
    expect(result.accuracy).toBe(0.75);
    expect(result.correct).toBe(3);
    expect(result.perLabel.find((item) => item.label === 'rock')).toMatchObject({
      precision: 1,
      recall: 0.5,
      support: 2,
    });
  });

  it('produces a complete confusion matrix', () => {
    const result = evaluateClassifications(['a', 'b'], ['b', 'a'], ['a', 'b']);
    expect(result.confusion).toEqual({
      a: { a: 0, b: 1 },
      b: { a: 1, b: 0 },
    });
  });
});
