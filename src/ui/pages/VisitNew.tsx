import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { findOrCreateProvider, SaveError, uid } from '../../db/repo.ts';
import { saveVisit } from '../../db/visits.ts';
import { addDays, fmtDate, todayLocal } from '../../engine/dates.ts';
import type { AdviceItem, AdviceKind, AdviceStatus, Concern, SystemOfMedicine } from '../../types/care.ts';
import { SYSTEM_LABEL } from '../../brief/careViews.ts';
import { AI_ENABLED, helperAvailable, readVisitNote } from '../../ai/client.ts';
import { resolveVisitWhen, VISIT_NOTE_MAX, type AdviceDraft, type ConcernDraft } from '../../ai/visit.ts';
import { FieldError } from '../components/common.tsx';
import { splitNote } from '../../visits/noteSplit.ts';
import { ADVICE_KIND_LABEL, ADVICE_STATUS_LABEL, ProviderPicker, SystemsPicker, type NewProvider } from '../components/visitBits.tsx';

type DAdvice = Omit<AdviceItem, 'visitId'>;
type DConcern = Omit<Concern, 'visitId'>;
interface Draft {
  providerId: string; fresh: NewProvider; on: string; systems: SystemOfMedicine[]; note: string;
  advice: DAdvice[]; concerns: DConcern[]; addToTreatments: string[];
  pendingAdvice?: PendingAdvice; pendingConcern?: PendingConcern;
}
const KEY = 'sakhi.visitDraft';
const blank = (): Draft => ({ providerId: '', fresh: { name: '', facilityName: '', facilityKind: 'other', role: 'other' }, on: todayLocal(), systems: [], note: '', advice: [], concerns: [], addToTreatments: [] });
const load = (): Draft => { try { const s = sessionStorage.getItem(KEY); return s ? { ...blank(), ...JSON.parse(s) } : blank(); } catch { return blank(); } };
const CONSENT_KEY = 'sakhi.aiConsent';

function Highlight({ note, quote }: { note: string; quote: string }) {
  const i = note.toLowerCase().indexOf(quote.toLowerCase());
  if (i < 0) return <span>“{quote}”</span>;
  return <span>“{note.slice(Math.max(0, i - 25), i)}<mark>{note.slice(i, i + quote.length)}</mark>{note.slice(i + quote.length, i + quote.length + 25)}”</span>;
}

export interface PendingAdvice { kind: AdviceKind; text: string; due: string; status: AdviceStatus }
export interface PendingConcern { text: string; addressed: boolean }
export const EMPTY_ADVICE: PendingAdvice = { kind: 'other', text: '', due: '', status: 'not_started' };
export const EMPTY_CONCERN: PendingConcern = { text: '', addressed: false };
export const adviceFromPending = (p: PendingAdvice, systems: SystemOfMedicine[]): DAdvice =>
  ({ id: uid(), kind: p.kind, text: p.text.trim(), systems, ...(p.due ? { dueOn: p.due } : {}), status: p.status, origin: 'manual' });

