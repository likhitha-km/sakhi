import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, BookmarkCheck, ChartColumn, ListChecks, SearchCheck } from 'lucide-react';
import { db } from '../../db/db.ts';
import { getDraft, patchSettings, saveDraft } from '../../db/repo.ts';
import { emptyDraft } from '../../brief/buildBrief.ts';
import { AREA_LABEL, AREA_ORDER } from '../../engine/vocab.ts';
import { fmtDate } from '../../engine/dates.ts';
import type { EvidenceResult, SymptomEvidence } from '../../types/evidence.ts';
import type { AreaCode } from '../../types/entry.ts';
import { EmptyMotif, jumpTo, PageHeader, StatusTag } from '../components/common.tsx';
import { DayStrip, SeverityDots, ShareBars } from '../components/Charts.tsx';
import { EvidenceDrawer, type DrawerTarget } from '../components/EvidenceDrawer.tsx';
import { useChecks, useEvidence } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';

export function WindowSwitch({ value, onChange }: { value: 28 | 56; onChange: (v: 28 | 56) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Time period">
      <button type="button" aria-pressed={value === 28} onClick={() => onChange(28)}>Last 4 weeks</button>
      <button type="button" aria-pressed={value === 56} onClick={() => onChange(56)}>Last 8 weeks</button>
    </div>
  );
}

function usePins() {
  const draft = useLiveQuery(() => db.briefs.get(1), []) ?? emptyDraft();
  const { announce } = useSession();
  const toggle = async (id: string, label: string) => {
    const d = await getDraft();
    const on = d.pinned.includes(id);
    await saveDraft({ ...d, pinned: on ? d.pinned.filter(x => x !== id) : [...d.pinned, id] });
    announce(on ? `Removed "${label}" from your brief.` : `Added "${label}" to your brief.`);
  };
  return { pinned: new Set(draft.pinned), toggle };
}

function Line({ r, onView, pins, children }: { r: EvidenceResult; onView: (t: DrawerTarget) => void; pins: ReturnType<typeof usePins>; children?: React.ReactNode }) {
  const ready = r.status === 'ready';
  const [more, setMore] = useState(false);
  const n = r.includedEntryIds.length;
  return (
    <div className="line-item">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <p className="observation" style={{ margin: 0, flex: 1, minWidth: 220, fontSize: ready ? 17 : 16 }}>{r.statement}</p>
        <StatusTag ready={ready} notApplicable={r.status === 'not_applicable'} />
      </div>
      {!ready && r.reason && <p className="caption" style={{ margin: '4px 0 0' }}>{r.reason}</p>}
      {children}
      {ready && (
        <p className="caption" style={{ margin: '6px 0 0' }}>
          {r.limitationText.length > 90 && !more ? <>{r.limitationText.slice(0, 88)}… <button type="button" className="btn-link" style={{ minHeight: 0, padding: 0 }} onClick={() => setMore(true)}>More</button></> : r.limitationText}
        </p>
      )}
      <div className="row" style={{ gap: 4, marginTop: 4 }}>
        {(n > 0 || r.excludedEntryIds.length > 0) && (
          <button type="button" className="btn-link" onClick={() => onView({ metricId: r.metricId })}>
            <SearchCheck size={16} aria-hidden="true" /> View evidence ({n} {n === 1 ? 'entry' : 'entries'}{r.excludedEntryIds.length ? `, ${r.excludedEntryIds.length} left out` : ''})
          </button>
        )}
        {ready && (
          <button type="button" className="btn-link" aria-pressed={pins.pinned.has(r.metricId)} onClick={() => pins.toggle(r.metricId, r.label)}>
            {pins.pinned.has(r.metricId) ? <><BookmarkCheck size={16} aria-hidden="true" /> In my brief</> : <><BookmarkPlus size={16} aria-hidden="true" /> Add to my brief</>}
          </button>
        )}
      </div>
    </div>
  );
}

