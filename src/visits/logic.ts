import type { AdviceItem, CareEvent, Concern, Disclosure, DisclosureStatus, ItemOrigin, NextVisit, Provider, Visit } from '../types/care.ts';
import type { Entry, Exclusion, ImpactCode, Profile } from '../types/entry.ts';
import { addDays, dateRange, todayLocal } from '../engine/dates.ts';
import { selectIncluded, uniq } from '../engine/select.ts';
import { computeEvidence, symptomKey, symptomKeyLabel } from '../engine/compute.ts';
import { inUseNow, SYSTEM_LABEL } from '../brief/careViews.ts';
import { suggestedQuestions } from '../brief/questions.ts';
import { carryForward, type StatusCounts } from '../loop/loop.ts';
import { DEFAULT_PROFILE } from '../db/repo.ts';
import { disclosureStatus, fmtShort, providerShort, reasonText } from './basics.ts';

export { disclosureStatus, isOverdue, providerShort } from './basics.ts';

export const DISCLOSURE_LABEL: Record<DisclosureStatus, string> = { told: 'Told', not_told: 'Not marked as told', unsure: 'Not sure' };

export function lastVisit(visits: Visit[], providerId?: string, before?: string) {
  return [...visits].filter(v => (!providerId || v.providerId === providerId) && (!before || v.on < before))
    .sort((a, b) => b.on.localeCompare(a.on))[0];
}

export interface SinceRow { key: string; label: string; days: string[]; limitedDays: string[]; entryIds: string[]; limitedEntryIds: string[] }
export interface SinceSummary { from: string; to: string; totalDays: number; daysWithEntry: string[]; daysWithout: string[]; rows: SinceRow[]; entryIds: string[] }

/** Counts only: days each symptom appeared (score 1 or more) and days it came with an effect on the day. */
export function sinceSummary(entries: Entry[], exclusions: Exclusion[], from: string, to: string): SinceSummary {
  const { included } = selectIncluded(entries, exclusions, from, to);
  const days = dateRange(from, to);
  const logged = uniq(included.map(e => e.occurredOn)).sort();
  const keys = uniq(included.map(symptomKey).filter((k): k is string => !!k));
  const rows = keys.map(key => {
    const xs = included.filter(e => symptomKey(e) === key && (e.severity ?? 0) >= 1);
    const limited = xs.filter(e => e.impact.length > 0);
    return {
      key, label: symptomKeyLabel(key),
      days: uniq(xs.map(e => e.occurredOn)).sort(), limitedDays: uniq(limited.map(e => e.occurredOn)).sort(),
      entryIds: xs.map(e => e.id), limitedEntryIds: limited.map(e => e.id),
    };
  }).filter(r => r.days.length > 0).sort((a, b) => b.days.length - a.days.length || a.label.localeCompare(b.label));
  return { from, to, totalDays: days.length, daysWithEntry: logged, daysWithout: days.filter(d => !logged.includes(d)), rows, entryIds: included.map(e => e.id) };
}

export const IMPACT_ANY: ImpactCode[] = ['activity_limited', 'missed_work_study', 'sleep_disrupted', 'mobility_limited', 'self_care_limited'];

/** Questions that only make sense with periods: hidden for post menopause, hysterectomy and "other". */
export const CYCLE_ONLY_QUESTIONS = ['Q1', 'Q3', 'Q4', 'Q6'];
export const stageHidesCycle = (p?: Profile) => p?.stage === 'post_menopause' || p?.stage === 'hysterectomy' || p?.stage === 'other';

export interface CardInput {
  next: NextVisit; providers: Provider[]; visits: Visit[]; advice: AdviceItem[]; concerns: Concern[];
  disclosures: Disclosure[]; care: CareEvent[]; entries: Entry[]; exclusions: Exclusion[]; profile?: Profile; today?: string;
}