/** Advice form. Controlled when value and onChange are given, so nothing typed is lost between steps. */
export function AdviceForm({ systems, onAdd, value, onChange }: { systems: SystemOfMedicine[]; onAdd: (a: DAdvice) => void; value?: PendingAdvice; onChange?: (v: PendingAdvice) => void }) {
  const [own, setOwn] = useState<PendingAdvice>(EMPTY_ADVICE);
  const v = value ?? own;
  const set = (p: Partial<PendingAdvice>) => (onChange ?? setOwn)({ ...v, ...p });
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    if (!v.text.trim()) { setErr('Write what you were told.'); return; }
    onAdd(adviceFromPending(v, systems));
    (onChange ?? setOwn)(EMPTY_ADVICE); setErr(null);
  };
  return (
    <div className="card-quiet stack">
      <div className="field"><label htmlFor="af-text">What you were told to do, in your words</label>
        <input id="af-text" className="input" maxLength={240} value={v.text} onChange={e => set({ text: e.target.value })} placeholder="For example: blood test this week, iron tablet after lunch" aria-describedby="af-err" />
        <FieldError id="af-err" msg={err} /></div>
      <div className="grid-2">
        <div className="field"><label htmlFor="af-kind">What kind of advice</label>
          <select id="af-kind" className="select" value={v.kind} onChange={e => set({ kind: e.target.value as AdviceKind })}>{Object.entries(ADVICE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="af-due">By when <span className="caption">(optional)</span></label><input id="af-due" className="input" type="date" value={v.due} onChange={e => set({ due: e.target.value })} aria-describedby="af-due-hint" />
          <span id="af-due-hint" className="hint">With a date, Sakhi can tell you when it is due.</span></div>
      </div>
      <div className="field" style={{ maxWidth: 260 }}><label htmlFor="af-status">Have you done it yet?</label>
        <select id="af-status" className="select" value={v.status} onChange={e => set({ status: e.target.value as AdviceStatus })}>{Object.entries(ADVICE_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}><Plus size={16} aria-hidden="true" /> Add this advice</button>
    </div>
  );
}

export function ConcernForm({ onAdd, value, onChange }: { onAdd: (c: DConcern) => void; value?: PendingConcern; onChange?: (v: PendingConcern) => void }) {
  const [own, setOwn] = useState<PendingConcern>(EMPTY_CONCERN);
  const v = value ?? own;
  const set = (p: Partial<PendingConcern>) => (onChange ?? setOwn)({ ...v, ...p });
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card-quiet stack">
      <div className="field"><label htmlFor="cf-text">Something you asked about, or wanted to ask</label>
        <input id="cf-text" className="input" maxLength={240} value={v.text} onChange={e => set({ text: e.target.value })} placeholder="For example: pain in my stomach" aria-describedby="cfe" />
        <FieldError id="cfe" msg={err} /></div>
      <label className="check"><input type="checkbox" checked={v.addressed} onChange={e => set({ addressed: e.target.checked })} /> It was answered</label>
      <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
        if (!v.text.trim()) { setErr('Write the question or concern.'); return; }
        onAdd({ id: uid(), text: v.text.trim(), addressed: v.addressed, origin: 'manual' }); (onChange ?? setOwn)(EMPTY_CONCERN); setErr(null);
      }}><Plus size={16} aria-hidden="true" /> Add this question</button>
    </div>
  );
}

/** Each sentence of her note can become advice or a question, in her own words. No AI. */
function NoteItems({ note, taken, onAdvice, onConcern }: { note: string; taken: string[]; onAdvice: (text: string, kind: AdviceKind) => void; onConcern: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<Record<number, AdviceKind>>({});
  const parts = splitNote(note);
  if (parts.length < 1) return null;
  return (
    <section className="note-items" aria-labelledby="ni-h">
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} aria-expanded="false">Turn my note into items ({parts.length} {parts.length === 1 ? 'sentence' : 'sentences'})</button>
      ) : <>
        <h3 id="ni-h">Your note, sentence by sentence</h3>
        <p className="caption">For each sentence, choose whether it is something you were told to do, or a question that was not answered. Your words are kept as you wrote them. This happens on your device, without AI.</p>
        <ol className="ni-list">{parts.map((p, i) => {
          const used = taken.includes(p);
          return (
            <li key={i} className={used ? 'is-used' : undefined}>
              <span className="ni-text">{p}</span>
              {used ? <span className="status status-ready"><Check size={14} aria-hidden="true" /> Added</span> : (
                <span className="ni-actions">
                  <label className="visually-hidden" htmlFor={`ni-k-${i}`}>Kind of advice</label>
                  <select id={`ni-k-${i}`} className="select" value={kinds[i] ?? 'other'} onChange={e => setKinds({ ...kinds, [i]: e.target.value as AdviceKind })}>
                    {Object.entries(ADVICE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => onAdvice(p, kinds[i] ?? 'other')}>Add as advice</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => onConcern(p)}>Add as unanswered question</button>
                </span>
              )}
            </li>
          );
        })}</ol>
        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Hide</button>
      </>}
    </section>
  );
}

