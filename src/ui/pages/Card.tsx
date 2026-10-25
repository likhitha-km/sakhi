import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, Expand, FileText, Printer, Trash2, X } from 'lucide-react';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { findOrCreateProvider, SaveError, uid } from '../../db/repo.ts';
import { deleteNextVisit, markCardOpened, saveNextVisit, setDisclosure } from '../../db/visits.ts';
import type { CardModel } from '../../visits/logic.ts';
import { reasonText } from '../../visits/basics.ts';
import type { TraceRow } from '../components/visitBits.tsx';
import { CalendarButton } from '../components/CalendarButton.tsx';
import { ShareButton } from '../components/ShareSheet.tsx';
import { addDays, fmtDate, fmtWeekday, todayLocal } from '../../engine/dates.ts';
import { providerShort } from '../../visits/logic.ts';
import { ConfirmDialog, FieldError, PageHeader } from '../components/common.tsx';
import { ProviderPicker, useTrace, type NewProvider } from '../components/visitBits.tsx';
import { CARD_SECTIONS, CardView, sectionOn, SHOW_MAX_WORDS, useCard } from '../components/CardView.tsx';
import { SHOW_STEPS } from '../../visits/sections.ts';

function PlanVisit({ onDone, presetProvider }: { onDone?: (id: string) => void; presetProvider?: string }) {
  const { providers } = useAppData();
  const { announce } = useSession();
  const [params] = useSearchParams();
  const [pid, setPid] = useState(params.get('plan') ?? presetProvider ?? '');
  const [fresh, setFresh] = useState<NewProvider>({ name: '', facilityName: '', facilityKind: 'other', role: 'other' });
  const presetOn = params.get('on');
  const [on, setOn] = useState(presetOn && presetOn >= todayLocal() ? presetOn : addDays(todayLocal(), 7));
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!pid) { setErr('Choose who you will see.'); return; }
    if (!on || on < todayLocal()) { setErr('Choose today or a later day.'); return; }
    try {
      const providerId = pid === 'new' ? await findOrCreateProvider(fresh) : pid;
      if (!providerId) { setErr('Give a name, a place or a role for the person you will see.'); return; }
      const id = uid();
      await saveNextVisit({ id, providerId, on });
      announce('Visit planned.');
      onDone?.(id);
    } catch (x) { setErr(x instanceof SaveError ? x.message : 'That did not save. Please try again.'); }
  };
  return (
    <form onSubmit={save} className="card section" aria-labelledby="plan-h">
      <h2 id="plan-h" style={{ fontSize: 20 }}><CalendarPlus size={20} aria-hidden="true" /> Plan your next visit</h2>
      <ProviderPicker providers={providers} value={pid} onChange={setPid} fresh={fresh} onFresh={setFresh} label="Who will you see?" />
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="pv-on">Date</label>
        <input id="pv-on" className="input" type="date" min={todayLocal()} value={on} onChange={e => setOn(e.target.value)} />
      </div>
      <FieldError id="pv-err" msg={err} />
      <button type="submit" className="btn btn-primary">Plan visit and make a card</button>
    </form>
  );
}

/**
 * The three questions for a short appointment, from the same card model as the card, show mode, print and link.
 * Counts open the records behind them.
 */
