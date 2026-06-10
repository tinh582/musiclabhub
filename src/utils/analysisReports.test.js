import { describe, expect, it } from 'vitest';
import { analysisReportToHtml, buildAnalysisReport } from './analysisReports';

describe('analysis reports', () => {
  it('builds a stable report without embedding restoration snapshots', () => {
    const report = buildAnalysisReport([{
      module: 'Effects',
      title: 'Warm profile',
      source: 'song.wav',
      createdAt: '2026-06-10T00:00:00.000Z',
      metrics: [{ label: 'Key', value: 'C major' }],
      snapshot: { large: 'private state' },
      snapshotVersion: 1,
    }], new Date('2026-06-10T01:00:00.000Z'));
    expect(report.resultCount).toBe(1);
    expect(report.results[0].snapshot).toBeUndefined();
    expect(report.generatedAt).toBe('2026-06-10T01:00:00.000Z');
  });

  it('escapes user-controlled report text in HTML', () => {
    const report = buildAnalysisReport([{ title: '<script>alert(1)</script>', metrics: [] }]);
    const html = analysisReportToHtml(report);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
