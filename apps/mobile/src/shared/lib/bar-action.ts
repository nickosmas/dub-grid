/**
 * Bar commits that only save what was edited, which the bar draws as a
 * checkmark (owner, 2026-10-31). A verb with an outcome of its own (Send,
 * Approve, Mark away, Clear all) keeps its words, as the system's Send does.
 */
const CHECKMARK_LABELS = new Set([
  "apply",
  "confirm",
  "done",
  "ok",
  "save",
  "save access",
  "save changes",
  "update",
]);

/** Whether a bar's commit reads as a checkmark rather than its label. */
export function barActionIsCheckmark(label: string | undefined): boolean {
  return label != null && CHECKMARK_LABELS.has(label.trim().toLowerCase());
}
