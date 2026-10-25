/**
 * Splits her own note into sentences so each can become an advice item or a question, in her exact words.
 * Works on the device without AI. Handles English full stops, question and exclamation marks, the Hindi
 * danda, semicolons and line breaks. Nothing is classified or guessed: she chooses what each sentence is.
 */
export function splitNote(note: string, max = 12): string[] {
  return note
    .split(/(?<=[.!?।॥;])\s+|\r?\n+/u)
    .map(s => s.replace(/^[\s\-•*]+/, '').replace(/[\s.;]+$/u, '').trim())
    .filter(s => s.length >= 3 && /\p{L}/u.test(s))
    .slice(0, max);
}
