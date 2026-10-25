import { useState } from 'react';
import { Check } from 'lucide-react';
import type { EvidenceBundle, SymptomEvidence } from '../../types/evidence.ts';
import { dateRange, fmtDate, fmtWeekday } from '../../engine/dates.ts';

function TableToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return <button type="button" className="btn-link" aria-expanded={shown} onClick={onToggle}>{shown ? 'Hide table' : 'View as table'}</button>;
}

const tint = (s: number) => (s >= 7 ? 't3' : s >= 4 ? 't2' : 't1');

/** One cell per day. Days with no entry stay empty, never zero. */
export function DayStrip({ bundle, days = 28 }: { bundle: EvidenceBundle; days?: number }) {
  const [table, setTable] = useState(false);
  const end = bundle.window.end;
  const dates = dateRange(bundle.window.start, end).slice(-days);
  const observed = new Set(bundle.observedDates);
  const checkins = new Set(bundle.checkinDates);
  const highest: Record<string, { s: number; label: string }> = {};
  for (const s of bundle.symptoms) for (const d of s.presentDays) {
    const v = s.dailySeverity[d];
    if (!highest[d] || v > highest[d].s) highest[d] = { s: v, label: s.label };
  }
  const describe = (d: string) =>
    !observed.has(d) ? 'Not logged' : highest[d] ? `Highest score ${highest[d].s} (${highest[d].label})` : checkins.has(d) ? 'Nothing to report' : 'Logged, no symptom score above 0';
  const logged = dates.filter(d => observed.has(d)).length;

  return (
    <div className="draw-in">
      <div className="daystrip" role="img" aria-label={`${logged} of ${dates.length} days from ${fmtDate(dates[0])} to ${fmtDate(end)} have an entry. Use the table for each day.`}>
        {dates.map(d => {
          const h = highest[d];
          const cls = !observed.has(d) ? 'missing' : h ? tint(h.s) : checkins.has(d) ? 'checkin' : 'logged';
          return (
            <div key={d} className={`daycell ${cls}`} title={`${fmtDate(d)}: ${describe(d)}`}>
              {h ? h.s : cls === 'checkin' ? <Check size={14} aria-hidden="true" /> : cls === 'logged' ? '·' : ''}
            </div>
          );
        })}
      </div>
      <div className="legend" aria-hidden="true">
        <span><i style={{ borderStyle: 'dashed', borderColor: 'var(--ink-600)' }} /> Not logged</span>
        <span><i style={{ background: 'var(--white)' }} /> Nothing to report (tick)</span>
        <span><i style={{ background: 'var(--blue-100)' }} /> Number = highest score that day</span>
        <span className="caption">{fmtDate(dates[0])} to {fmtDate(end)}</span>
      </div>
      <TableToggle shown={table} onToggle={() => setTable(!table)} />
      {table && (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Each day and what was logged</caption>
            <thead><tr><th scope="col">Day</th><th scope="col">What was logged</th></tr></thead>
            <tbody>{[...dates].reverse().map(d => <tr key={d}><td>{fmtWeekday(d)} {fmtDate(d)}</td><td>{describe(d)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A dot for each day with the symptom. Logged days without it sit as small rings on the baseline. Missing days draw nothing. */
export function SeverityDots({ bundle, symptom }: { bundle: EvidenceBundle; symptom: SymptomEvidence }) {
  const [table, setTable] = useState(false);
  const dates = dateRange(bundle.window.start, bundle.window.end);
  const W = Math.max(dates.length * 12, 200), H = 120, top = 10, base = 96;
  const x = (i: number) => 24 + i * ((W - 32) / Math.max(dates.length - 1, 1));
  const y = (s: number) => base - (s / 10) * (base - top);
  const observed = new Set(bundle.observedDates);
  return (
    <div className="draw-in">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img"
        aria-label={`${symptom.label}: a dot for each of ${symptom.presentDays.length} days with a score. Use the table to read each value.`}>
        {[0, 5, 10].map(v => (
          <g key={v}>
            <line x1="22" x2={W - 4} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x="2" y={y(v) + 4} fontSize="11" fill="var(--ink-600)">{v}</text>
          </g>
        ))}
        {dates.map((d, i) => {
          if (!observed.has(d)) return null;
          const s = symptom.dailySeverity[d];
          if (s && s >= 1) return <circle key={d} cx={x(i)} cy={y(s)} r="5" fill="var(--blue-700)"><title>{`${fmtDate(d)}: ${s} of 10`}</title></circle>;
          return <circle key={d} cx={x(i)} cy={base} r="3" fill="none" stroke="var(--ink-600)"><title>{`${fmtDate(d)}: logged, not recorded`}</title></circle>;
        })}
        <text x="24" y={H - 4} fontSize="11" fill="var(--ink-600)">{fmtDate(dates[0])}</text>
        <text x={W - 4} y={H - 4} fontSize="11" fill="var(--ink-600)" textAnchor="end">{fmtDate(dates[dates.length - 1])}</text>
      </svg>
      <div className="legend" aria-hidden="true">
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--blue-700)" /></svg> Score that day</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="3" fill="none" stroke="var(--ink-600)" /></svg> Logged, not recorded</span>
        <span>No mark: not logged</span>
      </div>
      <TableToggle shown={table} onToggle={() => setTable(!table)} />
      {table && (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">{symptom.label} scores by day</caption>
            <thead><tr><th scope="col">Day</th><th scope="col">Score out of 10</th></tr></thead>
            <tbody>{symptom.presentDays.map(d => <tr key={d}><td>{fmtDate(d)}</td><td>{symptom.dailySeverity[d]}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ShareBars({ rows }: { rows: { label: string; num: number; den: number; pink?: boolean }[] }) {
  return (
    <div className="stack draw-in" style={{ marginTop: 8 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div className="row-between caption"><span>{r.label}</span><strong style={{ color: 'var(--ink-900)' }}>{r.num} of {r.den}</strong></div>
          <div className="bar-track" aria-hidden="true"><div className={`bar-fill${r.pink ? ' pink' : ''}`} style={{ width: `${r.den ? (100 * r.num) / r.den : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
