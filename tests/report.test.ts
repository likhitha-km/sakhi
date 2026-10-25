import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { loadLoopState } from '../src/loop/loop.ts';
import { setAdviceStatus } from '../src/db/visits.ts';
import { buildReport, earliestDate, reportTextForAi, restoreNames } from '../src/report/buildReport.ts';
import { validateSummary } from '../src/ai/summary.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';

const T = todayLocal();
beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('full report', () => {
  it('covers everything logged so far', async () => {
    const s = await loadLoopState();
    const m = buildReport(s, earliestDate(s), T, T);
    expect(m.from).toBe(addDays(T, -54)); // day 55 is unlogged in the fixture
    expect(m.daysWithEntry).toBe(41);
    expect(m.symptoms.find(x => x.label === 'Period pain')?.days).toBe(10);
    expect(m.bleeding).toEqual({ days: 16, heavierDays: 9 });
    expect(m.visits).toHaveLength(1);
    expect(m.visits[0].advice.map(a => a.status).sort()).toEqual(['Done', 'Not started', 'Not started']);
    expect(m.take.map(t => t.title)).toEqual(['Herbal powder after meals', 'Iron tablets, every morning']);
    const iron = m.take.find(t => t.title.startsWith('Iron'))!;
    expect(iron.toldTo).toEqual(['Dr Rao']);
    expect(iron.notMarkedFor.sort()).toEqual(['Dr Mehta', 'Vaidya Sharma']);
    expect(m.openConcerns.map(c => c.text)).toEqual(['Pain in the stomach']);
    expect(m.advice).toMatchObject({ done: 1, notStarted: 2, overdue: 1 });
  });
  it('a range only counts what falls in it', async () => {
    const s = await loadLoopState();
    const m = buildReport(s, addDays(T, -21), T, T);
    expect(m.daysWithEntry).toBe(15);
    expect(m.visits).toHaveLength(1);
    expect(buildReport(s, addDays(T, -10), T, T).visits).toHaveLength(0);
  });
  it('reasons and result notes appear in the report', async () => {
    await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'cost' });
    const s = await loadLoopState();
    const m = buildReport(s, earliestDate(s), T, T);
    expect(m.visits[0].advice.find(a => a.text === 'Blood test')?.extra).toContain('my reason: cost');
  });
  it('the text for the AI has no clinician names', async () => {
    const s = await loadLoopState();
    const text = reportTextForAi(buildReport(s, earliestDate(s), T, T));
    for (const n of ['Dr Rao', 'Dr Mehta', 'Vaidya Sharma', 'Ananya', 'sample-']) expect(text).not.toContain(n);
    expect(text).toContain('Clinician A');
    expect(text.length).toBeLessThanOrEqual(6000);
    const m = buildReport(s, earliestDate(s), T, T);
    expect(restoreNames(m, 'I saw Clinician A, then Clinician B.')).toBe(`I saw ${m.providers[0].name}, then ${m.providers[1].name}.`);
  });
});

describe('AI summary checks', () => {
  const input = 'Records from 2026-08-31 to 2026-10-25 (56 days). Days with an entry: 41. Period pain 10 days, limited 5. Visit on 2026-10-04 to Clinician A.';
  it('accepts a plain restatement', () => {
    expect(validateSummary(input, { summary: 'I logged 41 of 56 days. I had period pain on 10 days and it limited me on 5. I saw Clinician A on 4 October.' }).ok).toBe(true);
  });
  it('refuses diagnostic, advice or reassuring wording', () => {
    for (const bad of ['This suggests a hormonal problem and I had pain on 10 days.', 'I had pain on 10 days, which is likely endometriosis.', 'Nothing to worry about, I logged 41 days.', 'I should take iron tablets daily as I logged 41 days.', 'The tablets may interact with the powder, over 41 days.'])
      expect(validateSummary(input, { summary: bad })).toMatchObject({ ok: false, why: 'blocked' });
  });
  it('refuses numbers that are not in her records', () => {
    expect(validateSummary(input, { summary: 'I had period pain on 12 days and logged 41 days.' })).toMatchObject({ ok: false, why: 'numbers' });
  });
  it('refuses broken or oversized output and HTML', () => {
    expect(validateSummary(input, 'nope').ok).toBe(false);
    expect(validateSummary(input, { summary: 'x'.repeat(901) }).ok).toBe(false);
    expect(validateSummary(input, { summary: '<script>alert(1)</script> I logged 41 days.' }).ok).toBe(false);
    expect(validateSummary(input, { summary: 'I logged 41 days.', extra: 1 }).ok).toBe(false);
  });
});
