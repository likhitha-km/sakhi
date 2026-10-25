import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, UserPlus } from 'lucide-react';
import { ConfirmDialog, FieldError, jumpTo, SkipLink } from '../components/common.tsx';
import { SiteFooter, SiteHeader } from '../components/SiteChrome.tsx';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { deleteAll, giveConsent, hasOwnEntries, loadFixture, SaveError } from '../../db/repo.ts';
import { checkSignIn, createAccount, getAccount, normEmail, passwordProblem, validEmail } from '../../db/account.ts';
import { DEMO_ACCOUNTS, DEMO_ENABLED, demoSignIn, type DemoAccount } from '../../demo/accounts.ts';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="app site">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="auth-wrap">{children}</main>
      <SiteFooter />
    </div>
  );
}

function PasswordField({ id, label, value, onChange, error, autoComplete, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string | null; autoComplete: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-button">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete} aria-describedby={`${id}-hint ${id}-err`} />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <span id={`${id}-hint`} className="hint">{hint}</span>}
      <FieldError id={`${id}-err`} msg={error} />
    </div>
  );
}

/** Age check and agreement, shared by both pages. */
function Agreement({ age, setAge, agree, setAgree, error }: {
  age: 'adult' | 'minor' | ''; setAge: (a: 'adult' | 'minor') => void; agree: boolean; setAgree: (v: boolean) => void; error?: string | null;
}) {
  return (
    <>
      <div className="banner banner-info">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Sakhi helps you keep a record of your symptoms and prepare for an appointment.</li>
          <li>It shows counts of what you recorded. It does not diagnose or advise treatment.</li>
          <li>It is not for emergencies. If you feel seriously unwell, call 112.</li>
          <li>Your journal is kept only in this browser on this device. Clearing browser data can erase it.</li>
        </ul>
      </div>
      <fieldset>
        <legend>Your age</legend>
        <div className="check-list">
          <label className="check"><input type="radio" name="age" checked={age === 'adult'} onChange={() => setAge('adult')} /> I am 18 or over</label>
          <label className="check"><input type="radio" name="age" checked={age === 'minor'} onChange={() => setAge('minor')} /> I am under 18</label>
        </div>
      </fieldset>
      {age === 'minor' ? (
        <div className="banner banner-sample" role="status"><p style={{ margin: 0 }}>Sakhi is made for adults, so it cannot be used under 18. A doctor, school nurse or a trusted adult can help you. If you need help now, see <Link to="/help">urgent help numbers</Link>.</p></div>
      ) : (
        <label className="check" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} aria-describedby="agree-err" />
          I have read this and I understand Sakhi does not diagnose or replace a doctor.
        </label>
      )}
      <FieldError id="agree-err" msg={error} />
    </>
  );
}

const agreementError = (age: string, agree: boolean) =>
  age === 'minor' ? 'Sakhi cannot be used under 18.' : age !== 'adult' ? 'Please confirm that you are 18 or over.' : !agree ? 'Please tick the box to say you have read this.' : null;

/** Waits until the agreement is saved before opening the journal, so the page is not sent back. */
function useGoWhenReady() {
  const { settings } = useAppData();
  const nav = useNavigate();
  const loc = useLocation();
  const [go, setGo] = useState(false);
  const to = (loc.state as { from?: string } | null)?.from ?? '/home';
  useEffect(() => { if (go && settings?.consentVersion) nav(to, { replace: true }); }, [go, settings?.consentVersion, nav, to]);
  return () => setGo(true);
}