function AiReader({ note, visitOn, onAdvice, onConcern }: { note: string; visitOn: string; onAdvice: (a: DAdvice) => void; onConcern: (c: DConcern) => void }) {
  const { announce } = useSession();
  const [available, setAvailable] = useState(false);
  const [consent, setConsent] = useState(() => { try { return sessionStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [res, setRes] = useState<{ advice: (AdviceDraft & { state: string; dueOn?: string })[]; concerns: (ConcernDraft & { state: string })[]; dropped: number; urgent: boolean; note: string } | null>(null);
  useEffect(() => { let live = true; if (AI_ENABLED) void helperAvailable().then(ok => live && setAvailable(ok)); return () => { live = false; }; }, []);
  if (!AI_ENABLED || !available) return null;
  const setC = (v: boolean) => { setConsent(v); try { if (v) sessionStorage.setItem(CONSENT_KEY, 'yes'); else sessionStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ } };
  const read = async () => {
    if (!consent || !note.trim()) return;
    setBusy(true); setFailed(false); setRes(null);
    const r = await readVisitNote(note, todayLocal());
    setBusy(false);
    if (!r.ok || (!r.advice.length && !r.concerns.length)) { setFailed(true); announce('Could not read that. Please add the items yourself below.'); if (r.ok && r.urgentMention) setRes({ advice: [], concerns: [], dropped: r.dropped, urgent: true, note }); return; }
    setRes({ advice: r.advice.map(a => ({ ...a, state: 'open', dueOn: resolveVisitWhen(a.when, visitOn) })), concerns: r.concerns.map(c => ({ ...c, state: 'open' })), dropped: r.dropped, urgent: r.urgentMention, note });
    announce(`${r.advice.length + r.concerns.length} suggestions ready. Check each one.`);
  };
  return (
    <section className="card" style={{ background: 'var(--blue-100)', marginBottom: 16 }} aria-labelledby="air-h">
      <h3 id="air-h"><Sparkles size={18} aria-hidden="true" /> Read my note with AI</h3>
      <label className="switch">
        <input type="checkbox" checked={consent} onChange={e => setC(e.target.checked)} />
        <span>Use AI to read my note. <span className="caption">Only the note and today's date are sent to an online AI service. Nothing is saved until you press Save.</span></span>
      </label>
      {consent && <div style={{ marginTop: 8 }}><button type="button" className="btn btn-secondary btn-sm" disabled={busy || !note.trim()} onClick={read}>{busy ? 'Reading…' : 'Read my note'}</button>
        {!note.trim() && <span className="caption" style={{ marginLeft: 8 }}>Write your note above first.</span>}</div>}
      {failed && <p className="error" role="status">Could not read that. Please add the items yourself below.</p>}
      {res?.urgent && (
        <div className="banner banner-quiet" role="status"><TriangleAlert size={20} aria-hidden="true" />
          <div><p style={{ margin: 0 }}>Your note mentions something that may be urgent. If this is happening now, open the urgent check.</p>
            <Link to="/now" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Something urgent?</Link></div></div>
      )}
      {res && res.dropped > 0 && <p className="caption">{res.dropped} {res.dropped === 1 ? 'suggestion was' : 'suggestions were'} hidden because {res.dropped === 1 ? 'it' : 'they'} could not be matched to your words.</p>}
      {res?.advice.map((a, i) => (
        <div key={'a' + i} className={`suggestion ${a.state === 'open' ? '' : a.state}`}>
          <div className="row-between"><span className="caption">{ADVICE_KIND_LABEL[a.kind]}</span>{a.state !== 'open' && <span className="status">{a.state === 'accepted' ? <><Check size={16} aria-hidden="true" /> Added</> : 'Skipped'}</span>}</div>
          {a.state === 'open'
            ? <input className="input" aria-label="Advice text" value={a.text} onChange={e => setRes({ ...res, advice: res.advice.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
            : <strong>{a.text}</strong>}
          <p className="caption" style={{ margin: '4px 0' }}>From your words: <Highlight note={res.note} quote={a.quote} /></p>
          {a.dueOn && <p className="caption" style={{ margin: 0 }}>By {fmtDate(a.dueOn, true)}</p>}
          {a.state === 'open' && <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!a.text.trim()} onClick={() => {
              onAdvice({ id: uid(), kind: a.kind, text: a.text.trim(), systems: a.systems, ...(a.dueOn ? { dueOn: a.dueOn } : {}), status: 'not_started', quote: a.quote, origin: 'ai_confirmed' });
              setRes({ ...res, advice: res.advice.map((x, j) => j === i ? { ...x, state: 'accepted' } : x) });
            }}>Accept</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRes({ ...res, advice: res.advice.map((x, j) => j === i ? { ...x, state: 'skipped' } : x) })}>Skip</button>
          </div>}
        </div>
      ))}
      {res?.concerns.map((c, i) => (
        <div key={'c' + i} className={`suggestion ${c.state === 'open' ? '' : c.state}`}>
          <div className="row-between"><span className="caption">Not answered</span>{c.state !== 'open' && <span className="status">{c.state === 'accepted' ? <><Check size={16} aria-hidden="true" /> Added</> : 'Skipped'}</span>}</div>
          {c.state === 'open'
            ? <input className="input" aria-label="Concern text" value={c.text} onChange={e => setRes({ ...res, concerns: res.concerns.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
            : <strong>{c.text}</strong>}
          <p className="caption" style={{ margin: '4px 0' }}>From your words: <Highlight note={res.note} quote={c.quote} /></p>
          {c.state === 'open' && <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!c.text.trim()} onClick={() => {
              onConcern({ id: uid(), text: c.text.trim(), addressed: false, quote: c.quote, origin: 'ai_confirmed' });
              setRes({ ...res, concerns: res.concerns.map((x, j) => j === i ? { ...x, state: 'accepted' } : x) });
            }}>Accept</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRes({ ...res, concerns: res.concerns.map((x, j) => j === i ? { ...x, state: 'skipped' } : x) })}>Skip</button>
          </div>}
        </div>
      ))}
    </section>
  );
}

export function VisitNew() {
  const { providers, settings } = useAppData();
  const { announce } = useSession();
  const nav = useNavigate();
  const [d, setD] = useState<Draft>(load);
  // The step is kept with the draft, so a reload returns her to where she was.
  const [step, setStep] = useState<number>(() => { try { return Number(sessionStorage.getItem(KEY + '.step')) || 1; } catch { return 1; } });
  useEffect(() => { try { sessionStorage.setItem(KEY + '.step', String(step)); } catch { /* ignore */ } }, [step]);
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } }, [d]);
  useEffect(() => { head.current?.focus(); }, [step]);
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }));
  // Anything typed but not yet added is carried into the lists, so it is never lost.
  const flush = () => {
    const pa = d.pendingAdvice, pc = d.pendingConcern;
    const added: string[] = [];
    let next = d;
    if (pa?.text.trim()) { const a = adviceFromPending(pa, []); next = { ...next, advice: [...next.advice, a], addToTreatments: a.kind === 'medicine' ? [...next.addToTreatments, a.id] : next.addToTreatments }; added.push(`"${a.text}"`); }
    if (pc?.text.trim()) { next = { ...next, concerns: [...next.concerns, { id: uid(), text: pc.text.trim(), addressed: pc.addressed, origin: 'manual' }] }; added.push(`"${pc.text.trim()}"`); }
    if (added.length) { next = { ...next, pendingAdvice: EMPTY_ADVICE, pendingConcern: EMPTY_CONCERN }; setD(next); announce(`Added ${added.join(' and ')} so it is not lost.`); }
    return next;
  };
  const goStep = (n: number) => { if (step === 2) flush(); setStep(n); };

  const check1 = () => {
    const e: Record<string, string | null> = {
      who: d.providerId ? null : 'Choose who you saw, or "Someone new".',
      on: !d.on || d.on > todayLocal() ? 'Choose today or an earlier day.' : d.on < addDays(todayLocal(), -3650) ? 'Visits can go back up to 10 years.' : null,
      systems: d.systems.length ? null : 'Choose at least one type of care.',
    };
    setErrs(e);
    const first = Object.values(e).find(Boolean);
    if (first) announce(first);
    return !first;
  };

  const save = async () => {
    const d = flush();
    if (!check1()) { setStep(1); return; }
    if (!d.advice.length && !d.concerns.length && !d.note.trim()) { setSaveErr('Add a note, some advice or a concern before saving.'); return; }
    setSaving(true); setSaveErr(null);
    try {
      const providerId = d.providerId === 'new'
        ? await findOrCreateProvider({ name: d.fresh.name, facilityName: d.fresh.facilityName, facilityKind: d.fresh.facilityKind, role: d.fresh.role })
        : d.providerId;
      if (!providerId) throw new SaveError('Give a name, a place, a kind of place or a role for the person you saw.');
      const id = uid();
      const anyAi = d.advice.some(a => a.origin === 'ai_confirmed') || d.concerns.some(c => c.origin === 'ai_confirmed');
      await saveVisit({
        visit: { id, providerId, on: d.on, systems: d.systems, ...(d.note.trim() ? { note: d.note.trim() } : {}), origin: anyAi ? 'ai_confirmed' : 'manual' },
        advice: d.advice.map(a => ({ ...a, visitId: id, systems: a.systems.length ? a.systems : d.systems })),
        concerns: d.concerns.map(c => ({ ...c, visitId: id })),
        addToTreatments: new Set(d.addToTreatments), sample: !!settings?.syntheticLoaded,
      });
      try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(KEY + '.step'); } catch { /* ignore */ }
      announce('Visit saved.');
      nav(`/visit/${id}`, { state: { saved: true } });
    } catch (e) {
      setSaveErr(e instanceof SaveError ? e.message : 'Sakhi could not save this visit. Please try again.');
    } finally { setSaving(false); }
  };

  const addAdvice = (a: DAdvice) => set({ advice: [...d.advice, a], addToTreatments: a.kind === 'medicine' ? [...d.addToTreatments, a.id] : d.addToTreatments });
  const names = ['Who and when', 'What was said', 'Check and save'];
  const prov = providers.find(p => p.id === d.providerId);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 ref={head} tabIndex={-1}>After the visit</h1>
      <p className="caption" style={{ marginBottom: 4 }}>Step {step} of 3: {names[step - 1]}</p>
      <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-valuetext={`Step ${step} of 3`}><div style={{ width: `${(step / 3) * 100}%` }} /></div>
      <nav className="steps" aria-label="Steps">
        {names.map((n, i) => <button key={n} type="button" aria-current={step === i + 1 ? 'step' : undefined} onClick={() => { if (i + 1 < step || check1()) goStep(i + 1); }}>{i + 1}. {n}</button>)}
      </nav>

      {step === 1 && <>
        <p className="muted" style={{ maxWidth: 680 }}>Write down what happened while you still remember it. Sakhi turns it into a checklist of advice and a list of open questions, and uses them for your next card. You can change anything later.</p>
        <ProviderPicker providers={providers} value={d.providerId} onChange={v => set({ providerId: v })} fresh={d.fresh} onFresh={f => set({ fresh: f })} error={errs.who} />
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="v-on">Date of the visit</label>
          <input id="v-on" className="input" type="date" max={todayLocal()} value={d.on} onChange={e => set({ on: e.target.value })} aria-describedby="v-on-err" />
          <FieldError id="v-on-err" msg={errs.on} />
        </div>
        <SystemsPicker legend="Type of care (choose all that apply)" value={d.systems} onChange={v => set({ systems: v })} error={errs.systems} />
      </>}

      {step === 2 && <>
        <div className="field">
          <label htmlFor="v-note">What was said</label>
          <textarea id="v-note" className="textarea" style={{ minHeight: 140 }} maxLength={VISIT_NOTE_MAX} value={d.note} onChange={e => set({ note: e.target.value })} aria-describedby="v-note-hint v-note-warn" />
          <span id="v-note-hint" className="hint">Write or dictate what you remember, in any language. Your keyboard's microphone works. {d.note.length} of {VISIT_NOTE_MAX} characters.</span>
          <span id="v-note-warn" className="hint"><TriangleAlert size={13} aria-hidden="true" /> Notes are not checked for emergencies. If something is happening now, use <Link to="/now">Something urgent?</Link></span>
        </div>
        <NoteItems note={d.note} taken={[...d.advice.map(a => a.text), ...d.concerns.map(c => c.text)]}
          onAdvice={(text, kind) => { addAdvice({ id: uid(), kind, text, systems: [], status: 'not_started', quote: text, origin: 'manual' }); announce(`Added as advice: ${text}`); }}
          onConcern={text => { set({ concerns: [...d.concerns, { id: uid(), text, addressed: false, quote: text, origin: 'manual' }] }); announce(`Added as an unanswered question: ${text}`); }} />
        <AiReader note={d.note} visitOn={d.on} onAdvice={addAdvice} onConcern={c => set({ concerns: [...d.concerns, c] })} />
        <h2 style={{ fontSize: 20 }}>What you were told to do</h2>
        <p className="caption">Add each thing separately: a test, a medicine or remedy, when to come back, a change to food or activity. Each becomes a checklist item you can tick off, and anything not done yet goes on your next card.</p>
        {d.advice.length > 0 && <ul className="added-list" aria-label="Advice added">{d.advice.map(a => (
          <li key={a.id}><span><span className="caption">{ADVICE_KIND_LABEL[a.kind]}</span> {a.text}{a.dueOn ? <span className="caption">, by {fmtDate(a.dueOn)}</span> : null}</span>
            <button type="button" className="btn-link" aria-label={`Remove ${a.text}`} onClick={() => set({ advice: d.advice.filter(x => x.id !== a.id) })}><Trash2 size={14} aria-hidden="true" /> Remove</button></li>))}</ul>}
        <AdviceForm systems={[]} onAdd={addAdvice} value={d.pendingAdvice ?? EMPTY_ADVICE} onChange={v => set({ pendingAdvice: v })} />
        <h2 style={{ fontSize: 20, marginTop: 24 }}>Questions that were not answered</h2>
        <p className="caption">Anything you asked about, or meant to ask, that is still open. Sakhi keeps it on your next card until you mark it answered.</p>
        {d.concerns.length > 0 && <ul className="added-list" aria-label="Questions added">{d.concerns.map(c => (
          <li key={c.id}><span>{c.text}{c.addressed ? <span className="caption"> (answered)</span> : null}</span>
            <button type="button" className="btn-link" aria-label={`Remove ${c.text}`} onClick={() => set({ concerns: d.concerns.filter(x => x.id !== c.id) })}><Trash2 size={14} aria-hidden="true" /> Remove</button></li>))}</ul>}
        <ConcernForm onAdd={c => set({ concerns: [...d.concerns, c] })} value={d.pendingConcern ?? EMPTY_CONCERN} onChange={v => set({ pendingConcern: v })} />
      </>}

      {step === 3 && <section aria-labelledby="rv-h">
        <h2 id="rv-h">Visit to {d.providerId === 'new' ? (d.fresh.name || d.fresh.facilityName || 'someone new') : prov?.name || prov?.facilityName || '…'} on {fmtDate(d.on, true)}</h2>
        <p className="caption">{d.systems.map(s => SYSTEM_LABEL[s]).join(', ')}</p>
        <div className="banner banner-info"><div>
          <strong>When you save</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li>Each piece of advice becomes a checklist item you can mark done, not done (with your reason) or not sure.</li>
            <li>Questions that were not answered stay on your next card until you mark them answered.</li>
            <li>Medicines and remedies you tick below are added to what you take, marked as told to this clinician.</li>
            <li>Everything stays on this device, and you can correct it later.</li>
          </ul></div></div>
        {d.note.trim() && <div className="entry-row"><div className="grow"><strong>Note</strong><div className="caption" style={{ whiteSpace: 'pre-wrap' }}>{d.note}</div></div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}><Pencil size={16} aria-hidden="true" /> Edit</button></div>}
        <h3 style={{ marginTop: 16 }}>Advice ({d.advice.length})</h3>
        {!d.advice.length && <p className="muted">No advice added.</p>}
        {d.advice.map(a => (
          <div key={a.id} className="entry-row">
            <div className="grow">
              <span className="caption">{ADVICE_KIND_LABEL[a.kind]} · {ADVICE_STATUS_LABEL[a.status]}{a.dueOn ? ` · by ${fmtDate(a.dueOn, true)}` : ''}</span>
              {editing === a.id
                ? <input className="input" aria-label="Advice text" autoFocus value={a.text} onChange={e => set({ advice: d.advice.map(x => x.id === a.id ? { ...x, text: e.target.value } : x) })} onBlur={() => setEditing(null)} />
                : <div><strong>{a.text}</strong></div>}
              {a.quote && <div className="caption">From your words: “{a.quote}”</div>}
              {a.kind === 'medicine' && (
                <label className="row caption" style={{ gap: 6, marginTop: 4 }}>
                  <input type="checkbox" checked={d.addToTreatments.includes(a.id)} onChange={e => set({ addToTreatments: e.target.checked ? [...d.addToTreatments, a.id] : d.addToTreatments.filter(x => x !== a.id) })} />
                  Also add to what I take
                </label>
              )}
            </div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(editing === a.id ? null : a.id)}><Pencil size={16} aria-hidden="true" /> {editing === a.id ? 'Done' : 'Edit'}</button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${a.text}`} onClick={() => set({ advice: d.advice.filter(x => x.id !== a.id) })}><Trash2 size={16} aria-hidden="true" /> Remove</button>
          </div>
        ))}
        <h3 style={{ marginTop: 16 }}>Things not answered ({d.concerns.filter(c => !c.addressed).length})</h3>
        {!d.concerns.length && <p className="muted">No concerns added.</p>}
        {d.concerns.map(c => (
          <div key={c.id} className="entry-row">
            <div className="grow">
              <span className="caption">{c.addressed ? 'Answered' : 'Not answered'}</span>
              {editing === c.id
                ? <input className="input" aria-label="Concern text" autoFocus value={c.text} onChange={e => set({ concerns: d.concerns.map(x => x.id === c.id ? { ...x, text: e.target.value } : x) })} onBlur={() => setEditing(null)} />
                : <div><strong>{c.text}</strong></div>}
              {c.quote && <div className="caption">From your words: “{c.quote}”</div>}
            </div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(editing === c.id ? null : c.id)}><Pencil size={16} aria-hidden="true" /> {editing === c.id ? 'Done' : 'Edit'}</button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove ${c.text}`} onClick={() => set({ concerns: d.concerns.filter(x => x.id !== c.id) })}><Trash2 size={16} aria-hidden="true" /> Remove</button>
          </div>
        ))}
        {saveErr && <p className="error" role="alert" style={{ marginTop: 12 }}>{saveErr}</p>}
      </section>}

      <div className="sticky-actions">
        <button type="button" className="btn btn-quiet" onClick={() => goStep(step - 1)} disabled={step === 1}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
        {step < 3
          ? <button type="button" className="btn btn-primary" onClick={() => { if (step > 1 || check1()) goStep(step + 1); }}>{step === 2 ? 'Check what you added' : 'Next'} <ArrowRight size={18} aria-hidden="true" /></button>
          : <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save visit'}</button>}
      </div>
    </div>
  );
}
