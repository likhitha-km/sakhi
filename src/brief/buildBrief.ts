import type { EvidenceBundle } from '../types/evidence.ts';
import type { BriefDraft, BriefQuestion, BriefSectionKey } from '../types/brief.ts';
import type { CareEvent, Provider } from '../types/care.ts';
import type { Entry, Exclusion, Profile } from '../types/entry.ts';
import { fmtDate, fmtDateList, todayLocal } from '../engine/dates.ts';
import { lateEntryCount } from '../engine/checks.ts';
import { allResults } from '../engine/compute.ts';
import { activeExclusionIds } from '../engine/select.ts';
import { suggestedQuestions } from './questions.ts';
import { CARE_KIND_LABEL, comingUp, inUseNow, providerName, SYSTEM_LABEL, testsDone } from './careViews.ts';

export const SECTION_LABEL: Record<BriefSectionKey, string> = {
  ageBand: 'Age group', lifeStage: 'Life stage', diagnoses: 'Conditions I already know about', medicines: 'Medicines I take',
  goal: 'Why I am here', coverage: 'How much I logged', highlights: 'Points I picked out', symptoms: 'What I recorded',
  impact: 'Effect on daily life', bleeding: 'Bleeding', timing: 'Timing', overlap: 'Symptoms on the same day',
  care: 'Care so far', careNames: 'Show clinician names', priorities: 'What I want to discuss', questions: 'Questions I would like to ask',
  notes: 'My notes', excluded: 'Entries I left out',
};

export const DEFAULT_SECTIONS: Record<BriefSectionKey, boolean> = {
  ageBand: true, lifeStage: true, diagnoses: true, medicines: true, goal: true, coverage: true, highlights: true,
  symptoms: true, impact: true, bleeding: true, timing: true, overlap: true, care: true, careNames: false,
  priorities: true, questions: true, notes: true, excluded: true,
};

export const emptyDraft = (): BriefDraft => ({
  id: 1, windowDays: 56, sections: {}, goal: '', priorities: [], questionEdits: {}, customQuestions: [], pinned: [], updatedAt: new Date().toISOString(),
});

export const isOn = (d: BriefDraft, k: BriefSectionKey) => d.sections[k] ?? DEFAULT_SECTIONS[k];

export interface BriefModel {
  windowStart: string; windowEnd: string; generatedOn: string;
  sample: string | null;
  profile: { label: string; value: string }[] | null;
  goal: string | null;
  coverage: string | null;
  highlights: string[] | null;
  symptoms: { label: string; days: number; of: number; middle: string; first: string; last: string }[] | null;
  impact: { label: string; text: string }[] | null;
  bleeding: string | null;
  timing: string[] | null;
  overlap: string[] | null;
  care: {
    rows: { date: string; who: string; kind: string; what: string; system: string }[];
    inUse: string[]; tests: string[]; followUps: string[]; attachments: string[];
  } | null;
  priorities: string[] | null;
  questions: string[] | null;
  notes: { date: string; text: string }[] | null;
  excluded: { count: number; dates: string } | null;
  dataNotes: string[];
  limits: string[];
}

export interface BriefInput {
  bundle: EvidenceBundle; profile: Profile; draft: BriefDraft;
  entries: Entry[]; exclusions: Exclusion[]; care: CareEvent[]; providers: Provider[];
  sampleName?: string | null; today?: string;
}

const CARE_QUESTIONS = ['Q9', 'Q10', 'Q11'];

/** Suggested questions, leaving out care questions when the care section is switched off. */
export function visibleSuggestions(i: BriefInput): BriefQuestion[] {
  const all = suggestedQuestions(i.bundle, i.entries, i.exclusions, i.care, i.providers, isOn(i.draft, 'careNames'), i.today);
  return isOn(i.draft, 'care') ? all : all.filter(q => !CARE_QUESTIONS.includes(q.id));
}

export function briefQuestions(i: BriefInput): BriefQuestion[] {
  const suggested = visibleSuggestions(i)
    .filter(q => i.draft.questionEdits[q.id] !== null)
    .map(q => ({ ...q, text: i.draft.questionEdits[q.id] ?? q.text }));
  return [...suggested, ...i.draft.customQuestions.filter(t => t.trim()).map((text, n) => ({ id: 'own:' + n, text, suggested: false }))];
}

