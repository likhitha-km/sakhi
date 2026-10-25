import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { saveVisit, setAdviceStatus, setConcernAddressed, setDisclosure } from '../src/db/visits.ts';
import { buildCard, CARD_FOOTER, disclosureStatus, isOverdue, sinceSummary } from '../src/visits/logic.ts';
import { generateAnanya, generateAnanyaVisits } from '../src/fixtures/ananya.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';
import type { AdviceItem, Visit } from '../src/types/care.ts';

const T = todayLocal();
const visit = (over: Partial<Visit> = {}): Visit => ({ id: crypto.randomUUID(), providerId: 'p1', on: T, systems: ['allopathy'], origin: 'manual', ...over });
const adv = (v: Visit, over: Partial<AdviceItem> = {}): AdviceItem => ({ id: crypto.randomUUID(), visitId: v.id, kind: 'other', text: 'Drink more water', systems: [], status: 'not_started', origin: 'manual', ...over });

const cardFor = async () => {
  const [providers, visits, advice, concerns, disclosures, care, entries, nextVisits] = await Promise.all([
    db.providers.toArray(), db.visits.toArray(), db.advice.toArray(), db.concerns.toArray(), db.disclosures.toArray(), db.careEvents.toArray(), db.entries.toArray(), db.nextVisits.toArray()]);
  return buildCard({ next: nextVisits.find(n => n.id === 'sample-next-mehta')!, providers, visits, advice, concerns, disclosures, care, entries, exclusions: [], today: T });
};

beforeEach(async () => { await deleteAll(); await giveConsent(); });

describe('visit loop', () => {
  it('VL1 a visit with manual advice and concerns persists', async () => {
    const v = visit({ note: 'Told to rest' });
    await saveVisit({ visit: v, advice: [adv(v)], concerns: [{ id: 'c1', visitId: v.id, text: 'Headaches', addressed: false, origin: 'manual' }], addToTreatments: new Set(), sample: false });
    db.close(); await db.open();
    expect(await db.visits.get(v.id)).toEqual(v);
    expect(await db.advice.where('visitId').equals(v.id).count()).toBe(1);
    expect((await db.concerns.get('c1'))?.text).toBe('Headaches');
  });
  it('VL1 a broken item saves nothing', async () => {
    const v = visit();
    await expect(saveVisit({ visit: v, advice: [adv(v, { text: '' })], concerns: [], addToTreatments: new Set(), sample: false })).rejects.toThrow();
    expect(await db.visits.count()).toBe(0);
  });
  it('VL2 done persists, a past due date is overdue, no due date is never overdue', async () => {
    const v = visit({ on: addDays(T, -10) });
    const a = adv(v), b = adv(v, { dueOn: addDays(T, -1) }), c = adv(v);
    await saveVisit({ visit: v, advice: [a, b, c], concerns: [], addToTreatments: new Set(), sample: false });
    await setAdviceStatus(a.id, 'done');
    expect((await db.advice.get(a.id))?.status).toBe('done');
    expect(isOverdue((await db.advice.get(b.id))!, T)).toBe(true);
    expect(isOverdue((await db.advice.get(c.id))!, T)).toBe(false);
    expect(isOverdue({ ...b, status: 'done' }, T)).toBe(false);
    expect(isOverdue({ ...b, status: 'unsure' }, T)).toBe(true);
  });
  it('VL3 an unaddressed concern appears on a later card until marked addressed', async () => {
    await loadFixture('ananya_visits');
    expect((await cardFor()).concerns.map(c => c.text)).toEqual(['Pain in the stomach']);
    await setConcernAddressed('sample-con-pain', true);
    expect((await cardFor()).concerns).toHaveLength(0);
  });
  it('VL4 since last visit counts equal the manifest', () => {
    const s = sinceSummary(generateAnanya(T), [], addDays(T, -21), T);
    expect(s.daysWithEntry).toHaveLength(15);
    expect(s.daysWithout).toHaveLength(7);
    const row = (k: string) => s.rows.find(r => r.key === k);
    expect([row('period_pain')!.days.length, row('period_pain')!.limitedDays.length]).toEqual([3, 2]);
    expect([row('fatigue')!.days.length, row('fatigue')!.limitedDays.length]).toEqual([13, 0]);
    expect(row('dizziness')!.days.length).toBe(1);
    expect(row('headache')).toBeUndefined();
    expect(row('poor_sleep')).toBeUndefined();
  });
});

