// The visit loop: what is carried to the next card, and the one next step on Home.
import { db } from '../db/db.ts';
import { DEFAULT_PROFILE } from '../db/repo.ts';
import type { AdviceItem, CareEvent, Concern, Disclosure, NextVisit, Provider, Visit } from '../types/care.ts';
import type { Entry, Exclusion, Profile } from '../types/entry.ts';
import { addDays, todayLocal } from '../engine/dates.ts';
import { inUseNow } from '../brief/careViews.ts';
import { disclosureStatus, fmtShort, isOverdue, providerShort } from '../visits/basics.ts';

export interface LoopState {
  providers: Provider[]; visits: Visit[]; advice: AdviceItem[]; concerns: Concern[]; disclosures: Disclosure[];
  care: CareEvent[]; nextVisits: NextVisit[]; entries: Entry[]; exclusions: Exclusion[]; profile: Profile;
}

export async function loadLoopState(): Promise<LoopState> {
  const [providers, visits, advice, concerns, disclosures, care, nextVisits, entries, exclusions, profile] = await Promise.all([
    db.providers.toArray(), db.visits.toArray(), db.advice.toArray(), db.concerns.toArray(), db.disclosures.toArray(),
    db.careEvents.toArray(), db.nextVisits.toArray(), db.entries.toArray(), db.exclusions.toArray(), db.profile.get(1)]);
  return { providers, visits, advice, concerns, disclosures, care, nextVisits, entries, exclusions, profile: profile ?? DEFAULT_PROFILE };
}

export interface StatusCounts { done: number; notStarted: number; skipped: number; unsure: number; overdue: number }

/** Statuses are exclusive. Overdue is an overlay on not started and unsure items. */
export function statusCounts(advice: AdviceItem[], today: string): StatusCounts {
  return {
    done: advice.filter(a => a.status === 'done').length,
    notStarted: advice.filter(a => a.status === 'not_started').length,
    skipped: advice.filter(a => a.status === 'skipped').length,
    unsure: advice.filter(a => a.status === 'unsure').length,
    overdue: advice.filter(a => isOverdue(a, today)).length,
  };
}

/** True when she has seen the same clinician again after this visit. */
function seenAgain(state: LoopState, visitId: string) {
  const v = state.visits.find(x => x.id === visitId);
  if (!v) return false;
  return state.visits.some(x => x.providerId === v.providerId && x.on > v.on);
}

export interface Carried {
  openConcerns: Concern[]; overdue: AdviceItem[]; skipped: AdviceItem[]; unsure: AdviceItem[];
  notStarted: AdviceItem[];   // not started and not past a date, until she sees that clinician again
  notMarkedTold: CareEvent[]; counts: StatusCounts;
}

export function carryForward(state: LoopState, providerId: string, today = todayLocal()): Carried {
  const open = state.advice.filter(a => !seenAgain(state, a.visitId));
  return {
    openConcerns: state.concerns.filter(c => !c.addressed && !seenAgain(state, c.visitId)),
    overdue: open.filter(a => isOverdue(a, today)),
    skipped: open.filter(a => a.status === 'skipped'),
    unsure: open.filter(a => a.status === 'unsure'),
    notStarted: open.filter(a => a.status === 'not_started' && !isOverdue(a, today)),
    notMarkedTold: inUseNow(state.care, today).filter(t => disclosureStatus(state.disclosures, t.id, providerId) !== 'told'),
    counts: statusCounts(state.advice, today),
  };
}

/**
 * Deterministic order when several advice items compete within one rule: items with a due date before
 * undated ones, the earliest date first, then the oldest visit, then the item id. The result never depends
 * on the order records come back from storage.
 */
