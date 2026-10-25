import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { db } from '../src/db/db.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { collectPayload, encryptBackup, GENERIC_FAIL, openBackup, RECORD_TABLES, restoreAddMissing, restoreReplace } from '../src/db/backup.ts';

const PASS = 'river stone 42';
const snapshot = async () => {
  const out: Record<string, { n: number; hash: string }> = {};
  for (const t of RECORD_TABLES) {
    const rows = (await db.table(t).toArray()).map(r => JSON.stringify(r, Object.keys(r).sort())).sort();
    out[t] = { n: rows.length, hash: createHash('sha256').update(rows.join('\n')).digest('hex') };
  }
  return out;
};

beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('encrypted backup', () => {
  it('BK1 export, delete all, restore with Replace gives back the same records', async () => {
    const before = await snapshot();
    const file = await encryptBackup(PASS);
    await deleteAll(); await giveConsent();
    expect((await snapshot()).visits.n).toBe(0);
    const p = await openBackup(file, PASS);
    expect(p.counts).toEqual({ visits: 1, advice: 3, treatments: 2, providers: 3, entries: before.entries.n });
    await restoreReplace(p.payload);
    expect(await snapshot()).toEqual(before);
  }, 30000);
  it('BK2 a wrong passphrase or a changed byte gives the same message and changes nothing', async () => {
    const file = await encryptBackup(PASS);
    const before = await snapshot();
    await expect(openBackup(file, 'wrong passphrase')).rejects.toThrow(GENERIC_FAIL);
    const env = JSON.parse(file);
    const c = env.ciphertext as string;
    env.ciphertext = c.slice(0, 20) + (c[20] === 'A' ? 'B' : 'A') + c.slice(21);
    await expect(openBackup(JSON.stringify(env), PASS)).rejects.toThrow(GENERIC_FAIL);
    await expect(openBackup('not a backup', PASS)).rejects.toThrow(GENERIC_FAIL);
    expect(await snapshot()).toEqual(before);
  }, 30000);
  it('BK3 nothing readable in the file', async () => {
    const file = await encryptBackup(PASS);
    for (const w of ['Dr Mehta', 'Vaidya Sharma', 'Iron tablet', 'Herbal powder', 'Blood test', PASS, 'Pain in the stomach']) expect(file).not.toContain(w);
    const env = JSON.parse(file);
    expect(Object.keys(env).sort()).toEqual(['app', 'cipher', 'ciphertext', 'format', 'kdf', 'schema']);
    expect(env.kdf).toMatchObject({ name: 'PBKDF2-SHA256', iterations: 600000 });
    expect(env.cipher.name).toBe('AES-256-GCM');
    const again = JSON.parse(await encryptBackup(PASS));
    expect(again.kdf.salt).not.toBe(env.kdf.salt);
    expect(again.cipher.iv).not.toBe(env.cipher.iv);
  }, 30000);
  it('BK4 Add missing never overwrites and counts correctly', async () => {
    const file = await encryptBackup(PASS);
    const total = Object.values((await openBackup(file, PASS)).payload.tables).reduce((n, r) => n + r.length, 0);
    await db.visits.update('sample-visit-1', { note: 'changed here' });
    await db.advice.delete('sample-adv-test');
    await db.concerns.clear();
    const r = await restoreAddMissing((await openBackup(file, PASS)).payload);
    expect(r).toEqual({ added: 2, skipped: total - 2 });
    expect((await db.visits.get('sample-visit-1'))?.note).toBe('changed here');
    expect(await db.advice.get('sample-adv-test')).toBeTruthy();
  }, 30000);
  it('BK5 a failing write rolls back and leaves the old data intact', async () => {
    const before = await snapshot();
    const payload = await collectPayload();
    payload.tables.visits = [...payload.tables.visits, payload.tables.visits[0]]; // same id twice makes the write fail
    await expect(restoreReplace(payload)).rejects.toThrow('nothing was changed');
    expect(await snapshot()).toEqual(before);
  });
  it('BK7 a newer version is refused with a clear message', async () => {
    const env = JSON.parse(await encryptBackup(PASS));
    env.schema = 99;
    await expect(openBackup(JSON.stringify(env), PASS)).rejects.toThrow('newer version');
  }, 30000);
  it('rejects files over 20 MB before reading them', async () => {
    await expect(openBackup('{}', PASS, 21 * 1024 * 1024)).rejects.toThrow('20 MB');
  });
  it('the backup leaves out the sign in, consent and the sample marker', async () => {
    const p = await collectPayload();
    expect(Object.keys(p.tables)).not.toContain('settings');
    expect(Object.keys(p.tables)).not.toContain('meta');
  });
});
