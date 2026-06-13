export function resolveApiBase(configuredBase, isProduction) {
  const base = String(configuredBase || '').trim().replace(/\/+$/, '');
  if (isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
    return '';
  }
  return base;
}
