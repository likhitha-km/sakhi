import type { EpisodeInput } from '../types/safety.ts';

export const SAFETY_RULES_VERSION = '1.0';

const preg = (i: EpisodeInput) => i.pregnancyStatus !== 'not_pregnant';

// Ordered by severity. The first match wins.
export const RULES = [
  { id: 'SF2', level: 'emergency', when: (i: EpisodeInput) => i.fainted },
  { id: 'SF3', level: 'emergency', when: (i: EpisodeInput) => preg(i) && i.severePainWithDanger },
  { id: 'SF1', level: 'urgent', when: (i: EpisodeInput) => i.soakingEveryHourForHours >= 2 },
  { id: 'SF3', level: 'urgent', when: (i: EpisodeInput) => preg(i) && i.soakingEveryHourForHours >= 1 },
  { id: 'SF4', level: 'prompt_advice', when: (i: EpisodeInput) => preg(i) && i.anyBleeding },
] as const;
