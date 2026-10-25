export type SystemOfMedicine = 'allopathy' | 'ayurveda' | 'homeopathy' | 'unani' | 'siddha'
  | 'yoga_naturopathy' | 'sowa_rigpa' | 'home_remedy' | 'other';

export type FacilityKind = 'govt_hospital' | 'govt_primary' | 'private_hospital' | 'private_clinic'
  | 'ayush_facility' | 'telemedicine' | 'pharmacy' | 'community_worker' | 'self' | 'other';

export type ProviderRole = 'gynaecologist' | 'physician' | 'endocrinologist' | 'ayush_practitioner' | 'homeopath'
  | 'nurse_or_asha' | 'pharmacist' | 'dietician' | 'other';

export interface Provider {
  id: string; name?: string; facilityName?: string;
  facilityKind: FacilityKind;
  role: ProviderRole;
}

export type CareKind = 'visit' | 'test' | 'treatment';

export interface CareEvent {
  id: string; kind: CareKind;
  date: string;
  providerId?: string;
  title: string;
  systems: SystemOfMedicine[];
  summary?: string;
  result?: string; unit?: string; reportedRange?: string;
  endDate?: string; stoppedBy?: 'me' | 'clinician' | 'finished' | 'problem';
  problemNote?: string;
  followUpOn?: string;
  attachmentIds: string[];
  hideFromBrief: boolean;
  origin: 'user' | 'synthetic';
  recordedAt?: string;
  visitId?: string;                 // the visit that advised it, if any
}

export interface Attachment { id: string; name: string; mime: string; size: number; blob: Blob; addedAt: string }

export interface Visit {
  id: string;
  providerId: string;
  on: string;                       // YYYY-MM-DD local date
  systems: SystemOfMedicine[];      // at least one
  note?: string;                    // her own words, up to 1000 characters, stored locally only
  origin: ItemOrigin;
}
export type AdviceKind = 'test' | 'medicine' | 'follow_up' | 'lifestyle' | 'referral' | 'other';
export type AdviceStatus = 'not_started' | 'done' | 'skipped' | 'unsure';
export type SkipReason = 'cost' | 'no_access' | 'did_not_understand' | 'worry_or_side_effects' | 'felt_better' | 'conflicting' | 'other';
export type ItemOrigin = 'manual' | 'ai_confirmed' | 'clinician_reply';
export interface AdviceItem {
  id: string; visitId: string;
  kind: AdviceKind;
  text: string;                     // her wording as confirmed. No dose arithmetic, no interpretation
  systems: SystemOfMedicine[];
  dueOn?: string;
  status: AdviceStatus;
  quote?: string;
  origin: ItemOrigin;
  treatmentId?: string;             // a medicine item linked to a treatment in "What I take"
  reason?: SkipReason;              // only while status is skipped
  reasonText?: string;              // up to 100 characters, her words
  doneOn?: string;                  // set when status becomes done
  resultNote?: string;              // up to 200 characters, her words, for tests she did
}
export interface Concern {
  id: string; visitId: string; text: string;
  addressed: boolean;
  quote?: string; origin: ItemOrigin;
}
export type DisclosureStatus = 'told' | 'not_told' | 'unsure';
export interface Disclosure {
  treatmentId: string;
  providerId: string;
  status: DisclosureStatus;         // "not_told" is shown as "not marked as told"
  updatedOn: string;
}
export interface NextVisit {
  id: string; providerId: string; on: string;
  goal?: string;
  sections?: Record<string, boolean>;
  cardOpenedOn?: string;
}
