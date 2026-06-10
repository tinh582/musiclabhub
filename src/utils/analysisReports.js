function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildAnalysisReport(entries, generatedAt = new Date()) {
  const items = entries.map((entry) => ({
    module: entry.module || 'Analysis',
    title: entry.title || 'Untitled result',
    source: entry.source || 'Unknown source',
    createdAt: entry.createdAt,
    metrics: entry.metrics || [],
    snapshotVersion: entry.snapshotVersion || null,
  }));
  return {
    reportVersion: 1,
    generatedAt: generatedAt.toISOString(),
    resultCount: items.length,
    results: items,
  };
}

export function analysisReportToHtml(report) {
  const sections = report.results.map((entry) => `
    <section>
      <p class="module">${escapeHtml(entry.module)}</p>
      <h2>${escapeHtml(entry.title)}</h2>
      <p>${escapeHtml(entry.source)} · ${escapeHtml(entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown date')}</p>
      <dl>${entry.metrics.map((metric) => `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value)}</dd></div>`).join('')}</dl>
    </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Music Lab Hub Analysis Report</title>
  <style>body{font:16px system-ui;margin:40px;max-width:900px;color:#17202a}header{border-bottom:2px solid #17202a;margin-bottom:28px}section{padding:20px 0;border-bottom:1px solid #ccd3da}.module{font-size:12px;text-transform:uppercase;font-weight:700}h1,h2{margin:4px 0}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}dl div{background:#f2f5f7;padding:12px}dt{font-size:12px;color:#56616b}dd{margin:4px 0 0;font-weight:700}</style>
  </head><body><header><p class="module">Music Lab Hub</p><h1>Analysis Report</h1><p>Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())} · ${report.resultCount} result${report.resultCount === 1 ? '' : 's'}</p></header>${sections}</body></html>`;
}
