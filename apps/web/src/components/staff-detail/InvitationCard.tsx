"use client";

import { useState } from "react";
import { Mail, MailX } from "lucide-react";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { INVITATION_ACTION_COPY } from "@/components/staff/useInvitationActionConfirm";
import { describeInvitationCard, type PersonAccountState } from "@/lib/person-account-state";
import { StatusIconCircle } from "./StatusMarkIcon";

type Result = Promise<boolean | void> | boolean | void;

interface InvitationCardProps {
  /** Where their invitation stands; someone who can sign in gets no card. */
  state: Exclude<PersonAccountState, { kind: "linked" }>;
  onInvite?: () => void;
  /** Offered to someone with no email on file, so one can be added. */
  onEditDetails?: () => void;
  onResend?: (invitationId: string) => Result;
  onRevoke?: (invitationId: string) => Result;
  /** Why the invitation buttons are off, such as in the Test Sandbox. */
  disabledReason?: string;
}

/**
 * Where someone without a sign-in stands with their invitation, in the status
 * card's style, directly under it. Resend and Revoke confirm first, as the
 * invitation banner did.
 */
export function InvitationCard({
  state,
  onInvite,
  onEditDetails,
  onResend,
  onRevoke,
  disabledReason,
}: InvitationCardProps) {
  const [confirming, setConfirming] = useState<"resend" | "revoke" | null>(null);
  const { title, detail } = describeInvitationCard(state);
  const invitation = state.kind === "pending" || state.kind === "expired" ? state : null;
  const copy = confirming ? INVITATION_ACTION_COPY[confirming] : null;
  const disabled = Boolean(disabledReason);

  const actions = [
    state.kind === "not-invited" && onInvite
      ? { key: "invite", label: "Invite", onClick: onInvite }
      : null,
    state.kind === "no-email" && onEditDetails
      ? { key: "edit", label: "Edit details", onClick: onEditDetails }
      : null,
    invitation && onResend
      ? { key: "resend", label: "Resend", onClick: () => setConfirming("resend") }
      : null,
    state.kind === "pending" && onRevoke
      ? { key: "revoke", label: "Revoke", onClick: () => setConfirming("revoke") }
      : null,
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  async function confirm() {
    if (!invitation || !confirming) return;
    await (confirming === "revoke" ? onRevoke : onResend)?.(invitation.invitationId);
    setConfirming(null);
  }

  return (
    <>
      <section
        aria-label="Invitation"
        data-slot="employee-invitation-card"
        data-invitation={state.kind}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: "var(--dg-radius-lg)",
          minWidth: 0,
          border: "1px solid var(--dg-color-border)",
          background: "var(--dg-color-surface)",
        }}
      >
        <StatusIconCircle
          icon={state.kind === "expired" ? MailX : Mail}
          tone={invitation ? "warning" : "neutral"}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span
            className="dg-tabular-nums"
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {title}
          </span>
          {detail ? (
            <span
              className="dg-tabular-nums"
              style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
            >
              {detail}
            </span>
          ) : null}
        </span>
        {actions.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {actions.map((action) => (
              <Button
                key={action.key}
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                disabled={disabled}
                title={disabledReason}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </section>
      {invitation && copy ? (
        <ConfirmDialog
          title={copy.title(invitation.email)}
          message={copy.message}
          confirmLabel={copy.confirmLabel}
          variant={copy.variant}
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </>
  );
}
