"use client";

import { useCallback } from "react";
import { useSharedStepUp } from "@/hooks/useSharedStepUp";
import { createOrganizationInvitation } from "@/features/organization/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { sendNewStaffInvites, type NewStaffInvite } from "./new-staff-invites";

export type InviteNewStaffResult =
  | { status: "done"; sent: number; failed: string[] }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Invites people just added, from Add staff members or an import, asking for
 * fresh proof once when the server wants it. Render `dialog` beside the caller.
 */
export function useInviteNewStaff(orgId: string | null | undefined) {
  const stepUp = useSharedStepUp();

  const inviteAddedPeople = useCallback(
    async (
      added: { id: string; email: string }[],
      invites: NewStaffInvite[],
    ): Promise<InviteNewStaffResult> => {
      if (!orgId || invites.length === 0) return { status: "done", sent: 0, failed: [] };
      const pending = new Map(invites.map((invite) => [invite.email.toLowerCase(), invite]));
      const failed: string[] = [];
      try {
        const completed = await stepUp.run((accessToken) =>
          sendNewStaffInvites({
            added,
            pending,
            failed,
            send: (invite) =>
              createOrganizationInvitation(
                {
                  email: invite.email,
                  role: invite.role,
                  orgId,
                  employeeId: invite.employeeId,
                  ...(invite.adminPermissions ? { adminPermissions: invite.adminPermissions } : {}),
                },
                accessToken,
              ),
          }),
        );
        if (!completed) return { status: "cancelled" };
      } catch (err) {
        return {
          status: "error",
          message: formatClientErrorMessage(err, "We couldn't send those invites. Try again."),
        };
      }
      const invitedEmails = new Set(added.map((person) => person.email.toLowerCase()));
      const asked = invites.filter((invite) => invitedEmails.has(invite.email.toLowerCase()));
      return { status: "done", sent: asked.length - failed.length, failed };
    },
    [orgId, stepUp],
  );

  return { inviteAddedPeople, dialog: stepUp.dialog };
}
