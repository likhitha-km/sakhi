import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { CloseButton, Overlay } from './common.tsx';
import { entryDetails, entryTitle, howCalculated } from './entryText.ts';
import { useEvidence } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { allResults } from '../../engine/compute.ts';
import { fmtDate } from '../../engine/dates.ts';
import { setExcluded, SaveError } from '../../db/repo.ts';
import type { Entry } from '../../types/entry.ts';

export interface DrawerTarget { metricId?: string; title?: string; detail?: string; entryIds?: string[] }

export function EvidenceDrawer({ target, windowDays, onClose }: { target: DrawerTarget | null; windowDays: 28 | 56; onClose: () => void }) {
  const { bundle, entries, exclusions } = useEvidence(windowDays);
  const { announce } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const acted = useRef(false);
  const result = target?.metricId ? allResults(bundle).find(r => r.metricId === target.metricId) : undefined;
  const statement = result?.statement;

  useEffect(() => {
    if (acted.current && statement) { announce(`Updated. ${statement}`); acted.current = false; }
  }, [statement, announce]);

  if (!target) return null;
  const off = new Set(exclusions.filter(x => !x.restoredAt).map(x => x.entryId));
  const byId = new Map(entries.map(e => [e.id, e]));
  const ids = result ? [...result.includedEntryIds, ...result.excludedEntryIds] : target.entryIds ?? [];
  const rows = ids.map(id => byId.get(id)).filter((e): e is Entry => !!e)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id));
  const used = rows.filter(e => !off.has(e.id)), left = rows.filter(e => off.has(e.id));

  const toggle = async (e: Entry, exclude: boolean) => {
    setErr(null);
    try {
      acted.current = true;
      await setExcluded(e.id, exclude);
      if (!result) announce(exclude ? `Left out the entry from ${fmtDate(e.occurredOn)}.` : `Put back the entry from ${fmtDate(e.occurredOn)}.`);
    } catch (x) { acted.current = false; setErr(x instanceof SaveError ? x.message : 'That did not save. Please try again.'); }
  };

  const Row = ({ e, isOff }: { e: Entry; isOff: boolean }) => (
    <div className={`entry-row${isOff ? ' is-excluded' : ''}`}>
      <input type="checkbox" checked={!isOff} aria-label={`Use the entry from ${fmtDate(e.occurredOn)}: ${entryTitle(e)}`} onChange={() => toggle(e, !isOff)} style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--blue-700)', flex: 'none' }} />
      <div className="grow">
        <strong>{fmtDate(e.occurredOn, true)}</strong> · {entryTitle(e)}
        {entryDetails(e).map(t => <div key={t} className="caption">{t}</div>)}
        {e.note && <div className="caption">Note: “{e.note}”</div>}
        {e.origin === 'ai_confirmed' && <div className="caption"><Sparkles size={14} aria-hidden="true" /> Drafted with AI, confirmed by you{e.aiSpan ? `: “${e.aiSpan}”` : ''}</div>}
      </div>
      {isOff && <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggle(e, false)}><RotateCcw size={16} aria-hidden="true" /> Put back</button>}
    </div>
  );

  return (
    <Overlay open onClose={onClose} label="Entries behind this summary" wide>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="caption" style={{ margin: 0 }}>Entries behind this</p>
          <h2 style={{ marginBottom: 4 }}>{result?.label ?? target.title}</h2>
          {result && <p className="caption">{fmtDate(result.windowStart, true)} to {fmtDate(result.windowEnd, true)}</p>}
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {result ? <p className="observation" style={{ fontSize: 18 }}>{result.status === 'ready' ? result.statement : result.reason ?? result.statement}</p> : target.detail && <p>{target.detail}</p>}
      {result && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>How this was worked out</summary>
          <ol>{howCalculated(result.metricId).map(s => <li key={s}>{s}</li>)}</ol>
        </details>
      )}
      <p className="caption">Untick an entry to leave it out, for example if it was typed on the wrong day. Every number and your brief update straight away. Nothing is deleted, and you can put it back.</p>
      {err && <p className="error" role="alert">{err}</p>}
      <h3>Entries used ({used.length})</h3>
      {used.length ? used.map(e => <Row key={e.id} e={e} isOff={false} />) : <p className="muted">No entries are being used.</p>}
      {left.length > 0 && <>
        <h3 style={{ marginTop: 20 }}>Left out by you ({left.length})</h3>
        {left.map(e => <Row key={e.id} e={e} isOff />)}
      </>}
    </Overlay>
  );
}
