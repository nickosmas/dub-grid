import { getStepUpMethod } from "@/features/account/client/step-up";
import type { AssignableOrganizationRole, Employee } from "@/types";

/** An invite asked for in Add staff members, keyed by the address typed for that person. */
export type NewStaffInvite = { email: string; role: AssignableOrganizationRole };

/**
 * Sends each invite still in `pending` to the person just added with that
 * address, removing it once sent so a run resumed after an identity check
 * never sends one twice. A step-up refusal is thrown for the caller to ask
 * for proof; any other failure is collected, since the people were added.
 */
export async function sendNewStaffInvites(input: {
  added: Pick<Employee, "id" | "email">[];
  pending: Map<string, NewStaffInvite>;
  failed: string[];
  send: (invite: NewStaffInvite & { employeeId: string }) => Promise<unknown>;
}): Promise<void> {
  const byEmail = new Map(
    input.added
      .filter((employee) => employee.email)
      .map((employee) => [employee.email.trim().toLowerCase(), employee]),
  );
  for (const [key, invite] of input.pending) {
    const employee = byEmail.get(key);
    if (!employee) {
      input.pending.delete(key);
      continue;
    }
    try {
      await input.send({ ...invite, email: employee.email, employeeId: employee.id });
      input.pending.delete(key);
    } catch (failure) {
      if (getStepUpMethod(failure)) throw failure;
      input.pending.delete(key);
      input.failed.push(employee.email);
    }
  }
}
