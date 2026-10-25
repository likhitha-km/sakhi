import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodePayload, encodePayload, MAX_FRAGMENT, readCard, readReply, ReplySchema, toShared, type SharedCard } from '../src/share/share.ts';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { loadLoopState } from '../src/loop/loop.ts';
import { buildCard } from '../src/visits/logic.ts';
import { cardSections, sectionsText, type CardSection } from '../src/visits/sections.ts';
import { todayLocal, addDays } from '../src/engine/dates.ts';

const KEYS: CardSection[] = ['goal', 'since', 'take', 'advice', 'concerns', 'tests', 'questions'];
const T = todayLocal();
const build = async () => {
  const s = await loadLoopState();
  const m = buildCard({ next: s.nextVisits[0], ...s, today: T });
  const sections = cardSections(m, KEYS);
  const card: SharedCard = { v: 1, kind: 'card', createdOn: T, expiresOn: addDays(T, 3), forClinician: m.clinician, sections: toShared(sections), concerns: m.concerns.map(c => ({ id: c.id, text: c.text })) };
  return { m, sections, card };
};

beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('shared card link', () => {
  it('CV1 and CV5 a round trip keeps the same text and numbers as the screen card', async () => {
    const { m, sections, card } = await build();
    const frag = await encodePayload(card);
    expect(frag.startsWith('v1.')).toBe(true);
    const back = await readCard(frag);
    expect(back).toEqual(card);
    const plain = back.sections.map(s => [s.heading, ...s.lines.map(l => l.text)].join('\n')).join('\n');
    expect(plain + '\n' + sectionsText(sections).split('\n').pop()).toBe(sectionsText(sections));
    const text = plain;
    expect(text).toContain(`${m.since.daysWithEntry.length} days with an entry`);
    expect(text).toContain(`Done ${m.advice.counts.done}, not started ${m.advice.counts.notStarted}. Overdue ${m.advice.counts.overdue}.`);
    expect(text).toContain(`What I take now (${m.inUseIds.length})`);
    console.log('fixture card link fragment length:', frag.length);
    expect(frag.length).toBeLessThan(6000);
  });
  it('CV2 refuses oversized, unknown and broken payloads', async () => {
    const { card } = await build();
    await expect(decodePayload('v1.p' + 'A'.repeat(MAX_FRAGMENT))).rejects.toThrow('too long');
    const huge = await encodePayload({ ...card, sections: [{ key: 'goal', heading: 'x', lines: Array.from({ length: 60 }, () => ({ kind: 'p', text: 'y'.repeat(600) })) }], pad: 'z'.repeat(40000) });
    await expect(readCard(huge)).rejects.toThrow();
    await expect(readCard(await encodePayload({ ...card, extra: 1 }))).rejects.toThrow('could not be opened');
    await expect(readCard('v1.p%%%')).rejects.toThrow();
    await expect(readCard('nonsense')).rejects.toThrow();
    // HTML and scripts stay plain text: the schema accepts the string, the viewer renders it as text
    const tricky = { ...card, sections: [{ key: 'goal', heading: '<img src=x onerror=alert(1)>', lines: [{ kind: 'p', text: 'javascript:alert(1)' }] }] };
    const r = await readCard(await encodePayload(tricky));
    expect(r.sections[0].heading).toBe('<img src=x onerror=alert(1)>');
  });
  it('CR2 reply limits', async () => {
    const ok = { v: 1, kind: 'reply', createdOn: T, advice: [{ kind: 'test', text: 'Blood test', inDays: 7 }], addressed: ['sample-con-pain', 'not-a-real-id'] };
    expect((await readReply(await encodePayload(ok))).addressed).toHaveLength(2);
    expect(ReplySchema.safeParse({ ...ok, advice: Array.from({ length: 20 }, () => ok.advice[0]) }).success).toBe(false);
    expect(ReplySchema.safeParse({ ...ok, advice: [{ kind: 'test', text: 'x'.repeat(161) }] }).success).toBe(false);
    expect(ReplySchema.safeParse({ ...ok, advice: [{ kind: 'dose', text: 'x' }] }).success).toBe(false);
    await expect(readReply(await encodePayload({ ...ok, kind: 'card' }))).rejects.toThrow();
  });
});
