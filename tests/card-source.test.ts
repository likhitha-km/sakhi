import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAll, giveConsent, loadFixture } from '../src/db/repo.ts';
import { db } from '../src/db/db.ts';
import { loadLoopState } from '../src/loop/loop.ts';
import { buildCard } from '../src/visits/logic.ts';
import { cardSections, sectionsText, SHOW_STEPS, type CardSection } from '../src/visits/sections.ts';
import { readCard, toShared, encodePayload, type SharedCard } from '../src/share/share.ts';
import { addDays, todayLocal } from '../src/engine/dates.ts';
import { saveNextVisit } from '../src/db/visits.ts';

const T = todayLocal();
const ALL: CardSection[] = ['goal', 'changes', 'since', 'take', 'advice', 'concerns', 'tests', 'questions'];
const card = async (nextId: string) => { const s = await loadLoopState(); return buildCard({ next: s.nextVisits.find(n => n.id === nextId)!, ...s, today: T }); };
const lines = (ss: ReturnType<typeof cardSections>, key: CardSection) => ss.find(s => s.key === key)?.lines ?? [];
beforeEach(async () => { await deleteAll(); await giveConsent(); await loadFixture('ananya_visits'); });

describe('show mode and the shared link keep "What has changed"', () => {
  it('no show mode step drops it', () => {
    for (const s of SHOW_STEPS) expect(s.drop).not.toContain('changes');
    // Every other trim still happens, in the same order.
    expect(SHOW_STEPS.map(s => s.drop.join('+') + ':' + s.questions)).toEqual([':2', 'tests:2', 'tests+since:2', 'tests+since:1', 'tests+since+questions:0']);
  });
  it('the share link never leaves it out', () => {
    const src = readFileSync(new URL('../src/ui/components/ShareSheet.tsx', import.meta.url), 'utf8');
    const drops = src.slice(src.indexOf('const DROPS'), src.indexOf('];', src.indexOf('const DROPS')));
    expect(drops).not.toContain("'changes'");
  });
  it('the smallest show mode card still has it, for a clinician seen before and one never seen', async () => {
    const last = SHOW_STEPS[SHOW_STEPS.length - 1];
    const keep = ALL.filter(k => !last.drop.includes(k));
    const never = cardSections(await card('sample-next-mehta'), keep, { compact: true, maxQuestions: last.questions });
    expect(never.find(s => s.key === 'changes')?.heading).toEqual(['My care in the last 3 months']);
    await saveNextVisit({ id: 'nv-rao', providerId: 'sample-prov-rao', on: addDays(T, 3) });
    const seen = cardSections(await card('nv-rao'), keep, { compact: true, maxQuestions: last.questions });
    expect(String(seen.find(s => s.key === 'changes')?.heading[0])).toMatch(/^What has changed since I saw you on /);
  });
});

describe('where each card item came from', () => {
  it('items she typed herself carry no mark', async () => {
    await saveNextVisit({ id: 'nv-rao', providerId: 'sample-prov-rao', on: addDays(T, 3) });
    const ss = cardSections(await card('nv-rao'), ALL);
    expect(ss.flatMap(s => s.lines).filter(l => l.src)).toEqual([]);
    expect(sectionsText(ss)).not.toMatch(/drafted with AI|reply link|source not recorded/);
  });
  it('AI drafts, reply link advice and records without a stored source are marked, and nothing else', async () => {
    await db.advice.update('sample-adv-fu', { origin: 'ai_confirmed' });           // overdue line
    await db.advice.update('sample-adv-test', { origin: 'clinician_reply' });
    await db.concerns.update('sample-con-pain', { origin: undefined as never });   // an older record without a source
    await saveNextVisit({ id: 'nv-rao', providerId: 'sample-prov-rao', on: addDays(T, 3) });
    const ss = cardSections(await card('nv-rao'), ALL);
    const changes = lines(ss, 'changes');
    expect(changes.find(l => String(l.segs[0]).includes('Come back in two weeks'))?.src).toBe('ai');
    expect(changes.find(l => String(l.segs[0]).includes('Blood test'))?.src).toBe('reply');
    expect(changes.find(l => String(l.segs[0]).includes('Iron tablet'))?.src).toBeUndefined();
    expect(lines(ss, 'advice').find(l => l.icon === 'overdue')?.src).toBe('ai');
    expect(lines(ss, 'concerns')[0].src).toBe('unknown');
    // Treatments, symptoms and questions have no item source to show.
    for (const k of ['take', 'since', 'questions'] as const) expect(lines(ss, k).some(l => l.src)).toBe(false);
    const text = sectionsText(ss);
    expect(text).toContain('Come back in two weeks. Not started. (drafted with AI, confirmed by me)');
    expect(text).toContain('(from a reply link)');
    expect(text).toContain('Pain in the stomach (source not recorded)');
    // Never worded as checked or seen by a clinician.
    expect(text).not.toMatch(/verified|approved|confirmed by (the|a|your) (doctor|clinician)/i);
  });
  it('the shared link carries the same marks and old links without them still open', async () => {
    await db.concerns.update('sample-con-pain', { origin: 'ai_confirmed' });
    const m = await card('sample-next-mehta');
    const shared = toShared(cardSections(m, ALL));
    expect(shared.find(s => s.key === 'concerns')?.lines[0]).toMatchObject({ text: 'Pain in the stomach', src: 'ai' });
    const base: SharedCard = { v: 1, kind: 'card', createdOn: T, expiresOn: addDays(T, 3), forClinician: 'Dr Mehta', sections: shared, concerns: [] };
    expect((await readCard(await encodePayload(base))).sections).toEqual(shared);
    const old = { ...base, sections: shared.map(s => ({ ...s, lines: s.lines.map(({ src: _s, ...l }) => l) })) };
    expect((await readCard(await encodePayload(old))).sections.every(s => s.lines.every(l => !('src' in l)))).toBe(true);
    const bad = { ...base, sections: [{ ...shared[0], lines: [{ kind: 'li', text: 'x', src: 'clinician' }] }] };
    await expect(readCard(await encodePayload(bad as never))).rejects.toThrow();
  });
});
