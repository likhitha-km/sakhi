import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { deleteAll, giveConsent, loadFixture, saveProfile, DEFAULT_PROFILE } from '../src/db/repo.ts';
import { markCardOpened, saveNextVisit, saveVisit, setAdviceStatus, setDisclosure, undoAdvice } from '../src/db/visits.ts';
import { carryForward, loadLoopState, nextStep } from '../src/loop/loop.ts';
import { buildCard } from '../src/visits/logic.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';
import type { AdviceItem, Visit } from '../src/types/care.ts';

const T = todayLocal();
const V1 = addDays(T, -21);
const MEHTA = 'sample-prov-mehta', RAO = 'sample-prov-rao';
const card = async () => {
  const s = await loadLoopState();
  return buildCard({ next: s.nextVisits.find(n => n.providerId === MEHTA)!, ...s, today: T });
};
const s2 = async () => { await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'cost' }); await setAdviceStatus('sample-adv-fu', 'unsure'); };
const raoToday = async () => saveVisit({ visit: { id: 'v-today', providerId: RAO, on: T, systems: ['allopathy'], origin: 'manual' }, advice: [], concerns: [], addToTreatments: new Set(), sample: true });

beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('carry forward (LP2)', () => {
  it('S2 skip with a reason and an unsure item', async () => {
    await s2();
    const c = await card();
    expect(c.advice.counts).toEqual({ done: 1, notStarted: 0, skipped: 1, unsure: 1, overdue: 1 });
    expect(c.advice.skipped.map(x => x.line)).toEqual([`Not done: Blood test. My reason: cost. Advised by Dr Rao on ${fmt(V1)}`]);
    expect(c.questions.map(q => q.text)).toContain('I was not sure about: Come back in two weeks. Can you explain it?');
    const cf = carryForward(await loadLoopState(), MEHTA, T);
    expect([cf.skipped.length, cf.unsure.length, cf.overdue.length, cf.openConcerns.length]).toEqual([1, 1, 1, 1]);
  });
  it('S3 a later visit with the advising clinician releases the items', async () => {
    await s2(); await raoToday();
    const cf = carryForward(await loadLoopState(), MEHTA, T);
    expect([cf.skipped.length, cf.unsure.length, cf.overdue.length, cf.openConcerns.length]).toEqual([0, 0, 0, 0]);
    expect(cf.counts).toEqual({ done: 1, notStarted: 0, skipped: 1, unsure: 1, overdue: 1 });
    const c = await card();
    expect(c.concerns).toHaveLength(0);
    expect(c.advice.skipped).toHaveLength(0);
  });
  it('S4 disclosure', async () => {
    await setDisclosure('sample-tr-herbal', MEHTA, 'told');
    expect(carryForward(await loadLoopState(), MEHTA, T).notMarkedTold.map(t => t.id)).toEqual(['sample-tr-iron']);
    await setDisclosure('sample-tr-iron', MEHTA, 'told');
    expect(carryForward(await loadLoopState(), MEHTA, T).notMarkedTold).toHaveLength(0);
  });
});

describe('next step (LP1, S5)', () => {
  it('S5 walks through the rules in order', async () => {
    let n = nextStep(await loadLoopState(), T);
    expect(n.rule).toBe(1);
    expect(n.label).toBe(`Prepare your card for Dr Mehta on ${fmt(addDays(T, 1))}`);
    await markCardOpened('sample-next-mehta');
    n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label]).toEqual([3, '1 advice item is past its date']);
    await s2();
    expect(nextStep(await loadLoopState(), T).rule).toBe(3);
    await setAdviceStatus('sample-adv-fu', 'skipped', { reason: 'no_access' });
    await setAdviceStatus('sample-adv-test', 'done');
    n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label]).toEqual([5, `Set your next visit with Dr Rao (follow up was due ${fmt(addDays(T, -7))})`]);
    await saveNextVisit({ id: 'nv-rao', providerId: RAO, on: addDays(T, 7) });
    n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label, n.to]).toEqual([6, 'Log how you feel today', '/log']);
  });
  it('LP1 the first matching rule wins when several are true', async () => {
    await s2(); await raoToday();                           // rules 1, 2 and 3 all true
    expect(nextStep(await loadLoopState(), T).rule).toBe(1);
    await markCardOpened('sample-next-mehta');               // now 2 and 3
    const n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label]).toEqual([2, 'Record what Dr Rao told you']);
  });
  it('LP1 rule 4: an unsure item that is not overdue', async () => {
    await markCardOpened('sample-next-mehta');
    await setAdviceStatus('sample-adv-fu', 'done');
    await setAdviceStatus('sample-adv-test', 'unsure');        // no due date, so not overdue
    const n = nextStep(await loadLoopState(), T);
    expect([n.rule, n.label]).toEqual([4, 'Clear up: Blood test']);
  });
});

describe('status changes', () => {
  it('LP5 moving away from skipped clears the reason', async () => {
    await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'other', reasonText: 'too far to travel' });
    expect((await db.advice.get('sample-adv-test'))).toMatchObject({ reason: 'other', reasonText: 'too far to travel' });
    await setAdviceStatus('sample-adv-test', 'done');
    const a = (await db.advice.get('sample-adv-test'))!;
    expect(a.reason).toBeUndefined(); expect(a.reasonText).toBeUndefined();
    expect(a.doneOn).toBe(T);
  });
  it('LP4 undo restores status, reason and done date', async () => {
    const before = await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'cost' });
    const prev = await setAdviceStatus('sample-adv-test', 'done', { doneOn: addDays(T, -1), resultNote: 'Report collected' });
    expect(prev).toMatchObject({ status: 'skipped', reason: 'cost' });
    await undoAdvice(prev!);
    expect(await db.advice.get('sample-adv-test')).toEqual({ ...before, status: 'skipped', reason: 'cost' });
  });
  it('a reason cannot be stored on an item that is not skipped', async () => {
    const a = (await db.advice.get('sample-adv-test'))!;
    await expect(saveVisit({ visit: { id: 'vx', providerId: RAO, on: T, systems: ['allopathy'], origin: 'manual' }, advice: [{ ...a, id: 'ax', visitId: 'vx', reason: 'cost' } as AdviceItem], concerns: [], addToTreatments: new Set(), sample: true })).rejects.toThrow();
  });
});

describe('life stage (S6, LS1, LS3)', () => {
  it('post menopause filters cycle only questions and keeps the rest', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, cycleStatus: 'regular', stage: 'post_menopause' });
    const c = await card();
    const ids = c.questions.map(q => q.id);
    expect(ids).toEqual(['Q9', 'Q2']);
    expect(JSON.stringify(c.questions)).not.toMatch(/period/i);
  });
  it('unset or cycling keeps the existing questions', async () => {
    expect((await card()).questions.map(q => q.id)).toEqual(['Q9', 'Q1']);
    await saveProfile({ ...DEFAULT_PROFILE, cycleStatus: 'regular', stage: 'cycling' });
    expect((await card()).questions.map(q => q.id)).toEqual(['Q9', 'Q1']);
  });
});

describe('wording (LP6)', () => {
  it('no grading words, scores or percentages anywhere on the card or checklist', async () => {
    await s2();
    const text = JSON.stringify(await card()) + JSON.stringify(carryForward(await loadLoopState(), MEHTA, T));
    for (const re of [/complian/i, /non.?compliant/i, /fail/i, /adherence/i, /score/i, /\d+\s*%/, /percent/i, /streak/i, /points?\b/i]) expect(text).not.toMatch(re);
  });
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso: string) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; }
export type { Visit };
