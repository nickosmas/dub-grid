import type { Employee } from "@/types";

/** What the People table's Account column says about a person's app account. */
export type StaffAccountState = "linked" | "invited" | "not_invited" | "no_email";

export const STAFF_ACCOUNT_STATES: readonly StaffAccountState[] = [
  "linked",
  "invited",
  "not_invited",
  "no_email",
];

export const STAFF_ACCOUNT_STATE_LABELS: Readonly<Record<StaffAccountState, string>> = {
  linked: "Linked",
  invited: "Invited",
  not_invited: "Not invited",
  no_email: "No email",
};

/**
 * The column and the Account filter both read this, so a filter can never
 * return someone whose row says something else.
 */
export function getStaffAccountState(
  employee: Pick<Employee, "userId" | "email">,
  hasPendingInvite: boolean,
): StaffAccountState {
  if (employee.userId) return "linked";
  if (hasPendingInvite) return "invited";
  return employee.email ? "not_invited" : "no_email";
}
