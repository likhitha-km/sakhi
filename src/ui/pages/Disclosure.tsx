import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDashed } from 'lucide-react';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';
import { setDisclosure } from '../../db/visits.ts';
import { SaveError } from '../../db/repo.ts';
import { inUseNow, SYSTEM_LABEL } from '../../brief/careViews.ts';
import { fmtDate, todayLocal } from '../../engine/dates.ts';
import { DISCLOSURE_LABEL, disclosureStatus, providerShort } from '../../visits/logic.ts';
import { EmptyMotif, PageHeader } from '../components/common.tsx';
import { DisclosureControl } from '../components/visitBits.tsx';

export function Disclosure() {
  const { care, providers, disclosures, nextVisits } = useAppData();
  const { announce } = useSession();
  const today = todayLocal();
  const using = inUseNow(care, today);
  const upcoming = [...nextVisits].filter(n => n.on >= today).sort((a, b) => a.on.localeCompare(b.on));
  const [chosen, setTarget] = useState<string | null>(null);
  // Until she picks someone, prepare for the next planned visit.
  const target = chosen ?? upcoming[0]?.providerId ?? providers[0]?.id ?? '';
  const [err, setErr] = useState<string | null>(null);
  const targetName = providerShort(providers.find(p => p.id === target));
  const notMarked = using.filter(t => disclosureStatus(disclosures, t.id, target) !== 'told');

  const change = async (tId: string, pId: string, s: 'told' | 'not_told' | 'unsure', label: string) => {
    setErr(null);
    try { await setDisclosure(tId, pId, s); announce(`${label}: ${DISCLOSURE_LABEL[s].toLowerCase()}.`); }
    catch (e) { setErr(e instanceof SaveError ? e.message : 'That did not save. Please try again.'); }
  };

  return (
    <>
      <PageHeader title="Who I have told" intro="This shows what you recorded, not what any clinician knows." />
      {err && <p className="error" role="alert">{err}</p>}
      {!using.length || !providers.length ? (
        <div className="card-quiet"><EmptyMotif kind="care" />
          <p>{!using.length ? 'Nothing is in "What I take" yet.' : 'No clinicians recorded yet.'} Add a visit or a treatment, then mark who you have told about each one.</p>
          <div className="row"><Link className="btn btn-primary" to="/visit/new">After the visit</Link><Link className="btn btn-secondary" to="/journal/take">What I take</Link></div></div>
      ) : <>
        <section className="card section" aria-labelledby="prep-h">
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="prep" id="prep-h">Prepare for</label>
            <select id="prep" className="select" value={target} onChange={e => setTarget(e.target.value)}>
              {providers.map(p => { const n = upcoming.find(x => x.providerId === p.id); return <option key={p.id} value={p.id}>{providerShort(p)}{n ? ` (visit on ${fmtDate(n.on)})` : ''}</option>; })}
            </select>
          </div>
          <h2 style={{ fontSize: 18 }}>Not marked as told to {targetName} ({notMarked.length})</h2>
          {notMarked.length ? <ul style={{ paddingLeft: 20, margin: 0 }}>{notMarked.map(t => <li key={t.id}><CircleDashed size={14} aria-hidden="true" /> {t.title} <span className="caption">({t.systems.map(s => SYSTEM_LABEL[s]).join(' and ')})</span></li>)}</ul>
            : <p className="muted" style={{ margin: 0 }}>Everything you take is marked as told to {targetName}.</p>}
        </section>

        <section aria-labelledby="grid-h">
          <h2 id="grid-h" style={{ fontSize: 20 }}>Everything I take, and who I have told</h2>
          <p className="caption">Rows are what you take. Columns are clinicians. Choose Told, Not marked as told or Not sure in each box.</p>
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="disc-grid">
              <thead><tr><th scope="col">What I take</th>{providers.map(p => <th key={p.id} scope="col">{providerShort(p)}</th>)}</tr></thead>
              <tbody>{using.map(t => (
                <tr key={t.id}>
                  <th scope="row"><span style={{ fontWeight: 600 }}>{t.title}</span><br /><span className="caption">{t.systems.map(s => SYSTEM_LABEL[s]).join(' and ')} · since {fmtDate(t.date)}</span></th>
                  {providers.map(p => (
                    <td key={p.id}>
                      <DisclosureControl name={`d-${t.id}-${p.id}`} label={`${t.title}, ${providerShort(p)}`} value={disclosureStatus(disclosures, t.id, p.id)} onChange={s => void change(t.id, p.id, s, `${t.title} for ${providerShort(p)}`)} />
                      {t.providerId === p.id && <span className="caption">Advised it</span>}
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </>}
    </>
  );
}
