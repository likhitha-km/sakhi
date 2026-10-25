import type { AdviceItem, Disclosure, DisclosureStatus, Provider, SkipReason } from '../types/care.ts';
import { todayLocal } from '../engine/dates.ts';

/** Computed, never stored: a due date before today and not done or skipped. No due date is never overdue. */
export const isOverdue = (a: AdviceItem, today = todayLocal()) =>
  !!a.dueOn && a.dueOn < today && (a.status === 'not_started' || a.status === 'unsure');

/** No record reads as "not marked as told". */
export function disclosureStatus(ds: Disclosure[], treatmentId: string, providerId: string): DisclosureStatus {
  return ds.find(d => d.treatmentId === treatmentId && d.providerId === providerId)?.status ?? 'not_told';
}

export const providerShort = (p?: Provider) => p?.name || p?.facilityName || 'Unnamed clinician';

export const REASON_LABEL: Record<SkipReason, string> = {
  cost: 'cost', no_access: 'could not get there or get an appointment', did_not_understand: 'did not understand it',
  worry_or_side_effects: 'worried about it or about side effects', felt_better: 'felt better',
  conflicting: 'another clinician told me something different', other: 'other',
};
export const reasonText = (a: AdviceItem) => a.reasonText?.trim() || (a.reason ? REASON_LABEL[a.reason] : 'not given');

export const CARD_FOOTER = 'This card shows what I recorded, not what any clinician knows. It is not a diagnosis.';
export const VIEWER_FOOTER = 'This card shows what the patient recorded, not what any clinician knows. It is not a diagnosis.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtShort = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
