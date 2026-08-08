/**
 * Organization terminology labels ("Focus Areas", "Wings", "Certifications") are
 * stored in their plural, title-cased display form, which is what a heading or a
 * column title wants. Dropping one into mid-sentence copy unedited produces
 * "Select at least one Wings".
 *
 * Returns the label as a lowercase singular noun for use inside a sentence. The
 * trailing "s" is stripped naively, which covers every label the terminology
 * settings realistically produce; English irregulars are out of scope.
 */
export function singularLabelNoun(label: string): string {
  return label.trim().replace(/s$/i, "").toLowerCase();
}