function ThreeQuestions({ m, providerId, onTrace }: { m: CardModel; providerId: string; onTrace: (title: string, rows: TraceRow[]) => void }) {
  const { announce } = useSession();
  const tell = m.inUse.flatMap(g => g.items).filter(i => i.told !== 'told');
  const open = [
    ...m.advice.overdue.map(a => ({ key: a.id, text: a.text, note: `Past its date (${fmtDate(a.dueOn!)})` })),
    ...m.advice.skipped.map(x => ({ key: x.item.id, text: x.item.text, note: x.item.reason || x.item.reasonText ? `Not done. My reason: ${reasonText(x.item)}` : 'Not done. No reason recorded' })),
    ...m.advice.unsure.filter(a => !m.advice.overdue.includes(a)).map(a => ({ key: a.id, text: a.text, note: 'I was not sure about this' })),
    ...m.advice.open.map(a => ({ key: a.id, text: a.text, note: a.dueOn ? `Not done yet, by ${fmtDate(a.dueOn)}` : 'Not done yet' })),
    ...m.concerns.map(c => ({ key: c.id, text: c.text, note: 'I asked, not answered yet' })),
  ];
  const Count = ({ n, title, rows }: { n: number; title: string; rows: TraceRow[] }) =>
    <button type="button" className="num" onClick={() => onTrace(title, rows)} aria-label={`${n}: ${title}. Show the records`}>{n}</button>;
  return (
    <section className="three-q" aria-label="Before the appointment">
      <div className="q-block">
        <h2>{m.changes.seenBefore ? `What has changed since I saw ${m.clinician} on ${fmtDate(m.changes.from)}?` : `What has happened in my care in the last 3 months?`}</h2>
        {!m.changes.seenBefore && <p className="caption">You have not recorded a visit to {m.clinician} before, so this covers the last 3 months.</p>}
        {(m.changes.lastAdvice.length + m.changes.otherVisits.length + m.changes.started.length + m.changes.stopped.length) ? <ul>
          {m.changes.lastAdvice.map(a => <li key={a.id}><span>{a.text}</span><span className="caption">{m.clinician} advised this last time · {a.status}</span></li>)}
          {m.changes.otherVisits.map(v => <li key={v.id}><span>Saw {v.who}</span><span className="caption">{fmtDate(v.on, true)} · {v.systems}{v.advice ? ` · ${v.advice} advice` : ''}</span><Link className="btn btn-quiet btn-sm" to={`/visit/${v.id}`}>Open</Link></li>)}
          {m.changes.started.map(t => <li key={t.id}><span>Started {t.title}</span><span className="caption">{fmtDate(t.on, true)}{t.by ? ` · from ${t.by}` : ' · on my own'}</span></li>)}
          {m.changes.stopped.map(t => <li key={t.id}><span>Stopped {t.title}</span><span className="caption">{fmtDate(t.on, true)}{t.why ? ` · ${t.why}` : ''}</span></li>)}
        </ul> : <p className="muted">No other visits, and nothing started or stopped, in your records for this time.</p>}
      </div>
      <div className="q-block">
        <h2>What should I tell {m.clinician}? <Count n={tell.length} title={`Not marked as told to ${m.clinician}`} rows={tell.map(t => ({ key: t.id, title: t.title }))} /></h2>
        {tell.length ? <ul>{tell.map(i => (
          <li key={i.id}><span>{i.title}</span><span className="caption">{i.told === 'unsure' ? 'Not sure if told' : 'Not marked as told'}</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await setDisclosure(i.id, providerId, 'told'); announce(`Marked ${i.title} as told to ${m.clinician}.`); }}>I have told them</button></li>
        ))}</ul> : <p className="muted">Everything you take is marked as told to {m.clinician}.</p>}
        <p className="caption">This is what you recorded, not what {m.clinician} knows. <Link to="/disclosure">Who I have told</Link></p>
      </div>
      <div className="q-block">
        <h2>What is still unresolved? <Count n={open.length} title="Still unresolved" rows={open.map(o => ({ key: o.key, title: o.text, detail: o.note }))} /></h2>
        {open.length ? <ul>{open.map(o => <li key={o.key}><span>{o.text}</span><span className="caption">{o.note}</span></li>)}</ul>
          : <p className="muted">Nothing open from your earlier visits.</p>}
      </div>
      <div className="q-block">
        <h2>What should I ask?</h2>
        {m.questions.length ? <ol>{m.questions.map(q => <li key={q.id}>{q.text}</li>)}</ol>
          : <p className="muted">No questions come from your records yet. Write your reason for the visit below and it goes on the card.</p>}
      </div>
    </section>
  );
}

function PlanVisitInline({ presetProvider }: { presetProvider?: string }) {
  const nav = useNavigate();
  return <PlanVisit onDone={id => nav(`/card/${id}`)} presetProvider={presetProvider} />;
}

