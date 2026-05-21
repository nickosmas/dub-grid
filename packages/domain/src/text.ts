/**
 * Returns the correct indefinite article ("a" | "an") for a word, chosen by the
 * word's leading sound rather than its leading letter.
 *
 * Intended for copy where a noun is interpolated from org-customizable labels
 * (absence types, roles, certifications, profile field names) so the article
 * stays grammatical regardless of what the org typed. It is a pragmatic
 * heuristic scoped to that data, not a full pronunciation engine, and does not
 * special-case acronyms (none of the inputs it serves are acronyms).
 */
export function indefiniteArticle(word: string): "a" | "an" {
  const w = word.trim().toLowerCase();
  if (!w) return "a";
  // Consonant-letter words with a leading vowel sound (silent h) take "an".
  if (/^(hour|honest|hono(u)?r|heir)/.test(w)) return "an";
  // Vowel-letter words with a leading consonant sound take "a":
  // "you"-sound u-words (unique, university, use, utility, ubiquitous),
  // all eu- words (European, eulogy), and "one"/"once".
  if (
    /^(u(ni(?!n)|se|su|ti|to|ten|biq|ku|nan|sur)|eu|once|one\b|one[- ])/.test(w)
  ) {
    return "a";
  }
  return /^[aeiou]/.test(w) ? "an" : "a";
}
