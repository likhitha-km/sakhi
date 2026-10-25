import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, TriangleAlert } from 'lucide-react';
import { readReply, type Reply } from '../../share/share.ts';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { findOrCreateProvider, SaveError, uid } from '../../db/repo.ts';
import { saveNextVisit, saveVisit, setConcernAddressed } from '../../db/visits.ts';
import { addDays, fmtDate, todayLocal } from '../../engine/dates.ts';
import { providerShort } from '../../visits/basics.ts';
import type { AdviceItem, SystemOfMedicine } from '../../types/care.ts';
import { FieldError, PageHeader } from '../components/common.tsx';
import { ADVICE_KIND_LABEL, ProviderPicker, SystemsPicker, type NewProvider } from '../components/visitBits.tsx';

export function ReplyReview() {
  const { frag = '' } = useParams();
  const { providers, concerns, settings } = useAppData();
  const { announce } = useSession();
  const nav = useNavigate();
  const [reply, setReply] = useState<Reply | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [states, setStates] = useState<('open' | 'accepted' | 'skipped')[]>([]);
  const [concernOk, setConcernOk] = useState<string[]>([]);
  const [takeNext, setTakeNext] = useState(true);
  const [pid, setPid] = useState('');
  const [fresh, setFresh] = useState<NewProvider>({ name: '', facilityName: '', facilityKind: 'other', role: 'other' });
  const [systems, setSystems] = useState<SystemOfMedicine[]>([]);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const today = todayLocal();

  useEffect(() => {
    readReply(frag).then(r => {
      setReply(r); setStates(r.advice.map(() => 'open'));
      if (r.clinicianName) setFresh(f => ({ ...f, name: r.clinicianName! }));
    }, e => setErr(e instanceof Error ? e.message : 'This reply link could not be opened.'));
  }, [frag]);
  useEffect(() => {
    if (!reply || pid) return;
    const match = providers.find(p => p.name && [reply.forClinician, reply.clinicianName].some(n => n && n.trim().toLowerCase() === p.name!.trim().toLowerCase()));
    if (match) setPid(match.id);
  }, [reply, providers, pid]);

  if (err) return <><PageHeader title="This reply could not be opened" /><p>{err}</p></>;
  if (!reply) return <p role="status">Opening the reply…</p>;
  const known = reply.addressed.filter(id => concerns.some(c => c.id === id && !c.addressed));
  const ignored = reply.addressed.length - known.length;

  const save = async () => {
    setSaveErr(null);
    if (!pid) { setSaveErr('Choose who this reply is from.'); return; }
    if (!systems.length) { setSaveErr('Choose at least one type of care.'); return; }
    try {
      const providerId = pid === 'new' ? await findOrCreateProvider(fresh) : pid;
      if (!providerId) throw new SaveError('Give a name, a place or a role for the clinician.');
      const id = uid();
      const advice: AdviceItem[] = reply.advice.map((a, i) => ({ a, i })).filter(({ i }) => states[i] === 'accepted').map(({ a }) => ({
        id: uid(), visitId: id, kind: a.kind, text: a.text, systems, status: 'not_started', origin: 'clinician_reply',
        ...(a.inDays !== undefined ? { dueOn: addDays(today, a.inDays) } : {}),
      }));
      const note = reply.note ? `Note from ${reply.clinicianName || 'the clinician'}: ${reply.note}` : undefined;
      await saveVisit({ visit: { id, providerId, on: today, systems, ...(note ? { note } : {}), origin: 'manual' }, advice, concerns: [],
        addToTreatments: new Set(advice.filter(a => a.kind === 'medicine').map(a => a.id)), sample: !!settings?.syntheticLoaded });
      for (const cid of concernOk) await setConcernAddressed(cid, true);
      if (takeNext && reply.nextVisitInDays !== undefined) await saveNextVisit({ id: uid(), providerId, on: addDays(today, reply.nextVisitInDays) });
      announce('Reply saved.');
      nav(`/visit/${id}`, { state: { saved: true } });
    } catch (e) { setSaveErr(e instanceof SaveError ? e.message : 'The reply could not be saved. Nothing was changed.'); }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="A reply from your clinician" intro={`Made on ${fmtDate(reply.createdOn, true)}${reply.clinicianName ? ` by ${reply.clinicianName}` : ''}. Check each line. Nothing is saved until you press Save.`} />
      <div className="banner banner-sample"><TriangleAlert size={20} aria-hidden="true" /><p style={{ margin: 0 }}>Entered through a link. Sakhi cannot check who wrote it.</p></div>
      <ProviderPicker providers={providers} value={pid} onChange={setPid} fresh={fresh} onFresh={setFresh} label="Who is this reply from?" />
      <SystemsPicker legend="Type of care" value={systems} onChange={setSystems} />
      <h2 style={{ fontSize: 20 }}>Advice ({reply.advice.length})</h2>
      {!reply.advice.length && <p className="muted">No advice in this reply.</p>}
      {reply.advice.map((a, i) => (
        <div key={i} className={`suggestion ${states[i] === 'open' ? '' : states[i]}`}>
          <div className="row-between"><span className="caption">{ADVICE_KIND_LABEL[a.kind]}{a.inDays !== undefined ? ` · by ${fmtDate(addDays(today, a.inDays), true)}` : ''}</span>
            {states[i] !== 'open' && <span className="status">{states[i] === 'accepted' ? <><Check size={16} aria-hidden="true" /> Will be saved</> : 'Skipped'}</span>}</div>
          <strong>{a.text}</strong>
          {states[i] === 'open' && <div className="row" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setStates(states.map((s, j) => j === i ? 'accepted' : s))}>Accept</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStates(states.map((s, j) => j === i ? 'skipped' : s))}>Skip</button></div>}
        </div>
      ))}
      {(known.length > 0 || ignored > 0) && <>
        <h2 style={{ fontSize: 20, marginTop: 16 }}>Concerns marked as answered</h2>
        {known.map(id => { const c = concerns.find(x => x.id === id)!; return (
          <label key={id} className="check"><input type="checkbox" checked={concernOk.includes(id)} onChange={e => setConcernOk(e.target.checked ? [...concernOk, id] : concernOk.filter(x => x !== id))} /> Mark as addressed: {c.text}</label>); })}
        {ignored > 0 && <p className="caption">{ignored} {ignored === 1 ? 'concern in the reply was' : 'concerns in the reply were'} not found in your journal and {ignored === 1 ? 'was' : 'were'} ignored.</p>}
      </>}
      {reply.nextVisitInDays !== undefined && <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={takeNext} onChange={e => setTakeNext(e.target.checked)} /> Add a next visit on {fmtDate(addDays(today, reply.nextVisitInDays), true)}{pid && pid !== 'new' ? ` with ${providerShort(providers.find(p => p.id === pid))}` : ''}</label>}
      {reply.note && <section className="card" style={{ marginTop: 12 }}><h2 style={{ fontSize: 18 }}>Note</h2><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{reply.note}</p></section>}
      <FieldError id="rr-err" msg={saveErr} />
      <div className="sticky-actions"><button type="button" className="btn btn-quiet" onClick={() => nav('/home')}>Do not save</button><button type="button" className="btn btn-primary" onClick={save}>Save</button></div>
    </div>
  );
}
