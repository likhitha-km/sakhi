import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, CircleCheck, Pencil, Pill, Plus, Trash2, Undo2 } from 'lucide-react';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import {
  addAdvice, addConcern, deleteAdvice, deleteConcern, deleteVisit, saveNextVisit, setAdviceStatus, setConcernAddressed,
  undoAdvice, updateAdvice, updateConcern, updateVisit, type StatusExtras,
} from '../../db/visits.ts';
import { findOrCreateProvider, SaveError, uid } from '../../db/repo.ts';
import { addDays, fmtDate, todayLocal } from '../../engine/dates.ts';
import { SYSTEM_LABEL } from '../../brief/careViews.ts';
import { providerShort, reasonText, REASON_LABEL } from '../../visits/basics.ts';
import type { AdviceItem, AdviceKind, AdviceStatus, Concern, Provider, SkipReason, Visit } from '../../types/care.ts';
import { CloseButton, ConfirmDialog, FieldError, Overlay, PageHeader } from '../components/common.tsx';
import { ADVICE_KIND_LABEL, ADVICE_STATUS_LABEL, AdviceStatusControl, OverdueTag, ProviderPicker, SystemsPicker, type NewProvider } from '../components/visitBits.tsx';
import { CalendarButton } from '../components/CalendarButton.tsx';
import { AdviceForm, ConcernForm } from './VisitNew.tsx';

const UNDO_MS = 8000;

/** Shown once after saving: what happens to what she recorded, and the next step. */
function AfterSave({ providerId, name, adviceCount, concernCount }: { providerId: string; name: string; adviceCount: number; concernCount: number }) {
  const { nextVisits } = useAppData();
  const { announce } = useSession();
  const today = todayLocal();
  const next = [...nextVisits].filter(n => n.providerId === providerId && n.on >= today).sort((a, b) => a.on.localeCompare(b.on))[0];
  const [on, setOn] = useState(addDays(today, 14));
  const [err, setErr] = useState<string | null>(null);
  const plan = async () => {
    setErr(null);
    if (!on || on < today) { setErr('Choose today or a later day.'); return; }
    try { await saveNextVisit({ id: uid(), providerId, on }); announce(`Next visit with ${name} planned.`); }
    catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save.'); }
  };
  return (
    <section className="card section after-save" aria-labelledby="as-h" role="status">
      <h2 id="as-h" style={{ fontSize: 20 }}><CircleCheck size={20} aria-hidden="true" /> Visit saved</h2>
      <ul className="after-save-list">
        <li>{adviceCount ? `${adviceCount} advice ${adviceCount === 1 ? 'item is' : 'items are'} below as a checklist. Mark each one as you go.` : 'No advice was added. You can add it below at any time.'}</li>
        {concernCount > 0 && <li>{concernCount} unanswered {concernCount === 1 ? 'question stays' : 'questions stay'} on your next card until you mark {concernCount === 1 ? 'it' : 'them'} answered.</li>}
        <li>{next ? <>Your next visit with {name} is on {fmtDate(next.on, true)}. <Link to={`/card/${next.id}`}>Prepare the card</Link></> : `Plan your next visit with ${name} so Sakhi can prepare a card for it.`}</li>
      </ul>
      {!next && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="as-on">Next visit with {name}</label><input id="as-on" className="input" type="date" min={today} value={on} onChange={e => setOn(e.target.value)} /></div>
          <button type="button" className="btn btn-primary" onClick={plan}>Plan this visit</button>
          <Link to="/home" className="btn-link">Not now</Link>
        </div>
      )}
      <FieldError id="as-err" msg={err} />
    </section>
  );
}

