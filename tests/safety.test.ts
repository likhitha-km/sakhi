import { describe, expect, it } from 'vitest';
import { evaluateEpisode, evaluateSafely, NONE_TEXT } from '../src/safety/evaluate.ts';
import type { EpisodeInput } from '../src/types/safety.ts';

const T = '2026-10-25';
const now = (p: Partial<EpisodeInput>): EpisodeInput => ({
  occurredOn: T, isHappeningNow: true, soakingEveryHourForHours: 0, fainted: false, severePainWithDanger: false,
  anyBleeding: false, pregnancyStatus: 'not_pregnant', ...p,
});

describe('urgent warning signs', () => {
  it('S01 soaking every hour for 2 hours', () => expect(evaluateEpisode(now({ soakingEveryHourForHours: 2, anyBleeding: true }), T)).toMatchObject({ level: 'urgent', ruleId: 'SF1', tense: 'current' }));
  it('S02 soaking for 1 hour, not pregnant', () => {
    const r = evaluateEpisode(now({ soakingEveryHourForHours: 1, anyBleeding: true }), T);
    expect(r.level).toBe('none');
    expect(r.body).toBe(NONE_TEXT);
    expect(r.body).toContain('does not mean there is no problem');
  });
  it('S03 fainted', () => expect(evaluateEpisode(now({ fainted: true }), T)).toMatchObject({ level: 'emergency', ruleId: 'SF2' }));
  it('S04 fainted in the past is a quiet card', () => {
    expect(evaluateEpisode(now({ fainted: true, occurredOn: '2026-10-20' }), T)).toMatchObject({ level: 'emergency', tense: 'past' });
    expect(evaluateEpisode(now({ fainted: true, isHappeningNow: false }), T).tense).toBe('past');
  });
  it('S05 possibly pregnant, bleeding, severe pain', () => expect(evaluateEpisode(now({ pregnancyStatus: 'possible', anyBleeding: true, severePainWithDanger: true }), T)).toMatchObject({ level: 'emergency', ruleId: 'SF3' }));
  it('S06 pregnant, soaking for 1 hour', () => expect(evaluateEpisode(now({ pregnancyStatus: 'confirmed', soakingEveryHourForHours: 1, anyBleeding: true }), T)).toMatchObject({ level: 'urgent', ruleId: 'SF3' }));
  it('S07 pregnant, bleeding only', () => {
    const r = evaluateEpisode(now({ pregnancyStatus: 'confirmed', anyBleeding: true }), T);
    expect(r).toMatchObject({ level: 'prompt_advice', ruleId: 'SF4' });
    expect(r.title.toLowerCase()).not.toContain('emergency');
  });
  it('S08 a failure shows the static urgent notice', () => {
    const r = evaluateSafely(now({}), T, () => { throw new Error('boom'); });
    expect(r.level).toBe('fallback');
    expect(r.body).toContain('112');
    expect(r.title.toLowerCase()).not.toContain('no ');
  });
  it('demo case: soaking 3 hours and fainted is an emergency', () => expect(evaluateEpisode(now({ soakingEveryHourForHours: 3, fainted: true, anyBleeding: true }), T).level).toBe('emergency'));
});
