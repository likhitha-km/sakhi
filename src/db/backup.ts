// Encrypted backup file. Web Crypto only: PBKDF2-SHA256 (600,000 rounds) to make a key from her
// passphrase, AES-256-GCM to encrypt. A fresh salt and nonce every time. The passphrase and key
// stay in memory only and are never written anywhere.
import { z } from 'zod';
import { db, DB_VERSION } from './db.ts';
import { EntrySchema } from './schema.ts';
import { SaveError } from './repo.ts';
import { AdviceSchema, ConcernSchema, DisclosureSchema, NextVisitSchema, VisitSchema } from './visits.ts';
import { SYSTEMS } from '../brief/careViews.ts';
import { todayLocal } from '../engine/dates.ts';

export const BACKUP_FORMAT = 1;
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
export const KDF_ITERATIONS = 600_000;
export const GENERIC_FAIL = 'That file or passphrase did not work. Nothing was changed.';

// Every table that holds her records. Settings, the sign in account, AI choice and the sample marker are left out.
export const RECORD_TABLES = ['entries', 'exclusions', 'profile', 'providers', 'careEvents', 'visits', 'advice', 'concerns', 'disclosures', 'nextVisits', 'briefs'] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];
export type Payload = { schema: number; tables: Record<RecordTable, unknown[]> };

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const Envelope = z.object({
  app: z.literal('sakhi'), format: z.number().int(), schema: z.number().int(),
  kdf: z.object({ name: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(100_000).max(10_000_000), salt: z.string().min(16) }),
  cipher: z.object({ name: z.literal('AES-256-GCM'), iv: z.string().min(12) }),
  ciphertext: z.string().min(1),
});

export async function collectPayload(): Promise<Payload> {
  const tables = {} as Record<RecordTable, unknown[]>;
  for (const t of RECORD_TABLES) tables[t] = await db.table(t).toArray();
  return { schema: DB_VERSION, tables };
}

export async function encryptBackup(passphrase: string, payload?: Payload): Promise<string> {
  if (passphrase.length < 8) throw new SaveError('Use a passphrase of at least 8 characters.');
  const data = payload ?? await collectPayload();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
  return JSON.stringify({
    app: 'sakhi', format: BACKUP_FORMAT, schema: data.schema,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-256-GCM', iv: b64(iv) }, ciphertext: b64(ct),
  });
}

export const backupFileName = (today = todayLocal()) => `sakhi-backup-${today}.sakhi`;

const Sys = z.array(z.enum(SYSTEMS as [string, ...string[]]));
const TABLE_SCHEMAS: Record<RecordTable, z.ZodType> = {
  entries: EntrySchema,
  exclusions: z.object({ entryId: z.string().min(1), reason: z.string().optional(), excludedAt: z.string(), restoredAt: z.string().optional() }),
  profile: z.object({ id: z.literal(1), cycleStatus: z.string(), pregnancyStatus: z.string() }).passthrough(),
  providers: z.object({ id: z.string().min(1), name: z.string().optional(), facilityName: z.string().optional(), facilityKind: z.string(), role: z.string() }),
  careEvents: z.object({ id: z.string().min(1), kind: z.enum(['visit', 'test', 'treatment']), date: z.string(), title: z.string(), systems: Sys, attachmentIds: z.array(z.string()), hideFromBrief: z.boolean(), origin: z.enum(['user', 'synthetic']) }).passthrough(),
  visits: VisitSchema, advice: AdviceSchema, concerns: ConcernSchema, disclosures: DisclosureSchema, nextVisits: NextVisitSchema,
  briefs: z.object({ id: z.literal(1) }).passthrough(),
};

export interface Preview {
  payload: Payload;
  counts: { visits: number; advice: number; treatments: number; providers: number; entries: number };
  range: { from: string; to: string } | null;
}

/** Checks the file, decrypts it and validates every record. Any failure gives the same message. */
export async function openBackup(fileText: string, passphrase: string, byteSize = fileText.length): Promise<Preview> {
  if (byteSize > BACKUP_MAX_BYTES) throw new SaveError('This file is larger than 20 MB, so it is not a Sakhi backup.');
  let env: z.infer<typeof Envelope>;
  try { env = Envelope.parse(JSON.parse(fileText)); } catch { throw new SaveError(GENERIC_FAIL); }
  if (env.format > BACKUP_FORMAT || env.schema > DB_VERSION) throw new SaveError('This backup was made by a newer version of Sakhi. Update Sakhi, then try again. Nothing was changed.');
  let payload: Payload;
  try {
    const key = await deriveKey(passphrase, unb64(env.kdf.salt), env.kdf.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv) as BufferSource }, key, unb64(env.ciphertext) as BufferSource);
    payload = JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new SaveError(GENERIC_FAIL); }
  if (!payload || typeof payload !== 'object' || payload.schema !== env.schema || typeof payload.tables !== 'object') throw new SaveError(GENERIC_FAIL);
  // Older backups simply lack the newer tables.
  for (const t of RECORD_TABLES) {
    const rows = payload.tables[t] ?? [];
    if (!Array.isArray(rows)) throw new SaveError(GENERIC_FAIL);
    for (const r of rows) if (!TABLE_SCHEMAS[t].safeParse(r).success) throw new SaveError(GENERIC_FAIL);
    payload.tables[t] = rows;
  }
  const T = payload.tables as Record<RecordTable, { occurredOn?: string; on?: string; kind?: string }[]>;
  const dates = [...T.entries.map(e => e.occurredOn!), ...T.visits.map(v => v.on!)].filter(Boolean).sort();
  return {
    payload,
    counts: { visits: T.visits.length, advice: T.advice.length, treatments: T.careEvents.filter(c => c.kind === 'treatment').length, providers: T.providers.length, entries: T.entries.length },
    range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };
}

const keyOf = (t: RecordTable, r: Record<string, unknown>) =>
  t === 'disclosures' ? [r.treatmentId as string, r.providerId as string] : t === 'exclusions' ? r.entryId as string : r.id as string | number;

/** Replace: one transaction that clears and writes every record table. Any failure rolls the whole thing back. */
export async function restoreReplace(payload: Payload) {
  try {
    await db.transaction('rw', RECORD_TABLES.map(t => db.table(t)), async () => {
      for (const t of RECORD_TABLES) {
        await db.table(t).clear();
        await db.table(t).bulkAdd(payload.tables[t]);
      }
    });
  } catch { throw new SaveError('The restore could not finish, so nothing was changed. Your existing data is as it was.'); }
}

/** Add missing: records already on this device always win. */
export async function restoreAddMissing(payload: Payload) {
  let added = 0, skipped = 0;
  try {
    await db.transaction('rw', RECORD_TABLES.map(t => db.table(t)), async () => {
      for (const t of RECORD_TABLES) {
        const rows = payload.tables[t] as Record<string, unknown>[];
        if (!rows.length) continue;
        const existing = await db.table(t).bulkGet(rows.map(r => keyOf(t, r)));
        const missing = rows.filter((_, i) => !existing[i]);
        skipped += rows.length - missing.length;
        added += missing.length;
        if (missing.length) await db.table(t).bulkAdd(missing);
      }
    });
  } catch { throw new SaveError('The restore could not finish, so nothing was changed. Your existing data is as it was.'); }
  return { added, skipped };
}
