import { describe, expect, it } from 'vitest';
import { computeEvidence, allResults } from '../src/engine/compute.ts';
import { addDays } from '../src/engine/dates.ts';
import { GATES } from '../src/engine/gates.ts';
import { generateAnanya, generateAnanyaWithError, ANANYA } from '../src/fixtures/ananya.ts';
import { generateSparse } from '../src/fixtures/sparse.ts';
import type { Entry, Exclusion, Profile } from '../src/types/entry.ts';
import { checkEntries } from '../src/engine/checks.ts';

const TODAY = '2026-10-25';
const profile: Profile = { id: 1, cycleStatus: 'regular', pregnancyStatus: 'not_pregnant' };
const run = (entries: Entry[], exclusions: Exclusion[] = [], windowDays: 28 | 56 = 56, p = profile) =>
  computeEvidence({ entries, exclusions, profile: p, windowDays });
const sym = (b: ReturnType<typeof run>, k: string) => b.symptoms.find(s => s.key === k)!;
const peri = (b: ReturnType<typeof run>, k: string) => b.perimenstrual.find(r => r.metricId === 'perimenstrual:' + k)!;
const imp = (b: ReturnType<typeof run>, k: string) => b.impact.find(r => r.metricId === 'impact:' + k)!;
const strip = (b: ReturnType<typeof run>) => ({ ...b, generatedAt: '' });

let n = 0;
const e = (date: string, over: Partial<Entry> & Pick<Entry, 'kind'>): Entry =>
  ({ id: `t${++n}`, occurredOn: date, recordedAt: date + 'T10:00:00.000Z', impact: [], source: 'user', ...over });

describe('sample data matches the written targets', () => {
  it('F01 Ananya baseline', () => {
    const b = run(generateAnanya(TODAY));
    expect(b.window).toEqual({ start: addDays(TODAY, -56), end: addDays(TODAY, -1), days: 56 });
    expect(b.coverage.observedDays).toBe(41);            // U01
    expect(b.coverage.missingDays).toBe(15);
    expect(sym(b, 'period_pain').days.numerator).toBe(10);
    expect(peri(b, 'period_pain').numerator).toBe(8);
    expect(peri(b, 'period_pain').denominator).toBe(10);
    expect(sym(b, 'fatigue').days.numerator).toBe(22);
    expect(sym(b, 'dizziness').days.numerator).toBe(6);
    expect(imp(b, 'missed_work_study').numerator).toBe(3);  // U05
    expect(imp(b, 'activity_limited').numerator).toBe(5);
    expect(b.bleeding.denominator).toBe(16);                // U06
    expect(b.bleeding.numerator).toBe(9);
    expect(b.intervals.status).toBe('ready');
    expect(b.intervals.median).toBe(25);
  });

  it('F02 Ananya with one wrong entry', () => {
    const b = run(generateAnanyaWithError(TODAY));
    expect(b.coverage.observedDays).toBe(42);
    expect(sym(b, 'period_pain').days.numerator).toBe(11);
    expect(peri(b, 'period_pain').numerator).toBe(8);
    expect(peri(b, 'period_pain').denominator).toBe(11);
    expect(imp(b, 'missed_work_study').numerator).toBe(4);
  });

  it('F03 sparse', () => {
    const b = run(generateSparse(TODAY), [], 28);
    expect(b.coverage.observedDays).toBe(5);
    expect(sym(b, 'fatigue').days.numerator).toBe(2);
    expect(sym(b, 'headache').days.numerator).toBe(1);
    expect(b.checkinDates.length).toBe(2);
    expect(b.symptoms.every(s => s.median.status === 'insufficient_data')).toBe(true);
    expect(b.recentPrev.every(r => r.status === 'insufficient_data')).toBe(true);
    expect(b.perimenstrual.every(r => r.status === 'insufficient_data')).toBe(true);
    expect(b.intervals.status).toBe('insufficient_data');
    expect(b.bleeding.status).toBe('insufficient_data');
    expect(b.impact.length).toBe(0);
  });

  it('live demo entry on top of the wrong-entry variant', () => {
    const base = generateAnanyaWithError(TODAY);
    const live = [
      e(TODAY, { kind: 'symptom', symptomCode: 'period_pain', severity: 7, impact: ['missed_work_study'] }),
      e(TODAY, { kind: 'bleeding', bleeding: { changeEvery1to2h: true, doubleProducts: false, bledThrough: false, clotsOver2_5cm: false, nightChange: false } }),
    ];
    const b = run([...base, ...live]);
    expect(b.coverage.observedDays).toBe(43);
    expect(sym(b, 'period_pain').days.numerator).toBe(12);
    expect(peri(b, 'period_pain').numerator).toBe(8);
    expect(peri(b, 'period_pain').denominator).toBe(12);
    expect(imp(b, 'missed_work_study').numerator).toBe(5);
    expect(b.bleeding.denominator).toBe(17);
    const planted = base.find(x => x.note === 'typed on the wrong day')!;
    const x = run([...base, ...live], [{ entryId: planted.id, excludedAt: 'now' }]);
    expect([x.coverage.observedDays, sym(x, 'period_pain').days.numerator, peri(x, 'period_pain').denominator, imp(x, 'missed_work_study').numerator]).toEqual([42, 11, 11, 4]);
  });
});