function VisitEditor({ v, providers, onDone }: { v: Visit; providers: Provider[]; onDone: (msg?: string) => void }) {
  const [pid, setPid] = useState(v.providerId);
  const [fresh, setFresh] = useState<NewProvider>({ name: '', facilityName: '', facilityKind: 'other', role: 'other' });
  const [on, setOn] = useState(v.on);
  const [systems, setSystems] = useState(v.systems);
  const [note, setNote] = useState(v.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try {
      const providerId = pid === 'new' ? await findOrCreateProvider(fresh) : pid;
      if (!providerId) { setErr('Choose who you saw, or describe them.'); return; }
      const next: Visit = { ...v, providerId, on, systems };
      if (note.trim()) next.note = note.trim(); else delete next.note;
      await updateVisit(next);
      onDone('Visit details saved. Your card and report now use them.');
    } catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save.'); }
  };
  return (
    <section className="card section" aria-labelledby="ev-h">
      <h2 id="ev-h" style={{ fontSize: 20 }}>Correct the visit details</h2>
      <ProviderPicker providers={providers} value={pid} onChange={setPid} fresh={fresh} onFresh={setFresh} />
      <div className="field" style={{ maxWidth: 260 }}><label htmlFor="ev-on">Date of the visit</label><input id="ev-on" className="input" type="date" max={todayLocal()} value={on} onChange={e => setOn(e.target.value)} /></div>
      <SystemsPicker legend="Type of care" value={systems} onChange={setSystems} />
      <div className="field"><label htmlFor="ev-note">What was said</label><textarea id="ev-note" className="textarea" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
      {pid !== v.providerId && <p className="caption">Treatments added from this visit will move to the clinician you choose.</p>}
      <FieldError id="ev-err" msg={err} />
      <div className="row"><button type="button" className="btn btn-primary" onClick={save}>Save details</button><button type="button" className="btn btn-quiet" onClick={() => onDone()}>Cancel</button></div>
    </section>
  );
}

