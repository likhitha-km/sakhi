import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, KeyRound, Upload } from 'lucide-react';
import { backupFileName, BACKUP_MAX_BYTES, encryptBackup, GENERIC_FAIL, openBackup, restoreAddMissing, restoreReplace, type Preview } from '../../db/backup.ts';
import { patchSettings, SaveError } from '../../db/repo.ts';
import { fmtDate, todayLocal } from '../../engine/dates.ts';
import { ConfirmDialog, FieldError, PageHeader } from '../components/common.tsx';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';

export function LastBackup() {
  const { settings } = useAppData();
  return <>{settings?.lastBackupOn ? `Last backup: ${fmtDate(settings.lastBackupOn, true)}` : 'No backup yet'}</>;
}

export function Backup() {
  const { announce } = useSession();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [expErr, setExpErr] = useState<string | null>(null);
  const [expMsg, setExpMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string; size: number } | null>(null);
  const [rp, setRp] = useState('');
  const [resErr, setResErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [typed, setTyped] = useState('');
  const [resMsg, setResMsg] = useState<string | null>(null);

  const doExport = async (e: React.FormEvent) => {
    e.preventDefault(); setExpErr(null); setExpMsg(null);
    if (p1.length < 8) { setExpErr('Use a passphrase of at least 8 characters.'); return; }
    if (p1 !== p2) { setExpErr('The two passphrases are not the same.'); return; }
    setBusy(true);
    try {
      const text = await encryptBackup(p1);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = backupFileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      await patchSettings({ lastBackupOn: todayLocal() });
      setExpMsg(`Your download has started: ${backupFileName()}. Check your downloads, then keep the file somewhere private.`);
      announce('Your encrypted backup download has started.');
    } catch (x) { setExpErr(x instanceof SaveError ? x.message : 'The backup could not be made. Please try again.'); }
    finally { setP1(''); setP2(''); setBusy(false); }
  };

  const pick = async (f: File | undefined) => {
    setResErr(null); setPreview(null); setResMsg(null);
    if (!f) return;
    if (f.size > BACKUP_MAX_BYTES) { setResErr('This file is larger than 20 MB, so it is not a Sakhi backup.'); return; }
    setFile({ name: f.name, text: await f.text(), size: f.size });
  };

  const open = async (e: React.FormEvent) => {
    e.preventDefault(); setResErr(null); setResMsg(null);
    if (!file) { setResErr('Choose your backup file first.'); return; }
    setBusy(true);
    try { setPreview(await openBackup(file.text, rp, file.size)); }
    catch (x) { setResErr(x instanceof SaveError ? x.message : GENERIC_FAIL); }
    finally { setRp(''); setBusy(false); }
  };

  const finish = (msg: string) => { setResMsg(msg); announce(msg); setPreview(null); setFile(null); };
  const replace = async () => {
    setConfirmReplace(false); setBusy(true);
    try { await restoreReplace(preview!.payload); finish('Restore finished. Everything on this device now matches your backup.'); }
    catch (x) { setResErr(x instanceof SaveError ? x.message : 'The restore did not finish. Your existing data is as it was.'); }
    finally { setTyped(''); setBusy(false); }
  };
  const addMissing = async () => {
    setBusy(true);
    try { const r = await restoreAddMissing(preview!.payload); finish(`Restore finished. ${r.added} ${r.added === 1 ? 'record was' : 'records were'} added and ${r.skipped} already here ${r.skipped === 1 ? 'was' : 'were'} kept as they are.`); }
    catch (x) { setResErr(x instanceof SaveError ? x.message : 'The restore did not finish. Your existing data is as it was.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Backup and restore" intro="If you lose this phone or clear your browser, a backup file you saved is the only way to get your journal back." />
      <p className="status"><KeyRound size={16} aria-hidden="true" /> <LastBackup /></p>

      <form onSubmit={doExport} className="card section" aria-labelledby="exp-h">
        <h2 id="exp-h" style={{ fontSize: 20 }}><Download size={20} aria-hidden="true" /> Save an encrypted backup</h2>
        <p>The file is locked with a passphrase you choose. You can email it to yourself, keep it in a cloud drive or on a USB stick. Sakhi never sees where it goes.</p>
        <div className="banner banner-sample"><p style={{ margin: 0 }}>If you forget this passphrase, nobody, including us, can open the file.</p></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="bk-p1">Passphrase</label><input id="bk-p1" className="input" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} aria-describedby="bk-hint" />
            <span id="bk-hint" className="hint">At least 8 characters. A short sentence is easier to remember.</span></div>
          <div className="field"><label htmlFor="bk-p2">Passphrase again</label><input id="bk-p2" className="input" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></div>
        </div>
        <FieldError id="bk-err" msg={expErr} />
        {expMsg && <p role="status" className="status status-ready">{expMsg}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Working…' : 'Save an encrypted backup'}</button>
        <p className="caption" style={{ marginTop: 12 }}>Keep this file somewhere private. Anyone with the file and the passphrase can read it.</p>
      </form>

      <section className="card section" aria-labelledby="res-h">
        <h2 id="res-h" style={{ fontSize: 20 }}><Upload size={20} aria-hidden="true" /> Restore from a backup</h2>
        {!preview ? (
          <form onSubmit={open}>
            <div className="field">
              <span className="label">Backup file</span>
              <div className="row">
                <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>Choose file</button>
                <span className="caption">{file ? file.name : 'No file chosen'}</span>
              </div>
              <input ref={fileRef} type="file" accept=".sakhi,application/octet-stream,application/json" className="visually-hidden" tabIndex={-1} aria-hidden="true"
                onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <div className="field" style={{ maxWidth: 420 }}><label htmlFor="rs-p">Passphrase</label><input id="rs-p" className="input" type="password" autoComplete="off" value={rp} onChange={e => setRp(e.target.value)} /></div>
            <FieldError id="rs-err" msg={resErr} />
            {resMsg && <p role="status" className="status status-ready">{resMsg}</p>}
            <button type="submit" className="btn btn-secondary" disabled={busy || !file}>{busy ? 'Opening…' : 'Open backup'}</button>
          </form>
        ) : (
          <div className="stack">
            <p>This backup holds:</p>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li>{preview.counts.visits} visits and {preview.counts.advice} advice items</li>
              <li>{preview.counts.treatments} treatments and {preview.counts.providers} clinicians</li>
              <li>{preview.counts.entries} symptom entries</li>
              {preview.range && <li>From {fmtDate(preview.range.from, true)} to {fmtDate(preview.range.to, true)}</li>}
            </ul>
            <FieldError id="rs-err2" msg={resErr} />
            <div className="row">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={addMissing}>Add records that are missing</button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { setTyped(''); setConfirmReplace(true); }}>Replace everything on this device</button>
              <button type="button" className="btn-link" onClick={() => { setPreview(null); setFile(null); }}>Cancel</button>
            </div>
            <p className="caption">"Add records that are missing" never changes anything already on this device.</p>
          </div>
        )}
      </section>
      <p><Link to="/settings">Back to Settings and privacy</Link></p>

      <ConfirmDialog open={confirmReplace} title="Replace everything on this device?" danger confirmLabel="Replace everything" confirmDisabled={typed.trim().toUpperCase() !== 'REPLACE'}
        body={<><p>All visits, advice, treatments, clinicians and entries on this device will be replaced by the ones in the backup.</p>
          <div className="field"><label htmlFor="rp-type">Type REPLACE to confirm</label><input id="rp-type" className="input" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} data-autofocus /></div></>}
        onCancel={() => setConfirmReplace(false)} onConfirm={replace} />
    </>
  );
}