export function CardList() {
  const d = useAppData();
  const { nextVisits, providers, visits, advice, concerns, care } = d;
  const today = todayLocal();
  const upcoming = [...nextVisits].filter(n => n.on >= today).sort((a, b) => a.on.localeCompare(b.on));
  const past = [...nextVisits].filter(n => n.on < today).sort((a, b) => b.on.localeCompare(a.on));
  const taking = care.filter(c => c.kind === 'treatment' && !c.endDate).length;
  const openAdvice = advice.filter(a => a.status !== 'done').length;
  const openQs = concerns.filter(c => !c.addressed).length;
  const last = [...visits].sort((a, b) => b.on.localeCompare(a.on))[0];
  const has = visits.length > 0 || taking > 0;
  return (
    <>
      <PageHeader title="Consult Card" intro="A one minute card for a specific appointment: what to tell the clinician, what is still unresolved, and what to ask." />
      {upcoming.length > 0 && (
        <section className="section" aria-labelledby="up-h">
          <h2 id="up-h">Your planned visits</h2>
          <ul className="attention-list">{upcoming.map(n => (
            <li key={n.id}><CalendarClock size={18} aria-hidden="true" />
              <div className="grow"><Link to={`/card/${n.id}`}>{providerShort(providers.find(p => p.id === n.providerId))}</Link><span className="caption">{fmtWeekday(n.on)} {fmtDate(n.on, true)}{n.cardOpenedOn ? ' · card opened' : ''}</span></div>
              <Link className="btn btn-secondary btn-sm" to={`/card/${n.id}`}>Prepare card</Link></li>))}</ul>
        </section>
      )}
      {!upcoming.length && (
        <section className="card-intro section" aria-labelledby="ci-h">
          <h2 id="ci-h">Plan a visit to make its card</h2>
          {has ? <>
            <p>From what you have recorded so far, the card would bring together:</p>
            <ul className="intro-facts">
              <li><strong>{taking}</strong> {taking === 1 ? 'thing you take' : 'things you take'}, and who you have told</li>
              <li><strong>{openAdvice}</strong> advice {openAdvice === 1 ? 'item' : 'items'} not marked done</li>
              <li><strong>{openQs}</strong> {openQs === 1 ? 'question' : 'questions'} not answered yet</li>
              <li>How you have felt since {last ? `your visit to ${providerShort(providers.find(p => p.id === last.providerId))}` : 'your last visit'}</li>
            </ul>
          </> : <p>The card is built from your visits and what you take. Once you have recorded a visit, it shows what to tell the next clinician, what is still open and what to ask. <Link to="/visit/new">Record a visit first</Link>, or plan one now.</p>}
        </section>
      )}
      <PlanVisitInline presetProvider={last?.providerId} />
      {past.length > 0 && <section className="section"><h2>Earlier cards</h2>
        <ul>{past.map(n => <li key={n.id}><Link to={`/card/${n.id}`}>{providerShort(providers.find(p => p.id === n.providerId))}, {fmtDate(n.on, true)}</Link></li>)}</ul></section>}
    </>
  );
}

export function CardPage() {
  const { id } = useParams();
  const d = useAppData();
  const { announce } = useSession();
  const nav = useNavigate();
  const next = d.nextVisits.find(n => n.id === id);
  const m = useCard(next, d);
  const { openTrace, sheet } = useTrace();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (next?.id) void markCardOpened(next.id); }, [next?.id]);
  if (d.loading) return <p role="status">Loading…</p>;
  if (!next || !m) return <><PageHeader title="Card not found" /><p><Link to="/card">See your planned visits</Link></p></>;
  const keys = CARD_SECTIONS.map(s => s.key).filter(k => sectionOn(next, k));
  const update = (p: Partial<typeof next>) => saveNextVisit({ ...next, ...p }).catch(x => setErr(x instanceof SaveError ? x.message : 'That did not save.'));
  const off = CARD_SECTIONS.filter(s => !sectionOn(next, s.key)).length;

  return (
    <>
      <PageHeader title={`Your visit to ${m.clinician}`} intro={`${fmtWeekday(next.on)} ${fmtDate(next.on, true)}. Read the three questions first; the card below is what you show.`} />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="no-print"><ThreeQuestions m={m} providerId={next.providerId} onTrace={openTrace} /></div>

      <section className="section card-section" aria-labelledby="cs-h">
        <div className="row-between no-print">
          <h2 id="cs-h">The card to show</h2>
          <div className="row">
            <Link className="btn btn-primary" to={`/card/${next.id}/show`}><Expand size={18} aria-hidden="true" /> Show to my doctor</Link>
            <button type="button" className="btn btn-secondary" onClick={() => { void markCardOpened(next.id); window.print(); }}><Printer size={18} aria-hidden="true" /> Print or save as PDF</button>
            <ShareButton m={m} keys={keys} />
          </div>
        </div>
        <details className="adjust no-print">
          <summary>Adjust the card{off ? ` (${off} ${off === 1 ? 'part' : 'parts'} hidden)` : ''}</summary>
          <div className="adjust-body">
            <div className="field">
              <label htmlFor="cd-goal">Why I am coming <span className="caption">(one line, optional)</span></label>
              <input id="cd-goal" className="input" maxLength={200} defaultValue={next.goal ?? ''} onBlur={e => { void update({ goal: e.target.value.trim() || undefined }); announce('Saved.'); }} placeholder="For example: tiredness and heavy periods" />
              <span className="hint">Saved when you leave the box. It appears at the top of the card.</span>
            </div>
            <fieldset><legend>Parts of the card</legend>
              <div className="toggle-grid">{CARD_SECTIONS.map(s => (
                <label key={s.key} className="switch"><input type="checkbox" checked={sectionOn(next, s.key)} onChange={e => void update({ sections: { ...next.sections, [s.key]: e.target.checked } })} /> {s.label}</label>
              ))}</div>
              <p className="caption">Anything switched off is left out of the card, show mode, print and shared link.</p>
            </fieldset>
            <div className="row">
              <CalendarButton items={[{ kind: 'visit', next, provider: d.providers.find(p => p.id === next.providerId) }]} label="Add this visit to my calendar" />
              <Link to="/report" className="btn btn-quiet btn-sm"><FileText size={16} aria-hidden="true" /> My full report</Link>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" /> Remove this planned visit</button>
            </div>
          </div>
        </details>
        <p className="caption no-print">Tap any number to see the records behind it.</p>
        <div className="brief-page card-print">
          <div className="brief-head"><h1>For {m.clinician}, {fmtDate(next.on, true)}</h1><div><strong>Patient reported information. Not a diagnosis.</strong></div></div>
          <CardView m={m} d={d} keys={keys} onTrace={openTrace} />
        </div>
      </section>
      {sheet}
      <ConfirmDialog open={confirm} title="Remove this planned visit?" danger confirmLabel="Remove"
        body={<p>Only the plan and its card settings are removed. Your visits and records stay.</p>}
        onCancel={() => setConfirm(false)} onConfirm={async () => { setConfirm(false); await deleteNextVisit(next.id); nav('/card'); }} />
    </>
  );
}

