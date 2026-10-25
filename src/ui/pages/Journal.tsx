import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { CalendarClock, FlaskConical, Paperclip, Pencil, Pill, Plus, Sparkles, Stethoscope } from 'lucide-react';
import { isOverdue } from '../../visits/logic.ts';
import { useAppData } from '../hooks/data.ts';
import { fmtDate, fmtWeekday, todayLocal } from '../../engine/dates.ts';
import { symptomKey, symptomKeyLabel } from '../../engine/compute.ts';
import { activeExclusionIds, uniq } from '../../engine/select.ts';
import { AREA_LABEL, AREA_ORDER, SYMPTOM_AREA } from '../../engine/vocab.ts';
import type { AreaCode, Entry } from '../../types/entry.ts';
import type { CareEvent, CareKind, SystemOfMedicine } from '../../types/care.ts';
import { CARE_KIND_LABEL, comingUp, inUseNow, providerName, STOPPED_LABEL, SYSTEMS, SYSTEM_LABEL } from '../../brief/careViews.ts';
import { EmptyMotif, PageHeader } from '../components/common.tsx';
import { entryDetails, entryTitle } from '../components/entryText.ts';
import { EntryEditor } from '../components/EntryEditor.tsx';
import { CareForm, openAttachment } from '../components/CareForm.tsx';

const TABS = [
  { id: '', label: 'Entries' }, { id: 'visits', label: 'Visits' }, { id: 'take', label: 'What I take' },
  { id: 'tests', label: 'Tests done' }, { id: 'coming-up', label: 'Coming up' },
];

const KIND_ICON = { visit: Stethoscope, test: FlaskConical, treatment: Pill } as const;
const sysText = (c: CareEvent) => c.systems.map(s => SYSTEM_LABEL[s]).join(' and ');

function EntriesTab() {
  const { entries, exclusions } = useAppData();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sym, setSym] = useState('all');
  const [area, setArea] = useState<AreaCode | 'all'>('all');
  const [editing, setEditing] = useState<Entry | null>(null);
  const off = activeExclusionIds(exclusions);
  const keys = uniq(entries.map(symptomKey).filter((k): k is string => !!k)).sort();
  const areaOf = (e: Entry): AreaCode | undefined => e.kind === 'symptom' ? (e.symptomCode === 'custom' ? e.area : SYMPTOM_AREA[e.symptomCode!]) : e.kind === 'checkin' ? undefined : 'menstrual';
  const list = entries.filter(e => (!from || e.occurredOn >= from) && (!to || e.occurredOn <= to)
    && (sym === 'all' || symptomKey(e) === sym) && (area === 'all' || areaOf(e) === area));
  const days = uniq(list.map(e => e.occurredOn)).sort().reverse();

  if (!entries.length) return (
    <div className="card-quiet"><EmptyMotif /><h2>No entries yet</h2><p>Start with how you feel today.</p>
      <div className="row"><Link className="btn btn-primary" to="/log">Log symptoms</Link></div></div>
  );

  return (
    <>
      <div className="row section" role="group" aria-label="Filters">
        <label className="row caption" style={{ gap: 6 }}>From <input className="input" style={{ width: 'auto' }} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="row caption" style={{ gap: 6 }}>To <input className="input" style={{ width: 'auto' }} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="row caption" style={{ gap: 6 }}>Area
          <select className="select" style={{ width: 'auto' }} value={area} onChange={e => setArea(e.target.value as AreaCode | 'all')}>
            <option value="all">All</option>{AREA_ORDER.map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select></label>
        <label className="row caption" style={{ gap: 6 }}>Symptom
          <select className="select" style={{ width: 'auto' }} value={sym} onChange={e => setSym(e.target.value)}>
            <option value="all">All</option>{keys.map(k => <option key={k} value={k}>{symptomKeyLabel(k)}</option>)}
          </select></label>
        {(from || to || sym !== 'all' || area !== 'all') && <button type="button" className="btn-link" onClick={() => { setFrom(''); setTo(''); setSym('all'); setArea('all'); }}>Clear filters</button>}
      </div>
      <p className="caption">{list.length} {list.length === 1 ? 'entry' : 'entries'} on {days.length} {days.length === 1 ? 'day' : 'days'}. Tap an entry to fix it.</p>
      {days.map(d => (
        <section key={d} aria-label={fmtDate(d, true)} style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>{fmtWeekday(d)} {fmtDate(d, true)}</h3>
          {list.filter(e => e.occurredOn === d).map(e => (
            <button key={e.id} type="button" className={`entry-row${off.has(e.id) ? ' is-excluded' : ''}`} style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => setEditing(e)}>
              <span className="grow">
                <strong>{entryTitle(e)}</strong>
                {entryDetails(e).map(t => <span key={t} className="caption" style={{ display: 'block' }}>{t}</span>)}
                {e.note && <span className="caption" style={{ display: 'block' }}>Note: “{e.note}”</span>}
                {e.origin === 'ai_confirmed' && <span className="caption" style={{ display: 'block' }}><Sparkles size={13} aria-hidden="true" /> Drafted with AI, confirmed by you</span>}
                {off.has(e.id) && <span className="caption" style={{ display: 'block' }}>Left out of your summaries</span>}
              </span>
              <Pencil size={16} aria-hidden="true" />
            </button>
          ))}
        </section>
      ))}
      {!list.length && <p className="muted">No entries match these filters.</p>}
      <EntryEditor entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CareItem({ c, onEdit }: { c: CareEvent; onEdit: (c: CareEvent) => void }) {
  const { providers } = useAppData();
  const Icon = KIND_ICON[c.kind];
  const who = providerName(providers.find(p => p.id === c.providerId));
  return (
    <div className="entry-row">
      <Icon size={20} aria-hidden="true" style={{ marginTop: 2 }} />
      <div className="grow">
        <strong>{c.title}</strong> <span className="caption">· {CARE_KIND_LABEL[c.kind]} · {fmtDate(c.date, true)}</span>
        <div className="caption">{sysText(c)}{who ? ` · ${who}` : ''}</div>
        {c.result && <div className="caption">Result as written: {c.result}{c.unit ? ' ' + c.unit : ''}{c.reportedRange ? ` (range on report: ${c.reportedRange})` : ''}</div>}
        {c.summary && <div className="caption">“{c.summary}”</div>}
        {c.endDate && <div className="caption">Stopped {fmtDate(c.endDate, true)}{c.stoppedBy ? `: ${STOPPED_LABEL[c.stoppedBy]}` : ''}</div>}
        {c.problemNote && <div className="caption">Problem noticed: {c.problemNote}</div>}
        {c.followUpOn && <div className="caption">Follow up: {fmtDate(c.followUpOn, true)}</div>}
        {c.hideFromBrief && <div className="caption">Kept out of the brief</div>}
        {c.attachmentIds.map((id, i) => <button key={id} type="button" className="btn-link" style={{ minHeight: 32 }} onClick={() => openAttachment(id)}><Paperclip size={14} aria-hidden="true" /> File {i + 1}</button>)}
      </div>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onEdit(c)} aria-label={`Edit ${c.title}`}><Pencil size={16} aria-hidden="true" /> Edit</button>
    </div>
  );
}

