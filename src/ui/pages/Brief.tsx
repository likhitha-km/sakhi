import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { db } from '../../db/db.ts';
import { saveDraft, SaveError } from '../../db/repo.ts';
import { briefQuestions, buildBrief, emptyDraft, isOn, SECTION_LABEL, visibleSuggestions, type BriefModel } from '../../brief/buildBrief.ts';
import { computeEvidence } from '../../engine/compute.ts';
import { fmtDate } from '../../engine/dates.ts';
import type { BriefDraft, BriefSectionKey } from '../../types/brief.ts';
import { useAppData } from '../hooks/data.ts';
import { PageHeader } from '../components/common.tsx';
import { WindowSwitch } from './Patterns.tsx';

export function BriefView({ m }: { m: BriefModel }) {
  return (
    <>
      <div className="brief-head">
        <h1>My symptom summary</h1>
        <div>Period covered: {fmtDate(m.windowStart, true)} to {fmtDate(m.windowEnd, true)} · Prepared on {fmtDate(m.generatedOn, true)}</div>
        <div><strong>Patient reported information. Not a diagnosis.</strong></div>
        {m.sample && <div className="brief-sample">{m.sample}</div>}
      </div>
      {m.profile && <p>{m.profile.map(p => <span key={p.label}><strong>{p.label}:</strong> {p.value}. </span>)}</p>}
      {m.goal && <><h2>Why I am here</h2><p>{m.goal}</p></>}
      {m.priorities && <><h2>What I want to discuss</h2><ol style={{ margin: 0, paddingLeft: 18 }}>{m.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol></>}
      {m.coverage && <><h2>How much I logged</h2><p>{m.coverage}</p></>}
      {m.highlights && <><h2>Points I picked out</h2><ul>{m.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
      {m.symptoms && <><h2>What I recorded</h2>
        {m.symptoms.length ? <table><thead><tr><th>Symptom</th><th>Days</th><th>Middle score</th><th>First</th><th>Last</th></tr></thead>
          <tbody>{m.symptoms.map(s => <tr key={s.label}><td>{s.label}</td><td>{s.days} of {s.of} logged</td><td>{s.middle}</td><td>{s.first}</td><td>{s.last}</td></tr>)}</tbody></table>
          : <p>No symptoms recorded in this period.</p>}</>}
      {m.impact && m.impact.length > 0 && <><h2>Effect on daily life</h2><ul>{m.impact.map(i => <li key={i.label}>{i.text}</li>)}</ul></>}
      {m.bleeding && <><h2>Bleeding</h2><p>{m.bleeding}</p></>}
      {m.timing && <><h2>Timing</h2><ul>{m.timing.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      {m.overlap && <><h2>Symptoms on the same day</h2><ul>{m.overlap.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
      {m.care && <><h2>Care so far</h2>
        <table><thead><tr><th>Date</th><th>Who</th><th>Kind</th><th>What</th><th>Type of care</th></tr></thead>
          <tbody>{m.care.rows.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.who}</td><td>{r.kind}</td><td>{r.what}</td><td>{r.system}</td></tr>)}</tbody></table>
        {m.care.inUse.length > 0 && <p style={{ marginTop: 4 }}><strong>In use now:</strong> {m.care.inUse.join('; ')}.</p>}
        {m.care.tests.length > 0 && <p><strong>Tests already done:</strong> {m.care.tests.join('; ')}.</p>}
        {m.care.followUps.length > 0 && <p><strong>Follow ups:</strong> {m.care.followUps.join('; ')}.</p>}
        {m.care.attachments.length > 0 && <p><strong>Reports I can show:</strong> {m.care.attachments.join('; ')}.</p>}
      </>}
      {m.questions && m.questions.length > 0 && <><h2>Questions I would like to ask</h2><ol style={{ margin: 0, paddingLeft: 18 }}>{m.questions.map((q, i) => <li key={i}>{q}</li>)}</ol></>}
      {m.notes && m.notes.length > 0 && <><h2>My notes</h2><ul>{m.notes.map((n, i) => <li key={i}>{n.date}: {n.text}</li>)}</ul></>}
      {m.excluded && <><h2>Entries I left out</h2><p>{m.excluded.count} {m.excluded.count === 1 ? 'entry' : 'entries'} left out, from {m.excluded.dates}.</p></>}
      <div className="brief-limits">
        {m.dataNotes.map(t => <div key={t}>{t}</div>)}
        {m.limits.map(t => <div key={t}><strong>{t}</strong></div>)}
      </div>
      <div className="brief-foot">Prepared with Sakhi on {fmtDate(m.generatedOn, true)}. Patient reported information. Not a diagnosis.</div>
    </>
  );
}

const TOGGLES: BriefSectionKey[] = ['coverage', 'highlights', 'symptoms', 'impact', 'bleeding', 'timing', 'overlap', 'care', 'careNames', 'priorities', 'questions', 'notes', 'excluded'];
const PROFILE_TOGGLES: BriefSectionKey[] = ['ageBand', 'lifeStage', 'diagnoses', 'medicines', 'goal'];

export function Brief() {
  const { entries, exclusions, profile, care, providers, settings, loading } = useAppData();
  const stored = useLiveQuery(async () => (await db.briefs.get(1)) ?? null, [], undefined);
  const [draft, setDraftState] = useState<BriefDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [overflow, setOverflow] = useState(false);
  const [newQ, setNewQ] = useState('');
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (draft === null && stored !== undefined) setDraftState(stored ?? { ...emptyDraft(), windowDays: settings?.windowDays ?? 56 });
  }, [stored, draft, settings?.windowDays]);

  const d = draft ?? emptyDraft();
  const bundle = useMemo(() => computeEvidence({ entries, exclusions, profile, windowDays: d.windowDays }), [entries, exclusions, profile, d.windowDays]);
  // Pins come from Patterns, so read them live from storage.
  const live = { ...d, pinned: stored?.pinned ?? d.pinned };
  const input = { bundle, profile, draft: live, entries, exclusions, care, providers, sampleName: settings?.syntheticLoaded ? settings.sampleName ?? 'sample' : null };
  const model = buildBrief(input);
  const questions = briefQuestions(input);
  const suggested = visibleSuggestions(input);

  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    el.classList.remove('overflow');
    const over = el.scrollHeight > el.clientHeight + 2;
    setOverflow(over);
    if (over) el.classList.add('overflow');
  });

  const update = (p: Partial<BriefDraft>) => {
    const next = { ...live, ...p };
    setDraftState(next);
    saveDraft(next).catch(x => setErr(x instanceof SaveError ? x.message : 'Your changes could not be saved.'));
  };
  const toggle = (k: BriefSectionKey) => update({ sections: { ...d.sections, [k]: !isOn(d, k) } });

  if (loading || !draft) return <p role="status">Loading…</p>;

  const Toggle = ({ k }: { k: BriefSectionKey }) => (
    <label className="switch" style={{ display: 'flex' }}><input type="checkbox" checked={isOn(d, k)} onChange={() => toggle(k)} /> {SECTION_LABEL[k]}</label>
  );

  return (
    <>
      <PageHeader title="Doctor brief" intro="Choose what to share, add what you want to talk about, then print one page or save it as a PDF.">
        <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={18} aria-hidden="true" /> Save as PDF or print</button>
      </PageHeader>
      <p className="caption no-print">In the print window, choose "Save as PDF" to keep a copy. A saved or shared file leaves Sakhi's protection, so share it only with people you trust.</p>
      {err && <p className="error" role="alert">{err}</p>}

      <div className="brief-mobile-tabs tabs no-print" role="tablist" aria-label="Brief">
        <button type="button" role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
      </div>

      <div className="brief-layout" data-tab={tab}>
        <div className="brief-controls no-print stack">
          <section className="card">
            <h2 style={{ fontSize: 20 }}>Time period</h2>
            <WindowSwitch value={d.windowDays} onChange={v => update({ windowDays: v })} />
            <p className="caption" style={{ marginTop: 8 }}>{fmtDate(bundle.window.start, true)} to {fmtDate(bundle.window.end, true)}</p>
          </section>

          <section className="card">
            <h2 style={{ fontSize: 20 }}>Why you are going</h2>
            <div className="field">
              <label htmlFor="b-goal">In one line</label>
              <input id="b-goal" className="input" maxLength={200} value={d.goal} onChange={e => update({ goal: e.target.value })} placeholder="For example: heavy periods and tiredness for 3 months" />
            </div>
            <fieldset>
              <legend>What you most want to discuss (up to 3)</legend>
              {[0, 1, 2].map(i => (
                <input key={i} className="input" style={{ marginBottom: 8 }} aria-label={`Priority ${i + 1}`} maxLength={160}
                  value={d.priorities[i] ?? ''} onChange={e => { const p = [...d.priorities]; p[i] = e.target.value; update({ priorities: p }); }} />
              ))}
            </fieldset>
          </section>

          <section className="card">
            <h2 style={{ fontSize: 20 }}>Questions</h2>
            <p className="caption">Suggested from your records. Change the wording or remove any.</p>
            {suggested.map(q => {
              const removed = d.questionEdits[q.id] === null;
              const text = d.questionEdits[q.id] ?? q.text;
              return (
                <div key={q.id} className="field">
                  {removed ? (
                    <div className="row-between"><span className="caption">Removed: {q.text.slice(0, 60)}…</span>
                      <button type="button" className="btn-link" onClick={() => { const e = { ...d.questionEdits }; delete e[q.id]; update({ questionEdits: e }); }}>Put back</button></div>
                  ) : (
                    <>
                      <textarea className="textarea" style={{ minHeight: 120 }} aria-label="Suggested question" value={text} onChange={e => update({ questionEdits: { ...d.questionEdits, [q.id]: e.target.value } })} />
                      <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn-link" onClick={() => update({ questionEdits: { ...d.questionEdits, [q.id]: null } })}><Trash2 size={14} aria-hidden="true" /> Remove</button>
                        {d.questionEdits[q.id] !== undefined && <button type="button" className="btn-link" onClick={() => { const e = { ...d.questionEdits }; delete e[q.id]; update({ questionEdits: e }); }}><RotateCcw size={14} aria-hidden="true" /> Original wording</button>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {d.customQuestions.map((q, i) => (
              <div key={i} className="field">
                <textarea className="textarea" style={{ minHeight: 72 }} aria-label={`Your question ${i + 1}`} value={q} onChange={e => { const c = [...d.customQuestions]; c[i] = e.target.value; update({ customQuestions: c }); }} />
                <button type="button" className="btn-link" onClick={() => update({ customQuestions: d.customQuestions.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden="true" /> Remove</button>
              </div>
            ))}
            <div className="field">
              <label htmlFor="b-newq">Add your own question</label>
              <textarea id="b-newq" className="textarea" style={{ minHeight: 60 }} value={newQ} onChange={e => setNewQ(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!newQ.trim()} onClick={() => { update({ customQuestions: [...d.customQuestions, newQ.trim()] }); setNewQ(''); }}><Plus size={16} aria-hidden="true" /> Add question</button>
            </div>
            <p className="caption">{questions.length} {questions.length === 1 ? 'question' : 'questions'} will be on your brief.</p>
          </section>

          <section className="card">
            <h2 style={{ fontSize: 20 }}>What to include</h2>
            <p className="caption">Anything switched off is left out of the printed page completely.</p>
            <h3 style={{ fontSize: 15 }}>About you</h3>
            {PROFILE_TOGGLES.map(k => <Toggle key={k} k={k} />)}
            {!profile.ageBand && !profile.lifeStage && !profile.knownDiagnoses && !profile.medicinesText && <p className="caption">Add these in <Link to="/settings">Settings and privacy</Link> if you want them on your brief.</p>}
            <h3 style={{ fontSize: 15, marginTop: 12 }}>Your records</h3>
            {TOGGLES.map(k => <Toggle key={k} k={k} />)}
            
          </section>
        </div>

        <div className="brief-preview-col">
          <p className="caption no-print" style={{ marginBottom: 6 }}>Preview of your one page brief</p>
          {overflow && <div className="banner banner-sample no-print" role="status"><p style={{ margin: 0 }}>Your brief is longer than one page. Switch off a section or remove a question to fit it on one page. It will still print if you leave it, on more than one page.</p></div>}
          <div ref={pageRef} className="brief-page" aria-label="Brief preview"><BriefView m={model} /></div>
        </div>
      </div>
    </>
  );
}
