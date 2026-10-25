import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Droplets, Pencil, Plus, Trash2 } from 'lucide-react';
import { AREA_LABEL, AREA_ORDER, BLEEDING_FEATURES, BLEEDING_LABEL, IMPACT_CODES, IMPACT_LABEL, SYMPTOM_AREA, SYMPTOM_CODES, SYMPTOM_LABEL, capitalise, normaliseLabel } from '../../engine/vocab.ts';
import { addDays, fmtDate, fmtWeekday, todayLocal } from '../../engine/dates.ts';
import type { AreaCode, BleedingFeatures, Entry, ImpactCode, SymptomCode } from '../../types/entry.ts';
import type { Suggestion } from '../../types/ai.ts';
import type { SafetyResult } from '../../types/safety.ts';
import { saveEntries, SaveError, uid } from '../../db/repo.ts';
import { db } from '../../db/db.ts';
import { resolveWhen } from '../../ai/validate.ts';
import { evaluateSafely } from '../../safety/evaluate.ts';
import { ConfirmDialog, FieldError, SafetyCard, SYMPTOM_ICON } from '../components/common.tsx';
import { AiNotePanel } from '../components/AiNotePanel.tsx';
import { BLEEDING_AFTER_PERIODS_STOPPED } from './Static.tsx';
import { useAppData } from '../hooks/data.ts';
import { useSession } from '../hooks/session.tsx';

interface Picked { severity?: number; ai?: string; label?: string; area?: AreaCode }
interface Draft {
  date: string;
  symptoms: Record<string, Picked>;   // key: symptom code or 'custom:<label>'
  impact: ImpactCode[]; impactAi?: string;
  periodStarted: boolean; periodAi?: string;
  bleedingOpen: boolean; hadBleeding: boolean; bleeding: BleedingFeatures; bleedingAi?: string;
  note: string;
}
const NO_BLEED: BleedingFeatures = { changeEvery1to2h: false, doubleProducts: false, bledThrough: false, clotsOver2_5cm: false, nightChange: false };
const fresh = (): Draft => ({ date: todayLocal(), symptoms: {}, impact: [], periodStarted: false, bleedingOpen: false, hadBleeding: false, bleeding: { ...NO_BLEED }, note: '' });
const KEY = 'sakhi.logDraft';
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
// Deferred for now: kept in code, hidden from the screen.
const SHOW_LOG_AI = false;
const SHOW_OTHER_SYMPTOM = false;
const loadDraft = (): Draft => { try { const s = sessionStorage.getItem(KEY); return s ? { ...fresh(), ...JSON.parse(s) } : fresh(); } catch { return fresh(); } };
const keyLabel = (k: string, p?: Picked) => (k.startsWith('custom:') ? capitalise(p?.label ?? k.slice(7)) : SYMPTOM_LABEL[k as SymptomCode]);

