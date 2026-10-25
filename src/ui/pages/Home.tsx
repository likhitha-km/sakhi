import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CircleCheck, CircleDashed, CircleHelp, ClipboardList, KeyRound, MessageCircleQuestion, Plus, Stethoscope, TriangleAlert, Users } from 'lucide-react';
import { saveEntries, SaveError, uid } from '../../db/repo.ts';
import { addDays, fmtDate, fmtWeekday, todayLocal } from '../../engine/dates.ts';
import { inUseNow } from '../../brief/careViews.ts';
import { disclosureStatus, isOverdue, lastVisit, providerShort } from '../../visits/logic.ts';
import { reasonText } from '../../visits/basics.ts';
import { adviceOrder, currentStage, nextStep, STAGES, type LoopState } from '../../loop/loop.ts';
import { ConfirmDialog } from '../components/common.tsx';
import { CalendarButton } from '../components/CalendarButton.tsx';
import { exportable, type CalItem } from '../../loop/ics.ts';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { LastBackup } from './Backup.tsx';

const ACTION: Record<number, string> = { 1: 'Open the card', 2: 'Add what was said', 3: 'Update the advice', 4: 'Look at it again', 5: 'Plan the visit', 6: 'Log today', 7: 'Record a visit', 8: 'Plan the visit', 9: 'Update the advice' };