function SymptomCard({ s, peri, rp, bundle, onView, pins }: {
  s: SymptomEvidence; peri?: EvidenceResult; rp?: EvidenceResult; bundle: ReturnType<typeof useEvidence>['bundle']; onView: (t: DrawerTarget) => void; pins: ReturnType<typeof usePins>;
}) {
  const [chart, setChart] = useState(false);
  return (
    <article className="card pattern-card" aria-labelledby={'sym-' + s.key}>
      <div className="row-between">
        <h3 id={'sym-' + s.key} style={{ margin: 0 }}>{s.label}</h3>
        {s.presentDays.length > 0 && <button type="button" className="btn btn-quiet btn-sm" aria-expanded={chart} onClick={() => setChart(!chart)}><ChartColumn size={16} aria-hidden="true" /> {chart ? 'Hide chart' : 'Show chart'}</button>}
      </div>
      <p className="meta"><span>{fmtDate(s.days.windowStart)} to {fmtDate(s.days.windowEnd)}</span></p>
      {chart && <SeverityDots bundle={bundle} symptom={s} />}
      <Line r={s.days} onView={onView} pins={pins} />
      {s.presentDays.length > 0 && <Line r={s.median} onView={onView} pins={pins} />}
      {peri && <Line r={peri} onView={onView} pins={pins}>
        {peri.status === 'ready' && <ShareBars rows={[
          { label: `Days with ${s.label.toLowerCase()} that fell around a period start`, num: peri.numerator!, den: peri.denominator! },
          { label: 'All logged days that fell around a period start', num: peri.secondary!.windowObserved, den: peri.secondary!.observed, pink: true },
        ]} />}
      </Line>}
      {rp && <Line r={rp} onView={onView} pins={pins}>
        {rp.status === 'ready' && <ShareBars rows={[
          { label: 'Middle score, latest 2 weeks', num: rp.secondary!.recentMedian, den: 10 },
          { label: 'Middle score, the 2 weeks before', num: rp.secondary!.prevMedian, den: 10, pink: true },
        ]} />}
      </Line>}
    </article>
  );
}

