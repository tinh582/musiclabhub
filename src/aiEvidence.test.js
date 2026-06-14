import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const component = readFileSync(new URL('./components/AIAnalysisStream.jsx', import.meta.url), 'utf8');
const modules = [
  './components/ClassificationLab.jsx',
  './components/TranscriptionLab.jsx',
  './components/EffectsLab.jsx',
  './components/VisualizationsLab.jsx',
];

describe('visible AI evidence', () => {
  it('announces live and completed analysis states', () => {
    expect(component).toContain('Analysis process');
    expect(component).toContain('Analyzing now');
    expect(component).toContain('Analysis complete');
    expect(component).toContain('aria-live="polite"');
  });

  it('is connected to the primary analysis modules', () => {
    modules.forEach((path) => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source).toContain('<AIAnalysisStream');
      expect(source).toContain('findings=');
    });
  });

  it('shows named processing stages instead of an indeterminate spinner', () => {
    expect(component).toContain('steps.map');
    expect(component).toContain('Running');
    expect(component).toContain('Queued');
  });
});