export function SignUp() {
  const { settings } = useAppData();
  const { user, signIn, announce } = useSession();
  const goHome = useGoWhenReady();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [age, setAge] = useState<'adult' | 'minor' | ''>('');
  const [agree, setAgree] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<Record<string, string | null>>({});
  const [exists, setExists] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void getAccount().then(a => setExists(!!a)); }, []);
  if (user) return <Navigate to="/home" replace />;

  const create = async () => {
    setBusy(true);
    try {
      if (settings?.syntheticLoaded) await deleteAll();
      const a = await createAccount(name, email, pw);
      await giveConsent();
      signIn({ name: a.name, sample: false }, remember);
      announce(`Welcome, ${a.name}. Your journal is ready.`);
      goHome();
    } catch (x) {
      setErr({ form: x instanceof SaveError ? x.message : 'Your journal could not be created. Please try again.' });
    } finally { setBusy(false); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string | null> = {
      name: name.trim() ? null : 'Tell us what to call you.',
      email: validEmail(email) ? null : 'Enter an email address, for example name@example.com.',
      pw: passwordProblem(pw),
      pw2: pw && pw !== pw2 ? 'The two passwords are not the same.' : null,
      agree: agreementError(age, agree),
    };
    if (DEMO_ACCOUNTS.some(a => a.email === normEmail(email))) errs.email = 'This email is for the sample journal. Use your own email.';
    setErr(errs);
    const first = Object.values(errs).find(Boolean);
    if (first) { announce(first); return; }
    if (settings?.syntheticLoaded) { setConfirmSample(true); return; }
    void create();
  };

  return (
    <AuthShell>
      <div className="auth-card card">
        <h1><UserPlus size={28} aria-hidden="true" /> Create your journal</h1>
        <p className="muted">Your account is made on this device only. Nothing is sent anywhere.</p>
        {exists ? (
          <div className="stack">
            <div className="banner banner-info"><p style={{ margin: 0 }}>This device already has a journal. Each browser holds one journal.</p></div>
            <Link className="btn btn-primary" to="/signin">Sign in instead</Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="su-name">Your name</label>
              <input id="su-name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" maxLength={60} aria-describedby="su-name-err" />
              <FieldError id="su-name-err" msg={err.name} />
            </div>
            <div className="field">
              <label htmlFor="su-email">Email</label>
              <input id="su-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" aria-describedby="su-email-hint su-email-err" />
              <span id="su-email-hint" className="hint">Used only to sign in on this device. We never send you email.</span>
              <FieldError id="su-email-err" msg={err.email} />
            </div>
            <PasswordField id="su-pw" label="Password" value={pw} onChange={setPw} error={err.pw} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
            <PasswordField id="su-pw2" label="Type the password again" value={pw2} onChange={setPw2} error={err.pw2} autoComplete="new-password" />
            <div className="banner banner-sample"><p style={{ margin: 0 }}>Keep your password safe. Because your journal is only on this device, a forgotten password cannot be reset.</p></div>
            <Agreement age={age} setAge={setAge} agree={agree} setAgree={setAgree} error={err.agree} />
            <label className="check" style={{ margin: '12px 0' }}><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Keep me signed in on this device</label>
            <FieldError id="su-form-err" msg={err.form} />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || age === 'minor'}>{busy ? 'Creating…' : 'Create my journal'}</button>
          </form>
        )}
        <p style={{ marginTop: 16 }}>Already have a journal on this device? <Link to="/signin">Sign in</Link></p>
      </div>
      <ConfirmDialog open={confirmSample} title="Remove the sample journal?"
        body={<p>Sample entries for {settings?.sampleName} are on this device. Creating your own journal removes them, so your journal starts empty.</p>}
        confirmLabel="Remove sample and continue" onCancel={() => setConfirmSample(false)} onConfirm={() => { setConfirmSample(false); void create(); }} />
    </AuthShell>
  );
}