export function Patterns() {
  const { bundle, entries, settings, loading } = useEvidence((useEvidenceWindow()));
  const windowDays = settings?.windowDays ?? 56;
  const checks = useChecks();
  const pins = usePins();
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [area, setArea] = useState<AreaCode | 'all'>('all');
  const [symptom, setSymptom] = useState<string>('all');
  const { hash } = useLocation();
  useEffect(() => { if (hash === '#check' && !loading) setTimeout(() => jumpTo('check'), 50); }, [hash, loading]);

  if (loading) return <p role="status">Loading…</p>;
  const setWindow = (v: 28 | 56) => void patchSettings({ windowDays: v });

  if (!entries.length) return (
    <>
      <PageHeader title="What your records show" />
      <div className="card-quiet"><EmptyMotif kind="patterns" /><h2>Nothing to show yet</h2><p>Summaries appear here after your first entries.</p><Link className="btn btn-primary" to="/log">Log symptoms</Link></div>
    </>
  );

  const symptoms = bundle.symptoms.filter(s => (area === 'all' || s.area === area) && (symptom === 'all' || s.key === symptom));
  const areas = AREA_ORDER.filter(a => bundle.symptoms.some(s => s.area === a));
  const showOthers = area === 'all' && symptom === 'all';

  return (
    <>
      <PageHeader title="What your records show" intro="These are counts and summaries of what you recorded. They are not a diagnosis.">
        <WindowSwitch value={windowDays} onChange={setWindow} />
      </PageHeader>

      {checks.length > 0 && (
        <section className="card section" id="check" aria-labelledby="check-h" style={{ borderColor: 'var(--pink-700)' }}>
          <h2 id="check-h" style={{ fontSize: 20 }}><ListChecks size={20} aria-hidden="true" /> Check my entries ({checks.length})</h2>
          <p className="caption">A few entries may be worth a second look before they change your numbers. Nothing is changed unless you choose.</p>
          {checks.map(c => (
            <div key={c.id} className="line-item">
              <strong>{c.title}</strong>
              <p style={{ margin: '2px 0' }}>{c.detail}</p>
              {c.entryIds.length > 0 && <button type="button" className="btn-link" onClick={() => setTarget({ title: c.title, detail: c.detail, entryIds: c.entryIds })}>Look at {c.entryIds.length === 1 ? 'this entry' : 'these entries'}</button>}
              {c.careIds.length > 0 && <Link to="/journal/care">Open care records</Link>}
            </div>
          ))}
        </section>
      )}

      <section className="card section pattern-card" aria-labelledby="cov-h">
        <div className="row-between"><h2 id="cov-h" style={{ fontSize: 20, margin: 0 }}>Days with an entry</h2><StatusTag ready /></div>
        <p className="meta">{fmtDate(bundle.window.start, true)} to {fmtDate(bundle.window.end, true)}</p>
        <p className="observation">{bundle.coverage.statement}</p>
        <DayStrip bundle={bundle} days={windowDays} />
        <p className="caption">{bundle.coverage.limitationText}</p>
        {bundle.excludedInWindow.length > 0 && <p className="caption">You have left out {bundle.excludedInWindow.length} {bundle.excludedInWindow.length === 1 ? 'entry' : 'entries'} in this period.</p>}
        <Link to="/log" className="btn btn-secondary btn-sm">Keep logging</Link>
      </section>

      <div className="row section" role="group" aria-label="Filters">
        <label className="row caption" style={{ gap: 6 }}>Area
          <select className="select" style={{ width: 'auto' }} value={area} onChange={e => { setArea(e.target.value as AreaCode | 'all'); setSymptom('all'); }}>
            <option value="all">All areas</option>
            {areas.map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
        </label>
        <label className="row caption" style={{ gap: 6 }}>Symptom
          <select className="select" style={{ width: 'auto' }} value={symptom} onChange={e => setSymptom(e.target.value)}>
            <option value="all">All symptoms</option>
            {bundle.symptoms.filter(s => area === 'all' || s.area === area).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {AREA_ORDER.map(a => {
        const list = symptoms.filter(s => s.area === a);
        if (!list.length) return null;
        return (
          <section key={a} className="section" aria-labelledby={'area-' + a}>
            <h2 id={'area-' + a}>{AREA_LABEL[a]}</h2>
            <div className="stack">
              {list.map(s => (
                <SymptomCard key={s.key} s={s} bundle={bundle} onView={setTarget} pins={pins}
                  peri={bundle.perimenstrual.find(r => r.metricId === 'perimenstrual:' + s.key)}
                  rp={bundle.recentPrev.find(r => r.metricId === 'recent_prev:' + s.key)} />
              ))}
            </div>
          </section>
        );
      })}
      {symptoms.length === 0 && <p className="muted section">No symptoms recorded in this period.</p>}

      {showOthers && (
        <>
          {bundle.impact.length > 0 && (
            <section className="card section pattern-card" aria-labelledby="imp-h">
              <h2 id="imp-h" style={{ fontSize: 20 }}>Effect on daily life</h2>
              {bundle.impact.map(r => <Line key={r.metricId} r={r} onView={setTarget} pins={pins} />)}
            </section>
          )}
          <section className="card section pattern-card" aria-labelledby="bl-h">
            <h2 id="bl-h" style={{ fontSize: 20 }}>Periods and bleeding</h2>
            <Line r={bundle.bleeding} onView={setTarget} pins={pins} />
            <Line r={bundle.intervals} onView={setTarget} pins={pins} />
          </section>
          <section className="card section pattern-card" aria-labelledby="ov-h">
            <h2 id="ov-h" style={{ fontSize: 20 }}>Symptoms on the same day</h2>
            {bundle.overlap.length
              ? bundle.overlap.map(r => <Line key={r.metricId} r={r} onView={setTarget} pins={pins} />)
              : <p className="muted">Not enough shared days yet. Two symptoms each need at least 3 days, and at least 3 days together.</p>}
          </section>
        </>
      )}

      <EvidenceDrawer target={target} windowDays={windowDays} onClose={() => setTarget(null)} />
    </>
  );
}

function useEvidenceWindow(): 28 | 56 {
  const s = useLiveQuery(() => db.settings.get(1), []);
  return s?.windowDays ?? 56;
}
