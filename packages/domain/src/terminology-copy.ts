/**
 * Organization labels ("Focus Areas", "Wings", "Certifications") are stored in
 * their plural, title-cased display form. These put one into a sentence or a
 * column heading without hardcoding the default term. The trailing "s" is
 * stripped naively, which covers every label the settings realistically
 * produce; English irregulars are out of scope.
 */

/** "Focus Areas" as "focus area". */
export function singularLabelNoun(label: string): string {
  return label.trim().replace(/s$/i, "").toLowerCase();
}

/** "Focus Areas" as "focus areas". */
export function pluralLabelNoun(label: string): string {
  return label.trim().toLowerCase();
}

/** "focus area" as "Focus area", to start a heading or a column. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
