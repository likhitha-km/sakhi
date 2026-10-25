import { db } from './db.ts';
import { EntrySchema } from './schema.ts';
import type { Entry, Exclusion, Profile, Settings } from '../types/entry.ts';
import type { Attachment, CareEvent, Provider } from '../types/care.ts';
import type { BriefDraft } from '../types/brief.ts';
import { buildFixture, type FixtureId } from '../fixtures/index.ts';
import { todayLocal } from '../engine/dates.ts';
import { emptyDraft } from '../brief/buildBrief.ts';

export const CONSENT_VERSION = '1';
export const DEFAULT_PROFILE: Profile = { id: 1, cycleStatus: 'not_sure', pregnancyStatus: 'not_pregnant' };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export class SaveError extends Error {}

const friendly = (err: unknown) => {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(String(err))) return 'Your browser is out of space for Sakhi. Remove some attachments and try again.';
  return 'Sakhi could not save this in your browser. Please try again.';
};

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError(friendly(e));
  }
}

export function validateEntry(e: Entry): string | null {
  const r = EntrySchema.safeParse(e);
  return r.success ? null : r.error.issues[0]?.message ?? 'Please check this entry.';
}

/** Saves all entries from one log in one go: either all are saved or none are. */
export async function saveEntries(entries: Entry[]) {
  for (const e of entries) {
    const msg = validateEntry(e);
    if (msg) throw new SaveError(msg);
  }
  await guard(() => db.transaction('rw', db.entries, async () => { await db.entries.bulkAdd(entries); }));
}

export async function updateEntry(e: Entry) {
  const msg = validateEntry(e);
  if (msg) throw new SaveError(msg);
  await guard(() => db.entries.put(e));
}

export async function deleteEntry(id: string) {
  await guard(() => db.transaction('rw', db.entries, db.exclusions, async () => {
    await db.entries.delete(id);
    await db.exclusions.delete(id);
  }));
}

export async function setExcluded(entryId: string, excluded: boolean) {
  await guard(async () => {
    if (excluded) await db.exclusions.put({ entryId, excludedAt: new Date().toISOString() });
    else {
      const x = await db.exclusions.get(entryId);
      if (x) await db.exclusions.put({ ...x, restoredAt: new Date().toISOString() });
    }
  });
}

export async function getSettings(): Promise<Settings | undefined> { return db.settings.get(1); }

export async function giveConsent() {
  const existing = await db.settings.get(1);
  await guard(() => db.settings.put({
    id: 1, consentVersion: CONSENT_VERSION, consentedAt: new Date().toISOString(),
    windowDays: existing?.windowDays ?? 56, syntheticLoaded: existing?.syntheticLoaded ?? false, aiAssistEnabled: false,
    sampleName: existing?.sampleName,
  }));
}

export async function patchSettings(p: Partial<Settings>) {
  const s = await db.settings.get(1);
  if (s) await guard(() => db.settings.put({ ...s, ...p }));
}

export async function saveProfile(p: Profile) { await guard(() => db.profile.put(p)); }

export async function saveDraft(d: BriefDraft) { await guard(() => db.briefs.put({ ...d, updatedAt: new Date().toISOString() })); }
export async function getDraft(): Promise<BriefDraft> { return (await db.briefs.get(1)) ?? emptyDraft(); }

export async function hasOwnEntries() {
  return (await db.entries.filter(e => e.source === 'user').count()) > 0 || (await db.careEvents.filter(c => c.origin === 'user').count()) > 0;
}

const VISIT_TABLES = () => [db.visits, db.advice, db.concerns, db.disclosures, db.nextVisits];

/** Replaces any sample data with the chosen sample. Never runs when the person has their own journal. */
export async function loadFixture(id: FixtureId, today = todayLocal()) {
  const f = buildFixture(id, today);
  await guard(() => db.transaction('rw', [db.entries, db.exclusions, db.providers, db.careEvents, db.settings, db.briefs, db.profile, ...VISIT_TABLES()], async () => {
    const old = await db.entries.filter(e => e.source === 'synthetic').primaryKeys();
    await db.entries.bulkDelete(old);
    await db.exclusions.bulkDelete(old);
    await db.careEvents.filter(c => c.origin === 'synthetic').delete();
    await db.providers.filter(p => p.id.startsWith('prov-') || p.id.startsWith('sample-')).delete();
    await Promise.all(VISIT_TABLES().map(t => t.clear()));
    await db.briefs.clear();
    await db.entries.bulkAdd(f.entries);
    if (f.providers.length) await db.providers.bulkAdd(f.providers);
    if (f.care.length) await db.careEvents.bulkAdd(f.care);
    await db.visits.bulkAdd(f.visits);
    await db.advice.bulkAdd(f.advice);
    await db.concerns.bulkAdd(f.concerns);
    await db.disclosures.bulkAdd(f.disclosures);
    await db.nextVisits.bulkAdd(f.nextVisits);
    await db.profile.put({ ...DEFAULT_PROFILE, cycleStatus: id === 'sparse' ? 'not_sure' : 'regular', ageBand: id === 'sparse' ? '35-44' : '18-24' });
    const s = await db.settings.get(1);
    if (s) await db.settings.put({ ...s, syntheticLoaded: true, sampleName: f.name });
  }));
}

