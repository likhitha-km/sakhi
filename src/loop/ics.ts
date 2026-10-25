// Calendar file (RFC 5545), built on the device. Only visits and dated advice, never medicines,
// never done or skipped items. Titles are generic unless she switches details on.
import type { AdviceItem, NextVisit, Provider } from '../types/care.ts';
import { addDays, todayLocal } from '../engine/dates.ts';
import { providerShort } from '../visits/basics.ts';

export type CalItem = { kind: 'visit'; next: NextVisit; provider?: Provider } | { kind: 'advice'; item: AdviceItem; provider?: Provider };

export const GENERIC_TITLE = 'Sakhi reminder';

export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds a content line at 75 octets without splitting a multibyte character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = (iso: string) => iso.replace(/-/g, '');
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Items that may go in a calendar file. */
export function exportable(items: CalItem[], today = todayLocal()): CalItem[] {
  return items.filter(c => c.kind === 'visit'
    ? c.next.on >= today
    : !!c.item.dueOn && c.item.dueOn >= today && c.item.kind !== 'medicine' && c.item.status !== 'done' && c.item.status !== 'skipped');
}

export function buildIcs(items: CalItem[], details: boolean, today = todayLocal(), now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sakhi//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const c of exportable(items, today)) {
    const id = c.kind === 'visit' ? c.next.id : c.item.id;
    const date = c.kind === 'visit' ? c.next.on : c.item.dueOn!;
    const title = !details ? GENERIC_TITLE
      : c.kind === 'visit' ? `Visit: ${providerShort(c.provider)}` : `${c.item.text}${c.provider ? ` (from ${providerShort(c.provider)})` : ''}`;
    lines.push('BEGIN:VEVENT', `UID:${id}@sakhi.local`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`,
      `SUMMARY:${icsEscape(title)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
