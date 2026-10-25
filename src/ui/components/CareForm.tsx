import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Paperclip, Trash2 } from 'lucide-react';
import { db } from '../../db/db.ts';
import { addAttachment, deleteCare, findOrCreateProvider, saveCare, SaveError, uid } from '../../db/repo.ts';
import type { Attachment, CareEvent, CareKind, FacilityKind, Provider, ProviderRole, SystemOfMedicine } from '../../types/care.ts';
import { CARE_KIND_LABEL, FACILITY_LABEL, ROLE_LABEL, STOPPED_LABEL, SYSTEMS, SYSTEM_LABEL } from '../../brief/careViews.ts';
import { todayLocal } from '../../engine/dates.ts';
import { CloseButton, FieldError, Overlay } from './common.tsx';
import { useSession } from '../hooks/session.tsx';
import { useAppData } from '../hooks/data.ts';

export function openAttachment(id: string) {
  void db.attachments.get(id).then(a => {
    if (!a) return;
    const url = URL.createObjectURL(a.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

// Deferred for now: attachments are kept in code, hidden from the form.
const SHOW_ATTACHMENTS = false;

const TITLE_HINT: Record<CareKind, string> = {
  visit: 'For example: OPD visit, follow up, online consultation',
  test: 'For example: Haemoglobin, blood sugar at home, ultrasound',
  treatment: 'For example: Iron tablets, herbal powder, yoga, hot water bag',
};

export function CareForm({ kind, existing, onClose }: { kind: CareKind | null; existing?: CareEvent | null; onClose: () => void }) {
  const { settings } = useAppData();
  const { announce } = useSession();
  const providers = useLiveQuery(() => db.providers.toArray(), []) ?? [];
  const k = existing?.kind ?? kind;
  const blank = (): CareEvent => ({ id: uid(), kind: k ?? 'visit', date: todayLocal(), title: '', systems: [], attachmentIds: [], hideFromBrief: false, origin: settings?.syntheticLoaded ? 'synthetic' : 'user' });
  const [c, setC] = useState<CareEvent>(existing ?? blank());
  const prov = providers.find(p => p.id === c.providerId);
  const [pName, setPName] = useState(prov?.name ?? '');
  const [pFacility, setPFacility] = useState(prov?.facilityName ?? '');
  const [pKind, setPKind] = useState<FacilityKind>(prov?.facilityKind ?? 'other');
  const [pRole, setPRole] = useState<ProviderRole>(prov?.role ?? 'other');
  const [files, setFiles] = useState<string[]>(existing?.attachmentIds ?? []);
  const attachments = useLiveQuery(async (): Promise<(Attachment | undefined)[]> => (files.length ? db.attachments.bulkGet(files) : []), [files.join()]) ?? [];
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!existing) return;
    const p = providers.find(x => x.id === existing.providerId);
    if (p) { setPName(p.name ?? ''); setPFacility(p.facilityName ?? ''); setPKind(p.facilityKind); setPRole(p.role); }
  }, [existing, providers.length]);

  if (!k) return null;
  const set = (p: Partial<CareEvent>) => setC(x => ({ ...x, ...p }));

  const onFile = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const ids: string[] = [];
      for (const f of Array.from(list)) ids.push(await addAttachment(f));
      setFiles(fs => [...fs, ...ids]);
      setErr(e => ({ ...e, file: '' }));
      announce(`${ids.length} ${ids.length === 1 ? 'file' : 'files'} added.`);
    } catch (x) { setErr(e => ({ ...e, file: x instanceof SaveError ? x.message : 'That file could not be added.' })); }
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!c.title.trim()) errs.title = 'Give this a short name.';
    if (!c.systems.length) errs.systems = 'Choose at least one type of care.';
    if (!c.date || c.date > todayLocal()) errs.date = 'Choose today or an earlier day.';
    if (c.endDate && c.endDate < c.date) errs.end = 'The end date is before the start date.';
    setErr(errs);
    if (Object.keys(errs).length) { announce(Object.values(errs)[0]); return; }
    try {
      const providerId = await findOrCreateProvider({ name: pName, facilityName: pFacility, facilityKind: pKind, role: pRole } as Omit<Provider, 'id'>);
      // Files removed in the form are deleted from the device.
      const removed = (existing?.attachmentIds ?? []).filter(id => !files.includes(id));
      if (removed.length) await db.attachments.bulkDelete(removed);
      await saveCare({ ...c, title: c.title.trim(), providerId, attachmentIds: files, recordedAt: c.recordedAt ?? new Date().toISOString() });
      announce('Saved.');
      onClose();
    } catch (x) { setErr({ save: x instanceof SaveError ? x.message : 'That did not save. Please try again.' }); }
  };

  const cancel = async () => {
    // Files added in this form but never saved are removed again.
    const added = files.filter(id => !(existing?.attachmentIds ?? []).includes(id));
    if (added.length) await db.attachments.bulkDelete(added);
    onClose();
  };

  return (
    <Overlay open onClose={cancel} label={`${existing ? 'Edit' : 'Add'} ${CARE_KIND_LABEL[k].toLowerCase()}`} wide>
      <div className="row-between"><h2 style={{ margin: 0 }}>{existing ? 'Edit' : 'Add'} {CARE_KIND_LABEL[k].toLowerCase()}</h2><CloseButton onClick={cancel} /></div>
      <p className="caption">Write things down the way you were told them. Sakhi keeps what you type and does not check or judge it.</p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="cf-date">{k === 'treatment' ? 'Started on' : 'Date'}</label>
          <input id="cf-date" className="input" type="date" max={todayLocal()} value={c.date} onChange={e => set({ date: e.target.value })} aria-describedby="cf-date-err" />
          <FieldError id="cf-date-err" msg={err.date} />
        </div>
        <div className="field">
          <label htmlFor="cf-title">What was it?</label>
          <input id="cf-title" className="input" value={c.title} maxLength={80} onChange={e => set({ title: e.target.value })} placeholder={TITLE_HINT[k]} aria-describedby="cf-title-err" />
          <FieldError id="cf-title-err" msg={err.title} />
        </div>
      </div>

      <fieldset>
        <legend>Type of care <span className="caption">(choose more than one if it was combined)</span></legend>
        <div className="check-list">
          {SYSTEMS.map(s => (
            <label key={s} className="check"><input type="checkbox" checked={c.systems.includes(s)} onChange={e => set({ systems: e.target.checked ? [...c.systems, s] : c.systems.filter(x => x !== s) as SystemOfMedicine[] })} /> {SYSTEM_LABEL[s]}</label>
          ))}
        </div>
        <FieldError id="cf-sys-err" msg={err.systems} />
      </fieldset>

      <fieldset>
        <legend>Who {k === 'treatment' ? 'advised it' : k === 'test' ? 'asked for it' : 'you saw'} <span className="caption">(optional)</span></legend>
        <div className="grid-2">
          <div className="field"><label htmlFor="cf-pn">Name</label><input id="cf-pn" className="input" value={pName} onChange={e => setPName(e.target.value)} list="cf-names" /></div>
          <div className="field"><label htmlFor="cf-pf">Hospital, clinic or place</label><input id="cf-pf" className="input" value={pFacility} onChange={e => setPFacility(e.target.value)} /></div>
          <div className="field"><label htmlFor="cf-pk">Kind of place</label>
            <select id="cf-pk" className="select" value={pKind} onChange={e => setPKind(e.target.value as FacilityKind)}>{Object.entries(FACILITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="cf-pr">Their role</label>
            <select id="cf-pr" className="select" value={pRole} onChange={e => setPRole(e.target.value as ProviderRole)}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <datalist id="cf-names">{providers.filter(p => p.name).map(p => <option key={p.id} value={p.name} />)}</datalist>
      </fieldset>

      {k === 'test' && (
        <div className="grid-2">
          <div className="field"><label htmlFor="cf-res">Result, as written</label><input id="cf-res" className="input" value={c.result ?? ''} onChange={e => set({ result: e.target.value || undefined })} /></div>
          <div className="field"><label htmlFor="cf-unit">Unit, as written</label><input id="cf-unit" className="input" value={c.unit ?? ''} onChange={e => set({ unit: e.target.value || undefined })} /></div>
          <div className="field"><label htmlFor="cf-range">Range printed on the report</label><input id="cf-range" className="input" value={c.reportedRange ?? ''} onChange={e => set({ reportedRange: e.target.value || undefined })} /></div>
        </div>
      )}

      {k === 'treatment' && (
        <div className="grid-2">
          <div className="field"><label htmlFor="cf-end">Stopped on <span className="caption">(leave empty if still using)</span></label>
            <input id="cf-end" className="input" type="date" value={c.endDate ?? ''} onChange={e => set({ endDate: e.target.value || undefined })} aria-describedby="cf-end-err" />
            <FieldError id="cf-end-err" msg={err.end} /></div>
          {c.endDate && <div className="field"><label htmlFor="cf-stop">Why it stopped</label>
            <select id="cf-stop" className="select" value={c.stoppedBy ?? ''} onChange={e => set({ stoppedBy: (e.target.value || undefined) as CareEvent['stoppedBy'] })}>
              <option value="">Not given</option>{Object.entries(STOPPED_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="cf-prob">Any problem you noticed <span className="caption">(optional)</span></label>
            <input id="cf-prob" className="input" value={c.problemNote ?? ''} onChange={e => set({ problemNote: e.target.value || undefined })} /></div>
        </div>
      )}

      <div className="field">
        <label htmlFor="cf-sum">{k === 'visit' ? 'What they said or advised, in your words' : 'Notes in your words'} <span className="caption">(optional)</span></label>
        <textarea id="cf-sum" className="textarea" maxLength={500} value={c.summary ?? ''} onChange={e => set({ summary: e.target.value || undefined })} />
      </div>
      <div className="field" style={{ maxWidth: 280 }}>
        <label htmlFor="cf-fu">Follow up date <span className="caption">(optional)</span></label>
        <input id="cf-fu" className="input" type="date" value={c.followUpOn ?? ''} onChange={e => set({ followUpOn: e.target.value || undefined })} />
      </div>

      {SHOW_ATTACHMENTS && <fieldset>
        <legend>Photos or reports <span className="caption">(optional)</span></legend>
        <p className="caption">Photos (JPEG or PNG) or PDF files, up to 5 MB each. They stay on this device and are never printed. They can be lost if your browser data is cleared.</p>
        <label className="btn btn-quiet"><Paperclip size={16} aria-hidden="true" /> Add a file
          <input type="file" accept="image/jpeg,image/png,application/pdf" multiple className="visually-hidden" onChange={e => { void onFile(e.target.files); e.target.value = ''; }} />
        </label>
        <FieldError id="cf-file-err" msg={err.file} />
        <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
          {files.map(id => {
            const a = attachments.find(x => x?.id === id);
            return (
              <li key={id} className="row" style={{ gap: 8 }}>
                <button type="button" className="btn-link" onClick={() => openAttachment(id)}>{a?.name ?? 'New file'}</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFiles(fs => fs.filter(x => x !== id))} aria-label={`Remove ${a?.name ?? 'file'}`}><Trash2 size={14} aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      </fieldset>}

      <label className="switch"><input type="checkbox" checked={c.hideFromBrief} onChange={e => set({ hideFromBrief: e.target.checked })} /> Keep this out of my brief</label>
      <FieldError id="cf-save-err" msg={err.save} />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
        {existing ? (!confirmDel
          ? <button type="button" className="btn btn-quiet" onClick={() => setConfirmDel(true)}><Trash2 size={16} aria-hidden="true" /> Delete</button>
          : <span className="row"><span>Delete this record and its files?</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={async () => { await deleteCare(existing.id); announce('Deleted.'); onClose(); }}>Yes, delete</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDel(false)}>No</button></span>) : <span />}
        <button type="button" className="btn btn-primary" onClick={save}>Save</button>
      </div>
    </Overlay>
  );
}
