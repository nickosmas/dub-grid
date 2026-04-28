export function mergeDraftChangedBroadcastPayload(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current, ...next };
  const currentShifts =
    (current.shifts as Record<string, unknown> | undefined) ?? {};
  const nextShifts = (next.shifts as Record<string, unknown> | undefined) ?? {};
  const currentNotes =
    (current.notes as Record<string, unknown> | undefined) ?? {};
  const nextNotes = (next.notes as Record<string, unknown> | undefined) ?? {};

  if (Object.keys(currentShifts).length || Object.keys(nextShifts).length) {
    merged.shifts = { ...currentShifts, ...nextShifts };
  }
  if (Object.keys(currentNotes).length || Object.keys(nextNotes).length) {
    merged.notes = { ...currentNotes, ...nextNotes };
  }

  return merged;
}
