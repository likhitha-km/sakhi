// Card and reply links. The data rides in the URL fragment (after #), which browsers never send
// to a server. Strict size limits and validation on read. Text only, never HTML.
import { z } from 'zod';
import type { Section } from '../visits/sections.ts';
import { segText } from '../visits/sections.ts';

export const MAX_FRAGMENT = 8000;
export const MAX_JSON_BYTES = 32 * 1024;
export const TARGET_LENGTH = 6000;

const b64url = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (s: string) => { if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad'); const p = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(p + '='.repeat((4 - p.length % 4) % 4)), c => c.charCodeAt(0)); };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { await reader.cancel(); throw new Error('too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** "v1.z" + data when compressed, "v1.p" + data when plain JSON. */
export async function encodePayload(obj: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (canCompress()) return 'v1.z' + b64url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'v1.p' + b64url(json);
}

export async function decodePayload(fragment: string): Promise<unknown> {
  if (fragment.length > MAX_FRAGMENT) throw new Error('This link is too long to be a Sakhi card.');
  const m = /^v1\.([zp])([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!m) throw new Error('This link could not be opened.');
  const bytes = unb64url(m[2]);
  let json: Uint8Array;
  if (m[1] === 'z') {
    if (!canCompress()) throw new Error('This browser cannot open this link. Try another browser.');
    json = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
  } else json = bytes;
  if (json.length > MAX_JSON_BYTES) throw new Error('This link is too large to be a Sakhi card.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
}

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SharedLine = z.object({ kind: z.enum(['p', 'li', 'ol', 'group']), text: z.string().max(600), icon: z.enum(['overdue', 'told', 'not_told', 'unsure']).optional(), src: z.enum(['ai', 'reply', 'unknown']).optional() }).strict();
const SharedSection = z.object({ key: z.enum(['goal', 'changes', 'since', 'take', 'advice', 'concerns', 'tests', 'questions']), heading: z.string().max(200), lines: z.array(SharedLine).max(60) }).strict();
export const SharedCardSchema = z.object({
  v: z.literal(1), kind: z.literal('card'), createdOn: Date_, expiresOn: Date_,
  nameOnCard: z.string().max(60).optional(), forClinician: z.string().max(80).optional(),
  sections: z.array(SharedSection).max(8), concerns: z.array(z.object({ id: z.string().min(1).max(64), text: z.string().max(240) }).strict()).max(20),
}).strict();
export type SharedCard = z.infer<typeof SharedCardSchema>;

export const ReplySchema = z.object({
  v: z.literal(1), kind: z.literal('reply'), createdOn: Date_,
  clinicianName: z.string().max(60).optional(), forClinician: z.string().max(80).optional(),
  advice: z.array(z.object({ kind: z.enum(['test', 'medicine', 'follow_up', 'lifestyle', 'referral', 'other']), text: z.string().trim().min(1).max(160), inDays: z.number().int().min(0).max(365).optional() }).strict()).max(6),
  addressed: z.array(z.string().min(1).max(64)).max(20),
  nextVisitInDays: z.number().int().min(0).max(365).optional(),
  note: z.string().max(300).optional(),
}).strict();
export type Reply = z.infer<typeof ReplySchema>;

/** Plain text sections for the link, from the same section model as the screen and print. */
export const toShared = (sections: Section[]): SharedCard['sections'] => sections.map(s => ({
  key: s.key, heading: segText(s.heading).slice(0, 200),
  lines: s.lines.slice(0, 60).map(l => ({ kind: l.kind, text: segText(l.segs).slice(0, 600), ...(l.icon ? { icon: l.icon } : {}), ...(l.src ? { src: l.src } : {}) })),
}));

export async function readCard(fragment: string): Promise<SharedCard> {
  const raw = await decodePayload(fragment);
  const r = SharedCardSchema.safeParse(raw);
  if (!r.success) throw new Error('This link could not be opened.');
  return r.data;
}
export async function readReply(fragment: string): Promise<Reply> {
  const raw = await decodePayload(fragment);
  const r = ReplySchema.safeParse(raw);
  if (!r.success) throw new Error('This reply link could not be opened.');
  return r.data;
}

/** The link base: this page without its fragment. */
export const linkBase = () => (typeof location === 'undefined' ? '' : location.origin + location.pathname);
export const cardLink = (frag: string) => `${linkBase()}#/c/${frag}`;
export const replyLink = (frag: string) => `${linkBase()}#/r/${frag}`;
