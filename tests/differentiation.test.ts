import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { splitNote } from '../src/visits/noteSplit.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { saveNextVisit, saveVisit, setAdviceStatus } from '../src/db/visits.ts';
import { db } from '../src/db/db.ts';
import { loadLoopState } from '../src/loop/loop.ts';
import { buildCard } from '../src/visits/logic.ts';
import { cardSections } from '../src/visits/sections.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';

const T = todayLocal();
const card = async (nextId: string) => { const s = await loadLoopState(); return buildCard({ next: s.nextVisits.find(n => n.id === nextId)!, ...s, today: T }); };
beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('turning her note into items (no AI)', () => {
  it('splits English, Hindi and mixed notes into her exact sentences', () => {
    expect(splitNote('Get a blood test this week. Start iron tablets after lunch! Come back in 2 weeks?')).toEqual(['Get a blood test this week', 'Start iron tablets after lunch!', 'Come back in 2 weeks?']);
    expect(splitNote('डॉक्टर ने खून की जांच लिखी है। एक महीने बाद फिर से दिखाना है।')).toEqual(['डॉक्टर ने खून की जांच लिखी है।', 'एक महीने बाद फिर से दिखाना है।']);
    expect(splitNote('- walk daily\n- less sugar; drink water')).toEqual(['walk daily', 'less sugar', 'drink water']);
    expect(splitNote('ok. . 12. ')).toEqual([]);
    expect(splitNote('a. '.repeat(40) + 'x'.repeat(10), 5)).toHaveLength(1);
  });
});

describe('what has changed since she last saw the clinician', () => {
  it('for a clinician she has seen: their last advice, other visits, treatments started and stopped', async () => {
    await setAdviceStatus('sample-adv-test', 'skipped', { reason: 'cost' });
    await saveVisit({ visit: { id: 'v2', providerId: 'sample-prov-sharma', on: addDays(T, -5), systems: ['ayurveda'], origin: 'manual' },
      advice: [{ id: 'v2a', visitId: 'v2', kind: 'lifestyle', text: 'Walk daily', systems: [], status: 'not_started', origin: 'manual' }], concerns: [], addToTreatments: new Set(), sample: true });
    const iron = (await db.careEvents.get('sample-tr-iron'))!;
    await db.careEvents.put({ ...iron, endDate: addDays(T, -2), stoppedBy: 'problem' });
    await saveNextVisit({ id: 'nv-rao', providerId: 'sample-prov-rao', on: addDays(T, 3) });
    const m = await card('nv-rao');
    expect(m.changes.seenBefore).toBe(true);
    expect(m.changes.from).toBe(addDays(T, -21));
    expect(m.changes.lastAdvice.map(a => `${a.text}: ${a.status}`).sort()).toEqual(['Blood test: not done (cost)', 'Come back in two weeks: not started', 'Iron tablet every morning: done']);
    expect(m.changes.otherVisits.map(v => `${v.who} ${v.advice}`)).toEqual(['Vaidya Sharma 1']);
    expect(m.changes.started.map(t => t.title).sort()).toEqual(['Herbal powder after meals', 'Iron tablets, every morning']);
    expect(m.changes.stopped.map(t => `${t.title} ${t.why}`)).toEqual(['Iron tablets, every morning stopped because of a problem']);
    const text = cardSections(m, ['changes']).map(s => [s.heading, ...s.lines.map(l => l.segs)].flat().join(' ')).join(' ');
    expect(text).toContain('What has changed since I saw you on');
    expect(text).toContain('Saw Vaidya Sharma (Ayurveda)');
    expect(text).toContain('Stopped Iron tablets, every morning');
  });
  it('for a clinician she has not seen: the last 3 months, and says so', async () => {
    const m = await card('sample-next-mehta');
    expect(m.changes.seenBefore).toBe(false);
    expect(m.changes.otherVisits.map(v => v.who)).toEqual(['Dr Rao']);
    expect(m.changes.lastAdvice).toEqual([]);
    expect(cardSections(m, ['changes'])[0].heading[0]).toBe('My care in the last 3 months');
  });
});

describe('different advice is only raised when she recorded it', () => {
  it('two visits with different notes do not create a conflict question', async () => {
    await saveVisit({ visit: { id: 'v2', providerId: 'sample-prov-sharma', on: addDays(T, -5), systems: ['ayurveda'], note: 'Take the powder after meals.', origin: 'manual' }, advice: [], concerns: [], addToTreatments: new Set(), sample: true });
    const m = await card('sample-next-mehta');
    expect(JSON.stringify(m.questions)).not.toMatch(/advised another|which should I follow/i);
  });
  it('a skip with "another clinician told me something different" becomes a question in her words', async () => {
    await setAdviceStatus('sample-adv-fu', 'skipped', { reason: 'conflicting' });
    const m = await card('sample-next-mehta');
    expect(m.questions[0].text).toMatch(/^I was told different things about: Come back in two weeks \(Dr Rao, \d+ \w+\)\. Which should I follow\?$/);
    expect(m.advice.skipped[0].line).toContain('My reason: another clinician told me something different');
  });
});
