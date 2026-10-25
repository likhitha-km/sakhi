import type { BleedingFeatures, Entry, ImpactCode, SymptomCode } from '../types/entry.ts';
import type { AdviceItem, CareEvent, Concern, Disclosure, NextVisit, Provider, Visit } from '../types/care.ts';
import { addDays } from '../engine/dates.ts';
import { intBetween, mulberry32 } from './rng.ts';

// Key days are placed by construction (days before today). Randomness only varies severities.
export const ANANYA = {
  seed: 20261025,
  unlogged: [55, 47, 45, 43, 41, 38, 35, 33, 21, 19, 17, 14, 10, 7],
  periodStarts: [54, 29, 4],
  bleeding: [54, 53, 52, 51, 50, 49, 29, 28, 27, 26, 25, 24, 4, 3, 2, 1],
  heavy: [54, 53, 52, 29, 28, 27, 4, 3, 2],
  pain: [54, 53, 52, 29, 28, 27, 4, 3, 40, 12],
  missed: [53, 28, 3],
  activity: [54, 53, 29, 28, 4],
  fatigue: [1, 2, 3, 5, 6, 8, 9, 11, 13, 15, 16, 18, 20, 22, 23, 24, 25, 28, 34, 36, 37, 54],
  dizziness: [1, 26, 39, 42, 44, 50],
  headache: [30, 31, 32],
  poorSleep: [46],
  checkin: [48],
  errorDay: 17,
};

const NO_BLEED: BleedingFeatures = { changeEvery1to2h: false, doubleProducts: false, bledThrough: false, clotsOver2_5cm: false, nightChange: false };

function mk(today: string, prefix: string) {
  let n = 0;
  return (daysAgo: number, e: Partial<Entry> & Pick<Entry, 'kind'>): Entry => {
    const occurredOn = addDays(today, -daysAgo);
    return {
      id: `${prefix}-${String(++n).padStart(3, '0')}`, occurredOn, recordedAt: `${occurredOn}T20:00:00.000Z`,
      impact: [], source: 'synthetic', origin: 'manual', ...e,
    };
  };
}

export function generateAnanya(today: string): Entry[] {
  const A = ANANYA, rnd = mulberry32(A.seed), make = mk(today, 'ananya');
  const out: Entry[] = [];
  const symptom = (d: number, code: SymptomCode, lo: number, hi: number, impact: ImpactCode[] = []) =>
    out.push(make(d, { kind: 'symptom', symptomCode: code, severity: intBetween(rnd, lo, hi), impact }));
  for (let d = 55; d >= 1; d--) {
    if (A.unlogged.includes(d)) continue;
    if (A.periodStarts.includes(d)) out.push(make(d, { kind: 'period_start' }));
    if (A.bleeding.includes(d)) {
      const heavy = A.heavy.includes(d);
      out.push(make(d, { kind: 'bleeding', bleeding: { ...NO_BLEED, changeEvery1to2h: heavy, nightChange: heavy && d % 2 === 0, clotsOver2_5cm: heavy && (d === 53 || d === 28) } }));
    }
    if (A.pain.includes(d)) {
      const impact: ImpactCode[] = [];
      if (A.activity.includes(d)) impact.push('activity_limited');
      if (A.missed.includes(d)) impact.push('missed_work_study');
      symptom(d, 'period_pain', 3, 5, impact);
    }
    if (A.fatigue.includes(d)) symptom(d, 'fatigue', 2, 6);
    if (A.dizziness.includes(d)) symptom(d, 'dizziness', 2, 5);
    if (A.headache.includes(d)) symptom(d, 'headache', 2, 5);
    if (A.poorSleep.includes(d)) symptom(d, 'poor_sleep', 3, 5);
    if (A.checkin.includes(d)) out.push(make(d, { kind: 'checkin' }));
  }
  return out;
}

export function generateAnanyaWithError(today: string): Entry[] {
  const base = generateAnanya(today);
  const make = mk(today, 'ananya-x');
  return [...base, make(ANANYA.errorDay, {
    kind: 'symptom', symptomCode: 'period_pain', severity: 10, impact: ['missed_work_study'], note: 'typed on the wrong day',
  })];
}

