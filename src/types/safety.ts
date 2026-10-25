import type { PregnancyStatus } from './entry';

export interface EpisodeInput {
  occurredOn: string; isHappeningNow: boolean;
  soakingEveryHourForHours: number;      // 0..12
  fainted: boolean; severePainWithDanger: boolean; anyBleeding: boolean;
  pregnancyStatus: PregnancyStatus;
}
export type AlertLevel = 'emergency' | 'urgent' | 'prompt_advice' | 'none' | 'fallback';
export interface SafetyResult {
  level: AlertLevel; ruleId?: 'SF1' | 'SF2' | 'SF3' | 'SF4';
  tense: 'current' | 'past'; title: string; body: string;
  actions: string[]; sources: string[]; rulesVersion: string;
}
