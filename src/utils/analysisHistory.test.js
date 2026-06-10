import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_HISTORY_KEY,
  ANALYSIS_SNAPSHOT_VERSION,
  createAnalysisEntry,
  createRestoreHandoff,
  readAnalysisHistory,
  writeAnalysisHistory,
} from './analysisHistory';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('analysis history', () => {
  it('returns an empty list for malformed persisted data', () => {
    const storage = createStorage({ [ANALYSIS_HISTORY_KEY]: '{broken' });
    expect(readAnalysisHistory(storage)).toEqual([]);
  });

  it('filters entries that cannot be reopened', () => {
    const storage = createStorage({
      [ANALYSIS_HISTORY_KEY]: JSON.stringify([
        { id: 'valid', slug: 'effects' },
        { id: 'missing-slug' },
        null,
      ]),
    });
    expect(readAnalysisHistory(storage)).toEqual([{ id: 'valid', slug: 'effects' }]);
  });

  it('creates a versioned entry when a snapshot is present', () => {
    const entry = createAnalysisEntry(
      { slug: 'effects', snapshot: { wet: 0.4 } },
      () => 1000,
      () => 0.5,
    );
    expect(entry.id).toBe('1000-i');
    expect(entry.createdAt).toBe('1970-01-01T00:00:01.000Z');
    expect(entry.snapshotVersion).toBe(ANALYSIS_SNAPSHOT_VERSION);
  });

  it('keeps only the newest 40 entries', () => {
    const storage = createStorage();
    const entries = Array.from({ length: 45 }, (_, index) => ({ id: String(index), slug: 'analytics' }));
    expect(writeAnalysisHistory(entries, storage)).toHaveLength(40);
    expect(readAnalysisHistory(storage)).toHaveLength(40);
  });

  it('creates a module restore handoff for snapshot entries', () => {
    const handoff = createRestoreHandoff({
      slug: 'transcription',
      title: 'Saved melody',
      snapshotVersion: 1,
      snapshot: { tempo: 120 },
    }, () => 2000);
    expect(handoff).toMatchObject({
      id: 2000,
      type: 'restore-analysis',
      source: 'Analysis history',
      payload: {
        slug: 'transcription',
        title: 'Saved melody',
        snapshot: { tempo: 120 },
      },
    });
  });

  it('does not create a restore handoff for legacy summary-only entries', () => {
    expect(createRestoreHandoff({ slug: 'classification' })).toBeNull();
  });
});
