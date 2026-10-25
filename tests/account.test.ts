import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { deleteAll } from '../src/db/repo.ts';
import { changePassword, checkSignIn, createAccount, getAccount, passwordProblem } from '../src/db/account.ts';

beforeEach(async () => { await deleteAll(); });

describe('account on this device', () => {
  it('creates an account and never stores the password as text', async () => {
    await createAccount('Meera', ' Meera@Example.com ', 'secret123');
    const a = await getAccount();
    expect(a?.email).toBe('meera@example.com');
    expect(JSON.stringify(await db.meta.toArray())).not.toContain('secret123');
  });
  it('signs in only with the right email and password', async () => {
    await createAccount('Meera', 'meera@example.com', 'secret123');
    expect(await checkSignIn('MEERA@example.com', 'secret123')).toBeTruthy();
    expect(await checkSignIn('meera@example.com', 'secret124')).toBeNull();
    expect(await checkSignIn('other@example.com', 'secret123')).toBeNull();
  });
  it('allows only one journal per device', async () => {
    await createAccount('Meera', 'meera@example.com', 'secret123');
    await expect(createAccount('Asha', 'asha@example.com', 'secret123')).rejects.toThrow('already has a journal');
  });
  it('changes the password only with the current one', async () => {
    await createAccount('Meera', 'meera@example.com', 'secret123');
    await expect(changePassword('wrong', 'newpass99')).rejects.toThrow();
    await changePassword('secret123', 'newpass99');
    expect(await checkSignIn('meera@example.com', 'newpass99')).toBeTruthy();
    expect(await checkSignIn('meera@example.com', 'secret123')).toBeNull();
  });
  it('delete all removes the account', async () => {
    await createAccount('Meera', 'meera@example.com', 'secret123');
    await deleteAll();
    expect(await getAccount()).toBeUndefined();
  });
  it('asks for a reasonable password', () => {
    expect(passwordProblem('short1')).toBeTruthy();
    expect(passwordProblem('onlyletters')).toBeTruthy();
    expect(passwordProblem('letters123')).toBeNull();
  });
});