export function Journal() {
  const { tab = '' } = useParams();
  const { care, visits, advice, providers, nextVisits } = useAppData();
  const [adding, setAdding] = useState<CareKind | null>(null);
  const [editing, setEditing] = useState<CareEvent | null>(null);
  const [system, setSystem] = useState<SystemOfMedicine | 'all'>('all');
  const today = todayLocal();
  const filtered = useMemo(() => care.filter(c => system === 'all' || c.systems.includes(system)), [care, system]);
  const fu = comingUp(filtered, today);
  const none = (msg: string, action?: React.ReactNode) => (
    <div className="card-quiet"><EmptyMotif kind="care" /><p>{msg}</p>{action}</div>
  );
  const sysFilter = (
    <label className="row caption" style={{ gap: 6 }}>Type of care
      <select className="select" style={{ width: 'auto' }} value={system} onChange={e => setSystem(e.target.value as SystemOfMedicine | 'all')}>
        <option value="all">All</option>{SYSTEMS.map(s => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
      </select></label>
  );
  const name = (id?: string) => providerName(providers.find(p => p.id === id));
  const using = inUseNow(filtered, today);
  const stopped = filtered.filter(c => c.kind === 'treatment' && !using.includes(c)).sort((a, b) => b.date.localeCompare(a.date));
  const sortedVisits = [...visits].filter(v => system === 'all' || v.systems.includes(system)).sort((a, b) => b.on.localeCompare(a.on));
  const dueAdvice = advice.filter(a => a.dueOn && (a.status === 'not_started' || a.status === 'unsure')).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
  const upcomingVisits = [...nextVisits].filter(n => n.on >= today).sort((a, b) => a.on.localeCompare(b.on));

  return (
    <>
      <PageHeader title="Journal" intro="Everything you recorded: symptoms, visits to any doctor or kind of medicine, and what you take." />
      <nav className="tabs" aria-label="Journal sections">
        {TABS.map(t => <NavLink key={t.id} to={t.id ? `/journal/${t.id}` : '/journal'} end>{t.label}</NavLink>)}
      </nav>

      {tab === '' && <EntriesTab />}

      {tab === 'visits' && <>
        <div className="row section"><Link className="btn btn-primary btn-sm" to="/visit/new"><Plus size={16} aria-hidden="true" /> After the visit</Link>{sysFilter}</div>
        {sortedVisits.length ? sortedVisits.map(v => {
          const items = advice.filter(a => a.visitId === v.id);
          return (
            <Link key={v.id} to={`/visit/${v.id}`} className="entry-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Stethoscope size={20} aria-hidden="true" style={{ marginTop: 2 }} />
              <span className="grow"><strong>{name(v.providerId) || 'Visit'}</strong> <span className="caption">· {fmtDate(v.on, true)}</span>
                <span className="caption" style={{ display: 'block' }}>{v.systems.map(s => SYSTEM_LABEL[s]).join(', ')} · {items.length} advice {items.length === 1 ? 'item' : 'items'}{items.some(a => isOverdue(a, today)) ? ' · some overdue' : ''}</span></span>
              <Pencil size={16} aria-hidden="true" />
            </Link>
          );
        }) : none('No visits recorded yet. After an appointment, write down what was said and what you were told to do.', <Link className="btn btn-primary" to="/visit/new">After the visit</Link>)}
      </>}

      {tab === 'take' && <>
        <div className="row section">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('treatment')}><Plus size={16} aria-hidden="true" /> Add something I take</button>
          <Link className="btn btn-quiet btn-sm" to="/disclosure">Who I have told</Link>{sysFilter}
        </div>
        <p className="caption">Medicines, remedies, supplements and anything else, from any doctor, chemist, practitioner or home.</p>
        {using.length ? SYSTEMS.map(s => ({ s, items: using.filter(c => c.systems.includes(s)) })).filter(g => g.items.length).map(g => (
          <section key={g.s} className="section"><h2 style={{ fontSize: 20 }}>{SYSTEM_LABEL[g.s]}</h2>{g.items.map(c => <CareItem key={c.id} c={c} onEdit={setEditing} />)}</section>
        )) : none('Nothing marked as in use now.')}
        {stopped.length > 0 && <section className="section"><h2 style={{ fontSize: 20 }}>Stopped</h2>{stopped.map(c => <CareItem key={c.id} c={c} onEdit={setEditing} />)}</section>}
      </>}

      {tab === 'tests' && <>
        <div className="row section"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('test')}><Plus size={16} aria-hidden="true" /> Add a test I have had</button>{sysFilter}</div>
        {(() => {
          const tests = [...filtered.filter(c => c.kind === 'test'), ...advice.filter(a => a.kind === 'test' && a.status === 'done').map(a => ({ adviceTest: a }))];
          if (!tests.length) return none('No tests recorded as done. Tests advised at a visit appear here once you mark them done.');
          return tests.map(t => 'adviceTest' in t
            ? <Link key={t.adviceTest.id} to={`/visit/${t.adviceTest.visitId}`} className="entry-row" style={{ textDecoration: 'none', color: 'inherit' }}><span className="grow"><strong>{t.adviceTest.text}</strong><span className="caption" style={{ display: 'block' }}>Advised at a visit, marked done</span></span></Link>
            : <CareItem key={t.id} c={t} onEdit={setEditing} />);
        })()}
        <p className="caption">Results are shown exactly as you typed them. Sakhi does not judge whether a result is high or low.</p>
      </>}

      {tab === 'coming-up' && (upcomingVisits.length || dueAdvice.length || fu.upcoming.length || fu.overdue.length ? <>
        {upcomingVisits.length > 0 && <section className="section"><h2 style={{ fontSize: 20 }}>Planned visits</h2>
          {upcomingVisits.map(n => <div key={n.id} className="entry-row"><CalendarClock size={20} aria-hidden="true" /><span className="grow"><strong>{name(n.providerId)}</strong> <span className="caption">· {fmtDate(n.on, true)}</span></span><Link className="btn btn-secondary btn-sm" to={`/card/${n.id}`}>Prepare card</Link></div>)}</section>}
        {dueAdvice.length > 0 && <section className="section"><h2 style={{ fontSize: 20 }}>Advice with a date</h2>
          {dueAdvice.map(a => <Link key={a.id} to={`/visit/${a.visitId}`} className="entry-row" style={{ textDecoration: 'none', color: 'inherit' }}><span className="grow"><strong>{a.text}</strong><span className="caption" style={{ display: 'block' }}>{isOverdue(a, today) ? `Overdue since ${fmtDate(a.dueOn!)}` : `By ${fmtDate(a.dueOn!, true)}`}</span></span></Link>)}</section>}
        {(fu.overdue.length > 0 || fu.upcoming.length > 0) && <section className="section"><h2 style={{ fontSize: 20 }}>Follow ups from care records</h2>{[...fu.overdue, ...fu.upcoming].map(c => <CareItem key={c.id} c={c} onEdit={setEditing} />)}</section>}
        <p className="caption">Sakhi does not send reminders. Check this list when you need it.</p>
      </> : none('Nothing coming up. Plan a visit to make a card for it.', <Link className="btn btn-secondary" to="/card">Plan a visit</Link>))}

      {adding && <CareForm key={'new' + adding} kind={adding} onClose={() => setAdding(null)} />}
      {editing && <CareForm key={editing.id} kind={editing.kind} existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
