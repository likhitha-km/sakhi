import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import { evaluateSafely } from '../../safety/evaluate.ts';
import { todayLocal } from '../../engine/dates.ts';
import type { EpisodeInput, SafetyResult } from '../../types/safety.ts';
import type { PregnancyStatus } from '../../types/entry.ts';
import { SafetyCard } from '../components/common.tsx';
import { useSession } from '../hooks/session.tsx';

export function Now() {
  const { setAlert } = useSession();
  const today = todayLocal();
  const [happening, setHappening] = useState<'now' | 'past'>('now');
  const [date, setDate] = useState(today);
  const [soaking, setSoaking] = useState(0);
  const [fainted, setFainted] = useState(false);
  const [pain, setPain] = useState(false);
  const [bleeding, setBleeding] = useState(false);
  const [preg, setPreg] = useState<PregnancyStatus | ''>('');
  const [result, setResult] = useState<SafetyResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    if (!preg) { setErr('Please answer the question about pregnancy. Choose "Possibly" if you are not sure.'); return; }
    setErr(null);
    const input: EpisodeInput = {
      occurredOn: happening === 'now' ? today : date, isHappeningNow: happening === 'now',
      soakingEveryHourForHours: soaking, fainted, severePainWithDanger: pain, anyBleeding: bleeding || soaking > 0, pregnancyStatus: preg,
    };
    const r = evaluateSafely(input);
    setResult(r);
    setAlert(r.tense === 'current' && r.level !== 'none' ? r : null);
    setTimeout(() => document.getElementById('now-result')?.focus(), 0);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Something urgent?</h1>
      <div className="banner banner-alert">
        <PhoneCall size={22} color="var(--alert-700)" aria-hidden="true" />
        <p style={{ margin: 0 }}><strong>If you feel seriously unwell, do not wait for this check.</strong> Call <a href="tel:112">112</a> for chest pain, trouble breathing, fainting or very severe pain, whatever this page says.</p>
      </div>
      <p className="muted">Answer a few questions. Sakhi checks them against a short list of warning signs. This works without internet. Your answers here are not saved.</p>

      <form onSubmit={check} noValidate className="card">
        <fieldset>
          <legend>Is this happening now?</legend>
          <div className="check-list">
            <label className="check"><input type="radio" name="when" checked={happening === 'now'} onChange={() => setHappening('now')} /> Yes, right now</label>
            <label className="check"><input type="radio" name="when" checked={happening === 'past'} onChange={() => setHappening('past')} /> No, it happened earlier</label>
          </div>
        </fieldset>
        {happening === 'past' && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="now-date">When did it happen?</label>
            <input id="now-date" className="input" type="date" max={today} value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="now-soak">For how many hours in a row have you soaked through a pad or tampon every hour?</label>
          <select id="now-soak" className="select" value={soaking} onChange={e => setSoaking(+e.target.value)}>
            <option value={0}>Not at all</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}{h === 12 ? ' or more' : ''}</option>)}
          </select>
        </div>
        <fieldset>
          <legend>Tick anything that is true</legend>
          <div className="check-list">
            <label className="check"><input type="checkbox" checked={fainted} onChange={e => setFainted(e.target.checked)} /> I fainted or collapsed</label>
            <label className="check"><input type="checkbox" checked={pain} onChange={e => setPain(e.target.checked)} /> Severe pain in my tummy or pelvis, or pain at the tip of my shoulder, or I feel very dizzy</label>
            <label className="check"><input type="checkbox" checked={bleeding} onChange={e => setBleeding(e.target.checked)} /> I am bleeding from the vagina</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Could you be pregnant?</legend>
          <div className="check-list">
            <label className="check"><input type="radio" name="preg" checked={preg === 'not_pregnant'} onChange={() => setPreg('not_pregnant')} /> No</label>
            <label className="check"><input type="radio" name="preg" checked={preg === 'possible'} onChange={() => setPreg('possible')} /> Possibly, or not sure</label>
            <label className="check"><input type="radio" name="preg" checked={preg === 'confirmed'} onChange={() => setPreg('confirmed')} /> Yes, I am pregnant</label>
          </div>
        </fieldset>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="submit" className="btn btn-primary">Check</button>
      </form>

      {result && (
        <div id="now-result" tabIndex={-1} style={{ marginTop: 24 }}>
          {result.tense === 'current' && result.level !== 'none' ? <p className="caption">This message also stays at the top of every page until you hide it.</p> : null}
          <SafetyCard result={result} />
          <p className="caption">This check is not complete and cannot rule anything out. <Link to="/help">See all urgent help numbers</Link>.</p>
        </div>
      )}
    </div>
  );
}
