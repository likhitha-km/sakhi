import type { EpisodeInput, SafetyResult } from '../types/safety.ts';
import { todayLocal } from '../engine/dates.ts';
import { RULES, SAFETY_RULES_VERSION } from './rules.ts';

const SOURCES = ['NHS guidance on heavy periods and bleeding in pregnancy', 'CDC guidance on heavy menstrual bleeding'];

const COPY = {
  emergency: {
    title: 'Get emergency help now',
    body: 'What you describe needs emergency care. Call 112 or go to the nearest emergency department. If you can, ask someone to stay with you.',
    actions: ['Call 112', 'Go to the nearest emergency department'],
  },
  urgent: {
    title: 'Get checked by a doctor now',
    body: 'What you describe needs to be seen by a doctor urgently, today, not at a routine appointment. Go to a hospital or call 112 if you feel worse, faint, or very unwell.',
    actions: ['Go to a hospital or clinic now', 'Call 112 if you feel worse'],
  },
  prompt_advice: {
    title: 'Speak to a doctor or midwife today',
    body: 'Any bleeding when you might be pregnant should be checked. Contact a doctor, midwife or your nearest hospital today. Call 112 if the bleeding becomes heavy or you have severe pain or feel faint.',
    actions: ['Contact a doctor or midwife today'],
  },
} as const;

export const NONE_TEXT = 'Nothing you entered matched our urgent warning signs. This does not mean there is no problem. If you feel seriously unwell, or worried, get help anyway.';

export const FALLBACK: SafetyResult = {
  level: 'fallback', tense: 'current', title: 'If you feel unwell, get help now',
  body: 'We could not check your answers. If you are bleeding heavily, have fainted, have severe pain, chest pain or trouble breathing, call 112 or go to the nearest emergency department.',
  actions: ['Call 112'], sources: [], rulesVersion: SAFETY_RULES_VERSION,
};

export function evaluateEpisode(input: EpisodeInput, today = todayLocal()): SafetyResult {
  const past = !input.isHappeningNow || input.occurredOn < today;
  const rule = RULES.find(r => r.when(input));
  if (!rule) return {
    level: 'none', tense: past ? 'past' : 'current', title: 'No urgent warning signs matched',
    body: NONE_TEXT, actions: [], sources: SOURCES, rulesVersion: SAFETY_RULES_VERSION,
  };
  const c = COPY[rule.level];
  if (past) return {
    level: rule.level, ruleId: rule.id, tense: 'past',
    title: 'This would need urgent care if it were happening now',
    body: 'You recorded this for a time that has passed. If it is happening again now, or you still feel unwell, get help straight away. Mention it at your next appointment.',
    actions: [], sources: SOURCES, rulesVersion: SAFETY_RULES_VERSION,
  };
  return { level: rule.level, ruleId: rule.id, tense: 'current', title: c.title, body: c.body, actions: [...c.actions], sources: SOURCES, rulesVersion: SAFETY_RULES_VERSION };
}

/** Never throws. If the rules fail, the static urgent notice is returned instead. */
export function evaluateSafely(input: EpisodeInput, today?: string, impl: typeof evaluateEpisode = evaluateEpisode): SafetyResult {
  try { return impl(input, today); } catch { return FALLBACK; }
}