export function CardShow() {
  const { id } = useParams();
  const d = useAppData();
  const nav = useNavigate();
  const next = d.nextVisits.find(n => n.id === id);
  const m = useCard(next, d);
  const { openTrace, sheet } = useTrace();
  const [step, setStep] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { if (next?.id) void markCardOpened(next.id); }, [next?.id]);
  const sig = m ? JSON.stringify([m.inUseIds, m.concerns.length, m.questions.length, m.since.rows.length, next?.sections]) : '';
  // Start trimming again only when the card's content really changes.
  const lastSig = useRef(sig);
  useEffect(() => { if (lastSig.current !== sig) { lastSig.current = sig; setStep(0); } }, [sig]);
  // Measure again when fonts finish loading or the screen size changes.
  const [, remeasure] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(() => remeasure(n => n + 1)) : null;
    if (ro && el) ro.observe(el);
    const onResize = () => { setStep(0); remeasure(n => n + 1); };
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(() => remeasure(n => n + 1));
    return () => { ro?.disconnect(); window.removeEventListener('resize', onResize); };
  }, [m === null]);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || step >= SHOW_STEPS.length - 1) return;
    const words = el.innerText.split(/\s+/).filter(Boolean).length;
    const tooTall = document.documentElement.scrollHeight > window.innerHeight;
    if (words > SHOW_MAX_WORDS || tooTall) setStep(s => s + 1);
  });
  if (d.loading) return <p role="status">Loading…</p>;
  if (!next || !m) return <p>Card not found. <Link to="/card">Back</Link></p>;
  const cur = SHOW_STEPS[step];
  const keys = CARD_SECTIONS.map(s => s.key).filter(k => sectionOn(next, k) && !cur.drop.includes(k));
  const trimmed = step > 0;
  return (
    <div className="show-mode">
      <header className="show-head">
        <h1><strong>For {m.clinician}</strong> · {fmtDate(next.on)}</h1>
        <button type="button" className="icon-btn" aria-label="Close show mode" onClick={() => nav(`/card/${next.id}`)}><X size={20} aria-hidden="true" /></button>
      </header>
      <main id="main" tabIndex={-1} ref={mainRef}>
        <CardView m={m} d={d} keys={keys} onTrace={openTrace} compact maxQuestions={cur.questions} />
        {trimmed && <p style={{ margin: 0 }}><Link to="/brief">Full brief available</Link></p>}
      </main>
      {sheet}
    </div>
  );
}