export function Home() {
  const d = useAppData();
  const { entries, settings, visits, advice, nextVisits, providers, care, disclosures, concerns } = d;
  const { user, announce } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayLocal();
  const state: LoopState = { providers, visits, advice, concerns, disclosures, care, nextVisits, entries, exclusions: d.exclusions, profile: d.profile };
  const step = nextStep(state, today);
  const stage = currentStage(state, today);
  const name = (id?: string) => providerShort(providers.find(p => p.id === id));
  const visitOf = (id: string) => visits.find(v => v.id === id);
  const last = lastVisit(visits, undefined, addDays(today, 1));
  const upcoming = [...nextVisits].filter(n => n.on >= today).sort((a, b) => a.on.localeCompare(b.on));
  const next = upcoming[0];
  const loggedToday = entries.some(e => e.occurredOn === today);
  const firstTime = !visits.length && !nextVisits.length;

  // What needs attention: real open items only, each with where it came from.
  const from = (visitId: string) => { const v = visitOf(visitId); return v ? `${name(v.providerId)}, ${fmtDate(v.on)}` : ''; };
  const ordered = [...advice].sort(adviceOrder(state));
  const attention = [
    ...ordered.filter(a => isOverdue(a, today)).map(a => ({ key: a.id, icon: TriangleAlert, tone: 'alert', text: a.text, note: `Past its date (${fmtDate(a.dueOn!)})`, src: from(a.visitId), to: `/visit/${a.visitId}` })),
    ...ordered.filter(a => a.status === 'unsure' && !isOverdue(a, today)).map(a => ({ key: a.id, icon: CircleHelp, tone: '', text: a.text, note: 'You marked this as not sure', src: from(a.visitId), to: `/visit/${a.visitId}` })),
    ...ordered.filter(a => a.status === 'not_started' && !isOverdue(a, today)).map(a => ({ key: a.id, icon: CircleDashed, tone: '', text: a.text, note: a.dueOn ? `By ${fmtDate(a.dueOn)}` : 'Not done yet', src: from(a.visitId), to: `/visit/${a.visitId}` })),
    ...ordered.filter(a => a.status === 'skipped').map(a => ({ key: a.id, icon: CircleDashed, tone: 'muted', text: a.text, note: `Not done. Your reason: ${reasonText(a)}`, src: from(a.visitId), to: `/visit/${a.visitId}` })),
    ...concerns.filter(c => !c.addressed).map(c => ({ key: c.id, icon: MessageCircleQuestion, tone: '', text: c.text, note: 'Not answered yet', src: from(c.visitId), to: `/visit/${c.visitId}` })),
  ];
  const shown = attention.slice(0, 5);
  const notTold = next ? inUseNow(care, today).filter(t => disclosureStatus(disclosures, t.id, next.providerId) !== 'told') : [];
  const calItems: CalItem[] = [
    ...upcoming.map(n => ({ kind: 'visit' as const, next: n, provider: providers.find(p => p.id === n.providerId) })),
    ...advice.map(a => ({ kind: 'advice' as const, item: a, provider: providers.find(p => p.id === visitOf(a.visitId)?.providerId) })),
  ];

  const nothingToday = async () => {
    setConfirm(false); setErr(null);
    try {
      await saveEntries([{ id: uid(), occurredOn: today, recordedAt: new Date().toISOString(), kind: 'checkin', impact: [], source: settings?.syntheticLoaded ? 'synthetic' : 'user', origin: 'manual' }]);
      announce('Saved. Today is recorded as nothing to report.');
    } catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save. Please try again.'); }
  };

  return (
    <div className="home">
      <p className="home-greeting">{user ? `Welcome${firstTime ? '' : ' back'}, ${user.name}${user.sample ? ' (sample)' : ''}` : 'Welcome'} · {fmtWeekday(today)} {fmtDate(today)}</p>

      <section className="journey-hero" aria-labelledby="hero-h">
        <ol className="journey-line" aria-label="Your care journey">
          {STAGES.map(s => <li key={s.key} className={stage === s.key ? 'is-here' : ''} aria-current={stage === s.key ? 'step' : undefined}>{s.label}{stage === s.key && <span className="visually-hidden"> (you are here)</span>}</li>)}
        </ol>
        <h1 id="hero-h">{step.label}</h1>
        <p className="journey-why">{step.why}</p>
        <div className="row">
          <Link className="btn btn-primary btn-lg" to={step.to}>{ACTION[step.rule]} <ArrowRight size={18} aria-hidden="true" /></Link>
          {step.rule !== 7 && step.rule !== 2 && <Link className="btn btn-quiet" to="/visit/new"><Stethoscope size={16} aria-hidden="true" /> Record another visit</Link>}
        </div>
      </section>

      {firstTime && (
        <section className="section how-loop" aria-labelledby="how-h">
          <h2 id="how-h">How Sakhi follows your care</h2>
          <ol>
            <li><strong>After a visit,</strong> write down what the doctor or practitioner said and what you were told to do.</li>
            <li><strong>Between visits,</strong> tick off the advice, note what got in the way, and keep one list of everything you take.</li>
            <li><strong>Before the next visit,</strong> Sakhi prepares a short card: what to tell, what is still open, and what to ask.</li>
          </ol>
        </section>
      )}

      {attention.length > 0 && (
        <section className="section" aria-labelledby="att-h">
          <div className="row-between"><h2 id="att-h">What needs attention</h2><span className="caption">{attention.length} open</span></div>
          <ul className="attention-list">
            {shown.map(a => (
              <li key={a.key} className={a.tone ? `tone-${a.tone}` : undefined}>
                <a.icon size={18} aria-hidden="true" />
                <div className="grow"><Link to={a.to}>{a.text}</Link><span className="caption">{a.note}{a.src ? ` · ${a.src}` : ''}</span></div>
              </li>
            ))}
          </ul>
          {attention.length > shown.length && <Link to="/journal/visits" className="caption">See all {attention.length} in your visits</Link>}
        </section>
      )}

      {!firstTime && (
        <section className="section visits-pair" aria-label="Your visits">
          <div className="visit-slot">
            <h2><Stethoscope size={18} aria-hidden="true" /> Last visit</h2>
            {last ? <>
              <p className="slot-main">{name(last.providerId)}</p>
              <p className="caption">{fmtDate(last.on, true)} · {advice.filter(a => a.visitId === last.id).length} advice, {concerns.filter(c => c.visitId === last.id && !c.addressed).length} open {concerns.filter(c => c.visitId === last.id && !c.addressed).length === 1 ? 'question' : 'questions'}</p>
              <div className="row"><Link to={`/visit/${last.id}`}>What was said</Link><Link to="/since">Symptoms since then</Link></div>
            </> : <p className="muted">No visit recorded yet.</p>}
          </div>
          <div className="visit-slot">
            <h2><CalendarClock size={18} aria-hidden="true" /> Next visit</h2>
            {next ? <>
              <p className="slot-main">{name(next.providerId)}</p>
              <p className="caption">{fmtWeekday(next.on)} {fmtDate(next.on, true)}</p>
              {notTold.length > 0 && <p className="caption"><Users size={14} aria-hidden="true" /> {notTold.length} {notTold.length === 1 ? 'thing you take is' : 'things you take are'} not marked as told to {name(next.providerId)}</p>}
              <div className="row"><Link className="btn btn-secondary btn-sm" to={`/card/${next.id}`}>Prepare the card</Link><CalendarButton items={[{ kind: 'visit', next, provider: providers.find(p => p.id === next.providerId) }]} /></div>
            </> : <>
              <p className="muted">Nothing planned.</p>
              <Link className="btn btn-secondary btn-sm" to={last ? `/card?plan=${last.providerId}` : '/card'}>Plan a visit</Link>
            </>}
          </div>
        </section>
      )}

      <section className="section everyday" aria-labelledby="day-h">
        <h2 id="day-h" className="visually-hidden">Everyday</h2>
        <div className="everyday-item">
          <span className="label">Today</span>
          {loggedToday ? <span className="status status-ready"><CircleCheck size={16} aria-hidden="true" /> Logged</span>
            : <span className="row" style={{ gap: 6 }}><Link to="/log"><Plus size={14} aria-hidden="true" /> Log how I feel</Link><button type="button" className="btn-link" onClick={() => setConfirm(true)}>Nothing to report</button></span>}
        </div>
        <div className="everyday-item"><span className="label">Records</span><span className="row" style={{ gap: 12 }}><Link to="/report"><ClipboardList size={14} aria-hidden="true" /> My report</Link><Link to="/journal">Journal</Link></span></div>
        <div className="everyday-item"><span className="label">Backup</span><Link to="/settings/backup"><KeyRound size={14} aria-hidden="true" /> <LastBackup /></Link></div>
        {exportable(calItems).length > 0 && <div className="everyday-item"><span className="label">Calendar</span><CalendarButton items={calItems} small label="Add upcoming dates" /></div>}
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <ConfirmDialog open={confirm} title="Nothing to report today?" body={<p>This records today as a day with nothing to report, so it is counted as a logged day.</p>}
        confirmLabel="Yes, record it" onCancel={() => setConfirm(false)} onConfirm={nothingToday} />
    </div>
  );
}
