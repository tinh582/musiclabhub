export const ANALYSIS_HISTORY_KEY = 'mlh_analysis_history';
export const ANALYSIS_SNAPSHOT_VERSION = 1;

export function readAnalysisHistory(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(ANALYSIS_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.id && entry.slug) : [];
  } catch {
    return [];
  }
}

export function createAnalysisEntry(entry, now = Date.now, random = Math.random) {
  const timestamp = now();
  return {
    id: `${timestamp}-${random().toString(36).slice(2, 7)}`,
    createdAt: new Date(timestamp).toISOString(),
    snapshotVersion: entry.snapshot ? ANALYSIS_SNAPSHOT_VERSION : undefined,
    ...entry,
  };
}

export function writeAnalysisHistory(entries, storage = window.localStorage) {
  const next = entries.slice(0, 40);
  storage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function createRestoreHandoff(entry, now = Date.now) {
  if (!entry?.snapshot) return null;
  return {
    id: now(),
    type: 'restore-analysis',
    payload: {
      slug: entry.slug,
      snapshotVersion: entry.snapshotVersion || 1,
      snapshot: entry.snapshot,
      title: entry.title,
    },
    source: 'Analysis history',
    createdAt: new Date(now()).toISOString(),
  };
}
