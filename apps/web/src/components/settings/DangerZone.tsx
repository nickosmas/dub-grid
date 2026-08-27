"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Organization } from "@/types";
import { Button } from "@/components/Button";
import { SectionCard } from "./shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatClientErrorMessage } from "@/lib/client-facing";
import * as Sentry from "@/lib/sentry";
import { useIsInSandbox, useLogout } from "@/hooks";

interface DangerZoneProps {
  organization: Organization;
}

export default function DangerZone({ organization }: DangerZoneProps) {
  const isInSandbox = useIsInSandbox();
  const { signOut } = useLogout();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmPhrase = `DELETE ${organization.name}`;

  function closeDialog() {
    if (isDeleting) return;
    setConfirmOpen(false);
    setTyped("");
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/organizations/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: organization.id, confirmation: typed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "We couldn't delete that organization. Try again.");
      }
      toast.success("Organization deleted.");
      // The org is gone for this user. Sign out globally so every device's
      // session is invalidated; /goodbye handles the teardown.
      try {
        signOut({ scope: "global" });
      } catch (signOutErr) {
        Sentry.captureException(signOutErr);
        toast.error("We couldn't sign you out. Refresh the page and try again.");
        setIsDeleting(false);
      }
    } catch (err) {
      toast.error(
        formatClientErrorMessage(err, "We couldn't delete that organization. Try again."),
      );
      setIsDeleting(false);
    }
  }

  return (
    <SectionCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2
            style={{
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
              margin: 0,
            }}
          >
            Delete this organization
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-muted)",
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            Closing {organization.name} cancels its subscription and removes access for every
            member. Reach out to support if you need it restored.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            paddingTop: 12,
            borderTop: "1px solid var(--dg-color-border-light)",
          }}
        >
          <Button
            className="dg-btn dg-btn-danger-filled"
            onClick={() => setConfirmOpen(true)}
            disabled={isInSandbox}
            title={
              isInSandbox ? "Deleting the organization isn't available in sandbox mode." : undefined
            }
          >
            Delete organization
          </Button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Delete organization"
          variant="danger"
          confirmLabel="Delete organization"
          isLoading={isDeleting}
          confirmDisabled={typed !== confirmPhrase}
          onCancel={closeDialog}
          onConfirm={handleDelete}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span>
                This cancels billing and removes access for everyone in {organization.name}. This
                cannot be undone from here.
              </span>
              <label className="dg-label" htmlFor="danger-confirm-input">
                Type <strong>{confirmPhrase}</strong> to confirm
              </label>
              <input
                id="danger-confirm-input"
                className="dg-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmPhrase}
                autoComplete="off"
                autoFocus
                disabled={isDeleting}
              />
            </div>
          }
        />
      )}
    </SectionCard>
  );
}
