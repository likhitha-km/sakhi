// One journal per browser. The account lives only on this device: the password is stored
// as a salted PBKDF2 hash, never as text. It keeps casual users out; it is not encryption.
import { db } from './db.ts';
import { SaveError } from './repo.ts';

export interface Account { id: 'account'; name: string; email: string; salt: string; hash: string; createdAt: string }

const ITERATIONS = 150_000;
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));

export async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS }, key, 256);
  return toHex(bits);
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use at least one letter and one number.';
  return null;
}

export async function getAccount(): Promise<Account | undefined> {
  const m = await db.meta.get('account');
  if (!m) return undefined;
  try { return JSON.parse(m.value) as Account; } catch { return undefined; }
}

export async function createAccount(name: string, email: string, password: string): Promise<Account> {
  if (await getAccount()) throw new SaveError('This device already has a journal. Sign in instead.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const a: Account = { id: 'account', name: name.trim(), email: normEmail(email), salt, hash: await hashPassword(password, salt), createdAt: new Date().toISOString() };
  await db.meta.put({ id: 'account', value: JSON.stringify(a) });
  return a;
}

/** Compares in constant time so the check does not leak how many characters matched. */
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

export async function checkSignIn(email: string, password: string): Promise<Account | null> {
  const a = await getAccount();
  if (!a || a.email !== normEmail(email)) return null;
  return same(await hashPassword(password, a.salt), a.hash) ? a : null;
}

export async function changePassword(current: string, next: string) {
  const a = await getAccount();
  if (!a || !same(await hashPassword(current, a.salt), a.hash)) throw new SaveError('Your current password is not right.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  await db.meta.put({ id: 'account', value: JSON.stringify({ ...a, salt, hash: await hashPassword(next, salt) }) });
}

export async function updateName(name: string) {
  const a = await getAccount();
  if (a) await db.meta.put({ id: 'account', value: JSON.stringify({ ...a, name: name.trim() }) });
}