function SkipSheet({ item, onSave, onClose }: { item: AdviceItem; onSave: (x: StatusExtras) => void; onClose: () => void }) {
  const [reason, setReason] = useState<SkipReason | ''>(item.reason ?? '');
  const [text, setText] = useState(item.reasonText ?? '');
  return (
    <Overlay open onClose={onClose} label="Why was it not done?" variant="dialog">
      <div className="row-between"><h2 style={{ margin: 0 }}>Not done</h2><CloseButton onClick={onClose} /></div>
      <p className="muted">{item.text}</p>
      <fieldset>
        <legend>What got in the way? <span className="caption">(optional)</span></legend>
        <div className="stack" style={{ gap: 6 }}>
          {(Object.keys(REASON_LABEL) as SkipReason[]).map(r => (
            <label key={r} className="check"><input type="radio" name="skip-reason" checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABEL[r][0].toUpperCase() + REASON_LABEL[r].slice(1)}</label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="skip-text">In your words <span className="caption">(optional, up to 100 characters)</span></label>
        <input id="skip-text" className="input" maxLength={100} value={text} onChange={e => setText(e.target.value)} />
      </div>
      <p className="caption">This goes on your next card as your reason, so the doctor knows. It is not judged.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => onSave({ ...(reason ? { reason } : {}), ...(text.trim() ? { reasonText: text } : {}) })}>Save</button>
      </div>
    </Overlay>
  );
}

function DoneSheet({ item, onSave, onClose }: { item: AdviceItem; onSave: (x: StatusExtras) => void; onClose: () => void }) {
  const [on, setOn] = useState(item.doneOn ?? todayLocal());
  const [note, setNote] = useState(item.resultNote ?? '');
  return (
    <Overlay open onClose={onClose} label="Test done" variant="dialog">
      <div className="row-between"><h2 style={{ margin: 0 }}>Test done</h2><CloseButton onClick={onClose} /></div>
      <p className="muted">{item.text}</p>
      <div className="field" style={{ maxWidth: 240 }}><label htmlFor="done-on">Done on</label><input id="done-on" className="input" type="date" max={todayLocal()} value={on} onChange={e => setOn(e.target.value)} /></div>
      <div className="field"><label htmlFor="done-note">My note about the result <span className="caption">(optional, up to 200 characters)</span></label>
        <input id="done-note" className="input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} aria-describedby="done-hint" />
        <span id="done-hint" className="hint">In your words. It is shown as your note, not a clinician's reading.</span></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => onSave({ doneOn: on || todayLocal(), resultNote: note })}>Save</button>
      </div>
    </Overlay>
  );
}

function AdviceEditor({ item, onDone }: { item: AdviceItem; onDone: () => void }) {
  const [kind, setKind] = useState<AdviceKind>(item.kind);
  const [text, setText] = useState(item.text);
  const [due, setDue] = useState(item.dueOn ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      const next: AdviceItem = { ...item, kind, text: text.trim() };
      if (due) next.dueOn = due; else delete next.dueOn;
      await updateAdvice(next); onDone();
    } catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save.'); }
  };
  return (
    <div className="card-quiet stack" style={{ marginTop: 6 }}>
      <div className="grid-2">
        <div className="field"><label htmlFor={'ek-' + item.id}>Kind</label>
          <select id={'ek-' + item.id} className="select" value={kind} onChange={e => setKind(e.target.value as AdviceKind)}>{Object.entries(ADVICE_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor={'ed-' + item.id}>By when</label><input id={'ed-' + item.id} className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor={'et-' + item.id}>What you were told</label><input id={'et-' + item.id} className="input" maxLength={240} value={text} onChange={e => setText(e.target.value)} /></div>
      <FieldError id={'ee-' + item.id} msg={err} />
      <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button><button type="button" className="btn btn-quiet btn-sm" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

export function VisitDetail() {
  const { id } = useParams();
  const { visits, advice, concerns, care, providers, nextVisits, loading } = useAppData();
  const { announce } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState<{ kind: 'skip' | 'done'; item: AdviceItem } | null>(null);
  const [undo, setUndo] = useState<{ prev: AdviceItem; label: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editConcern, setEditConcern] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<'advice' | 'concern' | null>(null);
  const [editVisit, setEditVisit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (loading) return <p role="status">Loading…</p>;
  const v = visits.find(x => x.id === id);
  if (!v) return <><PageHeader title="Visit not found" /><p>This visit is not on this device. <Link to="/journal/visits">See all visits</Link></p></>;
  const p = providers.find(x => x.id === v.providerId);
  const items = advice.filter(a => a.visitId === v.id);
  const cons = concerns.filter(c => c.visitId === v.id);
  const treatments = care.filter(c => c.kind === 'treatment' && (c.visitId === v.id || items.some(a => a.treatmentId === c.id)));
  const today = todayLocal();
  const followUps = items.filter(a => a.kind === 'follow_up' && a.dueOn && a.dueOn >= today && a.status !== 'done' && !nextVisits.some(n => n.providerId === v.providerId && n.on >= today));

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null);
    try { await fn(); announce(msg); return true; } catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save. Please try again.'); return false; }
  };

  const change = async (a: AdviceItem, s: AdviceStatus, extras: StatusExtras = {}) => {
    setErr(null);
    try {
      const prev = await setAdviceStatus(a.id, s, extras);
      if (!prev) return;
      if (timer.current) clearTimeout(timer.current);
      setUndo({ prev, label: `Marked "${a.text}" as ${ADVICE_STATUS_LABEL[s].toLowerCase()}.` });
      announce(`Marked as ${ADVICE_STATUS_LABEL[s].toLowerCase()}. Undo is available for 8 seconds.`);
      timer.current = setTimeout(() => setUndo(null), UNDO_MS);
    } catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save. Please try again.'); }
  };
  const pick = (a: AdviceItem, s: AdviceStatus) => {
    if (s === 'skipped') setSheet({ kind: 'skip', item: a });
    else if (s === 'done' && a.kind === 'test') setSheet({ kind: 'done', item: a });
    else void change(a, s);
  };

  return (
    <>
      {(loc.state as { saved?: boolean } | null)?.saved && <AfterSave providerId={v.providerId} name={providerShort(p)} adviceCount={items.length} concernCount={cons.filter(c => !c.addressed).length} />}
      <PageHeader title={`Visit to ${providerShort(p)}`} intro={`${fmtDate(v.on, true)} · ${v.systems.map(s => SYSTEM_LABEL[s]).join(', ')}${p?.facilityName && p.name ? ` · ${p.facilityName}` : ''}`} />
      {err && <p className="error" role="alert">{err}</p>}
      {!editVisit ? <button type="button" className="btn btn-quiet btn-sm section" onClick={() => setEditVisit(true)}><Pencil size={14} aria-hidden="true" /> Correct the clinician, date or note</button>
        : <VisitEditor v={v} providers={providers} onDone={msg => { setEditVisit(false); if (msg) announce(msg); }} />}

      {followUps.map(a => (
        <div key={a.id} className="banner banner-info">
          <CalendarPlus size={20} aria-hidden="true" />
          <div className="row" style={{ flex: 1, justifyContent: 'space-between' }}>
            <p style={{ margin: 0 }}>You were told: {a.text}.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void act(() => saveNextVisit({ id: uid(), providerId: v.providerId, on: a.dueOn! }), 'Next visit set.')}>
              Set next visit for {fmtDate(a.dueOn!)} with {providerShort(p)}
            </button>
          </div>
        </div>
      ))}

      {v.note && <section className="card section"><h2 style={{ fontSize: 20 }}>What was said</h2><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{v.note}</p></section>}

      <section className="card section" aria-labelledby="adv-h">
        <div className="row-between"><h2 id="adv-h" style={{ fontSize: 20, margin: 0 }}>Advice ({items.length})</h2>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(adding === 'advice' ? null : 'advice')}><Plus size={16} aria-hidden="true" /> Add advice</button></div>
        {adding === 'advice' && <AdviceForm systems={v.systems} onAdd={a => void act(() => addAdvice({ ...a, visitId: v.id }), 'Advice added.').then(ok => ok && setAdding(null))} />}
        {!items.length && adding !== 'advice' && <p className="muted">No advice recorded for this visit yet.</p>}
        {items.map(a => (
          <div key={a.id} className="line-item">
            <div className="row-between"><span className="caption">{ADVICE_KIND_LABEL[a.kind]}{a.systems.length ? ` · ${a.systems.map(s => SYSTEM_LABEL[s]).join(', ')}` : ''}{a.origin === 'clinician_reply' ? ' · from a reply link' : a.origin === 'ai_confirmed' ? ' · drafted with AI, confirmed by you' : ''}</span><OverdueTag item={a} /></div>
            <p style={{ margin: '2px 0 6px', fontWeight: 600 }}>{a.text}</p>
            {a.quote && <p className="caption" style={{ margin: '0 0 6px' }}>From your words: “{a.quote}”</p>}
            {a.status === 'skipped' && <p className="caption" style={{ margin: '0 0 6px' }}>My reason: {reasonText(a)}</p>}
            {a.status === 'done' && a.doneOn && <p className="caption" style={{ margin: '0 0 6px' }}>Done on {fmtDate(a.doneOn, true)}{a.resultNote ? `. My note: ${a.resultNote}` : ''}</p>}
            <AdviceStatusControl item={a} onChange={s => pick(a, s)} />
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              <button type="button" className="btn-link" onClick={() => setEditing(editing === a.id ? null : a.id)}><Pencil size={14} aria-hidden="true" /> Edit</button>
              {a.status === 'skipped' && <button type="button" className="btn-link" onClick={() => setSheet({ kind: 'skip', item: a })}>Change reason</button>}
              {(a.dueOn && a.status !== 'done' && a.status !== 'skipped' && a.kind !== 'medicine') && <CalendarButton items={[{ kind: 'advice', item: a, provider: p }]} small />}
              <button type="button" className="btn-link" onClick={() => void act(() => deleteAdvice(a.id), 'Advice removed.')}><Trash2 size={14} aria-hidden="true" /> Remove</button>
            </div>
            {editing === a.id && <AdviceEditor item={a} onDone={() => setEditing(null)} />}
          </div>
        ))}
      </section>

      <section className="card section" aria-labelledby="con-h">
        <div className="row-between"><h2 id="con-h" style={{ fontSize: 20, margin: 0 }}>Things you asked about</h2>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(adding === 'concern' ? null : 'concern')}><Plus size={16} aria-hidden="true" /> Add</button></div>
        {adding === 'concern' && <ConcernForm onAdd={c => void act(() => addConcern({ ...c, visitId: v.id }), 'Concern added.').then(ok => ok && setAdding(null))} />}
        {!cons.length && adding !== 'concern' && <p className="muted">No concerns recorded for this visit.</p>}
        {cons.map((c: Concern) => (
          <div key={c.id} className="line-item">
            <div className="row-between">
              <div style={{ flex: 1, minWidth: 200 }}><span className={`tag${c.addressed ? '' : ' tag-pink'}`}>{c.addressed ? 'Addressed' : 'Not addressed'}</span>
                {editConcern?.id === c.id
                  ? <div className="row" style={{ marginTop: 4 }}><input className="input" aria-label="Concern text" maxLength={240} value={editConcern.text} onChange={e => setEditConcern({ id: c.id, text: e.target.value })} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void act(() => updateConcern({ ...c, text: editConcern.text.trim() }), 'Saved.').then(ok => ok && setEditConcern(null))}>Save</button></div>
                  : <p style={{ margin: '4px 0 0' }}>{c.text}</p>}
                {c.origin === 'ai_confirmed' && <p className="caption" style={{ margin: 0 }}>Drafted with AI, confirmed by you</p>}
                {c.quote && <p className="caption" style={{ margin: 0 }}>From your words: “{c.quote}”</p>}</div>
              <label className="switch"><input type="checkbox" checked={c.addressed} onChange={e => void act(() => setConcernAddressed(c.id, e.target.checked), e.target.checked ? 'Marked as addressed.' : 'Marked as not addressed.')} /> Addressed</label>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button type="button" className="btn-link" onClick={() => setEditConcern(editConcern?.id === c.id ? null : { id: c.id, text: c.text })}><Pencil size={14} aria-hidden="true" /> Edit</button>
              <button type="button" className="btn-link" onClick={() => void act(() => deleteConcern(c.id), 'Concern removed.')}><Trash2 size={14} aria-hidden="true" /> Remove</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card section" aria-labelledby="tr-h">
        <h2 id="tr-h" style={{ fontSize: 20 }}><Pill size={20} aria-hidden="true" /> Treatments from this visit</h2>
        {treatments.length ? <ul style={{ paddingLeft: 20, margin: 0 }}>{treatments.map(t => <li key={t.id}>{t.title} · since {fmtDate(t.date, true)}{t.endDate ? `, stopped ${fmtDate(t.endDate, true)}` : ''}</li>)}</ul>
          : <p className="muted" style={{ margin: 0 }}>None added to what you take.</p>}
        <p style={{ marginTop: 8 }}><Link to="/journal/take">See everything I take</Link> · <Link to="/disclosure">Who I have told</Link></p>
      </section>

      <button type="button" className="btn btn-quiet" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" /> Delete this visit</button>

      {sheet?.kind === 'skip' && <SkipSheet item={sheet.item} onClose={() => setSheet(null)} onSave={x => { const a = sheet.item; setSheet(null); void change(a, 'skipped', x); }} />}
      {sheet?.kind === 'done' && <DoneSheet item={sheet.item} onClose={() => setSheet(null)} onSave={x => { const a = sheet.item; setSheet(null); void change(a, 'done', x); }} />}
      {undo && (
        <div className="toast" role="status">
          <span>{undo.label}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { const u = undo; setUndo(null); if (timer.current) clearTimeout(timer.current); await act(() => undoAdvice(u.prev), 'Change undone.'); }}><Undo2 size={16} aria-hidden="true" /> Undo</button>
        </div>
      )}
      <ConfirmDialog open={confirm} title="Delete this visit?" danger confirmLabel="Delete visit"
        body={<p>The visit, its advice and its concerns are removed. Treatments it added stay in what you take.</p>}
        onCancel={() => setConfirm(false)} onConfirm={async () => { setConfirm(false); await act(() => deleteVisit(v.id), 'Visit deleted.'); nav('/journal/visits'); }} />
    </>
  );
}
