/**
 * The absence a viewer sees in place of a colleague's when the organization
 * hides absence names from them. Its id is never stored, so it can't collide
 * with a real absence type.
 */
export const HIDDEN_ABSENCE_TYPE = {
  id: -1,
  label: "TO",
  name: "Time off",
  color: "#E5E5E5",
  borderColor: "transparent",
  textColor: "#404040",
} as const;

export const HIDDEN_ABSENCE_TYPE_ID = HIDDEN_ABSENCE_TYPE.id;

export interface AbsenceNameMask {
  /** The absence type this viewer may see for this person's absence. */
  absenceTypeId(
    empId: string | null | undefined,
    absenceTypeId: number | null | undefined,
  ): number | null;
}

/**
 * Null when the viewer sees every absence's name. Otherwise a colleague's
 * absence reads as Time off; the viewer's own and the kept ones (the day off
 * absence) keep their names.
 */
export function createAbsenceNameMask(input: {
  showAbsenceNames: boolean;
  viewerEmployeeIds: Iterable<string | null | undefined>;
  keepAbsenceTypeIds?: Iterable<number | null | undefined>;
}): AbsenceNameMask | null {
  if (input.showAbsenceNames) return null;
  const own = new Set([...input.viewerEmployeeIds].filter((id): id is string => !!id));
  const keep = new Set(
    [...(input.keepAbsenceTypeIds ?? [])].filter((id): id is number => id != null),
  );
  return {
    absenceTypeId(empId, absenceTypeId) {
      if (absenceTypeId == null) return null;
      if ((empId && own.has(empId)) || keep.has(absenceTypeId)) return absenceTypeId;
      return HIDDEN_ABSENCE_TYPE_ID;
    },
  };
}

/** A cell state with its absence, if any, as this viewer may see it. */
export function maskCellStateAbsence<
  S extends { absenceTypeId?: number | null } | null | undefined,
>(mask: AbsenceNameMask | null, empId: string | null | undefined, state: S): S {
  if (!mask || !state || state.absenceTypeId == null) return state;
  const absenceTypeId = mask.absenceTypeId(empId, state.absenceTypeId);
  return absenceTypeId === state.absenceTypeId ? state : { ...state, absenceTypeId };
}
