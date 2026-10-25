// Runs the 20 notes through the local helper and scores them against notes.json.
import { readFileSync, writeFileSync } from 'node:fs';
const notes = JSON.parse(readFileSync(new URL('./notes.json', import.meta.url), 'utf8'));
const URL_ = 'http://127.0.0.1:8787/extract-visit';
const rows = [];
for (const n of notes) {
  let r = null;
  for (let attempt = 0; attempt < 3 && !r; attempt++) {
    const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, note: n.note, today: '2026-10-25' }) });
    if (res.status === 200) r = await res.json(); else if (attempt === 2) r = { error: res.status };
  }
  if (r.error) { rows.push({ ...n, error: r.error }); continue; }
  const want = [...n.advice];
  let correct = 0, extra = 0;
  for (const a of r.advice) { const i = want.indexOf(a.kind); if (i >= 0) { want.splice(i, 1); correct++; } else extra++; }
  const cCorrect = Math.min(r.concerns.length, n.concerns), cExtra = Math.max(0, r.concerns.length - n.concerns), cMissed = Math.max(0, n.concerns - r.concerns.length);
  rows.push({ ...n, got: r.advice.map(a => `${a.kind}: ${a.text}`), gotConcerns: r.concerns.map(c => c.text), correct: correct + cCorrect, missed: want.length + cMissed, extra: extra + cExtra, dropped: r.dropped, language: r.language });
}
const by = {};
for (const r of rows) { const k = r.lang === 'Hinglish' || r.lang === 'Hindi' ? 'Hindi or Hinglish' : r.lang; by[k] ??= { notes: 0, correct: 0, missed: 0, extra: 0, dropped: 0, errors: 0 }; const b = by[k]; b.notes++; if (r.error) { b.errors++; continue; } b.correct += r.correct; b.missed += r.missed; b.extra += r.extra; b.dropped += r.dropped; }
let md = `# Language test results\n\nRun on ${new Date().toISOString()} against the local helper. Expected values were written before this run.\n\n| Language | Notes | Correct | Missed | Extra | Dropped by the checker | Errors |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const [k, b] of Object.entries(by)) md += `| ${k} | ${b.notes} | ${b.correct} | ${b.missed} | ${b.extra} | ${b.dropped} | ${b.errors} |\n`;
md += `\n## Each note\n\n| Note | Expected | Returned | Correct / missed / extra / dropped |\n| --- | --- | --- | --- |\n`;
for (const r of rows) md += `| ${r.id} | ${[...r.advice, ...Array(r.concerns).fill('concern')].join(', ') || 'nothing'} | ${r.error ? 'error ' + r.error : [...r.got, ...r.gotConcerns.map(c => 'concern: ' + c)].join('; ').replace(/\|/g, '/') || 'nothing'} | ${r.error ? '-' : `${r.correct} / ${r.missed} / ${r.extra} / ${r.dropped}`} |\n`;
writeFileSync(new URL('./results.md', import.meta.url), md);
console.log(md);