/** The earlier care seed, kept for the full brief tests. */
export function generateAnanyaLegacyCare(today: string): { providers: Provider[]; care: CareEvent[] } {
  const d = (n: number) => addDays(today, -n);
  const providers: Provider[] = [
    { id: 'prov-1', name: 'Dr Meera Rao', facilityName: 'District Hospital OPD', facilityKind: 'govt_hospital', role: 'physician' },
    { id: 'prov-2', name: 'Vaidya Suresh', facilityName: 'Sanjeevani Ayurveda Clinic', facilityKind: 'ayush_facility', role: 'ayush_practitioner' },
  ];
  const base = { attachmentIds: [], hideFromBrief: false, origin: 'synthetic' as const };
  const care: CareEvent[] = [
    { ...base, id: 'care-1', kind: 'visit', date: d(38), providerId: 'prov-1', title: 'OPD visit', systems: ['allopathy'], summary: 'Asked for a blood test and started iron tablets.', followUpOn: addDays(today, 6) },
    { ...base, id: 'care-2', kind: 'test', date: d(36), providerId: 'prov-1', title: 'Haemoglobin', systems: ['allopathy'], result: '10.2', unit: 'g/dL', reportedRange: '12.0 to 15.0' },
    { ...base, id: 'care-3', kind: 'treatment', date: d(35), providerId: 'prov-1', title: 'Iron tablets, once a day', systems: ['allopathy'] },
    { ...base, id: 'care-4', kind: 'visit', date: d(20), providerId: 'prov-2', title: 'Clinic visit', systems: ['ayurveda'], summary: 'Suggested a herbal powder and a change in diet.' },
    { ...base, id: 'care-5', kind: 'treatment', date: d(20), providerId: 'prov-2', title: 'Herbal powder after meals', systems: ['ayurveda'] },
  ];
  return { providers, care };
}

export interface VisitSeed {
  providers: Provider[]; care: CareEvent[]; visits: Visit[]; advice: AdviceItem[];
  concerns: Concern[]; disclosures: Disclosure[]; nextVisits: NextVisit[];
}

/** Visits, advice and treatments for the sample sign in. Values are listed in docs/fixtures-manifest.md. */
export function generateAnanyaVisits(today: string): VisitSeed {
  const d = (n: number) => addDays(today, n);
  const providers: Provider[] = [
    { id: 'sample-prov-rao', name: 'Dr Rao', facilityName: 'District Hospital', facilityKind: 'govt_hospital', role: 'physician' },
    { id: 'sample-prov-sharma', name: 'Vaidya Sharma', facilityName: 'Ayurveda Clinic', facilityKind: 'ayush_facility', role: 'ayush_practitioner' },
    { id: 'sample-prov-mehta', name: 'Dr Mehta', facilityName: 'City Women\'s Clinic', facilityKind: 'private_clinic', role: 'gynaecologist' },
  ];
  const visits: Visit[] = [{
    id: 'sample-visit-1', providerId: 'sample-prov-rao', on: d(-21), systems: ['allopathy'], origin: 'manual',
    note: 'Doctor asked for a blood test and started iron tablets every morning. Come back in two weeks. I asked about the pain in my stomach but there was no time.',
  }];
  const base = { attachmentIds: [], hideFromBrief: false, origin: 'synthetic' as const };
  const care: CareEvent[] = [
    { ...base, id: 'sample-tr-iron', kind: 'treatment', date: d(-20), providerId: 'sample-prov-rao', visitId: 'sample-visit-1', title: 'Iron tablets, every morning', systems: ['allopathy'] },
    { ...base, id: 'sample-tr-herbal', kind: 'treatment', date: d(-20), providerId: 'sample-prov-sharma', title: 'Herbal powder after meals', systems: ['ayurveda'] },
  ];
  const advice: AdviceItem[] = [
    { id: 'sample-adv-test', visitId: 'sample-visit-1', kind: 'test', text: 'Blood test', systems: ['allopathy'], status: 'not_started', origin: 'manual' },
    { id: 'sample-adv-iron', visitId: 'sample-visit-1', kind: 'medicine', text: 'Iron tablet every morning', systems: ['allopathy'], status: 'done', origin: 'manual', treatmentId: 'sample-tr-iron' },
    { id: 'sample-adv-fu', visitId: 'sample-visit-1', kind: 'follow_up', text: 'Come back in two weeks', systems: ['allopathy'], dueOn: d(-7), status: 'not_started', origin: 'manual' },
  ];
  const concerns: Concern[] = [{ id: 'sample-con-pain', visitId: 'sample-visit-1', text: 'Pain in the stomach', addressed: false, origin: 'manual' }];
  const disclosures: Disclosure[] = [
    { treatmentId: 'sample-tr-iron', providerId: 'sample-prov-rao', status: 'told', updatedOn: d(-20) },
    { treatmentId: 'sample-tr-herbal', providerId: 'sample-prov-sharma', status: 'told', updatedOn: d(-20) },
  ];
  const nextVisits: NextVisit[] = [{ id: 'sample-next-mehta', providerId: 'sample-prov-mehta', on: d(1) }];
  return { providers, care, visits, advice, concerns, disclosures, nextVisits };
}
