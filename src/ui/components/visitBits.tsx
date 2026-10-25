import { useState } from 'react';
import { CircleCheck, CircleDashed, CircleHelp, CircleSlash, Clock, TriangleAlert } from 'lucide-react';
import type { AdviceItem, AdviceKind, AdviceStatus, DisclosureStatus, FacilityKind, Provider, ProviderRole, SystemOfMedicine } from '../../types/care.ts';
import { FACILITY_LABEL, ROLE_LABEL, SYSTEMS, SYSTEM_LABEL } from '../../brief/careViews.ts';
import { fmtDate, todayLocal } from '../../engine/dates.ts';
import { isOverdue, providerShort } from '../../visits/logic.ts';
import { CloseButton, Overlay } from './common.tsx';

export const ADVICE_KIND_LABEL: Record<AdviceKind, string> = {
  test: 'Test', medicine: 'Medicine or remedy', follow_up: 'Follow up', lifestyle: 'Food, exercise or habits', referral: 'See someone else', other: 'Other',
};
export const ADVICE_STATUS_LABEL: Record<AdviceStatus, string> = { not_started: 'Not started', done: 'Done', skipped: 'Skipped', unsure: 'Not sure' };
const STATUS_ICON = { not_started: CircleDashed, done: CircleCheck, skipped: CircleSlash, unsure: CircleHelp };

export function AdviceStatusControl({ item, onChange }: { item: AdviceItem; onChange: (s: AdviceStatus) => void }) {
  return (
    <fieldset className="choice-row">
      <legend className="visually-hidden">Status of {item.text}</legend>
      {(Object.keys(ADVICE_STATUS_LABEL) as AdviceStatus[]).map(s => {
        const Icon = STATUS_ICON[s];
        return (
          <label key={s} className="choice">
            <input type="radio" name={'st-' + item.id} checked={item.status === s} onChange={() => onChange(s)} />
            <Icon size={16} aria-hidden="true" /> {ADVICE_STATUS_LABEL[s]}
          </label>
        );
      })}
    </fieldset>
  );
}

export function OverdueTag({ item }: { item: AdviceItem }) {
  if (isOverdue(item, todayLocal())) return <span className="tag tag-alert"><TriangleAlert size={14} aria-hidden="true" /> Overdue since {fmtDate(item.dueOn!)}</span>;
  if (item.dueOn) return <span className="tag"><Clock size={14} aria-hidden="true" /> Due {fmtDate(item.dueOn, true)}</span>;
  return null;
}

export function SystemsPicker({ value, onChange, legend, error }: { value: SystemOfMedicine[]; onChange: (v: SystemOfMedicine[]) => void; legend: string; error?: string | null }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="check-list">
        {SYSTEMS.map(s => (
          <label key={s} className="check">
            <input type="checkbox" checked={value.includes(s)} onChange={e => onChange(e.target.checked ? [...value, s] : value.filter(x => x !== s))} /> {SYSTEM_LABEL[s]}
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </fieldset>
  );
}

export interface NewProvider { name: string; facilityName: string; facilityKind: FacilityKind; role: ProviderRole }

/** Pick a clinician already recorded, or describe a new one. */
export function ProviderPicker({ providers, value, onChange, fresh, onFresh, error, label = 'Who did you see?' }: {
  providers: Provider[]; value: string; onChange: (id: string) => void; fresh: NewProvider; onFresh: (p: NewProvider) => void; error?: string | null; label?: string;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="pp-select" className="visually-hidden">{label}</label>
        <select id="pp-select" className="select" value={value} onChange={e => onChange(e.target.value)} aria-describedby="pp-err">
          <option value="">Choose…</option>
          {providers.map(p => <option key={p.id} value={p.id}>{providerShort(p)}{p.facilityName && p.name ? `, ${p.facilityName}` : ''}</option>)}
          <option value="new">Someone new</option>
        </select>
        {error && <p id="pp-err" className="error">{error}</p>}
      </div>
      {value === 'new' && (
        <div className="grid-2">
          <div className="field"><label htmlFor="pp-name">Name <span className="caption">(optional)</span></label><input id="pp-name" className="input" value={fresh.name} onChange={e => onFresh({ ...fresh, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="pp-fac">Hospital, clinic or place <span className="caption">(optional)</span></label><input id="pp-fac" className="input" value={fresh.facilityName} onChange={e => onFresh({ ...fresh, facilityName: e.target.value })} /></div>
          <div className="field"><label htmlFor="pp-kind">Kind of place</label>
            <select id="pp-kind" className="select" value={fresh.facilityKind} onChange={e => onFresh({ ...fresh, facilityKind: e.target.value as FacilityKind })}>{Object.entries(FACILITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="pp-role">Their role</label>
            <select id="pp-role" className="select" value={fresh.role} onChange={e => onFresh({ ...fresh, role: e.target.value as ProviderRole })}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
      )}
    </fieldset>
  );
}

const DISC: { s: DisclosureStatus; label: string; Icon: typeof CircleCheck }[] = [
  { s: 'told', label: 'Told', Icon: CircleCheck }, { s: 'not_told', label: 'Not marked as told', Icon: CircleDashed }, { s: 'unsure', label: 'Not sure', Icon: CircleHelp },
];
export function DisclosureControl({ value, onChange, name, label }: { value: DisclosureStatus; onChange: (s: DisclosureStatus) => void; name: string; label: string }) {
  return (
    <fieldset className="choice-row disc">
      <legend className="visually-hidden">{label}</legend>
      {DISC.map(({ s, label: l, Icon }) => (
        <label key={s} className={`choice disc-${s}`}>
          <input type="radio" name={name} checked={value === s} onChange={() => onChange(s)} />
          <Icon size={15} aria-hidden="true" /> {l}
        </label>
      ))}
    </fieldset>
  );
}

export interface TraceRow { key: string; title: string; detail?: string }

/** A read only list of the records behind a number. */
export function TraceSheet({ open, title, rows, onClose }: { open: boolean; title: string; rows: TraceRow[]; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} label={title}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div><p className="caption" style={{ margin: 0 }}>Records behind this</p><h2>{title}</h2></div>
        <CloseButton onClick={onClose} />
      </div>
      <p className="caption">{rows.length} {rows.length === 1 ? 'record' : 'records'}</p>
      {rows.length ? rows.map(r => (
        <div key={r.key} className="entry-row"><div className="grow"><strong>{r.title}</strong>{r.detail && <div className="caption">{r.detail}</div>}</div></div>
      )) : <p className="muted">Nothing recorded.</p>}
    </Overlay>
  );
}

export function useTrace() {
  const [t, setT] = useState<{ title: string; rows: TraceRow[] } | null>(null);
  return { trace: t, openTrace: (title: string, rows: TraceRow[]) => setT({ title, rows }), sheet: <TraceSheet open={!!t} title={t?.title ?? ''} rows={t?.rows ?? []} onClose={() => setT(null)} /> };
}
