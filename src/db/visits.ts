import { z } from 'zod';
import { db } from './db.ts';
import { SaveError, uid } from './repo.ts';
import type { AdviceItem, AdviceStatus, CareEvent, Concern, DisclosureStatus, NextVisit, SkipReason, Visit } from '../types/care.ts';
import { SYSTEMS } from '../brief/careViews.ts';
import { isIsoDate, todayLocal } from '../engine/dates.ts';

const Sys = z.array(z.enum(SYSTEMS as [string, ...string[]]));
const Date_ = z.string().refine(isIsoDate, 'Choose a valid date.');

export const VisitSchema = z.object({
  id: z.string().min(1), providerId: z.string().min(1, 'Choose who you saw.'),
  on: Date_.refine(d => d <= todayLocal(), 'A visit cannot be in the future.'),
  systems: Sys.min(1, 'Choose at least one type of care.'),
  note: z.string().max(1000, 'Notes can be up to 1000 characters.').optional(),
  origin: z.enum(['manual', 'ai_confirmed', 'clinician_reply']),
});
export const AdviceSchema = z.object({
  id: z.string().min(1), visitId: z.string().min(1),
  kind: z.enum(['test', 'medicine', 'follow_up', 'lifestyle', 'referral', 'other']),
  text: z.string().trim().min(1, 'Write what you were told.').max(240, 'Keep each item under 240 characters.'),
  systems: Sys, dueOn: Date_.optional(),
  status: z.enum(['not_started', 'done', 'skipped', 'unsure']),
  quote: z.string().max(240).optional(), origin: z.enum(['manual', 'ai_confirmed', 'clinician_reply']), treatmentId: z.string().optional(),
  reason: z.enum(['cost', 'no_access', 'did_not_understand', 'worry_or_side_effects', 'felt_better', 'conflicting', 'other']).optional(),
  reasonText: z.string().max(100, 'Keep the reason under 100 characters.').optional(),
  doneOn: Date_.optional(), resultNote: z.string().max(200, 'Keep the note under 200 characters.').optional(),
}).refine(a => a.status === 'skipped' || (!a.reason && !a.reasonText), 'A reason only goes with a skipped item.');
export const ConcernSchema = z.object({
  id: z.string().min(1), visitId: z.string().min(1),
  text: z.string().trim().min(1, 'Write the concern.').max(240, 'Keep each concern under 240 characters.'),
  addressed: z.boolean(), quote: z.string().max(240).optional(), origin: z.enum(['manual', 'ai_confirmed', 'clinician_reply']),
});
export const DisclosureSchema = z.object({
  treatmentId: z.string().min(1), providerId: z.string().min(1),
  status: z.enum(['told', 'not_told', 'unsure']), updatedOn: Date_,
});
export const NextVisitSchema = z.object({
  id: z.string().min(1), providerId: z.string().min(1, 'Choose who you will see.'), on: Date_,
  goal: z.string().max(200).optional(), sections: z.record(z.string(), z.boolean()).optional(), cardOpenedOn: Date_.optional(),
});

const check = <T,>(schema: z.ZodType<T>, x: unknown) => {
  const r = schema.safeParse(x);
  if (!r.success) throw new SaveError(r.error.issues[0]?.message ?? 'Please check this entry.');
};

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError('Sakhi could not save this in your browser. Please try again.');
  }
}

export interface VisitDraftSave {
  visit: Visit; advice: AdviceItem[]; concerns: Concern[];
  /** Medicine items to also add to "What I take". */
  addToTreatments: Set<string>;
  sample: boolean;
}

/** Saves a visit with its advice and concerns in one go. A medicine linked to a treatment marks the advising clinician as told. */
export async function saveVisit(d: VisitDraftSave) {
  check(VisitSchema, d.visit);
  d.advice.forEach(a => check(AdviceSchema, a));
  d.concerns.forEach(c => check(ConcernSchema, c));
  await guard(() => db.transaction('rw', [db.visits, db.advice, db.concerns, db.careEvents, db.disclosures], async () => {
    await db.visits.add(d.visit);
    for (const a of d.advice) {
      let item = a;
      if (a.kind === 'medicine' && d.addToTreatments.has(a.id)) {
        const t: CareEvent = {
          id: uid(), kind: 'treatment', date: d.visit.on, providerId: d.visit.providerId, visitId: d.visit.id,
          title: a.text.trim(), systems: a.systems.length ? a.systems : d.visit.systems, attachmentIds: [], hideFromBrief: false,
          origin: d.sample ? 'synthetic' : 'user', recordedAt: new Date().toISOString(),
        };
        await db.careEvents.add(t);
        await db.disclosures.put({ treatmentId: t.id, providerId: d.visit.providerId, status: 'told', updatedOn: todayLocal() });
        item = { ...a, treatmentId: t.id };
      }
      await db.advice.add(item);
    }
    if (d.concerns.length) await db.concerns.bulkAdd(d.concerns);
  }));
}