/** Removes everything this app stored in this browser, including the account and the last backup date. */
export async function deleteAll() {
  await db.transaction('rw', db.tables, async () => { await Promise.all(db.tables.map(t => t.clear())); });
  try { sessionStorage.clear(); } catch { /* ignore */ }
  const left = (await Promise.all(db.tables.map(t => t.count()))).reduce((a, b) => a + b, 0);
  if (left) throw new SaveError('Some of your data could not be removed. Please try again, or clear this site\'s data in your browser settings.');
}

// Care records
const normName = (s?: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function findOrCreateProvider(p: Omit<Provider, 'id'>): Promise<string | undefined> {
  if (!p.name?.trim() && !p.facilityName?.trim() && p.role === 'other' && p.facilityKind === 'other') return undefined;
  const all = await db.providers.toArray();
  const match = all.find(x => normName(x.name) === normName(p.name) && normName(x.facilityName) === normName(p.facilityName));
  if (match) {
    await db.providers.put({ ...match, role: p.role, facilityKind: p.facilityKind });
    return match.id;
  }
  const id = uid();
  await db.providers.add({ ...p, id, name: p.name?.trim() || undefined, facilityName: p.facilityName?.trim() || undefined });
  return id;
}

export async function saveCare(c: CareEvent) { await guard(() => db.careEvents.put(c)); }

export async function deleteCare(id: string) {
  await guard(() => db.transaction('rw', db.careEvents, db.attachments, async () => {
    const c = await db.careEvents.get(id);
    if (c) await db.attachments.bulkDelete(c.attachmentIds);
    await db.careEvents.delete(id);
  }));
}

export const ATTACH_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const ATTACH_MAX = 5 * 1024 * 1024;
export const ATTACH_TOTAL = 40 * 1024 * 1024;

export async function addAttachment(file: File): Promise<string> {
  if (!ATTACH_TYPES.includes(file.type)) throw new SaveError('Only photos (JPEG or PNG) and PDF files can be added.');
  if (file.size > ATTACH_MAX) throw new SaveError('This file is bigger than 5 MB. Choose a smaller photo or file.');
  const used = (await db.attachments.toArray()).reduce((s, a) => s + a.size, 0);
  if (used + file.size > ATTACH_TOTAL) throw new SaveError('You have reached the 40 MB limit for files. Remove some files first.');
  const a: Attachment = { id: uid(), name: file.name, mime: file.type, size: file.size, blob: file, addedAt: new Date().toISOString() };
  await guard(() => db.attachments.add(a));
  return a.id;
}

// Backup
export async function exportBackup() {
  const [entries, exclusions, profile, providers, careEvents, briefs] = await Promise.all([
    db.entries.filter(e => e.source === 'user').toArray(), db.exclusions.toArray(), db.profile.get(1),
    db.providers.toArray(), db.careEvents.filter(c => c.origin === 'user').toArray(), db.briefs.toArray(),
  ]);
  const ids = new Set(entries.map(e => e.id));
  return {
    app: 'sakhi', version: 1, savedAt: new Date().toISOString(),
    entries, exclusions: exclusions.filter(x => ids.has(x.entryId)), profile, providers, careEvents: careEvents.map(c => ({ ...c, attachmentIds: [] })), briefs,
  };
}

export async function importBackup(text: string) {
  let data: { app?: string; entries?: Entry[]; exclusions?: Exclusion[]; profile?: Profile; providers?: Provider[]; careEvents?: CareEvent[]; briefs?: BriefDraft[] };
  try { data = JSON.parse(text); } catch { throw new SaveError('This file is not a Sakhi backup.'); }
  if (data.app !== 'sakhi' || !Array.isArray(data.entries)) throw new SaveError('This file is not a Sakhi backup.');
  for (const e of data.entries) {
    if (e.source !== 'user') throw new SaveError('This backup contains entries Sakhi cannot read.');
    const r = EntrySchema.safeParse(e);
    if (!r.success) throw new SaveError('Some entries in this backup could not be read, so nothing was restored.');
  }
  await guard(() => db.transaction('rw', [db.entries, db.exclusions, db.profile, db.providers, db.careEvents, db.briefs], async () => {
    await db.entries.bulkPut(data.entries!);
    if (data.exclusions) await db.exclusions.bulkPut(data.exclusions);
    if (data.profile) await db.profile.put(data.profile);
    if (data.providers) await db.providers.bulkPut(data.providers);
    if (data.careEvents) await db.careEvents.bulkPut(data.careEvents);
    if (data.briefs?.[0]) await db.briefs.put(data.briefs[0]);
  }));
  return data.entries.length;
}