export function SignIn() {
  const { settings } = useAppData();
  const { user, signIn, announce } = useSession();
  const goHome = useGoWhenReady();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [needAgree, setNeedAgree] = useState<DemoAccount | null>(null);
  const [age, setAge] = useState<'adult' | 'minor' | ''>('');
  const [agree, setAgree] = useState(false);
  const [agreeErr, setAgreeErr] = useState<string | null>(null);
  const [swap, setSwap] = useState<DemoAccount | null>(null);
  const [forget, setForget] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if ((loc.state as { focus?: string } | null)?.focus === 'demo') setTimeout(() => jumpTo('demo-h'), 50); }, [loc.state]);
  if (user) return <Navigate to="/home" replace />;

  const openSample = async (a: DemoAccount, alreadyLoaded: boolean) => {
    setBusy(true);
    try {
      if (!alreadyLoaded) await loadFixture(a.fixture);
      signIn({ name: a.name, sample: true }, false);
      announce(`Signed in to ${a.name}'s sample journal.`);
      goHome();
    } catch (x) { setErr(x instanceof SaveError ? x.message : 'The sample could not be opened. Please try again.'); }
    finally { setBusy(false); }
  };

  const continueSample = async (a: DemoAccount) => {
    if (!settings?.consentVersion) { setNeedAgree(a); setTimeout(() => jumpTo('agree-h'), 50); return; }
    const loaded = !!settings.syntheticLoaded && settings.sampleName === a.name;
    if (settings.syntheticLoaded && settings.sampleName && !loaded) { setSwap(a); return; }
    await openSample(a, loaded);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !pw) { setErr('Enter your email and password.'); return; }
    const isSample = DEMO_ACCOUNTS.some(a => a.email === normEmail(email));
    if (isSample) {
      const blocked = (await hasOwnEntries()) || !!(await getAccount());
      const r = demoSignIn(email, pw, blocked);
      if (!r.ok) {
        setErr(r.reason === 'real_data_present'
          ? 'This device already has your own journal, so the sample cannot open here. Sign in with your own details, or open Sakhi in a private window to try the sample.'
          : 'That sample password is not right. Use the details shown below.');
        return;
      }
      await continueSample(r.account);
      return;
    }
    setBusy(true);
    const account = await getAccount();
    const a = account ? await checkSignIn(email, pw) : null;
    setBusy(false);
    if (!account) { setErr('There is no journal on this device yet. Create one first.'); return; }
    if (!a) { setErr('That email and password do not match.'); return; }
    signIn({ name: a.name, sample: false }, remember);
    announce(`Welcome back, ${a.name}.`);
    goHome();
  };

  const agreeAndOpen = async () => {
    const msg = agreementError(age, agree);
    setAgreeErr(msg);
    if (msg || !needAgree) return;
    try { await giveConsent(); await openSample(needAgree, false); }
    catch (x) { setAgreeErr(x instanceof SaveError ? x.message : 'That did not save. Please try again.'); }
  };

  return (
    <AuthShell>
      <div className="auth-grid">
        <div className="auth-card card">
          <h1><Lock size={26} aria-hidden="true" /> Sign in</h1>
          <p className="muted">Sign in to the journal kept on this device.</p>
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="si-email">Email</label>
              <input id="si-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" aria-describedby="si-err" />
            </div>
            <PasswordField id="si-pw" label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
            <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Keep me signed in on this device</label>
            <FieldError id="si-err" msg={err} />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <details className="forgot">
            <summary>Forgot your password?</summary>
            <p className="caption">Your journal is kept only on this device, so there is no way to reset the password from anywhere else. If you cannot remember it, you can delete this journal and start a new one. Your entries will be lost.</p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setForget(true)}>Delete this journal and start again</button>
          </details>
          <p style={{ marginTop: 16 }}>New to Sakhi? <Link to="/signup">Create your journal</Link></p>
        </div>

        {DEMO_ENABLED && (
          <section className="card auth-card" aria-labelledby="demo-h">
            <h2 id="demo-h" tabIndex={-1}>Try a sample journal</h2>
            <p className="muted">Look around with made up entries before you make your own. Fill in a sample's details, then press Sign in.</p>
            <div className="stack">
              {DEMO_ACCOUNTS.map(a => (
                <div key={a.email} className="sample-row">
                  <span><strong>{a.name}</strong><br /><span className="caption">{a.name === 'Ananya' ? '8 weeks of entries and some doctor visits' : 'only a few entries'}</span></span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail(a.email); setPw(a.password); setErr(null); jumpTo('si-email'); }}>
                    Fill {a.name}'s details
                  </button>
                </div>
              ))}
            </div>
            {needAgree && (
              <div style={{ marginTop: 20 }}>
                <h3 id="agree-h" tabIndex={-1}>Before you open {needAgree.name}'s sample</h3>
                <Agreement age={age} setAge={setAge} agree={agree} setAgree={setAgree} error={agreeErr} />
                <button type="button" className="btn btn-primary" onClick={agreeAndOpen} disabled={busy || age === 'minor'}>Agree and open the sample</button>
              </div>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog open={!!swap} title="Switch sample journal?"
        body={<p>This replaces {settings?.sampleName}'s sample entries with {swap?.name}'s.</p>}
        confirmLabel={`Open ${swap?.name ?? ''}`} onCancel={() => setSwap(null)}
        onConfirm={() => { const a = swap!; setSwap(null); void openSample(a, false); }} />
      <ConfirmDialog open={forget} title="Delete this journal?" danger confirmLabel="Delete and start again"
        body={<p>Everything on this device will be removed: entries, care records, files and the account. This cannot be undone.</p>}
        onCancel={() => setForget(false)}
        onConfirm={async () => { setForget(false); try { await deleteAll(); nav('/signup'); } catch { setErr('This journal could not be deleted. Please try again.'); } }} />
    </AuthShell>
  );
}
