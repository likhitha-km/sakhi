import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles, TriangleAlert } from 'lucide-react';
import { helperAvailable, NOTE_MAX, readNote } from '../../ai/client.ts';
import { resolveWhen } from '../../ai/validate.ts';
import type { Suggestion } from '../../types/ai.ts';
import { BLEEDING_FEATURES, BLEEDING_LABEL, IMPACT_LABEL, SYMPTOM_LABEL } from '../../engine/vocab.ts';
import { fmtDate } from '../../engine/dates.ts';
import { useSession } from '../hooks/session.tsx';

const CONSENT_KEY = 'sakhi.aiConsent';
const readConsent = () => { try { return sessionStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } };

function suggestionTitle(s: Suggestion) {
  if (s.kind === 'symptom' && s.symptomCode) return SYMPTOM_LABEL[s.symptomCode];
  if (s.kind === 'period_start') return 'Period started';
  if (s.kind === 'bleeding') {
    const f = BLEEDING_FEATURES.filter(k => s.bleeding?.[k]).map(k => BLEEDING_LABEL[k]);
    return f.length ? `Bleeding: ${f.join('; ')}` : 'Bleeding';
  }
  return s.impact.map(i => IMPACT_LABEL[i]).join('; ') || 'Effect on your day';
}

function Highlight({ note, span }: { note: string; span: string }) {
  const i = note.toLowerCase().indexOf(span.toLowerCase());
  if (i < 0) return <span>“{span}”</span>;
  return <span>“{note.slice(Math.max(0, i - 30), i)}<mark>{note.slice(i, i + span.length)}</mark>{note.slice(i + span.length, i + span.length + 30)}”</span>;
}

type Card = Suggestion & { state: 'open' | 'accepted' | 'skipped'; editSeverity: number | null };

export function AiNotePanel({ today, onAccept }: { today: string; onAccept: (s: Suggestion) => void }) {
  const { announce } = useSession();
  const [available, setAvailable] = useState(false);
  const [consent, setConsent] = useState(readConsent);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [readNoteText, setReadNoteText] = useState('');

  useEffect(() => { let live = true; helperAvailable().then(ok => { if (live) setAvailable(ok); }); return () => { live = false; }; }, []);
  if (!available) return null;

  const setConsentBoth = (v: boolean) => {
    setConsent(v);
    try { if (v) sessionStorage.setItem(CONSENT_KEY, 'yes'); else sessionStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ }
  };

  const read = async () => {
    if (!consent || !note.trim()) return;
    setBusy(true); setFailed(false); setCards(null); setUrgent(false);
    const r = await readNote(note, today);
    setBusy(false);
    if (!r.ok || !r.suggestions.length) {
      setFailed(true);
      setUrgent(r.ok && r.urgentMention);
      announce('Could not read that. Please use the options below.');
      return;
    }
    setReadNoteText(note);
    setCards(r.suggestions.map(s => ({ ...s, state: 'open', editSeverity: s.severity })));
    setUrgent(r.urgentMention);
    announce(`${r.suggestions.length} suggestions ready. Check each one.`);
  };

  const act = (i: number, accept: boolean) => {
    const c = cards![i];
    setCards(cards!.map((x, j) => (j === i ? { ...x, state: accept ? 'accepted' : 'skipped' } : x)));
    if (accept) {
      onAccept({ ...c, severity: c.editSeverity });
      announce(`Added ${suggestionTitle(c)} to the form. Nothing is saved until you press Save.`);
    }
  };

  return (
    <section className="card" aria-labelledby="ai-h" style={{ marginBottom: 24, background: 'var(--blue-100)' }}>
      <h2 id="ai-h" style={{ fontSize: 20 }}><Sparkles size={20} aria-hidden="true" /> Say it your way</h2>
      <p className="caption">Write how you feel in your own words, in English, Hindi, Kannada or a mix. Sakhi will suggest what to fill in. You check each suggestion before anything is added.</p>
      <label className="switch">
        <input type="checkbox" checked={consent} onChange={e => setConsentBoth(e.target.checked)} />
        <span>Use AI to read my note. <span className="caption">Only the note and today's date are sent to an online AI service. This stays on until you close this tab.</span></span>
      </label>
      {consent && (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="ai-note">Your note</label>
            <textarea id="ai-note" className="textarea" maxLength={NOTE_MAX} value={note} onChange={e => setNote(e.target.value)}
              placeholder="For example: Aaj period pain 7 out of 10 hai, lab nahi ja paayi." aria-describedby="ai-fixed ai-count" />
            <span id="ai-count" className="hint">{note.length} of {NOTE_MAX} characters. Please do not include other people's details.</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={read} disabled={busy || !note.trim()}>{busy ? 'Reading…' : 'Read my note'}</button>
        </>
      )}
      <p id="ai-fixed" className="caption" style={{ marginTop: 12 }}>
        <TriangleAlert size={14} aria-hidden="true" /> Notes are not checked for emergencies. If something is happening now, use <Link to="/now">Something urgent?</Link>
      </p>
      {failed && <p className="error" role="status">Could not read that. Please use the options below.</p>}
      {urgent && (
        <div className="banner banner-quiet" role="status">
          <TriangleAlert size={20} aria-hidden="true" />
          <div><p style={{ margin: 0 }}>Your note mentions something that may be urgent. If this is happening now, open the urgent check.</p>
            <Link to="/now" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Something urgent?</Link></div>
        </div>
      )}
      {cards && (
        <div style={{ marginTop: 12 }}>
          <h3>Suggestions from your note</h3>
          {cards.map((c, i) => {
            const date = resolveWhen(c.when, today);
            return (
              <div key={i} className={`suggestion ${c.state}`}>
                <div className="row-between">
                  <strong>{suggestionTitle(c)}</strong>
                  {c.state !== 'open' && <span className="status">{c.state === 'accepted' ? <><Check size={16} aria-hidden="true" /> Added to the form</> : 'Skipped'}</span>}
                </div>
                <p className="caption" style={{ margin: '4px 0' }}>From your words: <Highlight note={readNoteText} span={c.span} /></p>
                {date && date !== today && <p className="caption" style={{ margin: 0 }}>For {fmtDate(date, true)}</p>}
                {c.kind === 'symptom' && c.impact.length > 0 && <p className="caption" style={{ margin: 0 }}>Also: {c.impact.map(x => IMPACT_LABEL[x]).join('; ')}</p>}
                {c.state === 'open' && (
                  <div className="row" style={{ marginTop: 8 }}>
                    {c.kind === 'symptom' && (
                      <label className="row caption" style={{ gap: 6 }}>Score 0 to 10
                        <input className="input" style={{ width: 80 }} type="number" min={0} max={10} inputMode="numeric"
                          value={c.editSeverity ?? ''} placeholder="You choose"
                          onChange={e => setCards(cards.map((x, j) => j === i ? { ...x, editSeverity: e.target.value === '' ? null : Math.max(0, Math.min(10, Math.round(+e.target.value))) } : x))} />
                      </label>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => act(i, true)}>Accept</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(i, false)}>Skip</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
