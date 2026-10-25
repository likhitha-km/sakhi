// One model for every way the card is shown: screen, show mode, print and the shared link.
import type { CardModel } from './logic.ts';
import type { ItemOrigin } from '../types/care.ts';
import { CARD_FOOTER, fmtShort } from './basics.ts';

export type CardSection = 'goal' | 'changes' | 'since' | 'take' | 'advice' | 'concerns' | 'tests' | 'questions';
export type RefKind = 'entries' | 'advice' | 'treatments' | 'concerns';
export type Seg = string | { n: number; title: string; ref?: { t: RefKind; ids: string[] } };
export type LineKind = 'p' | 'li' | 'ol' | 'group';
export type LineSource = 'ai' | 'reply' | 'unknown';
export interface Line { kind: LineKind; segs: Seg[]; icon?: 'overdue' | 'told' | 'not_told' | 'unsure'; src?: LineSource }
export interface Section { key: CardSection; heading: Seg[]; lines: Line[] }

/** Where an item came from, only from what was stored. Items she typed herself carry no mark. */
export const SOURCE_LABEL: Record<LineSource, string> = { ai: 'drafted with AI, confirmed by me', reply: 'from a reply link', unknown: 'source not recorded' };
export const sourceOf = (origin: ItemOrigin | undefined): { src?: LineSource } =>
  origin === 'manual' ? {} : origin === 'ai_confirmed' ? { src: 'ai' } : origin === 'clinician_reply' ? { src: 'reply' } : { src: 'unknown' };

// Show mode trims in this order until the card fits one screen and 160 words:
// tests, then "since", then one question, then no questions. "What has changed" is never
// dropped: on a small phone the card scrolls instead of losing it.
export const SHOW_STEPS: { drop: CardSection[]; questions: number }[] = [
  { drop: [], questions: 2 }, { drop: ['tests'], questions: 2 }, { drop: ['tests', 'since'], questions: 2 },
  { drop: ['tests', 'since'], questions: 1 }, { drop: ['tests', 'since', 'questions'], questions: 0 },
];

const toldText = (s: 'told' | 'not_told' | 'unsure', who: string | null) => {
  const w = who ? ` to ${who}` : '';
  return s === 'told' ? `told${w}` : s === 'unsure' ? `not sure if told${w}` : `not marked as told${w}`;
};

