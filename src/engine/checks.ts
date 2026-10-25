import type { CareEvent } from '../types/care.ts';
import type { Entry, Exclusion } from '../types/entry.ts';
import { activeExclusionIds, median, uniq } from './select.ts';
import { daysBetween, fmtDate, todayLocal } from './dates.ts';
import { GATES } from './gates.ts';
import { symptomKey, symptomKeyLabel } from './compute.ts';

export interface CheckPrompt {
  id: string;
  rule: 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';
  title: string;
  detail: string;
  entryIds: string[];
  careIds: string[];
}

/** Gentle prompts that point at entries worth a second look. They never change anything. */
export function checkEntries(entries: Entry[], exclusions: Exclusion[], care: CareEvent[] = [], today = todayLocal()): CheckPrompt[] {
  const off = activeExclusionIds(exclusions);
  const inc = entries.filter(e => !off.has(e.id));
  const out: CheckPrompt[] = [];
  const C = GATES.checks;

  // H1: two period starts close together
  const starts = inc.filter(e => e.kind === 'period_start').sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  for (let i = 1; i < starts.length; i++) {
    const gap = daysBetween(starts[i - 1].occurredOn, starts[i].occurredOn);
    if (gap < C.closeStartsDays) out.push({
      id: `H1:${starts[i - 1].id}:${starts[i].id}`, rule: 'H1',
      title: 'Please check these two period start dates',
      detail: `Period starts on ${fmtDate(starts[i - 1].occurredOn)} and ${fmtDate(starts[i].occurredOn)} are only ${gap} ${gap === 1 ? 'day' : 'days'} apart.`,
      entryIds: [starts[i - 1].id, starts[i].id], careIds: [],
    });
  }

  // H2: one day's score far above that symptom's other days
  const keys = uniq(inc.map(symptomKey).filter((k): k is string => !!k));
  for (const key of keys) {
    const xs = inc.filter(e => symptomKey(e) === key && (e.severity ?? 0) >= 1);
    for (const e of xs) {
      const others = xs.filter(x => x.occurredOn !== e.occurredOn).map(x => x.severity ?? 0);
      if (others.length < C.oddSeverityMinOther) continue;
      if ((e.severity ?? 0) - median(others) >= C.oddSeverityGap) out.push({
        id: `H2:${e.id}`, rule: 'H2',
        title: 'This day looks different from your others',
        detail: `${symptomKeyLabel(key)} was ${e.severity} out of 10 on ${fmtDate(e.occurredOn)}, much higher than on your other days. If that is right, there is nothing to do.`,
        entryIds: [e.id], careIds: [],
      });
    }
  }

  // H3 and H4: per day conflicts
  const byDay = new Map<string, Entry[]>();
  for (const e of inc) byDay.set(e.occurredOn, [...(byDay.get(e.occurredOn) ?? []), e]);
  for (const [day, xs] of [...byDay].sort()) {
    const hasCheckin = xs.some(e => e.kind === 'checkin');
    const hasSomething = xs.some(e => (e.kind === 'symptom' && (e.severity ?? 0) >= 1) || e.kind === 'bleeding');
    if (hasCheckin && hasSomething) out.push({
      id: `H3:${day}`, rule: 'H3', title: 'Two different answers for one day',
      detail: `${fmtDate(day)} has "Nothing to report" and also a symptom or bleeding entry.`,
      entryIds: xs.map(e => e.id), careIds: [],
    });
    const impactNoCause = xs.some(e => e.impact.length) && !xs.some(e => e.kind === 'symptom' || e.kind === 'bleeding');
    if (impactNoCause) out.push({
      id: `H4:${day}`, rule: 'H4', title: 'Effect on your day, but no symptom',
      detail: `On ${fmtDate(day)} you noted an effect on your day without a symptom or bleeding entry.`,
      entryIds: xs.filter(e => e.impact.length).map(e => e.id), careIds: [],
    });
  }

  // H5: entries added days later from memory
  const late = inc.filter(e => daysBetween(e.occurredOn, e.recordedAt.slice(0, 10)) > C.lateDays);
  if (late.length) out.push({
    id: 'H5', rule: 'H5', title: `${late.length} ${late.length === 1 ? 'entry was' : 'entries were'} added later from memory`,
    detail: `Added more than ${C.lateDays} days after the day they describe. Your brief will mention that some entries were added later.`,
    entryIds: late.map(e => e.id), careIds: [],
  });

  // H6: impossible care dates
  for (const c of care) {
    if (c.kind === 'treatment' && c.endDate && c.endDate < c.date) out.push({
      id: `H6:end:${c.id}`, rule: 'H6', title: 'A treatment ends before it starts',
      detail: `"${c.title}" starts on ${fmtDate(c.date)} but ends on ${fmtDate(c.endDate)}.`, entryIds: [], careIds: [c.id],
    });
    if (c.kind === 'test' && c.date > today) out.push({
      id: `H6:future:${c.id}`, rule: 'H6', title: 'A test is dated in the future',
      detail: `"${c.title}" is dated ${fmtDate(c.date)}.`, entryIds: [], careIds: [c.id],
    });
  }
  return out;
}

export const lateEntryCount = (entries: Entry[], lo: string, hi: string) =>
  entries.filter(e => e.occurredOn >= lo && e.occurredOn <= hi && daysBetween(e.occurredOn, e.recordedAt.slice(0, 10)) > GATES.checks.lateDays).length;

