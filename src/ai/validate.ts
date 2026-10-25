// Checks what the AI helper sends back. Used by the local helper and again in the browser.
import { z } from 'zod';
import type { Suggestion } from '../types/ai.ts';
import { BLEEDING_FEATURES, IMPACT_CODES, SYMPTOM_CODES } from '../engine/vocab.ts';
import { addDays, isIsoDate } from '../engine/dates.ts';

const When = z.union([
  z.literal('today'), z.literal('yesterday'),
  z.object({ daysAgo: z.number().int().min(0).max(3650) }).strict(),
  z.object({ date: z.string() }).strict(),
  z.null(),
]);

const SuggestionSchema = z.object({
  kind: z.enum(['symptom', 'bleeding', 'period_start', 'impact_only']),
  symptomCode: z.enum(SYMPTOM_CODES as [string, ...string[]]).optional().nullable(),
  severity: z.number().int().min(0).max(10).nullable(),
  when: When.optional().default(null),
  impact: z.array(z.enum(IMPACT_CODES as [string, ...string[]])).max(5).default([]),
  bleeding: z.object(Object.fromEntries(BLEEDING_FEATURES.map(f => [f, z.boolean().optional()]))).strict().optional().nullable(),
  span: z.string().min(1).max(200),
}).strict();

export const ExtractSchema = z.object({
  suggestions: z.array(z.unknown()).max(20),
  urgentMention: z.boolean().default(false),
  language: z.enum(['en', 'hi', 'kn', 'mixed', 'other']).default('other'),
});

export const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

export function resolveWhen(w: Suggestion['when'], today: string): string | null {
  if (!w) return null;
  if (w === 'today') return today;
  if (w === 'yesterday') return addDays(today, -1);
  if ('daysAgo' in w) return addDays(today, -w.daysAgo);
  if ('date' in w) return isIsoDate(w.date) ? w.date : null;
  return null;
}

const validWhen = (w: Suggestion['when'], today: string) => {
  const d = resolveWhen(w, today);
  return !!d && d <= today && d >= addDays(today, -3650);
};

export interface Validated { suggestions: Suggestion[]; dropped: number; urgentMention: boolean; language: string }

export function validate(note: string, raw: unknown, today: string): Validated {
  const n = norm(note);
  const parsed = ExtractSchema.safeParse(raw);
  if (!parsed.success) return { suggestions: [], dropped: 0, urgentMention: false, language: 'other' };
  let dropped = 0;
  const out: Suggestion[] = [];
  for (const item of parsed.data.suggestions) {
    const one = SuggestionSchema.safeParse(item);
    if (!one.success) { dropped++; continue; }                       // unknown codes or fields
    const s = one.data as unknown as Suggestion & { symptomCode?: Suggestion['symptomCode'] | null; bleeding?: Suggestion['bleeding'] | null };
    if (!n.includes(norm(s.span))) { dropped++; continue; }          // the quote must be hers
    if (s.kind === 'symptom' && !s.symptomCode) { dropped++; continue; }
    if (s.kind !== 'impact_only') s.impact = [];                    // every effect must carry its own quote
    if (s.kind === 'impact_only' && !s.impact.length) { dropped++; continue; }
    if (s.symptomCode === null) delete s.symptomCode;
    if (s.bleeding === null) delete s.bleeding;
    if (s.severity !== null && !/\p{Nd}/u.test(s.span)) s.severity = null; // no digit, no number
    if (s.when && !validWhen(s.when, today)) s.when = null;           // never in the future
    out.push(s);
  }
  const seen = new Set<string>();
  const deduped = out.filter(s => {
    const k = `${s.kind}|${s.symptomCode ?? ''}|${norm(s.span)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return { suggestions: deduped.slice(0, 8), dropped, urgentMention: parsed.data.urgentMention, language: parsed.data.language };
}
