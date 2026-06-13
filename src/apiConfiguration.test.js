import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const apiConsumers = [
  './components/TranscriptionLab.jsx',
  './components/RecommendationStudio.jsx',
  './components/ClassificationLab.jsx',
  './pages/AccountPage.jsx',
  './pages/SpotifyCallbackPage.jsx',
];

describe('production API configuration', () => {
  it('uses the current origin when VITE_API_BASE is not configured', () => {
    apiConsumers.forEach((path) => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source).toContain('resolveApiBase(import.meta.env.VITE_API_BASE, import.meta.env.PROD)');
      expect(source).not.toContain('localhost:5174');
    });
  });
});
