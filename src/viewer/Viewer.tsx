// The page a clinician or a trusted person opens from a shared link.
// Rules: no storage of any kind, no requests, text only. Everything comes from the link itself.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SectionsView } from '../ui/components/SectionsView.tsx';
import type { Section } from '../visits/sections.ts';
import { VIEWER_FOOTER, fmtShort } from '../visits/basics.ts';
import { encodePayload, readCard, replyLink, type Reply, type SharedCard } from '../share/share.ts';

const todayLocal = () => new Date().toLocaleDateString('en-CA');
const KINDS = { test: 'Test', medicine: 'Medicine or remedy', follow_up: 'Follow up', lifestyle: 'Food, exercise or habits', referral: 'See someone else', other: 'Other' } as const;
type Row = { kind: keyof typeof KINDS; text: string; inDays: string };

function ReplyPanel({ card }: { card: SharedCard }) {
  const [rows, setRows] = useState<Row[]>([{ kind: 'other', text: '', inDays: '' }]);
  const [addressed, setAddressed] = useState<string[]>([]);
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const days = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Math.min(365, Math.round(Number(s)))));
  const make = async () => {
    setErr(null); setMsg(null);
    const advice = rows.filter(r => r.text.trim()).map(r => ({ kind: r.kind, text: r.text.trim().slice(0, 160), ...(days(r.inDays) !== undefined && !Number.isNaN(days(r.inDays)) ? { inDays: days(r.inDays)! } : {}) }));
    if (!advice.length && !addressed.length && !next.trim() && !note.trim()) { setErr('Add at least one line of advice, a concern you answered, a next visit or a note.'); return; }
    const reply: Reply = {
      v: 1, kind: 'reply', createdOn: todayLocal(), ...(name.trim() ? { clinicianName: name.trim().slice(0, 60) } : {}),
      ...(card.forClinician ? { forClinician: card.forClinician } : {}), advice, addressed,
      ...(days(next) !== undefined && !Number.isNaN(days(next)) ? { nextVisitInDays: days(next)! } : {}), ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}),
    };
    try { setLink(replyLink(await encodePayload(reply))); } catch { setErr('The reply link could not be made.'); }
  };
  return (
    <section className="card" aria-labelledby="rp-h" style={{ marginTop: 24 }}>
      <h2 id="rp-h" style={{ fontSize: 20 }}>Reply to the patient</h2>
      <p className="caption">Optional. Nothing is sent from this page. It makes a link you can give back to the patient, for example by message. She checks each line before anything is saved in her Sakhi.</p>
      {rows.map((r, i) => (
        <div key={i} className="reply-row">
          <label className="visually-hidden" htmlFor={`rk-${i}`}>Kind</label>
          <select id={`rk-${i}`} className="select" value={r.kind} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, kind: e.target.value as Row['kind'] } : x))}>
            {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="visually-hidden" htmlFor={`rt-${i}`}>Advice</label>
          <input id={`rt-${i}`} className="input" maxLength={160} placeholder="What to do" value={r.text} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
          <label className="row caption" style={{ gap: 4 }}>in <input className="input" style={{ width: 70 }} type="number" min={0} max={365} value={r.inDays} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, inDays: e.target.value } : x))} aria-label="In how many days" /> days</label>
          {rows.length > 1 && <button type="button" className="btn btn-quiet btn-sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>}
        </div>
      ))}
      {rows.length < 6 && <button type="button" className="btn-link" onClick={() => setRows([...rows, { kind: 'other', text: '', inDays: '' }])}><Plus size={14} aria-hidden="true" /> Add a line</button>}
      {card.concerns.length > 0 && <fieldset style={{ marginTop: 12 }}><legend>Concerns you answered today</legend>
        <div className="stack" style={{ gap: 6 }}>{card.concerns.map(c => (
          <label key={c.id} className="check"><input type="checkbox" checked={addressed.includes(c.id)} onChange={e => setAddressed(e.target.checked ? [...addressed, c.id] : addressed.filter(x => x !== c.id))} /> {c.text}</label>
        ))}</div></fieldset>}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="rp-next">Next visit in how many days <span className="caption">(optional)</span></label><input id="rp-next" className="input" type="number" min={0} max={365} value={next} onChange={e => setNext(e.target.value)} /></div>
        <div className="field"><label htmlFor="rp-name">Your name <span className="caption">(optional)</span></label><input id="rp-name" className="input" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="rp-note">Note <span className="caption">(optional, up to 300 characters)</span></label><textarea id="rp-note" className="textarea" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></div>
      {err && <p className="error" role="alert">{err}</p>}
      {!link ? <button type="button" className="btn btn-primary" onClick={make}>Make the reply link</button> : (
        <div className="stack">
          <p className="caption">Anyone with this link can read the reply. It cannot be switched off.</p>
          <label htmlFor="rp-link" className="label">Reply link</label>
          <input id="rp-link" className="input" readOnly value={link} onFocus={e => e.target.select()} />
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(link); setMsg('Copied'); } catch { setErr('Copying did not work. Select the link and copy it yourself.'); } }}>Copy link</button>
            {'share' in navigator && <button type="button" className="btn btn-secondary" onClick={() => navigator.share({ url: link }).catch(() => undefined)}>Share</button>}
            {msg && <span role="status" className="status status-ready">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

export function Viewer({ fragment }: { fragment: string }) {
  const [card, setCard] = useState<SharedCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { readCard(fragment).then(setCard, e => setErr(e instanceof Error ? e.message : 'This link could not be opened.')); }, [fragment]);
  if (err) return <main id="main" className="viewer"><h1>This link could not be opened</h1><p>{err}</p></main>;
  if (!card) return <main id="main" className="viewer"><p role="status">Opening the card…</p></main>;
  const expired = card.expiresOn < todayLocal();
  if (expired) return <main id="main" className="viewer"><h1>This card has expired</h1><p>It was shared on {fmtShort(card.createdOn)} and was valid until {fmtShort(card.expiresOn)}. Ask the patient for a new link.</p></main>;
  const sections: Section[] = card.sections.map(s => ({ key: s.key, heading: [s.heading], lines: s.lines.map(l => ({ kind: l.kind, segs: [l.text], ...(l.icon ? { icon: l.icon } : {}), ...(l.src ? { src: l.src } : {}) })) }));
  return (
    <main id="main" className="viewer">
      <h1>{card.forClinician ? `Card for ${card.forClinician}` : 'Patient card'}</h1>
      {card.nameOnCard && <p style={{ margin: 0 }}>From {card.nameOnCard}</p>}
      <p><strong>Patient reported information. Not a diagnosis.</strong></p>
      <div className="brief-page viewer-card"><SectionsView sections={sections} footerText={VIEWER_FOOTER} /></div>
      <p className="caption">Shared from Sakhi on {fmtShort(card.createdOn)}. Valid until {fmtShort(card.expiresOn)}.</p>
      <ReplyPanel card={card} />
    </main>
  );
}
