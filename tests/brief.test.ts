import { describe, expect, it } from 'vitest';
import { buildBrief, briefText, emptyDraft } from '../src/brief/buildBrief.ts';
import { computeEvidence } from '../src/engine/compute.ts';
import { generateAnanya, generateAnanyaLegacyCare, generateAnanyaWithError } from '../src/fixtures/ananya.ts';
import { generateSparse } from '../src/fixtures/sparse.ts';
import { checkEntries } from '../src/engine/checks.ts';
import { allResults } from '../src/engine/compute.ts';
import type { Entry, Exclusion, Profile } from '../src/types/entry.ts';

const T = '2026-10-25';
const profile: Profile = { id: 1, cycleStatus: 'regular', pregnancyStatus: 'not_pregnant', ageBand: '18-24', medicinesText: 'Iron tablets' };
const make = (entries: Entry[], exclusions: Exclusion[] = [], sections = {}, withCare = false, sampleName: string | null = 'Ananya') => {
  const bundle = computeEvidence({ entries, exclusions, profile, windowDays: 56 });
  const care = withCare ? generateAnanyaLegacyCare(T) : { providers: [], care: [] };
  return buildBrief({ bundle, profile, draft: { ...emptyDraft(), sections }, entries, exclusions, care: care.care, providers: care.providers, sampleName, today: T });
};

const BLOCK = [/you have/i, /diagnos(?!is\.)/i, /suffering/i, /likely/i, /risk of/i, /endometriosis/i, /pcos/i, /pcod/i, /anaemia|anemia/i, /thyroid/i, /fibroid/i, /menopaus/i, /cancer/i, /adenomyosis/i, /infection/i];

describe('brief', () => {
  it('B01 switched off sections are absent', () => {
    const entries = generateAnanyaWithError(T).map((e, i) => (i === 3 ? { ...e, note: 'secret note text' } : e));
    const on = briefText(make(entries));
    expect(on).toContain('Iron tablets');
    expect(on).toContain('secret note text');
    const off = briefText(make(entries, [], { medicines: false, notes: false }));
    expect(off).not.toContain('Iron tablets');
    expect(off).not.toContain('secret note text');
  });
  it('B02 left out entries are listed and numbers match', () => {
    const entries = generateAnanyaWithError(T);
    const planted = entries.find(e => e.note === 'typed on the wrong day')!;
    const ex = [{ entryId: planted.id, excludedAt: 'x' }];
    const m = make(entries, ex);
    expect(m.excluded?.count).toBe(1);
    expect(m.coverage).toContain('41 of 56');
    expect(m.symptoms!.find(s => s.label === 'Period pain')!.days).toBe(10);
  });
  it('B03 sample data is labelled', () => expect(make(generateAnanya(T)).sample).toContain('Sample data'));
  it('B04 limits are always present', () => {
    const m = make(generateSparse(T), [], { coverage: false, symptoms: false, questions: false });
    expect(m.limits[0]).toBe('Patient reported information. Not a diagnosis.');
  });
  it('C06 care section, names and hidden events', () => {
    const entries = generateAnanya(T);
    const withNames = briefText(make(entries, [], { careNames: true }, true));
    expect(withNames).toContain('Dr Meera Rao');
    const noNames = briefText(make(entries, [], {}, true));
    expect(noNames).not.toContain('Dr Meera Rao');
    expect(noNames).toContain('Ayurveda');
    expect(noNames).toContain('Modern medicine');
    expect(briefText(make(entries, [], { care: false }, true))).not.toContain('Ayurveda');
  });
  it('C03 Q9 appears with two kinds of care in use, Q10 and Q11 too', () => {
    const qs = make(generateAnanya(T), [], {}, true).questions!.join('\n');
    expect(qs).toContain('using these together');
    expect(qs).toContain('advised another');
    expect(qs).toContain('already had these tests');
    expect(make(generateAnanya(T)).questions!.join('\n')).not.toContain('using these together');
  });
  it('sparse brief still builds', () => {
    const m = make(generateSparse(T), [], {}, false, 'Farah');
    expect(m.coverage).toContain('5 of 56');
    expect(m.bleeding).toBeNull();
  });
  it('U14 no generated text uses diagnostic wording', () => {
    const texts: string[] = [];
    for (const entries of [generateAnanya(T), generateAnanyaWithError(T), generateSparse(T)]) {
      const m = make(entries, [], { careNames: true }, true);
      texts.push(briefText({ ...m, limits: [] }));
      const b = computeEvidence({ entries, exclusions: [], profile, windowDays: 56 });
      for (const r of allResults(b)) texts.push(r.statement, r.reason ?? '', r.limitationText, r.label);
      for (const c of checkEntries(entries, [], generateAnanyaLegacyCare(T).care, T)) texts.push(c.title, c.detail);
    }
    for (const t of texts) for (const re of BLOCK) expect(t, t).not.toMatch(re);
  });
});