function SeverityPicker({ id, label, value, onChange, error }: { id: string; label: string; value?: number; onChange: (v: number) => void; error?: string }) {
  return (
    <fieldset className="severity" aria-describedby={error ? id + '-err' : undefined}>
      <legend>How bad was {label.toLowerCase()}? <span className="caption">0 is none, 10 is the worst you can imagine</span></legend>
      <div className="sev-row">
        {Array.from({ length: 11 }, (_, n) => (
          <label key={n}>
            <input type="radio" name={id} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} out of 10`} />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
      <div className="sev-anchors" aria-hidden="true"><span>none</span><span>5</span><span>worst</span></div>
      <div className="row" style={{ marginTop: 8 }}>
        <label htmlFor={id + '-num'} className="caption">Or type a number</label>
        <input id={id + '-num'} className="input" style={{ width: 90 }} type="number" min={0} max={10} inputMode="numeric"
          value={value ?? ''} onChange={e => { const v = e.target.value; if (v !== '' && +v >= 0 && +v <= 10) onChange(Math.round(+v)); }} />
      </div>
      <FieldError id={id + '-err'} msg={error} />
    </fieldset>
  );
}

export function Log() {
  const { settings, profile, entries } = useAppData();
  const stage = profile.stage;
  const noCycle = stage === 'post_menopause' || stage === 'hysterectomy';
  const { announce, setAlert } = useSession();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customArea, setCustomArea] = useState<AreaCode>('other');
  const [confirmNothing, setConfirmNothing] = useState(false);
  const [changeDay, setChangeDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ days: number; safety: SafetyResult | null; bledAfterStop: boolean } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const today = todayLocal();

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft]);
  useEffect(() => { headRef.current?.focus(); }, [step]);

  const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));
  const customKeys = Object.keys(draft.symptoms).filter(k => k.startsWith('custom:'));
  const existingCustom = useMemo(() => {
    const m = new Map<string, AreaCode>();
    for (const e of entries) if (e.symptomCode === 'custom' && e.customLabel) m.set(normaliseLabel(e.customLabel), e.area ?? 'other');
    return [...m];
  }, [entries]);

  const toggleSymptom = (k: string, p: Picked = {}) => {
    const s = { ...draft.symptoms };
    if (s[k]) delete s[k]; else s[k] = p;
    set({ symptoms: s });
    setErrors(e => { const x = { ...e }; delete x[k]; return x; });
  };
  const setSeverity = (k: string, v: number) => {
    set({ symptoms: { ...draft.symptoms, [k]: { ...draft.symptoms[k], severity: v } } });
    setErrors(e => { const x = { ...e }; delete x[k]; return x; });
  };

  const addCustom = () => {
    const label = normaliseLabel(customLabel);
    if (!label) { setErrors(e => ({ ...e, custom: 'Type a name for the symptom.' })); return; }
    if (label.length > 60) { setErrors(e => ({ ...e, custom: 'Keep the name under 60 characters.' })); return; }
    const allCustom = new Set([...existingCustom.map(([l]) => l), ...customKeys.map(k => k.slice(7))]);
    if (!allCustom.has(label) && allCustom.size >= 10) { setErrors(e => ({ ...e, custom: 'You can have up to 10 of your own symptoms. Reuse one you already have.' })); return; }
    set({ symptoms: { ...draft.symptoms, ['custom:' + label]: { label, area: customArea } } });
    setCustomLabel(''); setCustomOpen(false);
    setErrors(e => { const x = { ...e }; delete x.custom; return x; });
  };

  const acceptAi = (s: Suggestion) => {
    setDraft(d => {
      const n = { ...d, symptoms: { ...d.symptoms }, impact: [...new Set([...d.impact, ...s.impact])] };
      const when = resolveWhen(s.when, today);
      if (when) n.date = when;
      if (s.kind === 'symptom' && s.symptomCode) n.symptoms[s.symptomCode] = { ...n.symptoms[s.symptomCode], severity: s.severity ?? n.symptoms[s.symptomCode]?.severity, ai: s.span };
      if (s.kind === 'bleeding') { n.bleedingOpen = true; n.hadBleeding = true; n.bleeding = { ...n.bleeding, ...Object.fromEntries(Object.entries(s.bleeding ?? {}).filter(([, v]) => v)) }; n.bleedingAi = s.span; }
      if (s.kind === 'period_start') { n.bleedingOpen = true; n.periodStarted = true; n.periodAi = s.span; }
      if (s.impact.length) n.impactAi = s.span;
      return n;
    });
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!draft.date || draft.date > today) errs.date = 'Choose today or an earlier day.';
    else if (draft.date < addDays(today, -3650)) errs.date = 'Entries can go back up to 10 years.';
    for (const [k, p] of Object.entries(draft.symptoms)) if (p.severity === undefined) errs[k] = `Choose a score from 0 to 10 for ${keyLabel(k, p).toLowerCase()}.`;
    setErrors(errs);
    const first = Object.values(errs)[0];
    if (first) announce(first);
    return !first;
  };

  const hasContent = Object.keys(draft.symptoms).length > 0 || draft.hadBleeding || draft.periodStarted;

  const buildEntries = (): Entry[] => {
    const source = settings?.syntheticLoaded ? 'synthetic' : 'user';
    const now = new Date().toISOString();
    const base = { occurredOn: draft.date, recordedAt: now, source, impact: [] as ImpactCode[] } as const;
    const out: Entry[] = [];
    for (const [k, p] of Object.entries(draft.symptoms)) {
      const custom = k.startsWith('custom:');
      out.push({
        ...base, id: uid(), kind: 'symptom', symptomCode: custom ? 'custom' : (k as SymptomCode), severity: p.severity,
        ...(custom ? { customLabel: p.label ?? k.slice(7), area: p.area ?? 'other' } : {}),
        origin: p.ai ? 'ai_confirmed' : 'manual', ...(p.ai ? { aiSpan: p.ai } : {}), impact: [],
      });
    }
    if (draft.hadBleeding) out.push({ ...base, id: uid(), kind: 'bleeding', bleeding: draft.bleeding, impact: [], origin: draft.bleedingAi ? 'ai_confirmed' : 'manual', ...(draft.bleedingAi ? { aiSpan: draft.bleedingAi } : {}) });
    if (draft.periodStarted) out.push({ ...base, id: uid(), kind: 'period_start', impact: [], origin: draft.periodAi ? 'ai_confirmed' : 'manual', ...(draft.periodAi ? { aiSpan: draft.periodAi } : {}) });
    const carrier = out.find(e => e.kind === 'symptom') ?? out.find(e => e.kind === 'bleeding');
    if (carrier && draft.impact.length) {
      carrier.impact = draft.impact;
      if (draft.impactAi && carrier.origin !== 'ai_confirmed') { carrier.origin = 'ai_confirmed'; carrier.aiSpan = draft.impactAi; }
    }
    if (draft.note.trim()) out[0].note = draft.note.trim();
    return out;
  };

  const finish = async (list: Entry[]) => {
    setSaving(true); setSaveErr(null);
    try {
      await saveEntries(list);
      const safety = evaluateSafely({
        occurredOn: draft.date, isHappeningNow: draft.date === today, soakingEveryHourForHours: 0, fainted: false,
        severePainWithDanger: false, anyBleeding: list.some(e => e.kind === 'bleeding'), pregnancyStatus: profile.pregnancyStatus,
      });
      const shown = safety.level === 'none' ? null : safety;
      if (shown && shown.tense === 'current') setAlert(shown);
      const days = new Set((await db.entries.toArray()).map(e => e.occurredOn)).size;
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      setSaved({ days, safety: shown, bledAfterStop: stage === 'post_menopause' && list.some(e => e.kind === 'bleeding') });
      announce(`Saved. Your records now cover ${days} days.`);
    } catch (e) {
      setSaveErr(e instanceof SaveError ? e.message : 'Sakhi could not save this. Please try again.');
    } finally { setSaving(false); }
  };

  const save = () => {
    if (!validateStep1()) { setStep(1); return; }
    if (!hasContent) { setSaveErr('Choose at least one symptom, or use "Nothing to report today".'); return; }
    if (draft.impact.length && !Object.keys(draft.symptoms).length && !draft.hadBleeding) {
      setSaveErr('Add a symptom or bleeding so the effect on your day has something to belong to.'); return;
    }
    void finish(buildEntries());
  };

  const saveNothing = () => {
    setConfirmNothing(false);
    const source = settings?.syntheticLoaded ? 'synthetic' : 'user';
    void finish([{ id: uid(), occurredOn: draft.date, recordedAt: new Date().toISOString(), kind: 'checkin', impact: [], source, origin: 'manual', ...(draft.note.trim() ? { note: draft.note.trim() } : {}) }]);
  };

  if (saved) {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        {saved.safety && <SafetyCard result={saved.safety} />}
        {saved.bledAfterStop && <div className="banner banner-info" role="status"><p style={{ margin: 0 }}>From the urgent help list, see a doctor soon if you have: {BLEEDING_AFTER_PERIODS_STOPPED.toLowerCase()}. <Link to="/help">Urgent help</Link></p></div>}
        <div className="card" role="status">
          <h1 ref={headRef} tabIndex={-1}><CircleCheck size={28} color="var(--blue-700)" aria-hidden="true" /> Saved</h1>
          <p>Your records now cover {saved.days} {saved.days === 1 ? 'day' : 'days'}.</p>
          <div className="row">
            <Link className="btn btn-primary" to="/since">Since last visit</Link>
            <Link className="btn btn-secondary" to="/home">Home</Link>
            <button type="button" className="btn-link" onClick={() => { setDraft(fresh()); setSaved(null); setStep(1); }}>Log something else</button>
          </div>
        </div>
      </div>
    );
  }

  const stepNames = ['What you noticed', 'How it affected your day', 'Check and save'];
  // Perimenopause pins sleep, mood and hot flush groups first. Nothing new is added.
  const order = stage === 'perimenopause' ? [...AREA_ORDER.filter(a => a === 'hot_flush_sweats' || a === 'mood_sleep'), ...AREA_ORDER.filter(a => a !== 'hot_flush_sweats' && a !== 'mood_sleep')] : AREA_ORDER;
  const groups = order.filter(a => a !== 'menstrual').map(area => ({
    area, codes: SYMPTOM_CODES.filter(c => SYMPTOM_AREA[c] === area), custom: customKeys.filter(k => (draft.symptoms[k].area ?? 'other') === area),
  }));
  const oldEntry = draft.date && draft.date < addDays(today, -365);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 ref={headRef} tabIndex={-1}>Log symptoms</h1>
      <p className="caption" style={{ marginBottom: 4 }}>Step {step} of 3: {stepNames[step - 1]}</p>
      <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-valuetext={`Step ${step} of 3`}><div style={{ width: `${(step / 3) * 100}%` }} /></div>
      <nav className="steps" aria-label="Steps">
        {stepNames.map((n, i) => (
          <button key={n} type="button" aria-current={step === i + 1 ? 'step' : undefined} onClick={() => { if (i + 1 < step || validateStep1()) setStep(i + 1); }}>
            {i + 1}. {n}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <>
          <div className="log-day">
            <div>
              <p className="log-day-label">{draft.date === today ? 'Today' : 'The day'}, {fmtWeekday(draft.date)} {fmtDate(draft.date, true)}</p>
              {!changeDay && <button type="button" className="btn-link" style={{ minHeight: 32, padding: 0 }} onClick={() => setChangeDay(true)}>Change the day</button>}
              {changeDay && <div className="field" style={{ maxWidth: 240, margin: '6px 0 0' }}>
                <label htmlFor="log-date">Which day?</label>
                <input id="log-date" className="input" type="date" max={today} value={draft.date} onChange={e => set({ date: e.target.value })} aria-describedby="date-err date-note" />
              </div>}
              <FieldError id="date-err" msg={errors.date} />
              {oldEntry && <span id="date-note" className="hint">This day is more than a year ago. It will stay in your journal but will not appear in the 4 or 8 week summaries.</span>}
            </div>
            <div className="log-nothing">
              <button type="button" className="btn btn-quiet" onClick={() => { if (validateStep1()) setConfirmNothing(true); }} disabled={saving || Object.keys(draft.symptoms).length > 0}>Nothing to report {draft.date === today ? 'today' : 'that day'}</button>
              <span className="caption">{Object.keys(draft.symptoms).length ? 'You have picked symptoms for this day.' : 'An easy day counts too. It shows the day was logged, not forgotten.'}</span>
            </div>
          </div>
          <h2 className="log-q">What did you notice? <span className="caption">Pick all that apply, then say how bad each one was.</span></h2>

          {SHOW_LOG_AI && <AiNotePanel today={today} onAccept={acceptAi} />}

          {groups.map(g => (g.codes.length + g.custom.length) > 0 && (
            <fieldset key={g.area}>
              <legend>{AREA_LABEL[g.area]}</legend>
              <div className="chip-grid">
                {g.codes.map(c => {
                  const Icon = SYMPTOM_ICON[c];
                  const on = !!draft.symptoms[c];
                  return (
                    <button key={c} type="button" className="chip" aria-pressed={on} onClick={() => toggleSymptom(c)}>
                      <Icon size={20} aria-hidden="true" /> {SYMPTOM_LABEL[c]} {on && <Check className="chip-check" size={18} aria-hidden="true" />}
                    </button>
                  );
                })}
                {g.custom.map(k => (
                  <button key={k} type="button" className="chip" aria-pressed="true" onClick={() => toggleSymptom(k)}>
                    <SYMPTOM_ICON.custom size={20} aria-hidden="true" /> {keyLabel(k, draft.symptoms[k])} <Check className="chip-check" size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {[...g.codes, ...g.custom].filter(k => draft.symptoms[k]).map(k => (
                <div key={k}>
                  {draft.symptoms[k].ai && <p className="caption" style={{ margin: '8px 0 0' }}>From your note: “{draft.symptoms[k].ai}”</p>}
                  <SeverityPicker id={'sev-' + k} label={keyLabel(k, draft.symptoms[k])} value={draft.symptoms[k].severity} onChange={v => setSeverity(k, v)} error={errors[k]} />
                </div>
              ))}
            </fieldset>
          ))}

          {SHOW_OTHER_SYMPTOM && <fieldset>
            <legend>Something else</legend>
            {!customOpen ? (
              <div className="row">
                <button type="button" className="chip" aria-pressed="false" onClick={() => setCustomOpen(true)} style={{ maxWidth: 260 }}>
                  <Plus size={20} aria-hidden="true" /> Other symptom
                </button>
                {existingCustom.filter(([l]) => !draft.symptoms['custom:' + l]).map(([l, area]) => (
                  <button key={l} type="button" className="chip" aria-pressed="false" style={{ maxWidth: 260 }} onClick={() => toggleSymptom('custom:' + l, { label: l, area })}>
                    <SYMPTOM_ICON.custom size={20} aria-hidden="true" /> {capitalise(l)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="card" style={{ maxWidth: 520 }}>
                <div className="field">
                  <label htmlFor="custom-label">What is it called?</label>
                  <input id="custom-label" className="input" maxLength={60} value={customLabel} onChange={e => setCustomLabel(e.target.value)} aria-describedby="custom-err" placeholder="For example: jaw pain" />
                  <FieldError id="custom-err" msg={errors.custom} />
                </div>
                <div className="field">
                  <label htmlFor="custom-area">Where does it fit best?</label>
                  <select id="custom-area" className="select" value={customArea} onChange={e => setCustomArea(e.target.value as AreaCode)}>
                    {AREA_ORDER.filter(a => a !== 'menstrual').map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
                  </select>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-secondary" onClick={addCustom}>Add</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setCustomOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </fieldset>}

        </>
      )}

      {step === 2 && (
        <>
          <fieldset>
            <legend>{Object.keys(draft.symptoms).length ? `Did ${list(Object.entries(draft.symptoms).map(([k, p]) => keyLabel(k, p).toLowerCase()))} stop you doing anything?` : 'Did anything stop you doing what you planned?'}</legend>
            <p className="caption">This is often what doctors most need to hear. Leave it empty if nothing changed.</p>
            {draft.impactAi && <p className="caption">From your note: “{draft.impactAi}”</p>}
            <div className="check-list">
              {IMPACT_CODES.map(c => (
                <label key={c} className="check">
                  <input type="checkbox" checked={draft.impact.includes(c)} onChange={e => set({ impact: e.target.checked ? [...draft.impact, c] : draft.impact.filter(x => x !== c) })} />
                  {IMPACT_LABEL[c]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>{noCycle ? 'Bleeding' : 'Periods and bleeding'} <span className="caption">(optional)</span></legend>
            {!draft.bleedingOpen ? (
              <button type="button" className="btn btn-quiet" onClick={() => set({ bleedingOpen: true })} aria-expanded="false"><Droplets size={18} aria-hidden="true" /> {noCycle ? 'Add bleeding details' : 'Add period or bleeding details'}</button>
            ) : (
              <div className="stack">
                {!noCycle && <label className="check"><input type="checkbox" checked={draft.periodStarted} onChange={e => set({ periodStarted: e.target.checked })} /> My period started on this day</label>}
                <label className="check"><input type="checkbox" checked={draft.hadBleeding} onChange={e => set({ hadBleeding: e.target.checked })} /> I had bleeding on this day</label>
                {draft.hadBleeding && (
                  <fieldset style={{ marginLeft: 12 }}>
                    <legend>Tick any that happened</legend>
                    {draft.bleedingAi && <p className="caption">From your note: “{draft.bleedingAi}”</p>}
                    <div className="check-list">
                      {BLEEDING_FEATURES.map(f => (
                        <label key={f} className="check">
                          <input type="checkbox" checked={draft.bleeding[f]} onChange={e => set({ bleeding: { ...draft.bleeding, [f]: e.target.checked } })} /> {BLEEDING_LABEL[f]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}
          </fieldset>

          <div className="field">
            <label htmlFor="log-note">Note <span className="caption">(optional)</span></label>
            <textarea id="log-note" className="textarea" maxLength={500} value={draft.note} onChange={e => set({ note: e.target.value })} aria-describedby="note-hint" />
            <span id="note-hint" className="hint">{draft.note.length} of 500 characters. Notes are kept for you and your brief. They are not checked for emergencies.</span>
          </div>
        </>
      )}

      {step === 3 && (
        <section aria-labelledby="review-h">
          <h2 id="review-h">This will be saved for {fmtDate(draft.date, true)}</h2>
          {!hasContent && <p className="muted">Nothing chosen yet. Go back to step 1 to choose a symptom, or record "Nothing to report today".</p>}
          <div className="stack">
            {Object.entries(draft.symptoms).map(([k, p]) => (
              <div key={k} className="entry-row">
                <div className="grow"><strong>{keyLabel(k, p)}</strong>, {p.severity ?? '?'} of 10{p.ai && <div className="caption">Drafted from your note, checked by you</div>}</div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(1)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => toggleSymptom(k)} aria-label={`Remove ${keyLabel(k, p)}`}><Trash2 size={16} aria-hidden="true" /> Remove</button>
              </div>
            ))}
            {draft.periodStarted && (
              <div className="entry-row"><div className="grow"><strong>Period started</strong></div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ periodStarted: false })} aria-label="Remove period started"><Trash2 size={16} aria-hidden="true" /> Remove</button></div>
            )}
            {draft.hadBleeding && (
              <div className="entry-row"><div className="grow"><strong>Bleeding</strong>
                <div className="caption">{BLEEDING_FEATURES.filter(f => draft.bleeding[f]).map(f => BLEEDING_LABEL[f]).join('; ') || 'No heavier bleeding signs ticked'}</div></div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ hadBleeding: false })} aria-label="Remove bleeding"><Trash2 size={16} aria-hidden="true" /> Remove</button></div>
            )}
            {draft.impact.length > 0 && (
              <div className="entry-row"><div className="grow"><strong>Effect on your day</strong><div className="caption">{draft.impact.map(i => IMPACT_LABEL[i]).join('; ')}</div></div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ impact: [] })} aria-label="Remove effect on your day"><Trash2 size={16} aria-hidden="true" /> Remove</button></div>
            )}
            {draft.note.trim() && (
              <div className="entry-row"><div className="grow"><strong>Note</strong><div className="caption">{draft.note}</div></div>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setStep(2)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ note: '' })} aria-label="Remove note"><Trash2 size={16} aria-hidden="true" /> Remove</button></div>
            )}
          </div>
          {saveErr && <p className="error" role="alert" style={{ marginTop: 12 }}>{saveErr} <button type="button" className="btn-link" onClick={save}>Try again</button></p>}
        </section>
      )}

      <div className="sticky-actions">
        <button type="button" className="btn btn-quiet" onClick={() => setStep(s => s - 1)} disabled={step === 1}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
        {step < 3
          ? <button type="button" className="btn btn-primary" onClick={() => { if (step > 1 || validateStep1()) setStep(s => s + 1); }}>Next <ArrowRight size={18} aria-hidden="true" /></button>
          : <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
      </div>

      <ConfirmDialog open={confirmNothing} title="Nothing to report today?"
        body={<p>This records {fmtDate(draft.date, true)} as a day with nothing to report. Anything you picked on this screen will not be saved.</p>}
        confirmLabel="Yes, record it" onCancel={() => setConfirmNothing(false)} onConfirm={saveNothing} />
    </div>
  );
}
