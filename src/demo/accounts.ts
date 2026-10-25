import type { FixtureId } from '../fixtures/index.ts';

export const DEMO_ENABLED = import.meta.env?.VITE_DEMO_LOGIN !== 'false';

// Public on purpose: these are sample details, not secrets.
export const DEMO_ACCOUNTS = [
  { email: 'ananya.demo@sakhi.test', password: 'demo-password', name: 'Ananya', fixture: 'ananya_visits' as FixtureId },
  { email: 'farah.demo@sakhi.test', password: 'demo-password', name: 'Farah', fixture: 'sparse' as FixtureId },
] as const;
export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export function demoSignIn(email: string, password: string, hasUserEntries: boolean, enabled = DEMO_ENABLED) {
  if (!enabled) return { ok: false, reason: 'disabled' } as const;
  if (hasUserEntries) return { ok: false, reason: 'real_data_present' } as const;
  const a = DEMO_ACCOUNTS.find(x => x.email === email.trim().toLowerCase() && x.password === password);
  return a ? { ok: true, account: a } as const : { ok: false, reason: 'wrong_credentials' } as const;
}
