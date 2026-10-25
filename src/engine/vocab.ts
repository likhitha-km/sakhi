import type { AreaCode, BleedingFeature, ImpactCode, SymptomCode } from '../types/entry.ts';

export const SYMPTOM_CODES: SymptomCode[] = [
  'period_pain', 'pelvic_pain_between', 'painful_bowel', 'painful_urination', 'pain_during_sex',
  'fatigue', 'dizziness', 'breathless_exertion', 'headache', 'low_mood', 'poor_sleep',
  'hair_fall', 'hot_flush', 'night_sweats',
];

export const IMPACT_CODES: ImpactCode[] = [
  'activity_limited', 'missed_work_study', 'sleep_disrupted', 'mobility_limited', 'self_care_limited',
];

export const BLEEDING_FEATURES: BleedingFeature[] = [
  'changeEvery1to2h', 'doubleProducts', 'bledThrough', 'clotsOver2_5cm', 'nightChange',
];

export const SYMPTOM_LABEL: Record<SymptomCode, string> = {
  period_pain: 'Period pain',
  pelvic_pain_between: 'Pelvic pain between periods',
  painful_bowel: 'Pain when passing stool',
  painful_urination: 'Pain when passing urine',
  pain_during_sex: 'Pain during sex',
  fatigue: 'Tiredness',
  dizziness: 'Dizziness',
  breathless_exertion: 'Breathless when active',
  headache: 'Headache',
  low_mood: 'Low mood',
  poor_sleep: 'Poor sleep',
  hair_fall: 'Hair fall',
  hot_flush: 'Hot flushes',
  night_sweats: 'Night sweats',
};

export const SYMPTOM_AREA: Record<SymptomCode, AreaCode> = {
  period_pain: 'pain', pelvic_pain_between: 'pain', pain_during_sex: 'pain',
  painful_bowel: 'bowel_bladder', painful_urination: 'bowel_bladder',
  fatigue: 'energy_body', dizziness: 'energy_body', breathless_exertion: 'energy_body',
  headache: 'energy_body', hair_fall: 'energy_body',
  low_mood: 'mood_sleep', poor_sleep: 'mood_sleep',
  hot_flush: 'hot_flush_sweats', night_sweats: 'hot_flush_sweats',
};

export const AREA_LABEL: Record<AreaCode, string> = {
  menstrual: 'Periods and bleeding',
  pain: 'Pain',
  bowel_bladder: 'Bowel and bladder',
  energy_body: 'Energy and body',
  mood_sleep: 'Mood and sleep',
  hot_flush_sweats: 'Hot flushes and sweats',
  other: 'Other',
};

export const AREA_ORDER: AreaCode[] = ['pain', 'bowel_bladder', 'energy_body', 'mood_sleep', 'hot_flush_sweats', 'menstrual', 'other'];

export const IMPACT_LABEL: Record<ImpactCode, string> = {
  activity_limited: 'Stopped me doing things',
  missed_work_study: 'Missed work or study',
  sleep_disrupted: 'Disturbed my sleep',
  mobility_limited: 'Hard to move around',
  self_care_limited: 'Hard to look after myself',
};

export const BLEEDING_LABEL: Record<BleedingFeature, string> = {
  changeEvery1to2h: 'Changed a pad or tampon every 1 to 2 hours',
  doubleProducts: 'Needed two products at once',
  bledThrough: 'Bled through to clothes or bedding',
  clotsOver2_5cm: 'Clots bigger than about 2.5 cm',
  nightChange: 'Had to change at night',
};

export const BLEEDING_SHORT: Record<BleedingFeature, string> = {
  changeEvery1to2h: 'changing every 1 to 2 hours',
  doubleProducts: 'two products at once',
  bledThrough: 'bleeding through',
  clotsOver2_5cm: 'clots over about 2.5 cm',
  nightChange: 'changing at night',
};

export const normaliseLabel = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
