import { useEffect, useMemo, useState } from 'react';
import { Printer, Sparkles, TriangleAlert } from 'lucide-react';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { addDays, fmtDate, todayLocal } from '../../engine/dates.ts';
import { buildReport, earliestDate, REPORT_SECTIONS, reportTextForAi, restoreNames, type ReportModel, type ReportSection } from '../../report/buildReport.ts';
import type { LoopState } from '../../loop/loop.ts';
import { AI_ENABLED, helperAvailable, summariseReport } from '../../ai/client.ts';
import { PageHeader } from '../components/common.tsx';

const RANGES = [
  { key: 'all', label: 'Everything so far' }, { key: '90', label: 'Last 3 months' }, { key: '30', label: 'Last 30 days' }, { key: 'custom', label: 'Choose dates' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];
const CONSENT_KEY = 'sakhi.summaryConsent';

function ReportView({ m, on, summary, name }: { m: ReportModel; on: (k: ReportSection) => boolean; summary: string | null; name: string | null }) {
  return (
    <>
      <header className="report-head">
        <h1>My health record</h1>
        <p>{name ? `${name} · ` : ''}{fmtDate(m.from, true)} to {fmtDate(m.to, true)} · Prepared on {fmtDate(todayLocal(), true)}</p>
        <p className="report-flag">Patient reported information. Not a diagnosis.</p>
      </header>
      {summary && <section className="report-summary"><h2>Summary</h2><p>{summary}</p><p className="caption-card">Written by an AI helper from my records, then checked by me. The sections below are the records themselves.</p></section>}
      {on('overview') && <section><h2>Overview</h2>
        <dl className="report-facts">
          <div><dt>Days with an entry</dt><dd>{m.daysWithEntry} <span>of {m.totalDays}</span></dd></div>
          <div><dt>Visits recorded</dt><dd>{m.visits.length}</dd></div>
          <div><dt>Advice done</dt><dd>{m.advice.done} <span>of {m.advice.done + m.advice.notStarted + m.advice.skipped + m.advice.unsure}</span></dd></div>
          <div><dt>Past its date</dt><dd>{m.advice.overdue}</dd></div>
        </dl>
        <p className="caption-card">Counts only include the days I logged. Days without an entry are left out, not counted as days without symptoms.</p></section>}
      {on('symptoms') && <><h2>Symptoms</h2>
        {m.symptoms.length ? <div className="table-wrap"><table><thead><tr><th>Symptom</th><th>Days it appeared</th><th>Days it limited me</th><th>First</th><th>Last</th></tr></thead>
          <tbody>{m.symptoms.map(s => <tr key={s.label}><td>{s.label}</td><td>{s.days}</td><td>{s.limited}</td><td>{fmtDate(s.first)}</td><td>{fmtDate(s.last)}</td></tr>)}</tbody></table></div>
          : <p>No symptoms recorded in this time.</p>}</>}
      {on('effects') && m.effects.length > 0 && <><h2>Effect on daily life</h2><ul>{m.effects.map(e => <li key={e.label}>{e.label}: {e.days} {e.days === 1 ? 'day' : 'days'}</li>)}</ul></>}
      {on('bleeding') && m.bleeding.days > 0 && <><h2>Bleeding</h2><p>Bleeding on {m.bleeding.days} days. At least one heavier sign on {m.bleeding.heavierDays} of them.</p></>}
      {on('visits') && <><h2>Visits and advice</h2>
        {m.visits.length ? m.visits.map(v => (
          <div key={v.id} className="report-visit">
            <h3>{v.who} <span>{fmtDate(v.on, true)} · {v.systems}</span></h3>
            {v.note && <p className="report-note">{v.note}</p>}
            {v.advice.length > 0 && <div className="table-wrap"><table className="report-advice"><thead><tr><th>Advice</th><th>Status</th></tr></thead>
              <tbody>{v.advice.map((a, i) => <tr key={i}><td>{a.text}<span>{a.kind}</span></td><td>{a.status}{a.extra ? <span>{a.extra}</span> : null}</td></tr>)}</tbody></table></div>}
            {v.concerns.length > 0 && <ul className="report-asked">{v.concerns.map((c, i) => <li key={i}>I asked: {c.text} <span>({c.addressed ? 'answered' : 'not answered'})</span></li>)}</ul>}
          </div>
        )) : <p>No visits recorded in this time.</p>}</>}
      {on('take') && <><h2>What I take and who I have told</h2>
        {m.take.length ? <div className="table-wrap"><table><thead><tr><th>What</th><th>Type of care</th><th>Dates</th><th>Marked as told to</th><th>Not marked as told</th></tr></thead>
          <tbody>{m.take.map((t, i) => <tr key={i}><td>{t.title}{t.advisedBy ? ` (from ${t.advisedBy})` : ''}</td><td>{t.systems}</td><td>{fmtDate(t.since)}{t.until ? ` to ${fmtDate(t.until)}` : ', still taking'}</td><td>{t.toldTo.join(', ') || 'No one'}</td><td>{t.notMarkedFor.join(', ') || 'None'}</td></tr>)}</tbody></table></div>
          : <p>Nothing recorded.</p>}
        <p className="caption-card">This shows what I recorded, not what any clinician knows.</p></>}
      {on('concerns') && <><h2>Questions not yet answered</h2>
        {m.openConcerns.length ? <ul>{m.openConcerns.map((c, i) => <li key={i}>{c.text}{c.on ? ` (raised with ${c.raisedWith} on ${fmtDate(c.on)})` : ''}</li>)}</ul> : <p>None.</p>}</>}
      {on('tests') && <><h2>Tests done</h2>
        {m.tests.length ? <ul>{m.tests.map((t, i) => <li key={i}>{t.title}{t.on ? `, ${fmtDate(t.on, true)}` : ''}{t.note ? `. My note about the result, not a clinician's reading: ${t.note}` : ''}</li>)}</ul> : <p>No tests recorded as done.</p>}</>}
      <footer className="report-foot">Prepared with Sakhi on {fmtDate(todayLocal(), true)}. This report shows what I recorded. It is not a diagnosis.</footer>
    </>
  );
}

export function Report() {
  const d = useAppData();
  const { user, announce } = useSession();
  const today = todayLocal();
  const state: LoopState = { providers: d.providers, visits: d.visits, advice: d.advice, concerns: d.concerns, disclosures: d.disclosures, care: d.care, nextVisits: d.nextVisits, entries: d.entries, exclusions: d.exclusions, profile: d.profile };
  const first = earliestDate(state);
  const [range, setRange] = useState<RangeKey>('all');
  const [cFrom, setCFrom] = useState(addDays(today, -30));
  const [cTo, setCTo] = useState(today);
  const [sections, setSections] = useState<Record<ReportSection, boolean>>(() => Object.fromEntries(REPORT_SECTIONS.map(s => [s.key, true])) as Record<ReportSection, boolean>);
  const [showName, setShowName] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [consent, setConsent] = useState(() => { try { return sessionStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [include, setInclude] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  useEffect(() => { let live = true; if (AI_ENABLED) void helperAvailable().then(ok => live && setAiReady(ok)); return () => { live = false; }; }, []);

  const from = range === 'all' ? first : range === 'custom' ? (cFrom <= cTo ? cFrom : cTo) : addDays(today, -(Number(range) - 1));
  const to = range === 'custom' ? (cFrom <= cTo ? cTo : cFrom) : today;
  const m = useMemo(() => buildReport(state, from, to, today), [d.entries, d.exclusions, d.visits, d.advice, d.concerns, d.care, d.disclosures, d.providers, d.nextVisits, from, to]); // eslint-disable-line
  const aiText = reportTextForAi(m);
  // A summary belongs to the records it was written from. Changing the range discards it.
  useEffect(() => { setDraft(null); setInclude(false); }, [from, to]);

  if (d.loading) return <p role="status">Loading…</p>;
  const setC = (v: boolean) => { setConsent(v); try { if (v) sessionStorage.setItem(CONSENT_KEY, 'yes'); else sessionStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ } };
  const summarise = async () => {
    setBusy(true); setAiErr(null); setDraft(null); setInclude(false);
    const r = await summariseReport(aiText, today);
    setBusy(false);
    if (r.ok) { setDraft(restoreNames(m, r.summary)); announce('Summary ready. Read it before adding it to your report.'); }
    else setAiErr(r.why === 'unavailable' ? 'The summary could not be made right now. Your report works without it.' : 'The summary did not pass Sakhi\'s checks (it may have used medical wording or a number not in your records), so it was not shown. You can try again.');
  };

  return (
    <>
      <PageHeader title="My report" intro="Your whole record in one place: symptoms, visits and what happened to the advice, what you take and who you have told. For one appointment, the Consult Card is shorter." />

      <section className="report-bar no-print" aria-label="Report settings">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="rp-range">Time period</label>
          <select id="rp-range" className="select" value={range} onChange={e => setRange(e.target.value as RangeKey)}>
            {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        {range === 'custom' && <>
          <div className="field" style={{ margin: 0 }}><label htmlFor="rp-from">From</label><input id="rp-from" className="input" type="date" max={today} value={cFrom} onChange={e => setCFrom(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="rp-to">To</label><input id="rp-to" className="input" type="date" max={today} value={cTo} onChange={e => setCTo(e.target.value)} /></div>
        </>}
        <span className="caption report-range">{fmtDate(from, true)} to {fmtDate(to, true)}</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={18} aria-hidden="true" /> Save as PDF or print</button>
      </section>

      <div className="report-options no-print">
        <details className="adjust">
          <summary>Choose what to include{REPORT_SECTIONS.some(x => !sections[x.key]) ? ` (${REPORT_SECTIONS.filter(x => !sections[x.key]).length} hidden)` : ''}</summary>
          <div className="adjust-body">
            <div className="toggle-grid">
              {REPORT_SECTIONS.map(x => <label key={x.key} className="switch"><input type="checkbox" checked={sections[x.key]} onChange={e => setSections({ ...sections, [x.key]: e.target.checked })} /> {x.label}</label>)}
              {user && !user.sample && <label className="switch"><input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} /> Put my name on it</label>}
            </div>
            <p className="caption">Anything switched off is left out of the saved or printed report.</p>
          </div>
        </details>

        {AI_ENABLED && aiReady && (
          <details className="adjust" open={consent || draft !== null}>
            <summary><Sparkles size={16} aria-hidden="true" /> Add a short summary written with AI (optional){include && draft ? ' · added' : ''}</summary>
            <div className="adjust-body">
              <p className="caption">An AI helper can write a few plain sentences for the top of your report. It only restates your records and never diagnoses or advises.</p>
              <label className="switch">
                <input type="checkbox" checked={consent} onChange={e => setC(e.target.checked)} />
                <span>Allow AI to read my report. <span className="caption">A text version of this report is sent to an online AI service. Clinician names become "Clinician A", "Clinician B", and your name is not sent. Nothing is added unless you choose.</span></span>
              </label>
              {consent && <>
                <details style={{ margin: '8px 0' }}><summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>See exactly what will be sent</summary><pre className="ai-preview">{aiText}</pre></details>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={summarise}>{busy ? 'Writing…' : draft ? 'Write it again' : 'Write a summary'}</button>
              </>}
              {aiErr && <p className="error" role="status" style={{ marginTop: 8 }}><TriangleAlert size={14} aria-hidden="true" /> {aiErr}</p>}
              {draft !== null && <div style={{ marginTop: 12 }}>
                <label htmlFor="sum-text" className="label">Read and edit before adding it</label>
                <textarea id="sum-text" className="textarea" style={{ minHeight: 140 }} maxLength={900} value={draft} onChange={e => setDraft(e.target.value)} />
                <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={include} onChange={e => setInclude(e.target.checked)} /> I have checked this summary. Add it to my report.</label>
                <button type="button" className="btn-link" onClick={() => { setDraft(null); setInclude(false); }}>Discard summary</button>
              </div>}
            </div>
          </details>
        )}
        <p className="caption">A saved or printed file leaves Sakhi's protection. Share it only with people you trust. In the print window, choose "Save as PDF" to keep a copy.</p>
      </div>

      <article className="report-doc" aria-label="Report">
        <ReportView m={m} on={k => sections[k]} summary={include && draft?.trim() ? draft.trim() : null} name={showName && user && !user.sample ? user.name : null} />
      </article>
    </>
  );
}
