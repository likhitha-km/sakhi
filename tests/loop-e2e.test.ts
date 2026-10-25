// LP3 as an integration test over the real storage and functions (fake-indexeddb).
// The same journey can also be run in a real browser.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/db.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { markCardOpened, saveNextVisit, saveVisit, setAdviceStatus, setDisclosure } from '../src/db/visits.ts';
import { carryForward, loadLoopState, nextStep } from '../src/loop/loop.ts';
import { buildCard } from '../src/visits/logic.ts';
import { cardSections, sectionsText } from '../src/visits/sections.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';

const T = todayLocal();
const ALL = ['goal', 'since', 'take', 'advice', 'concerns', 'tests', 'questions'] as const;

describe('LP3 the loop end to end', () => {
  it('every handoff reaches the next card', async () => {
    await deleteAll(); await giveConsent(); await loadFixture('ananya_visits');
    // 1 Prepare
    await markCardOpened('sample-next-mehta');
    // 5 Follow through on Dr Rao's advice
    await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'cost' });
    await setAdviceStatus('sample-adv-fu', 'unsure');
    // 3 Record a second visit, another clinician and system (Ayurveda), manual entry
    await saveVisit({
      visit: { id: 'v2', providerId: 'sample-prov-sharma', on: T, systems: ['ayurveda'], note: 'Continue the powder. Walk daily.', origin: 'manual' },
      advice: [
        { id: 'v2-walk', visitId: 'v2', kind: 'lifestyle', text: 'Walk every evening', systems: ['ayurveda'], status: 'not_started', origin: 'manual' },
        { id: 'v2-oil', visitId: 'v2', kind: 'medicine', text: 'Sesame oil massage', systems: ['ayurveda'], status: 'not_started', origin: 'manual' },
      ],
      concerns: [{ id: 'v2-c', visitId: 'v2', text: 'Is the powder safe with iron tablets?', addressed: false, origin: 'manual' }],
      addToTreatments: new Set(['v2-oil']), sample: true,
    });
    // 4 Convert: disclosure mark
    await setDisclosure('sample-tr-herbal', 'sample-prov-mehta', 'told');
    // 6 Return: the next card for Dr Mehta
    const s = await loadLoopState();
    const m = buildCard({ next: s.nextVisits.find(n => n.id === 'sample-next-mehta')!, ...s, today: T });
    const text = sectionsText(cardSections(m, [...ALL]));

    expect(text).toContain('Not done: Blood test. My reason: cost. Advised by Dr Rao');                // reason carried
    expect(m.questions[0].text).toBe('I was not sure about: Come back in two weeks. Can you explain it?'); // unsure becomes a question
    expect(m.concerns.map(c => c.text).sort()).toEqual(['Is the powder safe with iron tablets?', 'Pain in the stomach']); // concerns carried
    expect(m.advice.overdue.map(a => a.id)).toEqual(['sample-adv-fu']);                                 // overdue carried
    expect(m.advice.counts).toEqual({ done: 1, notStarted: 2, skipped: 1, unsure: 1, overdue: 1 });     // new advice counted
    const told = m.inUse.flatMap(g => g.items);
    expect(told.find(i => i.id === 'sample-tr-herbal')?.told).toBe('told');                              // disclosure reached the card
    expect(told.find(i => i.title === 'Sesame oil massage')?.told).toBe('not_told');                     // new treatment, not told to Dr Mehta
    expect(m.notToldIds).toHaveLength(2);
    expect(m.sinceLabel).toBe('Since my last visit (to Vaidya Sharma)');                                 // since moves to the latest visit
    expect(text).not.toMatch(/complian|fail|adherence|%/i);
    // The new treatment is marked told for the clinician who advised it
    const oil = (await db.careEvents.toArray()).find(c => c.title === 'Sesame oil massage')!;
    expect(carryForward(s, 'sample-prov-sharma', T).notMarkedTold.map(t => t.id)).not.toContain(oil.id);
    // Home step: nothing is stale. The card was opened, so the overdue follow up leads.
    expect(nextStep(s, T).rule).toBe(3);
    // Next visit with Dr Rao releases Rao's items from the next Rao card once that visit happens
    await saveNextVisit({ id: 'nv-rao', providerId: 'sample-prov-rao', on: addDays(T, 10) });
    await saveVisit({ visit: { id: 'v3', providerId: 'sample-prov-rao', on: T, systems: ['allopathy'], origin: 'manual' }, advice: [], concerns: [], addToTreatments: new Set(), sample: true });
    const s2 = await loadLoopState();
    const cf = carryForward(s2, 'sample-prov-mehta', T);
    expect(cf.skipped).toHaveLength(0);
    expect(cf.openConcerns.map(c => c.text)).toEqual(['Is the powder safe with iron tablets?']);
  });
});
