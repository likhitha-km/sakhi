import type { CareEvent, Provider, SystemOfMedicine, FacilityKind, ProviderRole } from '../types/care.ts';
import { addDays, todayLocal } from '../engine/dates.ts';

export const SYSTEM_LABEL: Record<SystemOfMedicine, string> = {
  allopathy: 'Modern medicine', ayurveda: 'Ayurveda', homeopathy: 'Homoeopathy', unani: 'Unani', siddha: 'Siddha',
  yoga_naturopathy: 'Yoga and naturopathy', sowa_rigpa: 'Sowa-Rigpa', home_remedy: 'Home remedy or self care', other: 'Other',
};
export const SYSTEMS = Object.keys(SYSTEM_LABEL) as SystemOfMedicine[];

export const FACILITY_LABEL: Record<FacilityKind, string> = {
  govt_hospital: 'Government hospital', govt_primary: 'Government health centre', private_hospital: 'Private hospital',
  private_clinic: 'Private clinic', ayush_facility: 'AYUSH clinic or hospital', telemedicine: 'Online or phone consultation',
  pharmacy: 'Chemist or pharmacy', community_worker: 'Health worker visit', self: 'Myself', other: 'Other',
};
export const ROLE_LABEL: Record<ProviderRole, string> = {
  gynaecologist: 'Gynaecologist', physician: 'Doctor (general)', endocrinologist: 'Hormone specialist', ayush_practitioner: 'AYUSH practitioner',
  homeopath: 'Homoeopath', nurse_or_asha: 'Nurse or ASHA worker', pharmacist: 'Chemist', dietician: 'Dietician', other: 'Other',
};
export const CARE_KIND_LABEL = { visit: 'Visit', test: 'Test or reading', treatment: 'Treatment' } as const;
export const STOPPED_LABEL = { me: 'I stopped it', clinician: 'The clinician stopped it', finished: 'Course finished', problem: 'Stopped because of a problem' } as const;

export const providerName = (p?: Provider, withName = true) => {
  if (!p) return '';
  const who = withName && p.name ? p.name : ROLE_LABEL[p.role];
  return p.facilityName ? `${who}, ${p.facilityName}` : who;
};

export const inUseNow = (care: CareEvent[], today = todayLocal()) =>
  care.filter(c => c.kind === 'treatment' && !c.endDate && c.date <= today).sort((a, b) => a.date.localeCompare(b.date));

export const testsDone = (care: CareEvent[]) =>
  care.filter(c => c.kind === 'test').sort((a, b) => b.date.localeCompare(a.date));

export const clinicianVisits = (care: CareEvent[]) =>
  care.filter(c => c.kind === 'visit' && c.summary).sort((a, b) => a.date.localeCompare(b.date));

export function comingUp(care: CareEvent[], today = todayLocal()) {
  const soon = addDays(today, 14);
  const withDate = care.filter(c => c.followUpOn);
  return {
    upcoming: withDate.filter(c => c.followUpOn! >= today && c.followUpOn! <= soon).sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!)),
    overdue: withDate.filter(c => c.followUpOn! < today).sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!)),
  };
}

/** Readings grouped by title, so the same test or home reading can be seen over time. */
export function valuesOverTime(care: CareEvent[]) {
  const groups = new Map<string, CareEvent[]>();
  for (const c of testsDone(care)) {
    const k = c.title.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()].map(xs => ({ title: xs[0].title, items: [...xs].sort((a, b) => a.date.localeCompare(b.date)) }));
}
