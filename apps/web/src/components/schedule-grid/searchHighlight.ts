/**
 * Whether a section's rows read the staff search the same way: a section only
 * uses whether anyone matched and which of its own people did.
 */
export function sameSearchHighlight(
  before: ReadonlySet<string> | undefined,
  after: ReadonlySet<string> | undefined,
  employeeIds: readonly string[],
): boolean {
  if ((before?.size ?? 0) > 0 !== (after?.size ?? 0) > 0) return false;
  return employeeIds.every((id) => (before?.has(id) ?? false) === (after?.has(id) ?? false));
}
