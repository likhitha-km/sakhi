import type { Entry, Exclusion } from '../types/entry.ts';

export function activeExclusionIds(exclusions: Exclusion[]) {
  return new Set(exclusions.filter(x => !x.restoredAt).map(x => x.entryId));
}

export function selectIncluded(entries: Entry[], exclusions: Exclusion[], lo: string, hi: string) {
  const off = activeExclusionIds(exclusions);
  const inWin = entries.filter(e => e.occurredOn >= lo && e.occurredOn <= hi);
  return { included: inWin.filter(e => !off.has(e.id)), excluded: inWin.filter(e => off.has(e.id)) };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

export const uniq = <T,>(xs: T[]) => [...new Set(xs)];
