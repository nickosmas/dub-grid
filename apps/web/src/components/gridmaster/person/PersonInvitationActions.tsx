"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  InvitationAccessConflictError,
  resendOrganizationInvitationGuarded,
  revokeOrganizationInvitationGuarded,
} from "@/features/organization/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { Invitation } from "@/types";

const CONFLICT_MESSAGE =
  "That invitation changed elsewhere. Review the latest values and try again.";

/**
 * Resend or revoke an open invitation. The resend route rotates an expired
 * one, so an expired invitation is resent rather than re-sent from scratch.
 */
export function PersonInvitationActions({
  invitation,
  onChanged,
}: {
  invitation: Invitation;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState<"resend" | "revoke" | null>(null);
  const [busy, setBusy] = useState(false);
  if (invitation.acceptedAt || invitation.revokedAt) return null;

  const input = {
    orgId: invitation.orgId,
    invitationId: invitation.id,
    expectedUpdatedAt: invitation.updatedAt ?? invitation.createdAt,
  };

  async function handleConfirm() {
    setBusy(true);
    try {
      if (confirm === "resend") {
        await resendOrganizationInvitationGuarded(input);
        toast.success(`Invitation sent again to ${invitation.email}`);
      } else {
        await revokeOrganizationInvitationGuarded(input);
        toast.success("Invitation revoked");
      }
      setConfirm(null);
      onChanged();
    } catch (error) {
      if (error instanceof InvitationAccessConflictError) {
        toast.error(CONFLICT_MESSAGE);
        onChanged();
        return;
      }
      toast.error(formatClientErrorMessage(error, "We couldn't update that invitation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => setConfirm("resend")}
        disabled={busy}
      >
        Resend
      </Button>
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => setConfirm("revoke")}
        disabled={busy}
      >
        Revoke
      </Button>
      {confirm && (
        <ConfirmDialog
          title={confirm === "resend" ? "Resend invitation" : "Revoke invitation"}
          message={
            confirm === "resend"
              ? `Send a new invitation link to ${invitation.email}? The old link stops working.`
              : `Revoke the invitation to ${invitation.email}? The link stops working.`
          }
          confirmLabel={confirm === "resend" ? "Resend" : "Revoke"}
          variant={confirm === "resend" ? "info" : "danger"}
          isLoading={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
