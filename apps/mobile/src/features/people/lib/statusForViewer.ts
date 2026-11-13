import type { MobilePerson } from "@dubgrid/contracts";

type StatusFields = Pick<MobilePerson, "status" | "plannedStatus"> &
  Partial<
    Pick<
      MobilePerson,
      "suspendedAt" | "suspendedUntil" | "plannedFrom" | "plannedUntil" | "firstDay"
    >
  >;

/**
 * The status a viewer is shown. Someone who can change statuses sees all of
 * it. Anyone else sees none of it, Away included: a colleague's status is for
 * the people who act on it, and the server withholds it from them anyway.
 * Null when there is nothing to show.
 */
export function statusForViewer<T extends StatusFields>(person: T, canAct: boolean): T | null {
  return canAct ? person : null;
}
