import { describe, expect, it } from 'vitest';
import { adviceOrder, nextStep, type LoopState } from '../src/loop/loop.ts';
import { DEFAULT_PROFILE } from '../src/db/repo.ts';
import { addDays } from '../src/engine/dates.ts';
import type { AdviceItem, Visit } from '../src/types/care.ts';

const T = '2026-10-25';
const visits: Visit[] = [
  { id: 'v-old', providerId: 'p1', on: addDays(T, -30), systems: ['allopathy'], origin: 'manual' },
  { id: 'v-new', providerId: 'p2', on: addDays(T, -10), systems: ['ayurveda'], origin: 'manual' },
];
const adv = (id: string, visitId: string, p: Partial<AdviceItem> = {}): AdviceItem => ({ id, visitId, kind: 'other', text: id, systems: [], status: 'not_started', origin: 'manual', ...p });
const state = (advice: AdviceItem[]): LoopState => ({
  providers: [{ id: 'p1', name: 'Dr A', facilityKind: 'other', role: 'other' }, { id: 'p2', name: 'Dr B', facilityKind: 'other', role: 'other' }],
  visits, advice, concerns: [], disclosures: [], care: [], entries: [], exclusions: [], profile: DEFAULT_PROFILE,
  nextVisits: [{ id: 'n1', providerId: 'p1', on: addDays(T, 20) }, { id: 'n2', providerId: 'p2', on: addDays(T, 20) }],
});
const shuffles = <X,>(xs: X[]) => [xs, [...xs].reverse(), [xs[1], xs[0], ...xs.slice(2)], [...xs.slice(1), xs[0]]];

describe('advice tie breaking', () => {
  it('dated before undated, earliest date first, then oldest visit, then id', () => {
    const items = [
      adv('z-undated-old', 'v-old'), adv('a-undated-new', 'v-new'),
      adv('m-due-late', 'v-old', { dueOn: addDays(T, 9) }), adv('k-due-soon', 'v-new', { dueOn: addDays(T, 3) }),
      adv('b-undated-old', 'v-old'),
    ];
    const order = adviceOrder(state(items));
    for (const xs of shuffles(items)) expect([...xs].sort(order).map(a => a.id)).toEqual(['k-due-soon', 'm-due-late', 'b-undated-old', 'z-undated-old', 'a-undated-new']);
  });
  it('rule 9 picks the same open item whatever order storage returns them in, and links to its visit', () => {
    const items = [adv('x-iron', 'v-new', { text: 'Iron tablets' }), adv('y-blood', 'v-new', { text: 'Blood test', dueOn: addDays(T, 5) }), adv('a-walk', 'v-old', { text: 'Walk daily' })];
    for (const xs of shuffles(items)) {
      const n = nextStep(state(xs), T);
      expect([n.rule, n.label, n.to]).toEqual([9, 'Next for you: Blood test', '/visit/v-new']);
    }
    const undated = [adv('x-iron', 'v-new', { text: 'Iron tablets' }), adv('a-walk', 'v-old', { text: 'Walk daily' })];
    for (const xs of shuffles(undated)) expect(nextStep(state(xs), T)).toMatchObject({ rule: 9, label: 'Next for you: Walk daily', to: '/visit/v-old' });
  });
  it('rule 3 goes to the item longest past its date', () => {
    const items = [adv('b', 'v-old', { dueOn: addDays(T, -2) }), adv('a', 'v-new', { dueOn: addDays(T, -8) }), adv('c', 'v-new', { dueOn: addDays(T, -8), status: 'unsure' })];
    for (const xs of shuffles(items)) expect(nextStep(state(xs), T)).toMatchObject({ rule: 3, label: '3 advice items are past their date', to: '/visit/v-new' });
  });
  it('rule 4 keeps oldest visit first and breaks ties stably', () => {
    const items = [adv('b-unsure', 'v-new', { status: 'unsure', text: 'B' }), adv('c-unsure', 'v-old', { status: 'unsure', text: 'C' }), adv('a-unsure', 'v-old', { status: 'unsure', text: 'A' })];
    for (const xs of shuffles(items)) expect(nextStep(state(xs), T)).toMatchObject({ rule: 4, label: 'Clear up: A', to: '/visit/v-old' });
  });
  it('rule 5 picks the earliest follow up, then a stable id', () => {
    const s = (advice: AdviceItem[]) => ({ ...state(advice), nextVisits: [] });
    const items = [adv('f2', 'v-new', { kind: 'follow_up', text: 'Back to Dr B', dueOn: addDays(T, 6) }), adv('f1', 'v-old', { kind: 'follow_up', text: 'Back to Dr A', dueOn: addDays(T, 6) })];
    for (const xs of shuffles(items)) expect(nextStep(s(xs), T)).toMatchObject({ rule: 5, to: `/card?plan=p1&on=${addDays(T, 6)}` });
  });
});
