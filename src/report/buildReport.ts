// The full report: everything she has logged in a chosen range, from stored records only.
import type { LoopState } from '../loop/loop.ts';
import { statusCounts, type StatusCounts } from '../loop/loop.ts';
import type { AdviceStatus, AdviceKind } from '../types/care.ts';
import { dateRange, daysBetween, todayLocal } from '../engine/dates.ts';
import { sinceSummary } from '../visits/logic.ts';
import { disclosureStatus, fmtShort, isOverdue, providerShort, reasonText } from '../visits/basics.ts';
import { SYSTEM_LABEL } from '../brief/careViews.ts';
import { BLEEDING_FEATURES, IMPACT_CODES, IMPACT_LABEL } from '../engine/vocab.ts';
import { activeExclusionIds, uniq } from '../engine/select.ts';

const KIND: Record<AdviceKind, string> = { test: 'Test', medicine: 'Medicine or remedy', follow_up: 'Follow up', lifestyle: 'Food, exercise or habits', referral: 'See someone else', other: 'Other' };
const STATUS: Record<AdviceStatus, string> = { not_started: 'Not started', done: 'Done', skipped: 'Not done', unsure: 'Not sure' };

export type ReportSection = 'overview' | 'symptoms' | 'effects' | 'bleeding' | 'visits' | 'take' | 'concerns' | 'tests';
export const REPORT_SECTIONS: { key: ReportSection; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'symptoms', label: 'Symptoms' }, { key: 'effects', label: 'Effect on daily life' },
  { key: 'bleeding', label: 'Bleeding' }, { key: 'visits', label: 'Visits and advice' }, { key: 'take', label: 'What I take and who I have told' },
  { key: 'concerns', label: 'Questions not yet answered' }, { key: 'tests', label: 'Tests done' },
];

export interface ReportModel {
  from: string; to: string; totalDays: number; daysWithEntry: number; entryCount: number;
  symptoms: { label: string; days: number; limited: number; first: string; last: string }[];
  effects: { label: string; days: number }[];
  bleeding: { days: number; heavierDays: number };
  visits: { id: string; on: string; who: string; systems: string; note?: string; advice: { text: string; kind: string; status: string; extra: string }[]; concerns: { text: string; addressed: boolean }[] }[];
  take: { title: string; systems: string; since: string; until?: string; advisedBy?: string; toldTo: string[]; notMarkedFor: string[] }[];
  openConcerns: { text: string; raisedWith: string; on: string }[];
  tests: { title: string; on: string; note?: string }[];
  advice: StatusCounts;
  providers: { id: string; name: string }[];
}

export function earliestDate(s: LoopState) {
  const ds = [...s.entries.map(e => e.occurredOn), ...s.visits.map(v => v.on), ...s.care.map(c => c.date)].sort();
  return ds[0] ?? todayLocal();
}

export function buildReport(s: LoopState, from: string, to: string, today = todayLocal()): ReportModel {
  const off = activeExclusionIds(s.exclusions);
  const inRange = s.entries.filter(e => e.occurredOn >= from && e.occurredOn <= to && !off.has(e.id));
  const since = sinceSummary(s.entries, s.exclusions, from, to);
  const name = (id?: string) => providerShort(s.providers.find(p => p.id === id));
  const visits = [...s.visits].filter(v => v.on >= from && v.on <= to).sort((a, b) => a.on.localeCompare(b.on));
  const visitIds = new Set(visits.map(v => v.id));
  const advice = s.advice.filter(a => visitIds.has(a.visitId));
  const bleedDays = uniq(inRange.filter(e => e.kind === 'bleeding').map(e => e.occurredOn));
  const heavy = uniq(inRange.filter(e => e.kind === 'bleeding' && BLEEDING_FEATURES.some(f => e.bleeding?.[f])).map(e => e.occurredOn));
  const treatments = s.care.filter(c => c.kind === 'treatment' && c.date <= to && (!c.endDate || c.endDate >= from)).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const clinicianIds = uniq([...s.visits.map(v => v.providerId), ...s.nextVisits.map(n => n.providerId), ...s.disclosures.map(d => d.providerId)]);
  return {
    from, to, totalDays: dateRange(from, to).length, daysWithEntry: since.daysWithEntry.length, entryCount: inRange.length,
    symptoms: since.rows.map(r => ({ label: r.label, days: r.days.length, limited: r.limitedDays.length, first: r.days[0], last: r.days[r.days.length - 1] })),
    effects: IMPACT_CODES.map(c => ({ label: IMPACT_LABEL[c], days: uniq(inRange.filter(e => e.impact.includes(c)).map(e => e.occurredOn)).length })).filter(x => x.days > 0),
    bleeding: { days: bleedDays.length, heavierDays: heavy.length },
    visits: visits.map(v => ({
      id: v.id, on: v.on, who: name(v.providerId), systems: v.systems.map(x => SYSTEM_LABEL[x]).join(', '), ...(v.note ? { note: v.note } : {}),
      advice: s.advice.filter(a => a.visitId === v.id).map(a => ({
        text: a.text, kind: KIND[a.kind], status: STATUS[a.status],
        extra: [a.dueOn ? `by ${fmtShort(a.dueOn)}` : '', isOverdue(a, today) ? 'overdue' : '', a.status === 'skipped' ? `my reason: ${reasonText(a)}` : '',
          a.status === 'done' && a.doneOn ? `done ${fmtShort(a.doneOn)}` : '', a.resultNote ? `my note: ${a.resultNote}` : ''].filter(Boolean).join(', '),
      })),
      concerns: s.concerns.filter(c => c.visitId === v.id).map(c => ({ text: c.text, addressed: c.addressed })),
    })),
    take: treatments.map(t => ({
      title: t.title, systems: t.systems.map(x => SYSTEM_LABEL[x]).join(' and '), since: t.date, ...(t.endDate ? { until: t.endDate } : {}),
      ...(t.providerId ? { advisedBy: name(t.providerId) } : {}),
      toldTo: clinicianIds.filter(p => disclosureStatus(s.disclosures, t.id, p) === 'told').map(name),
      notMarkedFor: clinicianIds.filter(p => disclosureStatus(s.disclosures, t.id, p) !== 'told').map(name),
    })),
    openConcerns: s.concerns.filter(c => !c.addressed).map(c => { const v = s.visits.find(x => x.id === c.visitId); return { text: c.text, raisedWith: name(v?.providerId), on: v?.on ?? '' }; }),
    tests: [
      ...s.care.filter(c => c.kind === 'test' && c.date >= from && c.date <= to).map(c => ({ title: c.title, on: c.date })),
      ...advice.filter(a => a.kind === 'test' && a.status === 'done').map(a => ({ title: a.text, on: a.doneOn ?? s.visits.find(v => v.id === a.visitId)?.on ?? '', ...(a.resultNote ? { note: a.resultNote } : {}) })),
    ].sort((a, b) => a.on.localeCompare(b.on)),
    advice: statusCounts(advice, today),
    providers: clinicianIds.map(id => ({ id, name: name(id) })),
  };
}

