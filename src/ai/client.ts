import type { ExtractRequest, Suggestion } from '../types/ai.ts';
import { validate } from './validate.ts';
import { validateVisit, VISIT_NOTE_MAX } from './visit.ts';
import { SUMMARY_INPUT_MAX, validateSummary } from './summary.ts';

export const AI_ENABLED = import.meta.env.VITE_AI_ENABLED !== 'false';
const BASE = (import.meta.env.VITE_AI_PROXY_URL as string | undefined) ?? 'http://127.0.0.1:8787';
export const NOTE_MAX = 600;

/** Only the note, today's date and the consent flag are ever sent. */
export const buildRequest = (note: string, today: string): ExtractRequest => ({ consent: true, note: note.slice(0, NOTE_MAX), today });

export async function helperAvailable(): Promise<boolean> {
  if (!AI_ENABLED) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(BASE + '/health', { signal: ctl.signal });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.ready === true;
  } catch { return false; } finally { clearTimeout(t); }
}

export type ReadResult = { ok: true; suggestions: Suggestion[]; urgentMention: boolean; dropped: number } | { ok: false };

export async function readNote(note: string, today: string, timeoutMs = 8000): Promise<ReadResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + '/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(note, today)), signal: ctl.signal,
    });
    if (r.status !== 200) return { ok: false };
    const v = validate(note, await r.json(), today);
    return { ok: true, suggestions: v.suggestions, urgentMention: v.urgentMention, dropped: v.dropped };
  } catch { return { ok: false }; } finally { clearTimeout(t); }
}

export type VisitReadResult = ({ ok: true } & import('./visit.ts').VisitExtract) | { ok: false };

/** Only the note, today's date and consent are sent. Any failure means "use manual entry". */
export async function readVisitNote(note: string, today: string, timeoutMs = 8000): Promise<VisitReadResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + '/extract-visit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, note: note.slice(0, VISIT_NOTE_MAX), today }), signal: ctl.signal,
    });
    if (r.status !== 200) return { ok: false };
    return { ok: true, ...validateVisit(note, await r.json()) };
  } catch { return { ok: false }; } finally { clearTimeout(t); }
}

export type SummaryResult = { ok: true; summary: string } | { ok: false; why: string };

/** Sends only the report text (clinician names already replaced), today's date and consent. */
export async function summariseReport(text: string, today: string, timeoutMs = 15000): Promise<SummaryResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + '/summarise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, note: text.slice(0, SUMMARY_INPUT_MAX), today }), signal: ctl.signal,
    });
    if (r.status !== 200) return { ok: false, why: 'unavailable' };
    const body = await r.json() as { summary?: unknown };
    const v = validateSummary(text, { summary: body?.summary });
    return v.ok ? v : { ok: false, why: v.why };
  } catch { return { ok: false, why: 'unavailable' }; } finally { clearTimeout(t); }
}
