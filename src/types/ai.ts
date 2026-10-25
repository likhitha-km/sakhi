import type { BleedingFeatures, ImpactCode, SymptomCode } from './entry';

export interface ExtractRequest { consent: true; note: string; today: string }
export type When = 'today' | 'yesterday' | { daysAgo: number } | { date: string } | null;
export interface Suggestion {
  kind: 'symptom' | 'bleeding' | 'period_start' | 'impact_only';
  symptomCode?: SymptomCode;
  severity: number | null;
  when: When;
  impact: ImpactCode[];
  bleeding?: Partial<BleedingFeatures>;
  span: string;
}
export interface ExtractResponse {
  suggestions: Suggestion[]; urgentMention: boolean;
  language: 'en' | 'hi' | 'kn' | 'mixed' | 'other';
  dropped: number; model: string; usage: { prompt_tokens: number; completion_tokens: number };
}
