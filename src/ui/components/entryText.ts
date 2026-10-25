import type { Entry } from '../../types/entry.ts';
import { BLEEDING_FEATURES, BLEEDING_LABEL, IMPACT_LABEL, SYMPTOM_LABEL, capitalise } from '../../engine/vocab.ts';
import { GATES } from '../../engine/gates.ts';

export function entryTitle(e: Entry): string {
  switch (e.kind) {
    case 'checkin': return 'Nothing to report';
    case 'period_start': return 'Period started';
    case 'bleeding': return 'Bleeding';
    case 'symptom': {
      const name = e.symptomCode === 'custom' ? capitalise(e.customLabel ?? 'Other symptom') : SYMPTOM_LABEL[e.symptomCode!];
      return `${name}, ${e.severity} of 10`;
    }
  }
}

export function entryDetails(e: Entry): string[] {
  const out: string[] = [];
  if (e.kind === 'bleeding') {
    const f = BLEEDING_FEATURES.filter(k => e.bleeding?.[k]).map(k => BLEEDING_LABEL[k]);
    out.push(f.length ? f.join('; ') : 'No heavier bleeding signs');
  }
  if (e.impact.length) out.push(e.impact.map(i => IMPACT_LABEL[i]).join('; '));
  return out;
}

/** Plain steps describing how a summary is worked out. Numbers come from the shared thresholds. */
export function howCalculated(metricId: string): string[] {
  const kind = metricId.split(':')[0];
  const G = GATES;
  switch (kind) {
    case 'coverage': return ['Count every day in this period that has at least one entry, including "Nothing to report".', 'Days with no entry are shown as not logged. They are never counted as zero.'];
    case 'symptom_days': return ['Count the days where this symptom has a score of 1 or more.', 'If you logged it twice on one day, that day counts once.', 'Shown as days with it, out of all the days you logged.', 'Needs at least 1 day.'];
    case 'median': return ['Take the highest score for this symptom on each day you had it.', 'Line those days up from lowest to highest and take the one in the middle.', `Needs at least ${G.medianMinDays} days with this symptom.`];
    case 'impact': return ['Count the days where you ticked this effect on your day.', 'Needs at least 1 day.'];
    case 'bleeding': return ['Count the days with a bleeding entry.', 'Then count how many of those days had at least one of the heavier bleeding signs ticked.', 'Needs at least 1 bleeding day.'];
    case 'recent_prev': return [`Take the latest ${G.recentPrev.windowDays} days and the ${G.recentPrev.windowDays} days before them.`, 'Work out the middle score for this symptom in each.', `Each stretch needs at least ${G.recentPrev.minObservedDays} logged days and ${G.recentPrev.minPresentDays} days with the symptom.`];
    case 'perimenstrual': return [`Mark the days from ${G.peri.daysBefore} days before to ${G.peri.daysAfter} days after each period start you recorded.`, 'Count how many days with this symptom fall on those marked days.', 'Also count how many of all your logged days fall on them, for comparison.', `Needs ${G.peri.minStarts} period starts and ${G.peri.minOccurrences} days with the symptom.`];
    case 'intervals': return ['Count the days between each recorded period start and the next.', `Needs at least ${G.intervalMinStarts} period starts.`];
    case 'overlap': return [`Only symptoms recorded on at least ${G.overlapMinDays} days are compared.`, 'Count the days where both were recorded, and the days where either was.', `Shown when they share at least ${G.overlapMinCoDays} days.`];
    default: return [];
  }
}