describe('who I have told', () => {
  it('DM1 a clinician advising a treatment is marked told, all others are not', async () => {
    const v = visit({ providerId: 'pA' });
    const m = adv(v, { kind: 'medicine', text: 'Iron tablets' });
    await saveVisit({ visit: v, advice: [m], concerns: [], addToTreatments: new Set([m.id]), sample: false });
    const t = (await db.careEvents.toArray())[0];
    const ds = await db.disclosures.toArray();
    expect(t.title).toBe('Iron tablets');
    expect((await db.advice.get(m.id))?.treatmentId).toBe(t.id);
    expect(disclosureStatus(ds, t.id, 'pA')).toBe('told');
    expect(disclosureStatus(ds, t.id, 'pB')).toBe('not_told');
  });
  it('DM2 and the manifest: the card for Dr Mehta', async () => {
    await loadFixture('ananya_visits');
    const c = await cardFor();
    expect(c.clinician).toBe('Dr Mehta');
    expect([c.advice.counts.done, c.advice.counts.notStarted, c.advice.counts.overdue]).toEqual([1, 2, 1]);
    expect(c.advice.overdue[0].text).toBe('Come back in two weeks');
    expect(c.inUseIds).toHaveLength(2);
    expect(c.notToldIds.sort()).toEqual(['sample-tr-herbal', 'sample-tr-iron']);
    expect(c.inUse.flatMap(g => g.items).every(i => i.told === 'not_told')).toBe(true);
    expect(c.concerns).toHaveLength(1);
    expect(c.tests).toHaveLength(0);
    expect(c.since.from).toBe(addDays(T, -21));
    expect(c.since.daysWithEntry).toHaveLength(15);
  });
  it('DM3 changing a status changes the card', async () => {
    await loadFixture('ananya_visits');
    await setDisclosure('sample-tr-herbal', 'sample-prov-mehta', 'told');
    expect((await cardFor()).notToldIds).toEqual(['sample-tr-iron']);
    await setDisclosure('sample-tr-herbal', 'sample-prov-mehta', 'unsure');
    expect((await cardFor()).notToldIds.sort()).toEqual(['sample-tr-herbal', 'sample-tr-iron']);
  });
  it('fixture disclosures match the manifest', () => {
    const f = generateAnanyaVisits(T);
    expect(disclosureStatus(f.disclosures, 'sample-tr-iron', 'sample-prov-rao')).toBe('told');
    expect(disclosureStatus(f.disclosures, 'sample-tr-herbal', 'sample-prov-sharma')).toBe('told');
    expect(disclosureStatus(f.disclosures, 'sample-tr-iron', 'sample-prov-sharma')).toBe('not_told');
  });
});

describe('card wording', () => {
  it('CC5 no diagnostic words, no "interaction", no dose arithmetic', async () => {
    await loadFixture('ananya_visits');
    const c = await cardFor();
    const text = JSON.stringify(c) + CARD_FOOTER;
    for (const re of [/interact/i, /\bdiagnos(?!is\.)/i, /you have/i, /likely/i, /risk of/i, /suffering/i, /\d+\s*(mg|ml|tablets? (a|per) day|times a day)/i, /endometriosis|pcos|anaemia|anemia|thyroid|cancer/i])
      expect(text).not.toMatch(re);
    expect(c.questions[0].id).toBe('Q9');
    expect(c.questions[0].text).toContain('using them together');
    expect(c.questions).toHaveLength(2);
  });
});
