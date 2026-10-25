import { useState } from 'react';
import { Link2, Share2 } from 'lucide-react';
import { addDays, fmtDate, todayLocal } from '../../engine/dates.ts';
import type { CardModel } from '../../visits/logic.ts';
import { cardLink, encodePayload, TARGET_LENGTH, toShared, type SharedCard } from '../../share/share.ts';
import { CloseButton, FieldError, Overlay } from './common.tsx';
import { sectionsFor, type CardSection } from './CardView.tsx';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';

// Same drop order as show mode when the link would be too long.
const DROPS: { drop: CardSection[]; questions: number; said: string }[] = [
  { drop: [], questions: 2, said: '' }, { drop: ['tests'], questions: 2, said: 'tests already done' },
  { drop: ['tests', 'since'], questions: 2, said: 'tests already done and the counts since the last visit' },
  { drop: ['tests', 'since'], questions: 1, said: 'tests already done, the counts since the last visit and one question' },
  { drop: ['tests', 'since', 'questions'], questions: 0, said: 'tests already done, the counts since the last visit and the questions' },
];

export function ShareButton({ m, keys }: { m: CardModel; keys: CardSection[] }) {
  const d = useAppData();
  const { announce } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState<1 | 3 | 7>(3);
  const [link, setLink] = useState<string | null>(null);
  const [dropped, setDropped] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const make = async () => {
    setErr(null); setMsg(null); setLink(null);
    try {
      const today = todayLocal();
      for (const step of DROPS) {
        const ks = keys.filter(k => !step.drop.includes(k));
        const payload: SharedCard = {
          v: 1, kind: 'card', createdOn: today, expiresOn: addDays(today, days),
          ...(name.trim() ? { nameOnCard: name.trim().slice(0, 60) } : {}), forClinician: m.clinician.slice(0, 80),
          sections: toShared(sectionsFor(m, d, ks, false, step.questions)),
          concerns: m.concerns.slice(0, 20).map(c => ({ id: c.id.slice(0, 64), text: c.text.slice(0, 240) })),
        };
        const url = cardLink(await encodePayload(payload));
        if (url.length <= TARGET_LENGTH || step === DROPS[DROPS.length - 1]) { setLink(url); setDropped(step.said); return; }
      }
    } catch { setErr('The link could not be made. Show the card on your screen or print it instead.'); }
  };
  const copy = async () => {
    setMsg(null);
    try { await navigator.clipboard.writeText(link!); setMsg('Copied'); announce('Link copied.'); }
    catch { setErr('Copying did not work. Select the link and copy it yourself.'); }
  };
  const share = async () => {
    try { await navigator.share({ title: 'My card for the visit', url: link! }); } catch { /* she closed the share menu */ }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => { setOpen(true); setLink(null); setMsg(null); setErr(null); }}><Link2 size={18} aria-hidden="true" /> Share a link</button>
      <Overlay open={open} onClose={() => setOpen(false)} label="Share a link to this card" variant="dialog">
        <div className="row-between"><h2 style={{ margin: 0 }}>Share a link</h2><CloseButton onClick={() => setOpen(false)} /></div>
        <p>The link holds a copy of this card as text: what you take, advice status, open concerns and your questions. Your other records are not included. You can send it to the clinician or to someone you trust.</p>
        <div className="banner banner-sample"><p style={{ margin: 0 }}><strong>Anyone with this link can read this card. Chat apps may keep a copy. It cannot be switched off.</strong></p></div>
        <div className="field"><label htmlFor="sh-name">Name on the card <span className="caption">(optional)</span></label>
          <input id="sh-name" className="input" maxLength={60} value={name} onChange={e => { setName(e.target.value); setLink(null); }} /></div>
        <fieldset><legend>Valid for</legend>
          <div className="choice-row">{([1, 3, 7] as const).map(n => (
            <label key={n} className="choice"><input type="radio" name="sh-days" checked={days === n} onChange={() => { setDays(n); setLink(null); }} /> {n} {n === 1 ? 'day' : 'days'}</label>
          ))}</div>
          <p className="caption">Until {fmtDate(addDays(todayLocal(), days), true)}. After that the card shows as expired, but anyone who saved the link or a copy can still keep it.</p>
        </fieldset>
        <FieldError id="sh-err" msg={err} />
        {!link ? <button type="button" className="btn btn-primary" onClick={make}>Make the link</button> : (
          <div className="stack">
            {dropped && <p className="caption" role="status">To keep the link short, these were left out: {dropped}.</p>}
            <label htmlFor="sh-link" className="label">Your link</label>
            <input id="sh-link" className="input" readOnly value={link} onFocus={e => e.target.select()} />
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={copy}>Copy link</button>
              {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="btn btn-secondary" onClick={share}><Share2 size={16} aria-hidden="true" /> Share</button>}
              {msg && <span role="status" className="status status-ready">{msg}</span>}
            </div>
          </div>
        )}
      </Overlay>
    </>
  );
}
