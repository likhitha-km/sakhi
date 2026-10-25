import type { AreaCode, BleedingFeature, Entry, Exclusion, ImpactCode, Profile } from '../types/entry.ts';
import type { EvidenceBundle, EvidenceResult, SymptomEvidence, Window } from '../types/evidence.ts';
import { addDays, daysBetween, fmtDate, fmtDateList, todayLocal } from './dates.ts';
import { GATES } from './gates.ts';
import { median, selectIncluded, uniq } from './select.ts';
import {
  BLEEDING_FEATURES, BLEEDING_SHORT, IMPACT_CODES, IMPACT_LABEL, SYMPTOM_AREA, SYMPTOM_CODES, SYMPTOM_LABEL,
  capitalise, normaliseLabel,
} from './vocab.ts';

export interface ComputeInput {
  entries: Entry[]; exclusions: Exclusion[]; profile: Profile;
  windowDays: 28 | 56; endDate?: string;
}

const LIMIT_LOGGING = 'Counts only include the days you logged. Days without an entry are left out, not counted as zero.';

export const symptomKey = (e: Entry): string | undefined => {
  if (e.kind !== 'symptom' || !e.symptomCode) return undefined;
  return e.symptomCode === 'custom' ? 'custom:' + normaliseLabel(e.customLabel ?? '') : e.symptomCode;
};

export const symptomKeyLabel = (key: string) =>
  key.startsWith('custom:') ? capitalise(key.slice(7)) : SYMPTOM_LABEL[key as keyof typeof SYMPTOM_LABEL] ?? key;

const keyArea = (key: string, entries: Entry[]): AreaCode =>
  key.startsWith('custom:')
    ? entries.find(e => symptomKey(e) === key)?.area ?? 'other'
    : SYMPTOM_AREA[key as keyof typeof SYMPTOM_AREA];

export function pickWindow(entries: Entry[], windowDays: number, endDate?: string): Window {
  const today = todayLocal();
  let end = endDate ?? entries.reduce((m, e) => (e.occurredOn > m ? e.occurredOn : m), '');
  if (!end || end > today) end = today;
  return { start: addDays(end, -(windowDays - 1)), end, days: windowDays };
}

function base(metricId: string, label: string, win: Window, observed: number): EvidenceResult {
  return {
    metricId, metricVersion: GATES.rulesVersion, label,
    windowStart: win.start, windowEnd: win.end,
    includedEntryIds: [], excludedEntryIds: [],
    observedDays: observed, eligibleDays: win.days, missingDays: win.days - observed,
    status: 'ready', statement: '', limitationText: LIMIT_LOGGING,
  };
}

const ids = (xs: Entry[]) => xs.map(e => e.id);

/** Highest severity per day for one symptom, over the given entries. */
function dailyMax(entries: Entry[], key: string) {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (symptomKey(e) !== key) continue;
    const s = e.severity ?? 0;
    out[e.occurredOn] = Math.max(out[e.occurredOn] ?? 0, s);
  }
  return out;
}
const presentDates = (daily: Record<string, number>) => Object.keys(daily).filter(d => daily[d] >= 1).sort();

function safely(fallback: () => EvidenceResult, fn: () => EvidenceResult): EvidenceResult {
  try { return fn(); } catch {
    const r = fallback();
    return { ...r, status: 'insufficient_data', statement: 'This summary could not be worked out.', reason: 'Something went wrong while counting. Your entries are not affected.' };
  }
}

function coverage(inc: Entry[], win: Window): EvidenceResult {
  const o = uniq(inc.map(e => e.occurredOn)).length;
  const r = base('coverage', 'Days with an entry', win, o);
  r.includedEntryIds = ids(inc);
  r.numerator = o; r.denominator = win.days;
  r.statement = `${o} of ${win.days} days have an entry. ${win.days - o} ${win.days - o === 1 ? 'day has' : 'days have'} none.`;
  return r;
}

