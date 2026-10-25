export type SymptomCode =
  | 'period_pain' | 'pelvic_pain_between' | 'painful_bowel' | 'painful_urination'
  | 'pain_during_sex' | 'fatigue' | 'dizziness' | 'breathless_exertion'
  | 'headache' | 'low_mood' | 'poor_sleep' | 'hair_fall' | 'hot_flush' | 'night_sweats';

export type ImpactCode =
  | 'activity_limited' | 'missed_work_study' | 'sleep_disrupted'
  | 'mobility_limited' | 'self_care_limited';

export type EntryKind = 'symptom' | 'bleeding' | 'period_start' | 'checkin';

export type AreaCode = 'menstrual' | 'pain' | 'bowel_bladder' | 'energy_body'
  | 'mood_sleep' | 'hot_flush_sweats' | 'other';

export interface BleedingFeatures {
  changeEvery1to2h: boolean; doubleProducts: boolean; bledThrough: boolean;
  clotsOver2_5cm: boolean; nightChange: boolean;
}
export type BleedingFeature = keyof BleedingFeatures;

export interface Entry {
  id: string;
  occurredOn: string;          // 'YYYY-MM-DD', local calendar date
  recordedAt: string;          // ISO timestamp
  kind: EntryKind;             // 'checkin' = nothing to report that day
  symptomCode?: SymptomCode | 'custom';
  customLabel?: string;        // lowercased and trimmed, max 60 chars
  area?: AreaCode;             // required for custom symptoms
  severity?: number;           // integer 0..10
  impact: ImpactCode[];
  bleeding?: BleedingFeatures;
  note?: string;               // max 500 chars, never read by safety or summaries
  source: 'user' | 'synthetic';
  origin?: 'manual' | 'ai_confirmed';
  aiSpan?: string;
}

export interface Exclusion { entryId: string; reason?: string; excludedAt: string; restoredAt?: string }

export type CycleStatus = 'regular' | 'irregular' | 'none_or_stopped' | 'hormonal_contraception' | 'not_sure';
export type PregnancyStatus = 'not_pregnant' | 'possible' | 'confirmed';
export type LifeStage = 'cycling' | 'perimenopause' | 'post_menopause' | 'hysterectomy' | 'other';

export interface Profile {
  id: 1;
  ageBand?: '18-24' | '25-34' | '35-44' | '45-54' | '55+';
  lifeStage?: string; knownDiagnoses?: string; medicinesText?: string;
  cycleStatus: CycleStatus;
  pregnancyStatus: PregnancyStatus;
  stage?: LifeStage;               // chosen by her, never inferred
}

export interface Settings {
  id: 1; consentVersion: string; consentedAt: string;
  windowDays: 28 | 56; syntheticLoaded: boolean; aiAssistEnabled: boolean;
  sampleName?: string;
  lastBackupOn?: string;
}

export interface Meta { id: string; value: string }
