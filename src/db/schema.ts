import { z } from 'zod';
import { BLEEDING_FEATURES, IMPACT_CODES, SYMPTOM_CODES } from '../engine/vocab.ts';
import { addDays, isIsoDate, todayLocal } from '../engine/dates.ts';

const Bleeding = z.object(Object.fromEntries(BLEEDING_FEATURES.map(f => [f, z.boolean()])) as Record<string, z.ZodBoolean>);

export const MAX_YEARS_BACK = 10;

export const EntrySchema = z.object({
  id: z.string().min(1),
  occurredOn: z.string().refine(isIsoDate, 'Choose a valid date.')
    .refine(d => d <= todayLocal(), 'This date is in the future. Choose today or an earlier day.')
    .refine(d => d >= addDays(todayLocal(), -365 * MAX_YEARS_BACK), `Entries can go back up to ${MAX_YEARS_BACK} years.`),
  recordedAt: z.string(),
  kind: z.enum(['symptom', 'bleeding', 'period_start', 'checkin']),
  symptomCode: z.enum([...SYMPTOM_CODES, 'custom'] as unknown as [string, ...string[]]).optional(),
  customLabel: z.string().trim().min(1, 'Give the symptom a name.').max(60, 'Keep the name under 60 characters.').optional(),
  area: z.enum(['menstrual', 'pain', 'bowel_bladder', 'energy_body', 'mood_sleep', 'hot_flush_sweats', 'other']).optional(),
  severity: z.number({ message: 'Choose a score from 0 to 10.' }).int('Choose a whole number from 0 to 10.').min(0, 'Choose a score from 0 to 10.').max(10, 'Choose a score from 0 to 10.').optional(),
  impact: z.array(z.enum(IMPACT_CODES as [string, ...string[]])),
  bleeding: Bleeding.optional(),
  note: z.string().max(500, 'Notes can be up to 500 characters.').optional(),
  source: z.enum(['user', 'synthetic']),
  origin: z.enum(['manual', 'ai_confirmed']).optional(),
  aiSpan: z.string().max(200).optional(),
}).superRefine((e, ctx) => {
  if (e.kind === 'symptom') {
    if (!e.symptomCode) ctx.addIssue({ code: 'custom', path: ['symptomCode'], message: 'Choose a symptom.' });
    if (e.severity === undefined) ctx.addIssue({ code: 'custom', path: ['severity'], message: 'Choose a score from 0 to 10.' });
    if (e.symptomCode === 'custom' && (!e.customLabel || !e.area)) ctx.addIssue({ code: 'custom', path: ['customLabel'], message: 'Give the symptom a name and choose where it fits.' });
  }
  if (e.kind === 'bleeding' && !e.bleeding) ctx.addIssue({ code: 'custom', path: ['bleeding'], message: 'Answer the bleeding questions.' });
});