function symptomDays(key: string, label: string, inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult {
  const r = base('symptom_days:' + key, label, win, o);
  const daily = dailyMax(inc, key);
  const present = presentDates(daily);
  r.includedEntryIds = ids(inc.filter(e => symptomKey(e) === key));
  r.excludedEntryIds = ids(exc.filter(e => symptomKey(e) === key));
  r.numerator = present.length; r.denominator = o;
  if (present.length === 0) {
    r.status = 'insufficient_data';
    r.statement = `${label} was recorded on 0 of ${o} logged days.`;
    r.reason = 'Needs at least 1 day with a score above 0.';
    return r;
  }
  r.statement = present.length === 1
    ? `${label} was recorded on 1 of ${o} logged days, on ${fmtDate(present[0])}.`
    : `${label} was recorded on ${present.length} of ${o} logged days, first on ${fmtDate(present[0])}, last on ${fmtDate(present[present.length - 1])}.`;
  return r;
}

function symptomMedian(key: string, label: string, inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult {
  const r = base('median:' + key, `${label}: middle score`, win, o);
  const daily = dailyMax(inc, key);
  const present = presentDates(daily);
  r.includedEntryIds = ids(inc.filter(e => symptomKey(e) === key && (e.severity ?? 0) >= 1));
  r.excludedEntryIds = ids(exc.filter(e => symptomKey(e) === key));
  r.denominator = present.length;
  if (present.length < GATES.medianMinDays) {
    r.status = 'insufficient_data';
    r.statement = 'Not enough days to give a middle score.';
    r.reason = `Needs at least ${GATES.medianMinDays} days with this symptom. So far there ${present.length === 1 ? 'is 1' : `are ${present.length}`}.`;
    return r;
  }
  r.median = median(present.map(d => daily[d]));
  r.statement = `On those days the middle score was ${r.median} out of 10.`;
  r.limitationText = 'The middle score is the score in the middle when your days are lined up from lowest to highest. ' + LIMIT_LOGGING;
  return r;
}

function impactResult(code: ImpactCode, inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult {
  const label = IMPACT_LABEL[code];
  const r = base('impact:' + code, label, win, o);
  const withCode = inc.filter(e => e.impact.includes(code));
  const dates = uniq(withCode.map(e => e.occurredOn)).sort();
  r.includedEntryIds = ids(withCode);
  r.excludedEntryIds = ids(exc.filter(e => e.impact.includes(code)));
  r.numerator = dates.length; r.denominator = o;
  if (!dates.length) {
    r.status = 'insufficient_data';
    r.statement = `${label} is not recorded on any included day.`;
    r.reason = 'Needs at least 1 day with this recorded.';
    return r;
  }
  r.statement = `${label} was recorded on ${dates.length} ${dates.length === 1 ? 'day' : 'days'}: ${fmtDateList(dates)}.`;
  return r;
}

function bleeding(inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult {
  const r = base('bleeding', 'Bleeding', win, o);
  const b = inc.filter(e => e.kind === 'bleeding');
  const days = uniq(b.map(e => e.occurredOn));
  const featureDays = (f: BleedingFeature) => uniq(b.filter(e => e.bleeding?.[f]).map(e => e.occurredOn)).length;
  const anyDays = uniq(b.filter(e => e.bleeding && BLEEDING_FEATURES.some(f => e.bleeding![f])).map(e => e.occurredOn)).length;
  r.includedEntryIds = ids(b);
  r.excludedEntryIds = ids(exc.filter(e => e.kind === 'bleeding'));
  r.numerator = anyDays; r.denominator = days.length;
  r.secondary = Object.fromEntries(BLEEDING_FEATURES.map(f => [f, featureDays(f)]));
  r.limitationText = 'These descriptions follow common signs of heavy periods. ' + LIMIT_LOGGING;
  if (!days.length) {
    r.status = 'insufficient_data';
    r.statement = 'No bleeding days are recorded in this period.';
    r.reason = 'Needs at least 1 bleeding day.';
    return r;
  }
  const list = BLEEDING_FEATURES.filter(f => r.secondary![f] > 0)
    .map(f => `${BLEEDING_SHORT[f]} (${r.secondary![f]} ${r.secondary![f] === 1 ? 'day' : 'days'})`);
  r.statement = anyDays
    ? `On ${anyDays} of ${days.length} bleeding days at least one of these was recorded: ${list.join(', ')}.`
    : `Bleeding was recorded on ${days.length} ${days.length === 1 ? 'day' : 'days'}. None of the heavier bleeding signs were recorded.`;
  return r;
}

function recentPrev(key: string, label: string, inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult {
  const G = GATES.recentPrev;
  const r = base('recent_prev:' + key, `${label}: latest 2 weeks and the 2 weeks before`, win, o);
  const recentLo = addDays(win.end, -(G.windowDays - 1)), prevHi = addDays(recentLo, -1), prevLo = addDays(prevHi, -(G.windowDays - 1));
  const part = (lo: string, hi: string) => {
    const xs = inc.filter(e => e.occurredOn >= lo && e.occurredOn <= hi);
    const daily = dailyMax(xs, key);
    const present = presentDates(daily);
    return { observed: uniq(xs.map(e => e.occurredOn)).length, present, daily };
  };
  const rec = part(recentLo, win.end), prev = part(prevLo, prevHi);
  r.includedEntryIds = ids(inc.filter(e => symptomKey(e) === key && e.occurredOn >= prevLo));
  r.excludedEntryIds = ids(exc.filter(e => symptomKey(e) === key && e.occurredOn >= prevLo));
  r.secondary = { recentObserved: rec.observed, recentPresent: rec.present.length, prevObserved: prev.observed, prevPresent: prev.present.length };
  const ok = (p: typeof rec) => p.observed >= G.minObservedDays && p.present.length >= G.minPresentDays;
  if (!ok(rec) || !ok(prev)) {
    r.status = 'insufficient_data';
    r.statement = 'Not enough days to compare the latest 2 weeks with the 2 weeks before.';
    r.reason = `Each 2 week stretch needs at least ${G.minObservedDays} logged days and ${G.minPresentDays} days with this symptom. ` +
      `Latest 2 weeks: ${rec.observed} logged, ${rec.present.length} with it. The 2 weeks before: ${prev.observed} logged, ${prev.present.length} with it.`;
    return r;
  }
  const rm = median(rec.present.map(d => rec.daily[d])), pm = median(prev.present.map(d => prev.daily[d]));
  const diff = Math.round((rm - pm) * 10) / 10;
  r.median = rm;
  r.secondary.recentMedian = rm; r.secondary.prevMedian = pm; r.secondary.difference = diff;
  r.statement = `The middle score was ${rm} in the latest 2 weeks and ${pm} in the 2 weeks before (difference ${diff > 0 ? '+' : ''}${diff}).`;
  r.limitationText = 'Many things can change a score from week to week. ' + LIMIT_LOGGING;
  return r;
}

const cycleNotApplicable = (p: Profile) => p.cycleStatus === 'none_or_stopped' || p.cycleStatus === 'hormonal_contraception';

function perimenstrual(key: string, label: string, inc: Entry[], exc: Entry[], win: Window, o: number, profile: Profile): EvidenceResult {
  const G = GATES.peri;
  const r = base('perimenstrual:' + key, `${label}: timing around periods`, win, o);
  const isRelevant = (e: Entry) => e.kind === 'period_start' || symptomKey(e) === key;
  r.includedEntryIds = ids(inc.filter(isRelevant));
  r.excludedEntryIds = ids(exc.filter(isRelevant));
  r.limitationText = `"Around a period start" means from ${G.daysBefore} days before to ${G.daysAfter} days after a period start you recorded. ` + LIMIT_LOGGING;
  if (cycleNotApplicable(profile)) {
    r.status = 'not_applicable';
    r.statement = 'Timing around periods is not shown.';
    r.reason = 'Period timing does not apply to you, based on what you told us about your cycle.';
    return r;
  }
  const starts = uniq(inc.filter(e => e.kind === 'period_start').map(e => e.occurredOn)).sort();
  const present = presentDates(dailyMax(inc, key));
  if (starts.length < G.minStarts || present.length < G.minOccurrences) {
    r.status = 'insufficient_data';
    r.statement = 'Not enough records to look at timing around periods.';
    r.reason = `Needs ${G.minStarts} period starts and ${G.minOccurrences} days with this symptom. So far there are ${starts.length} and ${present.length}.`;
    return r;
  }
  const inWin = (d: string) => starts.some(s => d >= addDays(s, -G.daysBefore) && d <= addDays(s, G.daysAfter));
  const observed = uniq(inc.map(e => e.occurredOn));
  const k = present.filter(inWin).length, a = observed.filter(inWin).length;
  r.numerator = k; r.denominator = present.length;
  r.secondary = { windowObserved: a, observed: observed.length };
  r.statement = `${k} of ${present.length} days with ${label.toLowerCase()} fell around a period start. Those days around a period start make up ${a} of ${observed.length} logged days.`;
  if (profile.cycleStatus === 'irregular') r.limitationText += ' Your cycles are irregular, so these stretches can overlap.';
  return r;
}

function intervals(inc: Entry[], exc: Entry[], win: Window, o: number, profile: Profile): EvidenceResult {
  const r = base('intervals', 'Gaps between period starts', win, o);
  r.includedEntryIds = ids(inc.filter(e => e.kind === 'period_start'));
  r.excludedEntryIds = ids(exc.filter(e => e.kind === 'period_start'));
  if (cycleNotApplicable(profile)) {
    r.status = 'not_applicable';
    r.statement = 'Gaps between periods are not shown.';
    r.reason = 'Period timing does not apply to you, based on what you told us about your cycle.';
    return r;
  }
  const starts = uniq(inc.filter(e => e.kind === 'period_start').map(e => e.occurredOn)).sort();
  if (starts.length < GATES.intervalMinStarts) {
    r.status = 'insufficient_data';
    r.statement = 'Not enough period starts to show the gaps between them.';
    r.reason = `Needs at least ${GATES.intervalMinStarts} recorded period starts. So far there ${starts.length === 1 ? 'is 1' : `are ${starts.length}`}.`;
    return r;
  }
  const gaps = starts.slice(1).map((s, i) => daysBetween(starts[i], s));
  r.median = median(gaps);
  r.secondary = { min: Math.min(...gaps), max: Math.max(...gaps) };
  r.numerator = gaps.length;
  r.statement = `Recorded period starts were ${gaps.join(', ').replace(/, (\d+)$/, ' and $1')} days apart (middle ${r.median}, range ${r.secondary.min} to ${r.secondary.max}).`;
  if (profile.cycleStatus === 'irregular') r.limitationText = 'Your cycles are irregular, so gaps can vary a lot. ' + LIMIT_LOGGING;
  return r;
}

function overlap(keys: string[], inc: Entry[], exc: Entry[], win: Window, o: number): EvidenceResult[] {
  const presentByKey = new Map(keys.map(k => [k, new Set(presentDates(dailyMax(inc, k)))]));
  const eligible = keys.filter(k => presentByKey.get(k)!.size >= GATES.overlapMinDays);
  const out: EvidenceResult[] = [];
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const A = eligible[i], B = eligible[j];
    const a = presentByKey.get(A)!, b = presentByKey.get(B)!;
    const co = [...a].filter(d => b.has(d)).length;
    if (co < GATES.overlapMinCoDays) continue;
    const either = new Set([...a, ...b]).size;
    const la = symptomKeyLabel(A), lb = symptomKeyLabel(B);
    const r = base(`overlap:${A}+${B}`, `${la} and ${lb.toLowerCase()} on the same day`, win, o);
    r.includedEntryIds = ids(inc.filter(e => symptomKey(e) === A || symptomKey(e) === B));
    r.excludedEntryIds = ids(exc.filter(e => symptomKey(e) === A || symptomKey(e) === B));
    r.numerator = co; r.denominator = either;
    r.statement = `${la} and ${lb.toLowerCase()} were both recorded on ${co} days. Either was recorded on ${either} days.`;
    r.limitationText = 'Being recorded on the same day does not mean one causes the other. ' + LIMIT_LOGGING;
    out.push(r);
  }
  return out.sort((x, y) => (y.numerator! - x.numerator!) || x.metricId.localeCompare(y.metricId)).slice(0, GATES.overlapMax);
}

const byDateThenId = (a: Entry, b: Entry) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id);

export function computeEvidence(input: ComputeInput): EvidenceBundle {
  const all = [...input.entries].sort(byDateThenId);
  const win = pickWindow(all, input.windowDays, input.endDate);
  const { included: inc, excluded: exc } = selectIncluded(all, input.exclusions, win.start, win.end);
  const observedDates = uniq(inc.map(e => e.occurredOn)).sort();
  const o = observedDates.length;

  const builtIn = SYMPTOM_CODES.filter(c => [...inc, ...exc].some(e => symptomKey(e) === c));
  const custom = uniq([...inc, ...exc].map(symptomKey).filter((k): k is string => !!k && k.startsWith('custom:'))).sort();
  const keys = [...builtIn, ...custom];

  const symptoms: SymptomEvidence[] = keys.map(key => {
    const label = symptomKeyLabel(key);
    const fb = () => base('symptom_days:' + key, label, win, o);
    const daily = dailyMax(inc, key);
    return {
      key, label, area: keyArea(key, all),
      days: safely(fb, () => symptomDays(key, label, inc, exc, win, o)),
      median: safely(fb, () => symptomMedian(key, label, inc, exc, win, o)),
      presentDays: presentDates(daily),
      dailySeverity: daily,
    };
  });

  const impactCodes = IMPACT_CODES.filter(c => [...inc, ...exc].some(e => e.impact.includes(c)));
  const withPresence = symptoms.filter(s => s.presentDays.length > 0).map(s => s.key);

  return {
    rulesVersion: GATES.rulesVersion,
    generatedAt: new Date().toISOString(),
    window: win,
    coverage: coverage(inc, win),
    observedDates,
    checkinDates: uniq(inc.filter(e => e.kind === 'checkin').map(e => e.occurredOn)).sort(),
    symptoms,
    impact: impactCodes.map(c => safely(() => base('impact:' + c, IMPACT_LABEL[c], win, o), () => impactResult(c, inc, exc, win, o))),
    bleeding: safely(() => base('bleeding', 'Bleeding', win, o), () => bleeding(inc, exc, win, o)),
    recentPrev: withPresence.map(k => safely(() => base('recent_prev:' + k, symptomKeyLabel(k), win, o), () => recentPrev(k, symptomKeyLabel(k), inc, exc, win, o))),
    perimenstrual: withPresence.map(k => safely(() => base('perimenstrual:' + k, symptomKeyLabel(k), win, o), () => perimenstrual(k, symptomKeyLabel(k), inc, exc, win, o, input.profile))),
    intervals: safely(() => base('intervals', 'Gaps between period starts', win, o), () => intervals(inc, exc, win, o, input.profile)),
    overlap: overlap(keys, inc, exc, win, o),
    excludedInWindow: ids(exc),
    aiConfirmedCount: inc.filter(e => e.origin === 'ai_confirmed').length,
  };
}

/** Every result in a bundle, for lookups by metric id. */
export function allResults(b: EvidenceBundle): EvidenceResult[] {
  return [
    b.coverage, ...b.symptoms.flatMap(s => [s.days, s.median]), ...b.impact, b.bleeding,
    ...b.recentPrev, ...b.perimenstrual, b.intervals, ...b.overlap,
  ];
}
