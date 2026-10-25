import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../hooks/data.ts';
import { addDays, daysBetween, fmtDate, todayLocal } from '../../engine/dates.ts';
import { computeEvidence } from '../../engine/compute.ts';
import { providerShort, sinceSummary } from '../../visits/logic.ts';
import { DayStrip } from '../components/Charts.tsx';
import { EmptyMotif, PageHeader } from '../components/common.tsx';
import { entryTitle } from '../components/entryText.ts';
import { useTrace, type TraceRow } from '../components/visitBits.tsx';

export function Since() {
  const { entries, exclusions, profile, visits, providers } = useAppData();
  const today = todayLocal();
  const sorted = [...visits].filter(v => v.on <= today).sort((a, b) => b.on.localeCompare(a.on));
  const [from, setFrom] = useState<string>(sorted[0]?.on ?? addDays(today, -27));
  const s = useMemo(() => sinceSummary(entries, exclusions, from, today), [entries, exclusions, from, today]);
  const span = daysBetween(from, today) + 1;
  const bundle = useMemo(() => computeEvidence({ entries, exclusions, profile, windowDays: 56, endDate: today }), [entries, exclusions, profile, today]);
  const { openTrace, sheet } = useTrace();
  const byId = new Map(entries.map(e => [e.id, e]));
  const rows = (ids: string[]): TraceRow[] => ids.map(id => byId.get(id)!).filter(Boolean).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    .map(e => ({ key: e.id, title: `${fmtDate(e.occurredOn, true)} · ${entryTitle(e)}` }));
  const N = ({ n, title, ids }: { n: number; title: string; ids: string[] }) =>
    <button type="button" className="num" onClick={() => openTrace(title, rows(ids))} aria-label={`${n}: ${title}. Show the entries`}>{n}</button>;

  return (
    <>
      <PageHeader title="Since last visit" intro="Counts of what you recorded. Days you did not log are left out, not counted as days without symptoms." />
      <div className="field" style={{ maxWidth: 460 }}>
        <label htmlFor="since-from">Count from</label>
        <select id="since-from" className="select" value={from} onChange={e => setFrom(e.target.value)}>
          {sorted.map(v => <option key={v.id} value={v.on}>My visit to {providerShort(providers.find(p => p.id === v.providerId))} on {fmtDate(v.on, true)}</option>)}
          <option value={addDays(today, -27)}>The last 4 weeks</option>
        </select>
      </div>
      {!entries.length ? (
        <div className="card-quiet"><EmptyMotif /><p>No symptom entries yet. <Link to="/log">Log symptoms</Link></p></div>
      ) : <>
        <section className="card section" aria-labelledby="tot-h">
          <h2 id="tot-h" style={{ fontSize: 20 }}>{fmtDate(s.from, true)} to {fmtDate(s.to, true)}</h2>
          <p className="observation" style={{ fontSize: 18 }}><N n={s.daysWithEntry.length} title="Days with an entry" ids={s.entryIds} /> of {s.totalDays} days have an entry. {s.daysWithout.length} {s.daysWithout.length === 1 ? 'day has' : 'days have'} none.</p>
          {span <= 56 && <DayStrip bundle={bundle} days={span} />}
        </section>
        <section className="card section" aria-labelledby="sym-h">
          <h2 id="sym-h" style={{ fontSize: 20 }}>Symptoms</h2>
          {s.rows.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">Symptom</th><th scope="col">Days it appeared</th><th scope="col">Days it limited me</th></tr></thead>
              <tbody>{s.rows.map(r => (
                <tr key={r.key}><td>{r.label}</td>
                  <td><N n={r.days.length} title={`${r.label}: days it appeared`} ids={r.entryIds} /></td>
                  <td>{r.limitedDays.length ? <N n={r.limitedDays.length} title={`${r.label}: days it limited me`} ids={r.limitedEntryIds} /> : '0'}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="muted">No symptoms recorded in this time.</p>}
          <p className="caption">"Limited me" means you ticked an effect on your day, such as missing work or study, on that entry.</p>
        </section>
      </>}
      {sheet}
    </>
  );
}
