import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(new URL('./components/Layout.jsx', import.meta.url), 'utf8');
const practice = readFileSync(new URL('./components/PracticeRoom.jsx', import.meta.url), 'utf8');
const effects = readFileSync(new URL('./components/EffectsLab.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('accessibility regressions', () => {
  it('provides skip navigation and route focus management', () => {
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
    expect(layout).toContain('pageTitleRef.current?.focus');
  });

  it('exposes expanded and live states', () => {
    expect(layout).toContain('aria-expanded={historyOpen}');
    expect(layout).toContain('aria-live="polite"');
    expect(practice).toContain('role="status"');
    expect(practice).toContain('aria-pressed=');
  });

  it('labels effect controls with spoken values', () => {
    expect(effects.match(/aria-valuetext=/g)).toHaveLength(7);
    expect(effects).toContain('aria-label="Select catalog sample"');
  });

  it('supports visible focus and reduced motion', () => {
    expect(styles).toContain('.skip-link:focus');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('@media (forced-colors: active)');
  });
});
