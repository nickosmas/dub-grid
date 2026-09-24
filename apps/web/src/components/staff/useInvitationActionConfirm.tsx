"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

export type InvitationActionKind = "revoke" | "resend";

type Pending = {
  kind: InvitationActionKind;
  email: string | null;
  resolve: (confirmed: boolean) => void;
};

export const INVITATION_ACTION_COPY: Record<
  InvitationActionKind,
  {
    title: string;
    confirmLabel: string;
    variant: "danger" | "warning";
    message: (who: string) => string;
  }
> = {
  revoke: {
    title: "Revoke Invitation?",
    confirmLabel: "Revoke",
    variant: "danger",
    // The revoked link never comes back, but inviting the person again is
    // always open and issues a new one. Saying only the first half read as
    // though they could never be invited again.
    message: (who) =>
      `Revoke the invitation for ${who}? Their invite link stops working right away. If you change your mind, you can send them a new invitation.`,
  },
  resend: {
    title: "Reissue Invitation?",
    confirmLabel: "Reissue",
    variant: "warning",
    // Reissuing rotates the token on the same invitation, so the link the
    // invitee already holds dies the moment this is confirmed.
    message: (who) =>
      `Send ${who} a new invitation link? Their current link stops working immediately.`,
  },
};

/**
 * One confirmation for the invitation actions that cannot be undone from the
 * invitee's side. Each surface that revokes or reissues asks through this, so
 * the wording and the consequence read the same wherever it is offered.
 */
export function useInvitationActionConfirm(): {
  askToConfirm: (kind: InvitationActionKind, email: string | null) => Promise<boolean>;
  confirmDialog: React.ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  function askToConfirm(kind: InvitationActionKind, email: string | null): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      setPending({ kind, email, resolve });
    });
  }

  function settle(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  const copy = pending ? INVITATION_ACTION_COPY[pending.kind] : null;

  return {
    askToConfirm,
    confirmDialog:
      pending && copy ? (
        <ConfirmDialog
          title={copy.title}
          message={copy.message(pending.email ?? "this person")}
          confirmLabel={copy.confirmLabel}
          variant={copy.variant}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null,
  };
}
