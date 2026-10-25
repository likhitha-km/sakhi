// Every threshold used by the summaries lives here, and the "How summaries work" page reads it.
export const GATES = {
  rulesVersion: '1.0',
  medianMinDays: 3,
  recentPrev: { windowDays: 14, minObservedDays: 5, minPresentDays: 3 },
  peri: { minStarts: 2, minOccurrences: 3, daysBefore: 5, daysAfter: 3 },
  intervalMinStarts: 3,
  overlapMinDays: 3,
  overlapMinCoDays: 3,
  overlapMax: 5,
  checks: { closeStartsDays: 10, oddSeverityGap: 5, oddSeverityMinOther: 4, lateDays: 2 },
} as const;
