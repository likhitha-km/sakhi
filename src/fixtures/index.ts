import type { Entry } from '../types/entry.ts';
import { generateAnanya, generateAnanyaLegacyCare, generateAnanyaVisits, generateAnanyaWithError, type VisitSeed } from './ananya.ts';
import { generateSparse } from './sparse.ts';

export type FixtureId = 'ananya' | 'ananya_error' | 'ananya_error_with_care' | 'ananya_visits' | 'sparse';

export interface FixtureData extends VisitSeed { entries: Entry[]; name: string }

const none = (): VisitSeed => ({ providers: [], care: [], visits: [], advice: [], concerns: [], disclosures: [], nextVisits: [] });

export function buildFixture(id: FixtureId, today: string): FixtureData {
  switch (id) {
    case 'ananya': return { entries: generateAnanya(today), ...none(), name: 'Ananya' };
    case 'ananya_error': return { entries: generateAnanyaWithError(today), ...none(), name: 'Ananya' };
    case 'ananya_error_with_care': return { entries: generateAnanyaWithError(today), ...none(), ...generateAnanyaLegacyCare(today), name: 'Ananya' };
    case 'ananya_visits': return { entries: generateAnanya(today), ...generateAnanyaVisits(today), name: 'Ananya' };
    case 'sparse': return { entries: generateSparse(today), ...none(), name: 'Farah' };
  }
}
