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
 * "Day Shift", or "Day Shift (Skilled Nursing)" when another active shift in
 * the organization has the same name. Names are unique only within a focus
 * area, so a name alone can't tell two areas' shifts apart. An org-wide shift
 * never gets a suffix: the area shift that shares its name carries one.
 */
export function shiftDisplayName(
  shift: NamedShift,
  shifts: readonly NamedShift[],
  focusAreaName: (focusAreaId: number) => string | null | undefined,
): string {
  if (shift.focusAreaId == null) return shift.name;
  const key = nameKey(shift.name);
  const shared = shifts.some(
    (other) => other.id !== shift.id && !other.archivedAt && nameKey(other.name) === key,
  );
  const area = shared ? focusAreaName(shift.focusAreaId) : null;
  return area ? `${shift.name} (${area})` : shift.name;
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
