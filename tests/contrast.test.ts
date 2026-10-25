import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/design/tokens.css', import.meta.url), 'utf8');
const tok = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];
const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('colour contrast', () => {
  it('text pairs reach 4.5 to 1', () => {
    for (const [fg, bg] of [['ink-900', 'cream-50'], ['ink-900', 'pink-500'], ['ink-900', 'blue-500'], ['ink-600', 'cream-50'], ['pink-700', 'cream-50'], ['blue-700', 'cream-50'], ['white', 'pink-700'], ['white', 'blue-700'], ['alert-700', 'cream-50'], ['ink-900', 'blue-100'], ['ink-900', 'pink-100'], ['ink-600', 'white']])
      expect(ratio(tok(fg), tok(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
  it('light pink and blue fail as text, so they are only used as fills', () => {
    expect(ratio(tok('pink-500'), tok('cream-50'))).toBeLessThan(3);
    expect(ratio(tok('blue-500'), tok('cream-50'))).toBeLessThan(3);
  });
  it('UI03 light fills are never used for text colour in styles', () => {
    const base = readFileSync(new URL('../src/ui/design/base.css', import.meta.url), 'utf8');
    expect(base).not.toMatch(/[^-]color:\s*var\(--(pink|blue)-500\)/);
  });
});