export function buildBrief(i: BriefInput): BriefModel {
  const { bundle: b, profile: p, draft: d } = i;
  const on = (k: BriefSectionKey) => isOn(d, k);
  const today = i.today ?? todayLocal();
  const off = activeExclusionIds(i.exclusions);
  const inWin = i.entries.filter(e => e.occurredOn >= b.window.start && e.occurredOn <= b.window.end);

  const profile = [
    on('ageBand') && p.ageBand ? { label: 'Age group', value: p.ageBand } : null,
    on('lifeStage') && p.lifeStage ? { label: 'Life stage', value: p.lifeStage } : null,
    on('diagnoses') && p.knownDiagnoses ? { label: 'Conditions I already know about', value: p.knownDiagnoses } : null,
    on('medicines') && p.medicinesText ? { label: 'Medicines I take', value: p.medicinesText } : null,
  ].filter((x): x is { label: string; value: string } => !!x);

  const byId = new Map(allResults(b).map(r => [r.metricId, r]));
  const highlights = d.pinned.map(id => byId.get(id)).filter(r => r && r.status === 'ready').map(r => r!.statement);

  const symptoms = b.symptoms.filter(s => s.presentDays.length > 0).map(s => ({
    label: s.label, days: s.presentDays.length, of: b.coverage.observedDays,
    middle: s.median.status === 'ready' ? `${s.median.median} of 10` : 'Too few days',
    first: fmtDate(s.presentDays[0]), last: fmtDate(s.presentDays[s.presentDays.length - 1]),
  }));

  const timing = [
    ...b.perimenstrual.filter(r => r.status === 'ready').map(r => r.statement),
    ...(b.intervals.status === 'ready' ? [b.intervals.statement] : []),
    ...b.recentPrev.filter(r => r.status === 'ready').map(r => `${r.label.split(':')[0]}: ${r.statement}`),
  ];

  const visibleCare = i.care.filter(c => !c.hideFromBrief);
  const names = on('careNames');
  const prov = (c: CareEvent) => providerName(i.providers.find(x => x.id === c.providerId), names);
  const fu = comingUp(visibleCare, today);
  const care = on('care') && visibleCare.length ? {
    rows: [...visibleCare].sort((a, c) => a.date.localeCompare(c.date)).map(c => ({
      date: fmtDate(c.date), who: prov(c) || 'Not given', kind: CARE_KIND_LABEL[c.kind],
      what: c.summary ? `${c.title}: ${c.summary}` : c.title, system: c.systems.map(s => SYSTEM_LABEL[s]).join(' and '),
    })),
    inUse: inUseNow(visibleCare, today).map(c => `${c.title} (${c.systems.map(s => SYSTEM_LABEL[s]).join(' and ')}), since ${fmtDate(c.date)}`),
    tests: testsDone(visibleCare).map(c => `${c.title}, ${fmtDate(c.date)}${c.result ? `: ${c.result}${c.unit ? ' ' + c.unit : ''}` : ''}${c.reportedRange ? ` (range on report: ${c.reportedRange})` : ''}`),
    followUps: [...fu.overdue.map(c => `${c.title}: follow up was due ${fmtDate(c.followUpOn!)}`), ...fu.upcoming.map(c => `${c.title}: follow up on ${fmtDate(c.followUpOn!)}`)],
    attachments: visibleCare.flatMap(c => c.attachmentIds.length ? [`${c.title}, ${fmtDate(c.date)}: ${c.attachmentIds.length} ${c.attachmentIds.length === 1 ? 'file' : 'files'} kept on my phone`] : []),
  } : null;

  const excludedDates = [...new Set(inWin.filter(e => off.has(e.id)).map(e => e.occurredOn))].sort();
  const late = lateEntryCount(i.entries.filter(e => !off.has(e.id)), b.window.start, b.window.end);

  const dataNotes = [
    'Counts depend on the days I logged. Days with no entry are not counted.',
    ...(late ? ['Some entries were added later from memory.'] : []),
    ...(b.aiConfirmedCount ? ['Some entries were drafted by an AI helper from my own words, then checked and saved by me.'] : []),
  ];

  return {
    windowStart: b.window.start, windowEnd: b.window.end, generatedOn: today,
    sample: i.sampleName ? `Sample data for a made up person (${i.sampleName}). Not a real patient.` : null,
    profile: profile.length ? profile : null,
    goal: on('goal') && d.goal.trim() ? d.goal.trim() : null,
    coverage: on('coverage') ? b.coverage.statement : null,
    highlights: on('highlights') && highlights.length ? highlights : null,
    symptoms: on('symptoms') ? symptoms : null,
    impact: on('impact') ? b.impact.filter(r => r.status === 'ready').map(r => ({ label: r.label, text: r.statement })) : null,
    bleeding: on('bleeding') && b.bleeding.status === 'ready' ? b.bleeding.statement : null,
    timing: on('timing') && timing.length ? timing : null,
    overlap: on('overlap') && b.overlap.length ? b.overlap.map(r => r.statement) : null,
    care,
    priorities: on('priorities') && d.priorities.some(x => x.trim()) ? d.priorities.filter(x => x.trim()) : null,
    questions: on('questions') ? briefQuestions(i).map(q => q.text) : null,
    notes: on('notes') ? inWin.filter(e => !off.has(e.id) && e.note?.trim()).sort((a, c) => a.occurredOn.localeCompare(c.occurredOn)).map(e => ({ date: fmtDate(e.occurredOn), text: e.note!.trim() })) : null,
    excluded: on('excluded') && excludedDates.length ? { count: inWin.filter(e => off.has(e.id)).length, dates: fmtDateList(excludedDates, 10) } : null,
    dataNotes,
    limits: [
      'Patient reported information. Not a diagnosis.',
      'Sakhi counts what was recorded. It does not judge what is normal, and it does not suggest causes or treatment.',
    ],
  };
}

/** All text a brief can contain, used to check the wording. */
export function briefText(m: BriefModel): string {
  return JSON.stringify(m);
}
