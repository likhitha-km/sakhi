import { describe, expect, it } from 'vitest';
import { demoSignIn, DEMO_ACCOUNTS } from '../src/demo/accounts.ts';

describe('sample sign in', () => {
  it('L01 wrong details are refused', () => {
    expect(demoSignIn('ananya.demo@sakhi.test', 'nope', false).ok).toBe(false);
    expect(demoSignIn('someone@example.com', 'demo-password', false).ok).toBe(false);
    expect(demoSignIn('', '', false)).toEqual({ ok: false, reason: 'wrong_credentials' });
  });
  it('accepts the sample details', () => {
    const r = demoSignIn(' Ananya.Demo@sakhi.test ', 'demo-password', false);
    expect(r.ok && r.account.fixture).toBe('ananya_visits');
    expect(DEMO_ACCOUNTS.every(a => a.email.endsWith('.test'))).toBe(true);
  });
  it('L05 refuses when own entries exist', () => expect(demoSignIn(DEMO_ACCOUNTS[0].email, 'demo-password', true)).toEqual({ ok: false, reason: 'real_data_present' }));
  it('L07 can be switched off', () => expect(demoSignIn(DEMO_ACCOUNTS[0].email, 'demo-password', false, false)).toEqual({ ok: false, reason: 'disabled' }));
});
