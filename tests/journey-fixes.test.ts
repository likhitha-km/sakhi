import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { saveNextVisit, saveVisit, setAdviceStatus, updateVisit } from '../src/db/visits.ts';
import { loadLoopState, nextStep } from '../src/loop/loop.ts';
import { disclosureStatus } from '../src/visits/basics.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';

const T = todayLocal();
beforeEach(async () => { await deleteAll(); await giveConsent(); });

describe('next step for a new or quiet journal', () => {
  it('a new journal starts with recording a visit', async () => {
    const n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label, n.to]).toEqual([7, 'Record your most recent visit', '/visit/new']);
    expect(n.why.length).toBeGreaterThan(20);
  });
  it('after the first visit: plan the next one, then the open advice, then logging', async () => {
    await db.providers.add({ id: 'p1', name: 'Dr Kulkarni', facilityKind: 'other', role: 'other' });
    await saveVisit({ visit: { id: 'v1', providerId: 'p1', on: addDays(T, -5), systems: ['allopathy'], origin: 'manual' },
      advice: [{ id: 'a1', visitId: 'v1', kind: 'test', text: 'Blood test this week', systems: [], status: 'not_started', origin: 'manual' }],
      concerns: [], addToTreatments: new Set(), sample: false });
    let n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label]).toEqual([8, 'Plan your next visit with Dr Kulkarni']);
    await saveNextVisit({ id: 'n1', providerId: 'p1', on: addDays(T, 10) });
    n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label, n.to]).toEqual([9, 'Next for you: Blood test this week', '/visit/v1']);
    await setAdviceStatus('a1', 'done');
    expect(nextStep(await loadLoopState(), T).rule).toBe(6);
  });
  it('the visit loop rules still come first', async () => {
    await loadFixture('ananya_visits');
    expect(nextStep(await loadLoopState(), T).rule).toBe(1);
  });
});

describe('correcting a saved visit', () => {
  it('moves treatments and the told mark to the new clinician', async () => {
    await db.providers.bulkAdd([{ id: 'p1', name: 'Dr A', facilityKind: 'other', role: 'other' }, { id: 'p2', name: 'Dr B', facilityKind: 'other', role: 'other' }]);
    await saveVisit({ visit: { id: 'v1', providerId: 'p1', on: T, systems: ['allopathy'], origin: 'manual' },
      advice: [{ id: 'm1', visitId: 'v1', kind: 'medicine', text: 'Iron tablets', systems: [], status: 'not_started', origin: 'manual' }],
      concerns: [], addToTreatments: new Set(['m1']), sample: false });
    const t = (await db.careEvents.toArray())[0];
    expect(disclosureStatus(await db.disclosures.toArray(), t.id, 'p1')).toBe('told');
    const v = (await db.visits.get('v1'))!;
    await updateVisit({ ...v, providerId: 'p2', on: addDays(T, -1), note: 'Corrected' });
    const ds = await db.disclosures.toArray();
    expect((await db.careEvents.get(t.id))?.providerId).toBe('p2');
    expect(disclosureStatus(ds, t.id, 'p2')).toBe('told');
    expect(disclosureStatus(ds, t.id, 'p1')).toBe('not_told');
    expect(await db.visits.get('v1')).toMatchObject({ providerId: 'p2', on: addDays(T, -1), note: 'Corrected' });
    expect(await db.advice.where('visitId').equals('v1').count()).toBe(1);
  });
  it('refuses a visit dated in the future and changes nothing', async () => {
    await db.providers.add({ id: 'p1', name: 'Dr A', facilityKind: 'other', role: 'other' });
    await saveVisit({ visit: { id: 'v1', providerId: 'p1', on: T, systems: ['allopathy'], origin: 'manual' }, advice: [], concerns: [], addToTreatments: new Set(), sample: false });
    const v = (await db.visits.get('v1'))!;
    await expect(updateVisit({ ...v, on: addDays(T, 3) })).rejects.toThrow();
    expect((await db.visits.get('v1'))?.on).toBe(T);
  });
});
