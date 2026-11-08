interface NamedShift {
  id: number;
  name: string;
  focusAreaId?: number | null;
  archivedAt?: string | null;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The focus area a shift's name needs beside it, or null: only when another
 * active shift in the organization has the same name. Names are unique only
 * within a focus area, so a name alone can't tell two areas' shifts apart. An
 * org-wide shift never needs one: the area shift that shares its name does.
 */
export function sharedShiftFocusArea(
  shift: NamedShift,
  shifts: readonly NamedShift[],
  focusAreaName: (focusAreaId: number) => string | null | undefined,
): string | null {
  if (shift.focusAreaId == null) return null;
  const key = nameKey(shift.name);
  const shared = shifts.some(
    (other) => other.id !== shift.id && !other.archivedAt && nameKey(other.name) === key,
  );
  return (shared ? focusAreaName(shift.focusAreaId) : null) || null;
}

/**
 * "Day Shift", or "Day Shift · Skilled Nursing" when another active shift has
 * the same name. Text names a shift, then its job, then its area, then time;
 * with a job, use `sharedShiftFocusArea` and put the area after the job.
 */
export function shiftDisplayName(
  shift: NamedShift,
  shifts: readonly NamedShift[],
  focusAreaName: (focusAreaId: number) => string | null | undefined,
): string {
  const area = sharedShiftFocusArea(shift, shifts, focusAreaName);
  return area ? `${shift.name} · ${area}` : shift.name;
}

/** `shiftDisplayName` for every shift, by id. */
export function shiftDisplayNamesById(
  shifts: readonly NamedShift[],
  focusAreas: readonly { id: number; name: string }[],
): Map<number, string> {
  const areaName = new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
  return new Map(
    shifts.map((shift) => [shift.id, shiftDisplayName(shift, shifts, (id) => areaName.get(id))]),
  );
}

/** `sharedShiftFocusArea` for every shift that needs one, by id. */
export function sharedShiftFocusAreasById(
  shifts: readonly NamedShift[],
  focusAreas: readonly { id: number; name: string }[],
): Map<number, string> {
  const areaName = new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
  return new Map(
    shifts.flatMap((shift) => {
      const area = sharedShiftFocusArea(shift, shifts, (id) => areaName.get(id));
      return area ? [[shift.id, area] as const] : [];
    }),
  );
}
