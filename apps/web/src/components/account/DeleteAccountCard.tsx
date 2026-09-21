"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SectionCard } from "@/components/settings/shared";
import { requireCredentialAssurance } from "@/features/account/client";
import { useIsInSandbox, useLogout } from "@/hooks";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import * as Sentry from "@/lib/sentry";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

/**
 * A super admin deletes their own account without a request: nobody outranks
 * them in the organization. The server still refuses the last super admin,
 * so that rule is stated up front rather than discovered on submit.
 */
export default function DeleteAccountCard() {
  const isInSandbox = useIsInSandbox();
  const { signOut } = useLogout();
  const stepUp = useStepUpAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  function closeDialog() {
    if (isDeleting) return;
    setConfirmOpen(false);
    setTyped("");
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const res = await fetch("/api/auth/delete-account", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ confirmation: typed }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw Object.assign(
            new Error(data?.error || "We couldn't delete your account. Try again."),
            { status: res.status, code: data?.code, method: data?.method },
          );
        }
      });
      if (!completed) return;
      toast.success("Your account was deleted.");
      try {
        signOut({ scope: "local" });
      } catch (signOutErr) {
        Sentry.captureException(signOutErr);
        toast.error("We couldn't sign you out. Refresh the page and try again.");
        setIsDeleting(false);
      }
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "We couldn't delete your account. Try again."));
      setIsDeleting(false);
    } finally {
      if (confirmOpen) setIsDeleting(false);
    }
  }

  return (
    <SectionCard>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderTop: "1px solid var(--dg-color-danger-bg)",
          paddingTop: 16,
        }}
      >
        <div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--dg-color-danger)" }}>
            Delete account
          </div>
          <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
            Permanently delete your account and leave every organization you belong to. If you are
            the only super admin of an organization, transfer ownership first. This is irreversible.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isInSandbox}
          title={isInSandbox ? "Deleting your account isn't available in sandbox mode." : undefined}
          className="dg-btn dg-btn-danger self-start"
        >
          <ButtonLoading
            loading={isDeleting}
            spinnerSize={14}
            icon={<Trash2 size={14} style={{ marginRight: 4 }} />}
          >
            Delete account
          </ButtonLoading>
        </Button>
      </div>

      {confirmOpen && !stepUp.dialog && (
        <ConfirmDialog
          title="Delete your account"
          variant="danger"
          confirmLabel="Delete account"
          isLoading={isDeleting}
          confirmDisabled={typed !== CONFIRM_PHRASE}
          onCancel={closeDialog}
          onConfirm={handleDelete}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span>
                Your account, profile and sessions are removed everywhere. This cannot be undone.
              </span>
              <label className="dg-label" htmlFor="delete-account-confirm-input">
                Type <strong>{CONFIRM_PHRASE}</strong> to confirm
              </label>
              <input
                id="delete-account-confirm-input"
                className="dg-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                autoComplete="off"
                autoFocus
                disabled={isDeleting}
              />
            </div>
          }
        />
      )}
      {stepUp.dialog}
    </SectionCard>
  );
}