export function cardSections(m: CardModel, keys: CardSection[], opts: { compact?: boolean; maxQuestions?: number; allAdvice?: { skipped: string[]; unsure: string[]; overdue: string[] } } = {}): Section[] {
  const { compact = false, maxQuestions = 2 } = opts;
  const on = (k: CardSection) => keys.includes(k);
  const out: Section[] = [];
  const n = (v: number, title: string, t?: RefKind, ids?: string[]): Seg => ({ n: v, title, ...(t && ids ? { ref: { t, ids } } : {}) });

  if (on('goal') && m.goal) out.push({ key: 'goal', heading: ['Why I am coming'], lines: [{ kind: 'p', segs: [m.goal] }] });

  if (on('changes')) {
    const c = m.changes;
    const lines: Line[] = [
      ...c.lastAdvice.map(a => ({ kind: 'li' as const, segs: [`You advised: ${a.text}. ${a.status[0].toUpperCase() + a.status.slice(1)}.`], ...sourceOf(a.origin) })),
      ...c.otherVisits.map(v => ({ kind: 'li' as const, segs: [`Saw ${v.who} (${v.systems}) on ${fmtShort(v.on)}${v.advice ? `, ${v.advice} advice ${v.advice === 1 ? 'item' : 'items'}` : ''}.`] })),
      ...c.started.map(t => ({ kind: 'li' as const, segs: [`Started ${t.title} on ${fmtShort(t.on)}${t.by ? ` (from ${t.by})` : ''}.`] })),
      ...c.stopped.map(t => ({ kind: 'li' as const, segs: [`Stopped ${t.title} on ${fmtShort(t.on)}${t.why ? ` (${t.why})` : ''}.`] })),
    ];
    if (lines.length) out.push({ key: 'changes', heading: [c.seenBefore ? `What has changed since I saw you on ${fmtShort(c.from)}` : 'My care in the last 3 months'], lines });
  }

  if (on('since')) {
    const rows = compact ? m.since.rows.slice(0, 4) : m.since.rows;
    out.push({ key: 'since', heading: [m.sinceLabel], lines: [
      { kind: 'p', segs: [`${fmtShort(m.since.from)} to ${fmtShort(m.since.to)}: `, n(m.since.daysWithEntry.length, 'Days with an entry', 'entries', m.since.entryIds), ` days with an entry, ${m.since.daysWithout.length} without.`] },
      ...(rows.length ? rows.map(r => ({ kind: 'li' as const, segs: [
        `${r.label}: `, n(r.days.length, `${r.label}: days it appeared`, 'entries', r.entryIds), ` ${r.days.length === 1 ? 'day' : 'days'}`,
        ...(r.limitedDays.length ? [', limited me on ', n(r.limitedDays.length, `${r.label}: days it limited me`, 'entries', r.limitedEntryIds)] : []),
      ] })) : [{ kind: 'p' as const, segs: ['No symptoms recorded in this time.'] }]),
    ] });
  }

  if (on('take')) {
    const lines: Line[] = [];
    for (const g of m.inUse) {
      lines.push({ kind: 'group', segs: [g.system] });
      for (const i of g.items) lines.push({ kind: 'li', icon: i.told, segs: [`${i.title} `, `(${toldText(i.told, compact ? null : m.clinician)})`] });
    }
    if (!m.inUse.length) lines.push({ kind: 'p', segs: ['Nothing recorded as in use.'] });
    out.push({ key: 'take', heading: ['What I take now (', n(m.inUseIds.length, 'What I take now', 'treatments', m.inUseIds), ')'], lines });
  }

  if (on('advice')) {
    const c = m.advice.counts;
    const segs: Seg[] = ['Done ', n(c.done, 'Advice done', 'advice', m.advice.done.map(a => a.id)), ', not started ', n(c.notStarted, 'Advice not started', 'advice', m.advice.notStarted.map(a => a.id))];
    if (c.skipped) segs.push(', not done ', n(c.skipped, 'Advice not done', 'advice', opts.allAdvice?.skipped));
    if (c.unsure) segs.push(', not sure ', n(c.unsure, 'Advice I was not sure about', 'advice', opts.allAdvice?.unsure));
    segs.push('. Overdue ', n(c.overdue, 'Advice overdue', 'advice', opts.allAdvice?.overdue), '.');
    out.push({ key: 'advice', heading: ['Advice status'], lines: [
      { kind: 'p', segs },
      ...m.advice.overdue.map(a => ({ kind: 'li' as const, icon: 'overdue' as const, segs: [`Overdue: ${a.text} (due ${fmtShort(a.dueOn!)})`], ...sourceOf(a.origin) })),
      ...m.advice.skipped.map(s => ({ kind: 'li' as const, segs: [s.line], ...sourceOf(s.item.origin) })),
    ] });
  }

  if (on('concerns') && m.concerns.length) out.push({ key: 'concerns', heading: ['Not yet addressed (', n(m.concerns.length, 'Concerns not yet addressed', 'concerns', m.concerns.map(x => x.id)), ')'],
    lines: m.concerns.map(x => ({ kind: 'li' as const, segs: [x.text], ...sourceOf(x.origin) })) });

  if (on('tests')) out.push({ key: 'tests', heading: ['Tests already done'], lines: m.tests.length
    ? m.tests.map(t => ({ kind: 'li' as const, segs: [`${t.title}${t.on ? `, ${fmtShort(t.on)}` : ''}${t.note ? `. My note about the result, not a clinician's reading: ${t.note}` : ''}`] }))
    : [{ kind: 'p', segs: ['No tests recorded as done.'] }] });

  const qs = m.questions.slice(0, maxQuestions);
  if (on('questions') && qs.length) out.push({ key: 'questions', heading: [qs.length === 1 ? 'My question' : 'My questions'], lines: qs.map(q => ({ kind: 'ol' as const, segs: [q.text] })) });
  return out;
}

export const segText = (segs: Seg[]) => segs.map(s => (typeof s === 'string' ? s : String(s.n))).join('');
export const sourceText = (src?: LineSource) => (src ? ` (${SOURCE_LABEL[src]})` : '');
export const sectionsText = (ss: Section[]) => ss.map(s => [segText(s.heading), ...s.lines.map(l => segText(l.segs) + sourceText(l.src))].join('\n')).join('\n') + '\n' + CARD_FOOTER;
export const sectionsWords = (ss: Section[]) => sectionsText(ss).split(/\s+/).filter(Boolean).length;