describe('summaries', () => {
  it('U02 a symptom never logged shows no middle score', () => {
    const b = run([e('2026-10-01', { kind: 'symptom', symptomCode: 'headache', severity: 0 }), e('2026-10-02', { kind: 'checkin' })]);
    const s = sym(b, 'headache');
    expect(s.days.numerator).toBe(0);
    expect(s.days.denominator).toBe(2);
    expect(s.median.status).toBe('insufficient_data');
    expect(s.median.median).toBeUndefined();
  });

  it('U03 middle score gate, and two entries on one day count once at the higher score', () => {
    const two = [e('2026-10-01', { kind: 'symptom', symptomCode: 'fatigue', severity: 4 }), e('2026-10-02', { kind: 'symptom', symptomCode: 'fatigue', severity: 6 })];
    expect(sym(run(two), 'fatigue').median.status).toBe('insufficient_data');
    const three = [...two, e('2026-10-03', { kind: 'symptom', symptomCode: 'fatigue', severity: 8 })];
    expect(sym(run(three), 'fatigue').median.median).toBe(6);
    const sameDay = [...three, e('2026-10-04', { kind: 'symptom', symptomCode: 'fatigue', severity: 3 }), e('2026-10-04', { kind: 'symptom', symptomCode: 'fatigue', severity: 7 })];
    const s = sym(run(sameDay), 'fatigue');
    expect(s.dailySeverity['2026-10-04']).toBe(7);
    expect(s.days.numerator).toBe(4);
    expect(s.median.median).toBe(6.5);
  });

  it('U04 a score of 0 counts as a logged day, not a symptom day', () => {
    const b = run([e('2026-10-01', { kind: 'symptom', symptomCode: 'fatigue', severity: 0 })]);
    expect(b.coverage.observedDays).toBe(1);
    expect(sym(b, 'fatigue').days.numerator).toBe(0);
  });

  it('U07 latest 2 weeks against the 2 weeks before', () => {
    const end = '2026-10-20';
    const d = (k: number) => addDays(end, -k);
    const fat = (k: number, s: number) => e(d(k), { kind: 'symptom', symptomCode: 'fatigue', severity: s });
    const chk = (k: number) => e(d(k), { kind: 'checkin' });
    const recent = [fat(0, 5), fat(1, 6), fat(2, 7), chk(3), chk(4)];
    const older4 = [fat(14, 4), fat(15, 5), fat(16, 6), chk(17)];
    const rp = (xs: Entry[]) => computeEvidence({ entries: xs, exclusions: [], profile, windowDays: 28, endDate: end }).recentPrev[0];
    expect(rp([...recent, ...older4]).status).toBe('insufficient_data');
    expect(rp([...recent, fat(14, 4), fat(15, 5), chk(16), chk(17), chk(18)]).status).toBe('insufficient_data');
    const r = rp([...recent, ...older4, chk(18)]);
    expect(r.status).toBe('ready');
    expect(r.secondary!.difference).toBe(1);
  });

  it('U08 timing around period starts gates', () => {
    const s1 = '2026-09-01', s2 = '2026-09-29';
    const start = (d: string) => e(d, { kind: 'period_start' });
    const pain = (d: string) => e(d, { kind: 'symptom', symptomCode: 'period_pain', severity: 5 });
    const two = [start(s1), start(s2), pain(s1), pain(s2)];
    expect(run(two).perimenstrual[0].status).toBe('insufficient_data');
    expect(run([...two, pain('2026-09-02')]).perimenstrual[0].status).toBe('ready');
  });

  it('U09 symptoms on the same day', () => {
    const day = (k: number) => addDays('2026-10-01', k);
    const S = (code: 'fatigue' | 'dizziness', k: number) => e(day(k), { kind: 'symptom', symptomCode: code, severity: 4 });
    expect(run([1, 2, 3, 4].map(k => S('fatigue', k)).concat([3, 4, 5].map(k => S('dizziness', k)))).overlap).toHaveLength(0);
    const o = run([1, 2, 3, 4, 5].map(k => S('fatigue', k)).concat([3, 4, 5, 6, 7].map(k => S('dizziness', k)))).overlap;
    expect(o).toHaveLength(1);
    expect([o[0].numerator, o[0].denominator]).toEqual([3, 7]);
  });

  it('U10 excluding then restoring gives back exactly the original', () => {
    const entries = generateAnanyaWithError(TODAY);
    const planted = entries.find(x => x.note === 'typed on the wrong day')!;
    const original = run(entries);
    const excluded = run(entries, [{ entryId: planted.id, excludedAt: '2026-10-25T10:00:00Z' }]);
    expect([excluded.coverage.observedDays, sym(excluded, 'period_pain').days.numerator, peri(excluded, 'period_pain').numerator,
      peri(excluded, 'period_pain').denominator, imp(excluded, 'missed_work_study').numerator]).toEqual([41, 10, 8, 10, 3]);
    expect(excluded.excludedInWindow).toEqual([planted.id]);
    const restored = run(entries, [{ entryId: planted.id, excludedAt: '2026-10-25T10:00:00Z', restoredAt: '2026-10-25T10:01:00Z' }]);
    expect(strip(restored)).toEqual(strip(original));
  });

  it('U11 date arithmetic crosses leap days and month ends', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('U12 two entries for one symptom on one day are both listed', () => {
    const a = e('2026-10-04', { kind: 'symptom', symptomCode: 'headache', severity: 3 });
    const b2 = e('2026-10-04', { kind: 'symptom', symptomCode: 'headache', severity: 5 });
    const s = sym(run([a, b2]), 'headache');
    expect(s.days.numerator).toBe(1);
    expect(s.days.includedEntryIds.sort()).toEqual([a.id, b2.id].sort());
  });

  it('U13 gaps between period starts', () => {
    const st = (d: string) => e(d, { kind: 'period_start' });
    const r = run([st('2026-08-10'), st('2026-09-04'), st('2026-09-29')]).intervals;
    expect(r.status).toBe('ready');
    expect(r.median).toBe(25);
    expect(r.statement).toContain('25 and 25');
    expect(run([st('2026-09-04'), st('2026-09-29')]).intervals.status).toBe('insufficient_data');
  });

  it('C08 cycle timing does not apply when periods have stopped or with hormonal contraception', () => {
    for (const cycleStatus of ['none_or_stopped', 'hormonal_contraception'] as const) {
      const b = run(generateAnanya(TODAY), [], 56, { ...profile, cycleStatus });
      expect(b.intervals.status).toBe('not_applicable');
      expect(b.perimenstrual.every(r => r.status === 'not_applicable')).toBe(true);
    }
  });

  it('U15 thresholds come from one place', () => {
    const three = ['2026-10-01', '2026-10-02', '2026-10-03'].map((d, i) => e(d, { kind: 'symptom', symptomCode: 'fatigue', severity: 4 + i }));
    expect(sym(run(three), 'fatigue').median.status).toBe('ready');
    const g = GATES as { medianMinDays: number };
    const old = g.medianMinDays;
    g.medianMinDays = 4;
    try { expect(sym(run(three), 'fatigue').median.status).toBe('insufficient_data'); } finally { g.medianMinDays = old; }
  });

  it('custom symptoms are counted like built in ones', () => {
    const c = (d: string) => e(d, { kind: 'symptom', symptomCode: 'custom', customLabel: 'jaw pain', area: 'pain', severity: 4 });
    const b = run([c('2026-10-01'), c('2026-10-02'), c('2026-10-03')]);
    const s = sym(b, 'custom:jaw pain');
    expect(s.label).toBe('Jaw pain');
    expect(s.median.median).toBe(4);
  });

  it('every result carries its entries', () => {
    const b = run(generateAnanyaWithError(TODAY));
    for (const r of allResults(b)) if (r.status === 'ready') expect(r.includedEntryIds.length).toBeGreaterThan(0);
  });
});

describe('check my entries', () => {
  it('H1 to H5 fire and stay quiet', () => {
    const st = (d: string) => e(d, { kind: 'period_start' });
    expect(checkEntries([st('2026-10-01'), st('2026-10-05')], []).some(p => p.rule === 'H1')).toBe(true);
    expect(checkEntries([st('2026-10-01'), st('2026-10-20')], []).some(p => p.rule === 'H1')).toBe(false);
    const prompts = checkEntries(generateAnanyaWithError(TODAY), [], [], TODAY);
    expect(prompts.filter(p => p.rule === 'H2').length).toBe(1);
    expect(checkEntries(generateAnanya(TODAY), [], [], TODAY)).toHaveLength(0);
    expect(checkEntries([e('2026-10-01', { kind: 'checkin' }), e('2026-10-01', { kind: 'symptom', symptomCode: 'fatigue', severity: 3 })], []).some(p => p.rule === 'H3')).toBe(true);
    expect(checkEntries([e('2026-10-01', { kind: 'checkin', impact: ['missed_work_study'] })], []).some(p => p.rule === 'H4')).toBe(true);
    const late = e('2026-10-01', { kind: 'checkin' }); late.recordedAt = '2026-10-09T10:00:00Z';
    expect(checkEntries([late], []).some(p => p.rule === 'H5')).toBe(true);
  });
  it('H6 impossible care dates', () => {
    const base = { attachmentIds: [], hideFromBrief: false, origin: 'user' as const, systems: ['allopathy' as const] };
    const p = checkEntries([], [], [
      { ...base, id: 'c1', kind: 'treatment', date: '2026-10-10', endDate: '2026-10-01', title: 'Tablets' },
      { ...base, id: 'c2', kind: 'test', date: '2026-12-01', title: 'Blood test' },
      { ...base, id: 'c3', kind: 'test', date: '2026-10-01', title: 'Blood test' },
    ], TODAY);
    expect(p.map(x => x.id)).toEqual(['H6:end:c1', 'H6:future:c2']);
  });
});

it('ANANYA layout is self consistent', () => {
  expect(55 - ANANYA.unlogged.length).toBe(41);
});
