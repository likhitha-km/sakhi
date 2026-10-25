import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { addAttachment, deleteAll, deleteEntry, findOrCreateProvider, giveConsent, hasOwnEntries, loadFixture, saveEntries, SaveError, setExcluded } from '../src/db/repo.ts';
import { todayLocal, addDays } from '../src/engine/dates.ts';
import type { Entry } from '../src/types/entry.ts';

const e = (over: Partial<Entry> = {}): Entry => ({ id: crypto.randomUUID(), occurredOn: todayLocal(), recordedAt: new Date().toISOString(), kind: 'symptom', symptomCode: 'fatigue', severity: 4, impact: [], source: 'user', ...over });

beforeEach(async () => { await deleteAll(); await giveConsent(); });

describe('storage on this device', () => {
  it('I01 an entry is saved and can be read back', async () => {
    const x = e();
    await saveEntries([x]);
    expect(await db.entries.get(x.id)).toEqual(x);
  });
  it('E01 future dates and bad scores are refused, and nothing is saved', async () => {
    await expect(saveEntries([e(), e({ occurredOn: addDays(todayLocal(), 2) })])).rejects.toBeInstanceOf(SaveError);
    await expect(saveEntries([e({ severity: 11 })])).rejects.toThrow('Choose a score from 0 to 10.');
    expect(await db.entries.count()).toBe(0);
  });
  it('E10 deleting an entry removes its exclusion', async () => {
    const x = e();
    await saveEntries([x]);
    await setExcluded(x.id, true);
    await deleteEntry(x.id);
    expect(await db.exclusions.count()).toBe(0);
  });
  it('L02 and L04 loading a sample twice does not duplicate it, and switching replaces it', async () => {
    await loadFixture('ananya_error_with_care');
    const n = await db.entries.count();
    await loadFixture('ananya_error_with_care');
    expect(await db.entries.count()).toBe(n);
    await loadFixture('sparse');
    expect(await db.entries.count()).toBe(5);
    expect(await db.careEvents.count()).toBe(0);
  });
  it('I04 delete all leaves every store empty', async () => {
    await loadFixture('ananya_error_with_care');
    await saveEntries([e()]);
    await deleteAll();
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0);
  });
  it('own entries block the sample', async () => {
    expect(await hasOwnEntries()).toBe(false);
    await saveEntries([e()]);
    expect(await hasOwnEntries()).toBe(true);
  });
  it('C02 the same clinician is reused', async () => {
    const a = await findOrCreateProvider({ name: 'Dr. Rao', facilityName: 'City Clinic', facilityKind: 'private_clinic', role: 'physician' });
    const b = await findOrCreateProvider({ name: 'dr rao', facilityName: 'city clinic ', facilityKind: 'private_clinic', role: 'physician' });
    expect(a).toBe(b);
    expect(await db.providers.count()).toBe(1);
  });
  it('C05 file limits', async () => {
    const small = new File([new Uint8Array(1024 * 1024)], 'report.png', { type: 'image/png' });
    expect(await addAttachment(small)).toBeTruthy();
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await expect(addAttachment(big)).rejects.toThrow('bigger than 5 MB');
    await expect(addAttachment(new File(['x'], 'a.txt', { type: 'text/plain' }))).rejects.toThrow('Only photos');
  });
});