export interface StatusExtras { reason?: SkipReason; reasonText?: string; doneOn?: string; resultNote?: string }

/** Changes a status and returns the item as it was, so the change can be undone. A reason only stays while skipped. */
/**
 * Corrects a saved visit. If the clinician changes, treatments added from this visit move to the new
 * clinician, and the "told" mark that came from the visit moves with them.
 */
export async function updateVisit(v: Visit) {
  check(VisitSchema, v);
  await guard(() => db.transaction('rw', [db.visits, db.careEvents, db.disclosures], async () => {
    const prev = await db.visits.get(v.id);
    await db.visits.put(v);
    if (!prev || prev.providerId === v.providerId) return;
    const linked = await db.careEvents.filter(c => c.kind === 'treatment' && c.visitId === v.id).toArray();
    for (const t of linked) {
      await db.careEvents.put({ ...t, providerId: v.providerId });
      const old = await db.disclosures.get([t.id, prev.providerId]);
      if (old?.status === 'told') {
        await db.disclosures.delete([t.id, prev.providerId]);
        await db.disclosures.put({ treatmentId: t.id, providerId: v.providerId, status: 'told', updatedOn: todayLocal() });
      }
    }
  }));
}

export async function setAdviceStatus(id: string, status: AdviceStatus, extras: StatusExtras = {}): Promise<AdviceItem | undefined> {
  return guard(async () => {
    const prev = await db.advice.get(id);
    if (!prev) return undefined;
    const next: AdviceItem = { ...prev, status };
    delete next.reason; delete next.reasonText;
    if (status === 'skipped') {
      if (extras.reason) next.reason = extras.reason;
      if (extras.reasonText?.trim()) next.reasonText = extras.reasonText.trim().slice(0, 100);
    }
    if (status === 'done') {
      next.doneOn = extras.doneOn ?? prev.doneOn ?? todayLocal();
      if (extras.resultNote !== undefined) { if (extras.resultNote.trim()) next.resultNote = extras.resultNote.trim().slice(0, 200); else delete next.resultNote; }
    } else delete next.doneOn;
    check(AdviceSchema, next);
    await db.advice.put(next);
    return prev;
  });
}

export async function undoAdvice(prev: AdviceItem) { await guard(() => db.advice.put(prev)); }

export async function updateAdvice(a: AdviceItem) { check(AdviceSchema, a); await guard(() => db.advice.put(a)); }
export async function addAdvice(a: AdviceItem) { check(AdviceSchema, a); await guard(() => db.advice.add(a)); }
export async function deleteAdvice(id: string) { await guard(() => db.advice.delete(id)); }
export async function addConcern(c: Concern) { check(ConcernSchema, c); await guard(() => db.concerns.add(c)); }
export async function updateConcern(c: Concern) { check(ConcernSchema, c); await guard(() => db.concerns.put(c)); }
export async function deleteConcern(id: string) { await guard(() => db.concerns.delete(id)); }

export async function markCardOpened(nextVisitId: string, today = todayLocal()) {
  await guard(async () => { const n = await db.nextVisits.get(nextVisitId); if (n && n.cardOpenedOn !== today) await db.nextVisits.put({ ...n, cardOpenedOn: today }); });
}

export async function setConcernAddressed(id: string, addressed: boolean) {
  await guard(async () => { const c = await db.concerns.get(id); if (c) await db.concerns.put({ ...c, addressed }); });
}

/** Removes a visit with its advice and concerns. Treatments it added stay in "What I take". */
export async function deleteVisit(id: string) {
  await guard(() => db.transaction('rw', [db.visits, db.advice, db.concerns], async () => {
    await db.advice.where('visitId').equals(id).delete();
    await db.concerns.where('visitId').equals(id).delete();
    await db.visits.delete(id);
  }));
}

export async function setDisclosure(treatmentId: string, providerId: string, status: DisclosureStatus) {
  await guard(() => db.disclosures.put({ treatmentId, providerId, status, updatedOn: todayLocal() }));
}

export async function saveNextVisit(n: NextVisit) { check(NextVisitSchema, n); await guard(() => db.nextVisits.put(n)); }
export async function deleteNextVisit(id: string) { await guard(() => db.nextVisits.delete(id)); }

export async function endTreatment(id: string, endDate: string) {
  await guard(async () => { const c = await db.careEvents.get(id); if (c) await db.careEvents.put({ ...c, endDate }); });
}
