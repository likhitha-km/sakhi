export type EvidenceStatus = 'ready' | 'insufficient_data' | 'not_applicable';

export interface Window { start: string; end: string; days: number }

export interface EvidenceResult {
  metricId: string;
  metricVersion: string;
  label: string;
  windowStart: string; windowEnd: string;
  includedEntryIds: string[];
  excludedEntryIds: string[];
  observedDays: number; eligibleDays: number; missingDays: number;
  numerator?: number; denominator?: number; median?: number;
  secondary?: Record<string, number>;
  status: EvidenceStatus;
  statement: string;
  limitationText: string;
  reason?: string;
}

export interface SymptomEvidence {
  key: string;                 // symptom code or 'custom:<label>'
  label: string;
  area: import('./entry').AreaCode;
  days: EvidenceResult;
  median: EvidenceResult;
  presentDays: string[];       // dates, for charts
  dailySeverity: Record<string, number>; // date -> highest severity that day
}

export interface EvidenceBundle {
  rulesVersion: string;
  generatedAt: string;
  window: Window;
  coverage: EvidenceResult;
  observedDates: string[];
  checkinDates: string[];
  symptoms: SymptomEvidence[];
  impact: EvidenceResult[];
  bleeding: EvidenceResult;
  recentPrev: EvidenceResult[];
  perimenstrual: EvidenceResult[];
  intervals: EvidenceResult;
  overlap: EvidenceResult[];
  excludedInWindow: string[];
  aiConfirmedCount: number;
}
