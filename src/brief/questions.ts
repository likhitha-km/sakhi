import type { EvidenceBundle } from '../types/evidence.ts';
import type { BriefQuestion } from '../types/brief.ts';
import type { CareEvent, Provider } from '../types/care.ts';
import type { Entry } from '../types/entry.ts';
import { fmtDate } from '../engine/dates.ts';
import { BLEEDING_FEATURES } from '../engine/vocab.ts';
import { inUseNow, providerName, SYSTEM_LABEL, testsDone, clinicianVisits } from './careViews.ts';
import { activeExclusionIds, uniq } from '../engine/select.ts';
import type { Exclusion } from '../types/entry.ts';

const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export function suggestedQuestions(
  b: EvidenceBundle, entries: Entry[], exclusions: Exclusion[], care: CareEvent[], providers: Provider[], showNames: boolean, today?: string,
): BriefQuestion[] {
  const out: BriefQuestion[] = [];
  const q = (id: string, text: string) => out.push({ id, text, suggested: true });
  const off = activeExclusionIds(exclusions);
  const inc = entries.filter(e => !off.has(e.id) && e.occurredOn >= b.window.start && e.occurredOn <= b.window.end);
  const sym = (k: string) => b.symptoms.find(s => s.key === k);
  const heavyDays = uniq(inc.filter(e => e.kind === 'bleeding' && BLEEDING_FEATURES.some(f => e.bleeding?.[f])).map(e => e.occurredOn));
  const activityDays = uniq(inc.filter(e => e.impact.includes('activity_limited')).map(e => e.occurredOn));
  const covered = new Set<string>();

  const lifeDays = uniq([...heavyDays, ...activityDays]);
  if (lifeDays.length) q('Q1', `My periods have affected my daily life on ${lifeDays.length} recorded ${lifeDays.length === 1 ? 'day' : 'days'}. Can we talk about what could be behind this and what options there are?`);
  if (heavyDays.length) q('Q2', 'Would a full blood count (a routine blood test) be right for me?');

  const pain = sym('period_pain');
  if (pain && pain.presentDays.length >= 3 && activityDays.length) {
    const n = pain.presentDays.filter(d => activityDays.includes(d)).length;
    if (n) q('Q3', `My period pain limited my activities on ${n} ${n === 1 ? 'day' : 'days'}. Is that worth looking into further, and would a longer diary help?`);
    covered.add('period_pain');
  }
  for (const k of ['painful_bowel', 'painful_urination']) {
    const r = b.perimenstrual.find(x => x.metricId === 'perimenstrual:' + k);
    if (r?.status === 'ready' && (r.numerator ?? 0) >= 2) {
      q('Q4:' + k, `I recorded ${sym(k)!.label.toLowerCase()} around my periods on ${r.numerator} of ${r.denominator} days. Should we discuss that together with my pain?`);
      covered.add(k);
    }
  }
  for (const k of ['fatigue', 'dizziness']) {
    const s = sym(k);
    if (s && s.presentDays.length >= 3) {
      q('Q5:' + k, `I recorded ${s.label.toLowerCase()} on ${s.presentDays.length} days. What could be checked, and is anything about my periods relevant?`);
      covered.add(k);
    }
  }
  if (b.intervals.status === 'ready') q('Q6', `My recorded period starts were ${b.intervals.secondary!.min} to ${b.intervals.secondary!.max} days apart. Is that expected for me?`);
  const q7 = ['hot_flush', 'night_sweats', 'poor_sleep'].map(sym).filter(s => s && s.presentDays.length >= 3);
  if (q7.length) {
    const n = uniq(q7.flatMap(s => s!.presentDays)).length;
    q('Q7', `I recorded ${list(q7.map(s => s!.label.toLowerCase()))} on ${n} days. What could explain this, and what should I keep tracking?`);
    q7.forEach(s => covered.add(s!.key));
  }

  // Care related questions
  const visible = care.filter(c => !c.hideFromBrief);
  const using = inUseNow(visible, today);
  const systems = uniq(using.flatMap(c => c.systems));
  const homeWithModern = systems.includes('home_remedy') && systems.includes('allopathy');
  if (using.length >= 2 && (systems.length >= 2 || homeWithModern)) {
    q('Q9', `I am using these together: ${list(using.map(c => `${c.title} (${c.systems.map(s => SYSTEM_LABEL[s]).join(' and ')})`))}. Is there anything I should know about using them together?`);
  }
  const visits = clinicianVisits(visible);
  const pv = (c: CareEvent) => providerName(providers.find(p => p.id === c.providerId), showNames) || 'one clinician';
  for (let i = visits.length - 1; i > 0; i--) {
    const a = visits[i - 1], c = visits[i];
    if (a.summary!.trim().toLowerCase() !== c.summary!.trim().toLowerCase() && a.providerId !== c.providerId) {
      q('Q10', `On ${fmtDate(a.date)} ${pv(a)} advised one thing and on ${fmtDate(c.date)} ${pv(c)} advised another. Which should I follow?`);
      break;
    }
  }
  const tests = testsDone(visible);
  if (tests.length) q('Q11', `I have already had these tests: ${list(tests.slice(0, 5).map(t => `${t.title} on ${fmtDate(t.date)}`))}. Does any need repeating?`);

  for (const s of b.symptoms) {
    if (covered.has(s.key) || s.presentDays.length < 3) continue;
    q('Q12:' + s.key, `I also recorded ${s.label.toLowerCase()} on ${s.presentDays.length} days. Can we discuss it?`);
  }
  return out;
}
