"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "var(--dg-color-warning-bg)",
          border: "1px solid var(--dg-color-warning-border)",
          borderRadius: "var(--dg-radius-lg)",
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--dg-color-warning-text)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: "var(--dg-color-warning-text)",
              }}
            >
              {expired ? "Invitation expired" : "Invitation pending"}
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-warning-text)",
                marginTop: 1,
              }}
            >
              Sent to {pendingInvitation.email}
            </div>
            <div
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-warning-text)",
                marginTop: 1,
              }}
            >
              Sent {formatInvitationTime(pendingInvitation.createdAt)}.{" "}
              {expired ? "Expired" : "Expires"} {formatInvitationTime(pendingInvitation.expiresAt)}.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {onReinvite && (
            <Button
              disabled={isInSandbox}
              onClick={() => setPendingAction("reinvite")}
              className="dg-btn dg-btn-ghost dg-btn-xs"
              style={{ color: "var(--dg-color-link)" }}
              title={
                isInSandbox ? "Sending invitations isn't available in sandbox mode." : undefined
              }
            >
              Reinvite
            </Button>
          )}
          <Button
            disabled={isInSandbox}
            onClick={() => setPendingAction("revoke")}
            className="dg-btn dg-btn-ghost dg-btn-xs"
            style={{ color: "var(--dg-color-danger)" }}
            title={
              isInSandbox ? "Revoking invitations isn't available in sandbox mode." : undefined
            }
          >
            Revoke
          </Button>
        </div>
      </div>
      {pendingAction && (
        <ConfirmDialog
          title={copy.title}
          message={copy.message(pendingInvitation.email)}
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
