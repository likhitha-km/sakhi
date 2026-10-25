import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Trash2 } from 'lucide-react';
import { deleteAll, saveProfile, SaveError } from '../../db/repo.ts';
import { LastBackup } from './Backup.tsx';
import { changePassword, passwordProblem, updateName } from '../../db/account.ts';
import type { CycleStatus, LifeStage, PregnancyStatus, Profile } from '../../types/entry.ts';
import { AI_ENABLED } from '../../ai/client.ts';
import { GATES } from '../../engine/gates.ts';
import { ConfirmDialog, FieldError, PageHeader } from '../components/common.tsx';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';

const CYCLE: Record<CycleStatus, string> = {
  regular: 'Fairly regular periods', irregular: 'Irregular periods', none_or_stopped: 'No periods, or my periods have stopped',
  hormonal_contraception: 'I use hormonal contraception or a hormonal coil', not_sure: 'Not sure, or prefer not to say',
};
const PREG: Record<PregnancyStatus, string> = { not_pregnant: 'No', possible: 'Possibly', confirmed: 'Yes' };
export const STAGE_LABEL: Record<LifeStage, string> = { cycling: 'I have periods', perimenopause: 'Perimenopause (periods are changing)', post_menopause: 'After menopause', hysterectomy: 'After a hysterectomy', other: "I'd rather not say" };

function ProfileForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setP(profile), [profile]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setErr(null);
    try { await saveProfile(p); setMsg('Saved.'); } catch (x) { setErr(x instanceof SaveError ? x.message : 'That did not save.'); }
  };
  return (
    <form onSubmit={save}>
      <div className="grid-2">
        <div className="field"><label htmlFor="p-age">Age group</label>
          <select id="p-age" className="select" value={p.ageBand ?? ''} onChange={e => setP({ ...p, ageBand: (e.target.value || undefined) as Profile['ageBand'] })}>
            <option value="">Prefer not to say</option>{['18-24', '25-34', '35-44', '45-54', '55+'].map(a => <option key={a} value={a}>{a}</option>)}
          </select></div>
        <div className="field"><label htmlFor="p-stage2">Life stage <span className="caption">(optional)</span></label>
          <select id="p-stage2" className="select" value={p.stage ?? ''} onChange={e => setP({ ...p, stage: (e.target.value || undefined) as LifeStage | undefined })} aria-describedby="p-stage2-hint">
            <option value="">Not chosen</option>{Object.entries(STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span id="p-stage2-hint" className="hint">Only you choose this. It changes which questions and prompts Sakhi shows.</span></div>
        <div className="field"><label htmlFor="p-cycle">Your periods</label>
          <select id="p-cycle" className="select" value={p.cycleStatus} onChange={e => setP({ ...p, cycleStatus: e.target.value as CycleStatus })} aria-describedby="p-cycle-hint">
            {Object.entries(CYCLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span id="p-cycle-hint" className="hint">If you have no periods, Sakhi will not show timing around periods.</span></div>
        <div className="field"><label htmlFor="p-preg">Could you be pregnant?</label>
          <select id="p-preg" className="select" value={p.pregnancyStatus} onChange={e => setP({ ...p, pregnancyStatus: e.target.value as PregnancyStatus })}>
            {Object.entries(PREG).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="field"><label htmlFor="p-stage">Life stage <span className="caption">(optional, in your words)</span></label>
          <input id="p-stage" className="input" maxLength={100} value={p.lifeStage ?? ''} onChange={e => setP({ ...p, lifeStage: e.target.value || undefined })} placeholder="For example: student, new mother" /></div>
      </div>
      <div className="field"><label htmlFor="p-dx">Conditions you already know about <span className="caption">(optional)</span></label>
        <input id="p-dx" className="input" maxLength={200} value={p.knownDiagnoses ?? ''} onChange={e => setP({ ...p, knownDiagnoses: e.target.value || undefined })} /></div>
      <div className="field"><label htmlFor="p-med">Medicines you take <span className="caption">(optional)</span></label>
        <input id="p-med" className="input" maxLength={200} value={p.medicinesText ?? ''} onChange={e => setP({ ...p, medicinesText: e.target.value || undefined })} /></div>
      <button type="submit" className="btn btn-secondary">Save</button>
      {msg && <span role="status" className="status status-ready" style={{ marginLeft: 12 }}>{msg}</span>}
      <FieldError id="p-err" msg={err} />
    </form>
  );
}

function AccountSection() {
  const { account } = useAppData();
  const { user, signIn, signOutTo } = useSession();
  const [name, setName] = useState(account?.name ?? '');
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  useEffect(() => setName(account?.name ?? ''), [account?.name]);
  if (!account) return null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameMsg('Enter a name.'); return; }
    await updateName(name);
    if (user) signIn({ ...user, name: name.trim() }, (() => { try { return !!localStorage.getItem('sakhi.session'); } catch { return false; } })());
    setNameMsg('Saved.');
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg(null);
    const problem = passwordProblem(next) ?? (next !== next2 ? 'The two new passwords are not the same.' : null);
    if (problem) { setPwErr(problem); return; }
    try { await changePassword(cur, next); setPwErr(null); setPwMsg('Your password has been changed.'); setCur(''); setNext(''); setNext2(''); }
    catch (x) { setPwErr(x instanceof SaveError ? x.message : 'Your password could not be changed.'); }
  };

  return (
    <section className="card section" aria-labelledby="acc-h">
      <h2 id="acc-h">Your account</h2>
      <p>Signed in as <strong>{account.email}</strong>. This account is kept only on this device.</p>
      <form onSubmit={saveName} className="row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <label htmlFor="acc-name">Your name</label>
          <input id="acc-name" className="input" value={name} maxLength={60} onChange={e => { setName(e.target.value); setNameMsg(null); }} />
        </div>
        <button type="submit" className="btn btn-secondary">Save name</button>
        {nameMsg && <span role="status" className="caption">{nameMsg}</span>}
      </form>
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Change password</summary>
        <form onSubmit={savePw} style={{ maxWidth: 420, marginTop: 8 }}>
          <div className="field"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw-new">New password</label><input id="pw-new" className="input" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} aria-describedby="pw-new-hint" />
            <span id="pw-new-hint" className="hint">At least 8 characters, with a letter and a number.</span></div>
          <div className="field"><label htmlFor="pw-new2">New password again</label><input id="pw-new2" className="input" type="password" autoComplete="new-password" value={next2} onChange={e => setNext2(e.target.value)} /></div>
          <FieldError id="pw-err" msg={pwErr} />
          {pwMsg && <p role="status" className="status status-ready">{pwMsg}</p>}
          <button type="submit" className="btn btn-secondary">Change password</button>
        </form>
      </details>
      <hr className="divider" />
      <button type="button" className="btn btn-quiet" onClick={() => signOutTo('/')}>Sign out</button>
    </section>
  );
}

export function Settings() {
  const { profile, settings, entries, care } = useAppData();
  const { user, signOutTo, announce } = useSession();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);

  const doDelete = async () => {
    setDelErr(null);
    try {
      await deleteAll();
      signOutTo('/');
      announce('Everything has been deleted from this browser.');
    } catch (e) { setDelErr(e instanceof SaveError ? e.message : 'Some data could not be removed. Please try again.'); setStep(0); }
  };

  return (
    <>
      <PageHeader title="Settings and privacy" />

      {!user?.sample && <AccountSection />}

      <section className="card section" aria-labelledby="where-h">
        <h2 id="where-h"><Lock size={22} aria-hidden="true" /> Where your data is</h2>
        <p>In this browser on this device. Nothing you log is sent anywhere.</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>No account is needed and nobody else can see your entries through Sakhi.</li>
          <li>Your sign in is kept on this device too. It keeps others out of Sakhi on this device, but the entries themselves are not scrambled, and a forgotten password cannot be reset.</li>
          <li>Clearing your browser data, or using a private window, can erase your entries. Keep a backup if they matter to you.</li>
          <li>A brief you save or share leaves Sakhi's protection.</li>
          {AI_ENABLED && <li>"Read my note with AI" is off until you switch it on. When it is on, only the note you write and today's date are sent to an online AI service to be read. No names, no earlier records. Nothing is saved until you press Save.</li>}
        </ul>
      </section>

      <section className="card section" aria-labelledby="about-h">
        <h2 id="about-h">About you</h2>
        <p className="caption">All optional. This helps Sakhi show only summaries that apply to you, and you choose whether it appears on your brief.</p>
        <ProfileForm profile={profile} />
      </section>

      {settings?.syntheticLoaded && (
        <section className="card section" aria-labelledby="sample-h">
          <h2 id="sample-h">Sample data</h2>
          <p>You are looking at made up entries for {settings.sampleName ?? 'a sample person'}. To make your own journal, sign out and choose "Create my journal". The sample entries are removed when you do.</p>
          <div className="row">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => signOutTo('/signin', { focus: 'demo' })}>Sign out and try the other sample</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => signOutTo('/signup')}>Make my own journal</button>
          </div>
        </section>
      )}

      <section className="card section" aria-labelledby="backup-h">
        <h2 id="backup-h">Backup and restore</h2>
        <p>Save an encrypted backup file you keep yourself, or bring your journal back from one. <strong><LastBackup /></strong>.</p>
        <Link to="/settings/backup" className="btn btn-secondary">Backup and restore</Link>
      </section>

      <section className="card section" aria-labelledby="del-h" style={{ borderColor: 'var(--alert-700)' }}>
        <h2 id="del-h"><Trash2 size={22} aria-hidden="true" /> Delete everything</h2>
        <p>This removes your account, all entries, visits, care records, files, your brief and your settings from this browser. It cannot be undone. A backup file you saved earlier is not deleted by Sakhi.</p>
        <button type="button" className="btn btn-danger" onClick={() => setStep(1)}>Delete all my data</button>
        <FieldError id="del-err" msg={delErr} />
      </section>

      <section className="section" aria-labelledby="more-h">
        <h2 id="more-h">Help and limits</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li><Link to="/help">Urgent help numbers</Link></li>
          <li><Link to="/limits">What Sakhi does not cover</Link></li>
          <li><Link to="/how-it-works">How summaries work</Link></li>
        </ul>
        <p className="caption">Sakhi version {GATES.rulesVersion}</p>
      </section>

      <ConfirmDialog open={step === 1} title="Delete everything?" danger confirmLabel="Continue"
        body={<><p>This will permanently remove from this browser:</p>
          <ul style={{ paddingLeft: 20 }}>{!user?.sample && <li>Your account and sign in</li>}<li>{entries.length} entries</li><li>{care.length} care records and any attached files</li><li>Your brief, your details and your settings</li></ul>
          <p>Backup files and briefs you already saved or printed are not deleted by Sakhi.</p></>}
        onCancel={() => setStep(0)} onConfirm={() => { setTyped(''); setStep(2); }} />
      <ConfirmDialog open={step === 2} title="Are you sure?" danger confirmLabel="Delete everything now" confirmDisabled={typed.trim().toUpperCase() !== 'DELETE'}
        body={<div className="field"><label htmlFor="del-type">Type DELETE to confirm</label>
          <input id="del-type" className="input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" data-autofocus /></div>}
        onCancel={() => setStep(0)} onConfirm={() => void doDelete()} />
    </>
  );
}
