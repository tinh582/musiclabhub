import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return /\.(js|jsx)$/.test(entry.name) ? [target] : [];
  });
}

describe('translation coverage', () => {
  it('defines a Vietnamese entry for every translation key used by the UI', () => {
    const usedKeys = new Set();
    collectSourceFiles('src').forEach((file) => {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
        usedKeys.add(match[1]);
      }
    });

    const translations = readFileSync('src/i18n/translations.js', 'utf8');
    const definedKeys = new Set(
      [...translations.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((match) => match[1]),
    );
    const missing = [...usedKeys].filter((key) => !definedKeys.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it('contains valid UTF-8 text without replacement characters', () => {
    const translations = readFileSync('src/i18n/translations.js', 'utf8');
    expect(translations).not.toContain('\uFFFD');
  });
});
