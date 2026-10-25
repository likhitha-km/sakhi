import type { Entry } from '../types/entry.ts';
import { addDays } from '../engine/dates.ts';
import { intBetween, mulberry32 } from './rng.ts';

export const SPARSE = { seed: 20261026, fatigue: [3, 12], headache: [8], checkin: [18, 25] };

export function generateSparse(today: string): Entry[] {
  const rnd = mulberry32(SPARSE.seed);
  let n = 0;
  const make = (daysAgo: number, e: Partial<Entry> & Pick<Entry, 'kind'>): Entry => {
    const occurredOn = addDays(today, -daysAgo);
    return { id: `farah-${String(++n).padStart(3, '0')}`, occurredOn, recordedAt: `${occurredOn}T21:00:00.000Z`, impact: [], source: 'synthetic', origin: 'manual', ...e };
  };
  const out: Entry[] = [];
  for (let d = 27; d >= 1; d--) {
    if (SPARSE.fatigue.includes(d)) out.push(make(d, { kind: 'symptom', symptomCode: 'fatigue', severity: intBetween(rnd, 3, 6) }));
    if (SPARSE.headache.includes(d)) out.push(make(d, { kind: 'symptom', symptomCode: 'headache', severity: intBetween(rnd, 3, 6) }));
    if (SPARSE.checkin.includes(d)) out.push(make(d, { kind: 'checkin' }));
  }
  return out;
}