export function adviceOrder(state: Pick<LoopState, 'visits'>) {
  const on = (a: AdviceItem) => state.visits.find(v => v.id === a.visitId)?.on ?? '';
  return (a: AdviceItem, b: AdviceItem) =>
    (a.dueOn ? 0 : 1) - (b.dueOn ? 0 : 1) || (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || on(a).localeCompare(on(b)) || a.id.localeCompare(b.id);
}

export interface NextStep { rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; label: string; to: string; why: string }

/**
 * One action for Home. The first rule that matches wins. Rules 1 to 5 follow the visit loop;
 * 7 to 9 guide a new or quiet journal; 6 is the fallback.
 */
export function nextStep(state: LoopState, today = todayLocal()): NextStep {
  const name = (id?: string) => providerShort(state.providers.find(p => p.id === id));
  const soon = [...state.nextVisits].filter(n => n.on >= today && n.on <= addDays(today, 2) && !n.cardOpenedOn).sort((a, b) => a.on.localeCompare(b.on))[0];
  if (soon) return { rule: 1, label: `Prepare your card for ${name(soon.providerId)} on ${fmtShort(soon.on)}`, to: `/card/${soon.id}`, why: 'Your visit is soon. The card shows what changed since your last visit, what you take, and what is still open, in under a minute.' };

  const empty = [...state.visits].filter(v => v.on <= today && v.on >= addDays(today, -3)
    && !state.advice.some(a => a.visitId === v.id) && !state.concerns.some(c => c.visitId === v.id)).sort((a, b) => b.on.localeCompare(a.on))[0];
  if (empty) return { rule: 2, label: `Record what ${name(empty.providerId)} told you`, to: `/visit/${empty.id}`, why: 'You saved this visit without any advice or questions. Add them while you still remember, so they reach your next card.' };

  const order = adviceOrder(state);
  const overdue = state.advice.filter(a => isOverdue(a, today)).sort(order);   // the longest past its date leads
  if (overdue.length) return { rule: 3, label: `${overdue.length} advice ${overdue.length === 1 ? 'item is' : 'items are'} past ${overdue.length === 1 ? 'its' : 'their'} date`, to: `/visit/${overdue[0].visitId}`, why: 'Mark what you did, or say what got in the way. Your reason goes on your next card, so the doctor knows.' };

  const visitOn = (a: AdviceItem) => state.visits.find(v => v.id === a.visitId)?.on ?? '';
  // Rule 4 keeps its stated order (oldest visit first); the shared order breaks ties.
  const unsure = state.advice.filter(a => a.status === 'unsure').sort((a, b) => visitOn(a).localeCompare(visitOn(b)) || order(a, b))[0];
  if (unsure) return { rule: 4, label: `Clear up: ${unsure.text}`, to: `/visit/${unsure.visitId}`, why: 'You marked this as not sure. It becomes a question on your next card, or you can update it if it is now clear.' };

  const advisedBy = (a: AdviceItem) => state.visits.find(v => v.id === a.visitId)?.providerId;
  const fu = state.advice.filter(a => a.kind === 'follow_up' && a.dueOn && a.status !== 'done'
    && !state.nextVisits.some(n => n.providerId === advisedBy(a) && n.on >= today)).sort(order)[0];
  if (fu) {
    const who = name(advisedBy(fu));
    const label = fu.dueOn! < today ? `Set your next visit with ${who} (follow up was due ${fmtShort(fu.dueOn!)})` : `Set your next visit with ${who} for ${fmtShort(fu.dueOn!)}`;
    return { rule: 5, label, to: `/card?plan=${advisedBy(fu)}&on=${fu.dueOn! < today ? today : fu.dueOn}`, why: 'You were told to come back. With a date, Sakhi prepares a card for that visit.' };
  }
  if (!state.visits.length && !state.nextVisits.some(n => n.on >= today))
    return { rule: 7, label: 'Record your most recent visit', to: '/visit/new', why: 'Sakhi works from what each doctor told you. Start with your last appointment, even if it was a while ago.' };

  const last = [...state.visits].filter(v => v.on <= today).sort((a, b) => b.on.localeCompare(a.on))[0];
  if (last && !state.nextVisits.some(n => n.on >= today))
    return { rule: 8, label: `Plan your next visit with ${name(last.providerId)}`, to: `/card?plan=${last.providerId}`, why: 'With a date, Sakhi prepares a card for that visit and brings back anything still open.' };

  const open = state.advice.filter(a => a.status === 'not_started').sort(order)[0];
  if (open) return { rule: 9, label: `Next for you: ${open.text}`, to: `/visit/${open.visitId}`, why: 'When it is done, mark it on the visit page. If it gets skipped, you can say why.' };

  return { rule: 6, label: 'Log how you feel today', to: '/log', why: 'A quick entry, even "nothing to report", makes the counts on your next card honest.' };
}

export type Stage = 'prepare' | 'visit' | 'record' | 'follow' | 'return';
export const STAGES: { key: Stage; label: string }[] = [
  { key: 'prepare', label: 'Prepare' }, { key: 'visit', label: 'Visit' }, { key: 'record', label: 'Record' },
  { key: 'follow', label: 'Follow through' }, { key: 'return', label: 'Return' },
];

/** Which stage is "Now", from the same rules as the next step. */
export function currentStage(state: LoopState, today = todayLocal()): Stage {
  if (state.nextVisits.some(n => n.on === today && n.cardOpenedOn)) return 'visit';
  const step = nextStep(state, today);
  if (step.rule === 1 || step.rule === 8) return 'prepare';
  if (step.rule === 2 || step.rule === 7) return 'record';
  if (state.nextVisits.some(n => n.on >= today && n.on <= addDays(today, 2) && n.cardOpenedOn)) return 'return';
  return 'follow';
}
