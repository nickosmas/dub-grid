"use client";

import { useState } from "react";
import { Mail, MailX } from "lucide-react";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";
import type { Invitation } from "@/types";
import { INVITATION_ACTION_COPY } from "./useInvitationActionConfirm";

interface PendingInvitationBannerProps {
  pendingInvitation: Invitation;
  /** Omit to hide the Reinvite action entirely. */
  onReinvite?: () => Promise<boolean | void> | boolean | void;
  onRevoke: (invitationId: string) => Promise<boolean | void> | boolean | void;
  isInSandbox?: boolean;
  /** The invitation passed its expiry without being accepted. */
  expired?: boolean;
}

function formatInvitationTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Shared "Invitation pending" warning card used everywhere a staff member's
 * open invitation needs to be visible, expired ones included: the full detail page, the slideover,
 * and the edit-details panel. Owns its own confirm-before-revoke dialog so
 * every caller gets the same safe behavior without re-implementing it.
 */
export function PendingInvitationBanner({
  pendingInvitation,
  onReinvite,
  onRevoke,
  isInSandbox = false,
  expired = false,
}: PendingInvitationBannerProps) {
  const [pendingAction, setPendingAction] = useState<"reinvite" | "revoke" | null>(null);
  const [busy, setBusy] = useState(false);
  // One wording for these actions wherever they are offered.
  const copy = INVITATION_ACTION_COPY[pendingAction === "revoke" ? "revoke" : "resend"];

  async function handleConfirm() {
    if (!pendingAction) return;
    setBusy(true);
    try {
      if (pendingAction === "revoke") {
        await onRevoke(pendingInvitation.id);
      } else {
        await onReinvite?.();
      }
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Banner
        tone="warning"
        icon={expired ? MailX : Mail}
        title={expired ? "Invitation expired" : "Invitation pending"}
        action={
          <div className="flex gap-1.5">
            {onReinvite && (
              <Button
                disabled={isInSandbox}
                onClick={() => setPendingAction("reinvite")}
                className="dg-btn dg-btn-secondary dg-btn-xs"
                title={
                  isInSandbox ? "Sending invitations isn't available in sandbox mode." : undefined
                }
              >
                Resend
              </Button>
            )}
            <Button
              disabled={isInSandbox}
              onClick={() => setPendingAction("revoke")}
              className="dg-btn dg-btn-secondary dg-btn-xs"
              title={
                isInSandbox ? "Revoking invitations isn't available in sandbox mode." : undefined
              }
            >
              Revoke
            </Button>
          </div>
        }
      >
        <span className="font-normal">
          Sent to {pendingInvitation.email}
          <br />
          <span className="dg-tabular-nums">
            Sent {formatInvitationTime(pendingInvitation.createdAt)}.{" "}
            {expired ? "Expired" : "Expires"} {formatInvitationTime(pendingInvitation.expiresAt)}.
          </span>
        </span>
      </Banner>
      {pendingAction && (
        <ConfirmDialog
          title={copy.title(pendingInvitation.email)}
          message={copy.message}
          confirmLabel={copy.confirmLabel}
          variant={copy.variant}
          isLoading={busy}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (!busy) setPendingAction(null);
          }}
        />
      )}
    </>
  );
}