export interface CardModel {
  clinician: string; on: string; goal: string;
  since: SinceSummary; sinceLabel: string;
  inUse: { system: string; items: { id: string; title: string; told: DisclosureStatus }[] }[];
  inUseIds: string[]; notToldIds: string[];
  advice: {
    counts: StatusCounts;
    done: AdviceItem[]; notStarted: AdviceItem[];
    overdue: AdviceItem[];                                   // carried
    skipped: { item: AdviceItem; line: string }[];           // carried, with her reason
    unsure: AdviceItem[];                                    // carried
    open: AdviceItem[];                                      // carried, not started and not past a date
  };
  concerns: Concern[];                                       // carried
  tests: { id: string; title: string; on: string; note?: string }[];
  questions: { id: string; text: string }[];
  /** What happened between visits, across every clinician, from her records. */
  changes: {
    seenBefore: boolean; from: string;
    otherVisits: { id: string; who: string; on: string; systems: string; advice: number }[];
    started: { id: string; title: string; on: string; by?: string }[];
    stopped: { id: string; title: string; on: string; why?: string }[];
    lastAdvice: { id: string; text: string; status: string; origin?: ItemOrigin }[];   // what this clinician advised last time
  };
}

const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function buildCard(i: CardInput): CardModel {
  const today = i.today ?? todayLocal();
  const profile = i.profile ?? DEFAULT_PROFILE;
  const prov = i.providers.find(p => p.id === i.next.providerId);
  const clinician = providerShort(prov);
  const name = (id?: string) => providerShort(i.providers.find(p => p.id === id));
  const seen = lastVisit(i.visits, i.next.providerId, i.next.on > today ? undefined : i.next.on);
  const anyLast = lastVisit(i.visits, undefined, addDays(today, 1));
  const ref = seen ?? anyLast;
  const to = i.next.on > today ? today : addDays(i.next.on, -1);
  const from = ref ? ref.on : addDays(to, -27);
  const since = sinceSummary(i.entries, i.exclusions, from <= to ? from : to, to);
  const sinceLabel = seen ? `Since my last visit to ${clinician}` : ref ? `Since my last visit (to ${name(ref.providerId)})` : 'In the last 4 weeks';

  const using = inUseNow(i.care, today);
  const groups = new Map<string, CardModel['inUse'][number]['items']>();
  for (const t of using) {
    const sys = t.systems.map(s => SYSTEM_LABEL[s]).join(' and ') || 'Other';
    groups.set(sys, [...(groups.get(sys) ?? []), { id: t.id, title: t.title, told: disclosureStatus(i.disclosures, t.id, i.next.providerId) }]);
  }

  const carried = carryForward({ ...i, nextVisits: [i.next], profile }, i.next.providerId, today);
  const visitOf = (a: AdviceItem | Concern) => i.visits.find(v => v.id === a.visitId);
  const skipped = carried.skipped.map(a => {
    const v = visitOf(a);
    return { item: a, line: `Not done: ${a.text}. My reason: ${reasonText(a)}.${v ? ` Advised by ${name(v.providerId)} on ${fmtShort(v.on)}` : ''}` };
  });

  const tests = [
    ...i.care.filter(c => c.kind === 'test' && c.date <= today).map(c => ({ id: c.id, title: c.title, on: c.date })),
    ...i.advice.filter(a => a.kind === 'test' && a.status === 'done').map(a => ({ id: a.id, title: a.text, on: a.doneOn ?? visitOf(a)?.on ?? '', ...(a.resultNote ? { note: a.resultNote } : {}) })),
  ].sort((a, b) => b.on.localeCompare(a.on));

  // Questions: what she was not sure about first, then using things together, different advice, then the question bank.
  const qs: { id: string; text: string }[] = [];
  for (const a of [...carried.unsure, ...carried.skipped.filter(x => x.reason === 'did_not_understand')])
    qs.push({ id: 'U:' + a.id, text: `I was not sure about: ${a.text}. Can you explain it?` });
  // Different advice is only raised when she recorded it herself, never inferred from two notes being different.
  for (const a of carried.skipped.filter(x => x.reason === 'conflicting')) {
    const v = visitOf(a);
    qs.push({ id: 'Q10:' + a.id, text: `I was told different things about: ${a.text}${v ? ` (${name(v.providerId)}, ${fmtShort(v.on)})` : ''}. Which should I follow?` });
  }
  const systems = uniq(using.flatMap(t => t.systems));
  if (using.length >= 2 && systems.length >= 2) qs.push({ id: 'Q9', text: `I am using these together: ${list(using.map(t => `${t.title} (${t.systems.map(s => SYSTEM_LABEL[s]).join(' and ')})`))}. Is there anything I should know about using them together?` });
  const bundle = computeEvidence({ entries: i.entries, exclusions: i.exclusions, profile, windowDays: 28 });
  const bank = suggestedQuestions(bundle, i.entries, i.exclusions, i.care, i.providers, false, today)
    .filter(q => !['Q9', 'Q10'].includes(q.id.split(':')[0]))
    .filter(q => !(stageHidesCycle(profile) && CYCLE_ONLY_QUESTIONS.includes(q.id.split(':')[0])));
  for (const q of bank) qs.push(q);

  // Changes since she last saw this clinician; for a clinician she has not seen, the last 3 months.
  const changeFrom = seen ? seen.on : addDays(today, -90);
  const STATUS = { not_started: 'not started', done: 'done', skipped: 'not done', unsure: 'not sure' } as const;
  const STOP = { me: 'I stopped it', clinician: 'stopped by a clinician', finished: 'course finished', problem: 'stopped because of a problem' } as const;
  const changes: CardModel['changes'] = {
    seenBefore: !!seen, from: changeFrom,
    otherVisits: [...i.visits].filter(v => v.providerId !== i.next.providerId && v.on > changeFrom && v.on <= today).sort((a, b) => a.on.localeCompare(b.on))
      .map(v => ({ id: v.id, who: name(v.providerId), on: v.on, systems: v.systems.map(s => SYSTEM_LABEL[s]).join(' and '), advice: i.advice.filter(a => a.visitId === v.id).length })),
    started: i.care.filter(c => c.kind === 'treatment' && c.date > changeFrom && c.date <= today).sort((a, b) => a.date.localeCompare(b.date))
      .map(c => ({ id: c.id, title: c.title, on: c.date, ...(c.providerId ? { by: name(c.providerId) } : {}) })),
    stopped: i.care.filter(c => c.kind === 'treatment' && c.endDate && c.endDate > changeFrom && c.endDate <= today).sort((a, b) => a.endDate!.localeCompare(b.endDate!))
      .map(c => ({ id: c.id, title: c.title, on: c.endDate!, ...(c.stoppedBy ? { why: STOP[c.stoppedBy] } : {}) })),
    lastAdvice: seen ? i.advice.filter(a => a.visitId === seen.id).map(a => ({ id: a.id, text: a.text, status: a.status === 'skipped' ? `not done (${reasonText(a)})` : STATUS[a.status], origin: a.origin })) : [],
  };

  return {
    clinician, on: i.next.on, goal: i.next.goal ?? '', changes,
    since, sinceLabel,
    inUse: [...groups].map(([system, items]) => ({ system, items })),
    inUseIds: using.map(t => t.id),
    notToldIds: carried.notMarkedTold.map(t => t.id),
    advice: {
      counts: carried.counts,
      done: i.advice.filter(a => a.status === 'done'),
      notStarted: i.advice.filter(a => a.status === 'not_started'),
      overdue: carried.overdue, skipped, unsure: carried.unsure, open: carried.notStarted,
    },
    concerns: carried.openConcerns, tests, questions: qs.slice(0, 2),
  };
}

export { CARD_FOOTER } from './basics.ts';
