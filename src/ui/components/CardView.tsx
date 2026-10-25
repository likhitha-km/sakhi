import { useMemo } from 'react';
import { SectionsView } from './SectionsView.tsx';
export { SectionsView } from './SectionsView.tsx';
import type { CardModel } from '../../visits/logic.ts';
import { buildCard, isOverdue } from '../../visits/logic.ts';
import { cardSections, type CardSection, type Section, type Seg } from '../../visits/sections.ts';
import { fmtDate, todayLocal } from '../../engine/dates.ts';
import type { NextVisit } from '../../types/care.ts';
import type { useAppData } from '../hooks/data.ts';
import { entryTitle } from './entryText.ts';
import { ADVICE_KIND_LABEL, ADVICE_STATUS_LABEL, type TraceRow } from './visitBits.tsx';

export type { CardSection } from '../../visits/sections.ts';
export const CARD_SECTIONS: { key: CardSection; label: string }[] = [
  { key: 'goal', label: 'Why I am coming' }, { key: 'changes', label: 'What has changed' }, { key: 'since', label: 'Symptoms since the last visit' }, { key: 'take', label: 'What I take now' },
  { key: 'advice', label: 'Advice status' }, { key: 'concerns', label: 'Concerns not yet addressed' }, { key: 'tests', label: 'Tests already done' },
  { key: 'questions', label: 'Two questions' },
];
export const sectionOn = (n: NextVisit, k: CardSection) => n.sections?.[k] ?? true;
export const SHOW_MAX_WORDS = 160;

type Data = ReturnType<typeof useAppData>;

export function useCard(next: NextVisit | undefined, d: Data): CardModel | null {
  return useMemo(() => {
    if (!next) return null;
    return buildCard({ next, providers: d.providers, visits: d.visits, advice: d.advice, concerns: d.concerns, disclosures: d.disclosures, care: d.care, entries: d.entries, exclusions: d.exclusions, profile: d.profile, today: todayLocal() });
  }, [next, d.entries, d.exclusions, d.profile, d.care, d.providers, d.visits, d.advice, d.concerns, d.disclosures]);
}

export function sectionsFor(m: CardModel, d: Pick<Data, 'advice'>, keys: CardSection[], compact = false, maxQuestions = 2): Section[] {
  return cardSections(m, keys, {
    compact, maxQuestions,
    allAdvice: {
      skipped: d.advice.filter(a => a.status === 'skipped').map(a => a.id),
      unsure: d.advice.filter(a => a.status === 'unsure').map(a => a.id),
      overdue: d.advice.filter(a => isOverdue(a)).map(a => a.id),
    },
  });
}

export function CardView({ m, d, keys, onTrace, compact = false, maxQuestions = 2 }: {
  m: CardModel; d: Data; keys: CardSection[]; onTrace: (title: string, rows: TraceRow[]) => void; compact?: boolean; maxQuestions?: number;
}) {
  const sections = sectionsFor(m, d, keys, compact, maxQuestions);
  const byEntry = new Map(d.entries.map(e => [e.id, e]));
  const rowsFor = (s: Exclude<Seg, string>): TraceRow[] => {
    const ids = s.ref?.ids ?? [];
    switch (s.ref?.t) {
      case 'entries': return ids.map(id => byEntry.get(id)).filter(Boolean).sort((a, b) => b!.occurredOn.localeCompare(a!.occurredOn))
        .map(e => ({ key: e!.id, title: `${fmtDate(e!.occurredOn, true)} · ${entryTitle(e!)}`, detail: e!.impact.length ? 'Effect on the day recorded' : undefined }));
      case 'advice': return ids.map(id => d.advice.find(a => a.id === id)).filter(Boolean).map(a => ({
        key: a!.id, title: a!.text, detail: `${ADVICE_KIND_LABEL[a!.kind]} · ${ADVICE_STATUS_LABEL[a!.status]}${a!.dueOn ? ` · due ${fmtDate(a!.dueOn, true)}` : ''}` }));
      case 'treatments': return ids.map(id => d.care.find(c => c.id === id)).filter(Boolean).map(t => ({ key: t!.id, title: t!.title, detail: `Since ${fmtDate(t!.date, true)}` }));
      case 'concerns': return ids.map(id => d.concerns.find(c => c.id === id)).filter(Boolean).map(c => ({ key: c!.id, title: c!.text }));
      default: return [];
    }
  };
  return <SectionsView sections={sections} onNumber={s => onTrace(s.title, rowsFor(s))} footer={compact ? null : ` Prepared ${fmtDate(todayLocal(), true)}.`} />;
}
