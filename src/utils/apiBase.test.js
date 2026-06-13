import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './apiBase';

describe('API base resolution', () => {
  it('uses same-origin APIs by default', () => {
    expect(resolveApiBase('', true)).toBe('');
  });

  it('ignores localhost URLs in production', () => {
    expect(resolveApiBase('https://localhost:5174', true)).toBe('');
    expect(resolveApiBase('http://127.0.0.1:5174/', true)).toBe('');
  });

  it('keeps local and remote URLs when appropriate', () => {
    expect(resolveApiBase('http://localhost:5174', false)).toBe('http://localhost:5174');
    expect(resolveApiBase('https://api.example.com/', true)).toBe('https://api.example.com');
  });
});
