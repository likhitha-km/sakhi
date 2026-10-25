import { describe, expect, it } from 'vitest';
import { buildIcs, fold, GENERIC_TITLE, icsEscape, type CalItem } from '../src/loop/ics.ts';
import type { AdviceItem } from '../src/types/care.ts';

const T = '2026-10-25';
const adv = (p: Partial<AdviceItem>): AdviceItem => ({ id: 'a1', visitId: 'v1', kind: 'test', text: 'Blood test', systems: [], status: 'not_started', origin: 'manual', dueOn: '2026-10-30', ...p });
const rao = { id: 'p1', name: 'Dr Rao', facilityKind: 'govt_hospital', role: 'physician' } as const;
const items: CalItem[] = [
  { kind: 'visit', next: { id: 'n1', providerId: 'p1', on: '2026-10-26' }, provider: rao },
  { kind: 'advice', item: adv({}), provider: rao },
  { kind: 'advice', item: adv({ id: 'm1', kind: 'medicine', text: 'Iron tablets' }) },
  { kind: 'advice', item: adv({ id: 'd1', status: 'done' }) },
  { kind: 'advice', item: adv({ id: 's1', status: 'skipped' }) },
  { kind: 'advice', item: adv({ id: 'past', dueOn: '2026-10-01' }) },
  { kind: 'advice', item: adv({ id: 'nod', dueOn: undefined }) },
];
const now = new Date('2026-10-25T10:00:00Z');

describe('calendar file', () => {
  it('IC1 structure, CRLF, stable ids and the alarm the day before at 09:00', () => {
    const ics = buildIcs(items, false, T, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Sakhi//EN\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('UID:n1@sakhi.local');
    expect(ics).toContain('UID:a1@sakhi.local');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261026');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('DTSTAMP:20261025T100000Z');
    expect(buildIcs(items, false, T, now)).toBe(ics);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('IC2 default titles are generic', () => {
    const ics = buildIcs(items, false, T, now);
    expect(ics.match(new RegExp(`SUMMARY:${GENERIC_TITLE}`, 'g'))).toHaveLength(2);
    expect(ics).not.toContain('Dr Rao');
    expect(ics).not.toContain('Blood test');
  });
  it('IC3 medicines, done, skipped, past and undated items are not exported', () => {
    const ics = buildIcs(items, true, T, now);
    for (const id of ['m1', 'd1', 's1', 'past', 'nod']) expect(ics).not.toContain(`UID:${id}@`);
    expect(ics).not.toContain('Iron tablets');
  });
  it('IC4 escaping and folding without breaking a character', () => {
    const text = 'Check sugar, BP; bring report\\file\nरक्त परीक्षा ಮತ್ತೆ ಬರಬೇಕು और दवा लानी है, ಎರಡು ವಾರದ ನಂತರ ಮತ್ತೆ ಬರಬೇಕು';
    const ics = buildIcs([{ kind: 'advice', item: adv({ text }), provider: rao }], true, T, now);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${icsEscape(text)} (from Dr Rao)`);
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
    const dec = new TextDecoder('utf-8', { fatal: true });
    for (const line of ics.split('\r\n')) { const b = new TextEncoder().encode(line); expect(b.length).toBeLessThanOrEqual(75); expect(() => dec.decode(b)).not.toThrow(); }
    expect(fold('x'.repeat(200)).split('\r\n').map(l => l.length)).toEqual([75, 75, 52]);
  });
});
