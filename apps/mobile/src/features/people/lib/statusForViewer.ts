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
 * it. Anyone else sees only that a colleague is away, now or planned: Active
 * says nothing to them, and suspensions, last days, returns and first days are
 * for the people who act on them. Null when there is nothing to show.
 */
export function statusForViewer<T extends StatusFields>(person: T, canAct: boolean): T | null {
  if (canAct) return person;
  if (person.status === "inactive") {
    return {
      ...person,
      suspendedAt: null,
      suspendedUntil: null,
      plannedStatus: null,
      plannedFrom: null,
      plannedUntil: null,
      firstDay: null,
    };
  }
  if (person.status === "active" && person.plannedStatus === "away") {
    return { ...person, suspendedAt: null, suspendedUntil: null, firstDay: null };
  }
  return null;
}