/**
 * Plain text of the report for the AI summary. Clinician names become "Clinician A", "Clinician B".
 * Her name, notes about other people and record ids are never included.
 */
export const clinicianAliases = (m: ReportModel) => new Map(m.providers.map((p, i) => [p.name, `Clinician ${String.fromCharCode(65 + (i % 26))}`]));

/** Puts the real clinician names back into a checked summary, on her device only. */
export function restoreNames(m: ReportModel, summary: string): string {
  let out = summary;
  for (const [real, a] of [...clinicianAliases(m)].sort((x, y) => y[1].length - x[1].length)) out = out.replace(new RegExp(`\\b${a}\\b`, 'g'), real);
  return out;
}

export function reportTextForAi(m: ReportModel): string {
  const alias = clinicianAliases(m);
  let anon = (s: string) => s;
  for (const [real, a] of [...alias].sort((x, y) => y[0].length - x[0].length)) {
    const prev = anon; const re = new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    anon = (s: string) => prev(s).replace(re, a);
  }
  const L: string[] = [];
  L.push(`Records from ${m.from} to ${m.to} (${m.totalDays} days). Days with an entry: ${m.daysWithEntry}.`);
  if (m.symptoms.length) L.push('Symptoms (days it appeared, days it limited her): ' + m.symptoms.map(x => `${x.label} ${x.days} days, limited ${x.limited}`).join('; ') + '.');
  if (m.effects.length) L.push('Effects on daily life: ' + m.effects.map(x => `${x.label} on ${x.days} days`).join('; ') + '.');
  if (m.bleeding.days) L.push(`Bleeding on ${m.bleeding.days} days, heavier signs on ${m.bleeding.heavierDays}.`);
  for (const v of m.visits) {
    L.push(`Visit on ${v.on} to ${anon(v.who)} (${v.systems}).${v.note ? ` Her note: ${anon(v.note)}` : ''}`);
    for (const a of v.advice) L.push(`- Advice (${a.kind}): ${anon(a.text)}. Status: ${a.status}${a.extra ? `, ${anon(a.extra)}` : ''}.`);
    for (const c of v.concerns) L.push(`- Question she raised: ${anon(c.text)} (${c.addressed ? 'answered' : 'not answered'}).`);
  }
  if (m.take.length) L.push('What she takes: ' + m.take.map(t => `${anon(t.title)} (${t.systems}) since ${t.since}${t.until ? ` until ${t.until}` : ''}; marked as told to ${t.toldTo.map(anon).join(', ') || 'no one'}`).join(' | ') + '.');
  if (m.tests.length) L.push('Tests done: ' + m.tests.map(t => `${anon(t.title)} on ${t.on}`).join('; ') + '.');
  L.push(`Advice counts: done ${m.advice.done}, not started ${m.advice.notStarted}, not done ${m.advice.skipped}, not sure ${m.advice.unsure}, overdue ${m.advice.overdue}.`);
  return L.join('\n').slice(0, 6000);
}

export const reportSpanDays = (m: ReportModel) => daysBetween(m.from, m.to) + 1;
