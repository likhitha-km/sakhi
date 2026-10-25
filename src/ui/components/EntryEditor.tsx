import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Entry } from '../../types/entry.ts';
import { BLEEDING_FEATURES, BLEEDING_LABEL, IMPACT_CODES, IMPACT_LABEL } from '../../engine/vocab.ts';
import { todayLocal } from '../../engine/dates.ts';
import { deleteEntry, SaveError, updateEntry } from '../../db/repo.ts';
import { CloseButton, FieldError, Overlay } from './common.tsx';
import { entryTitle } from './entryText.ts';
import { useSession } from '../hooks/session.tsx';

export function EntryEditor({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [e, setE] = useState<Entry | null>(entry);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { announce } = useSession();
  useEffect(() => { setE(entry); setErr(null); setConfirmDelete(false); }, [entry]);
  if (!entry || !e) return null;

  const save = async () => {
    try { await updateEntry(e); announce('Changes saved. Your summaries have been updated.'); onClose(); }
    catch (x) { setErr(x instanceof SaveError ? x.message : 'That did not save. Please try again.'); }
  };
  const remove = async () => {
    try { await deleteEntry(e.id); announce('Entry deleted.'); onClose(); }
    catch (x) { setErr(x instanceof SaveError ? x.message : 'That did not delete. Please try again.'); }
  };

  return (
    <Overlay open onClose={onClose} label="Edit entry">
      <div className="row-between"><h2 style={{ margin: 0 }}>Edit entry</h2><CloseButton onClick={onClose} /></div>
      <p className="muted">{entryTitle(entry)}</p>
      <div className="field">
        <label htmlFor="ed-date">Day</label>
        <input id="ed-date" className="input" type="date" max={todayLocal()} value={e.occurredOn} onChange={x => setE({ ...e, occurredOn: x.target.value })} />
      </div>
      {e.kind === 'symptom' && (
        <div className="field">
          <label htmlFor="ed-sev">Score from 0 to 10</label>
          <input id="ed-sev" className="input" type="number" min={0} max={10} inputMode="numeric" value={e.severity ?? ''}
            onChange={x => setE({ ...e, severity: x.target.value === '' ? undefined : Math.round(+x.target.value) })} />
        </div>
      )}
      {e.kind === 'bleeding' && e.bleeding && (
        <fieldset>
          <legend>Bleeding</legend>
          <div className="check-list">
            {BLEEDING_FEATURES.map(f => (
              <label key={f} className="check"><input type="checkbox" checked={e.bleeding![f]} onChange={x => setE({ ...e, bleeding: { ...e.bleeding!, [f]: x.target.checked } })} /> {BLEEDING_LABEL[f]}</label>
            ))}
          </div>
        </fieldset>
      )}
      {e.kind !== 'checkin' && e.kind !== 'period_start' && (
        <fieldset>
          <legend>Effect on your day</legend>
          <div className="check-list">
            {IMPACT_CODES.map(c => (
              <label key={c} className="check"><input type="checkbox" checked={e.impact.includes(c)} onChange={x => setE({ ...e, impact: x.target.checked ? [...e.impact, c] : e.impact.filter(i => i !== c) })} /> {IMPACT_LABEL[c]}</label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="field">
        <label htmlFor="ed-note">Note</label>
        <textarea id="ed-note" className="textarea" maxLength={500} value={e.note ?? ''} onChange={x => setE({ ...e, note: x.target.value || undefined })} />
      </div>
      <FieldError id="ed-err" msg={err} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {!confirmDelete
          ? <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" /> Delete</button>
          : <span className="row"><span>Delete this entry for good?</span><button type="button" className="btn btn-danger btn-sm" onClick={remove}>Yes, delete</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(false)}>No</button></span>}
        <button type="button" className="btn btn-primary" onClick={save}>Save changes</button>
      </div>
    </Overlay>
  );
}
