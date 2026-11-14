"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Organization } from "@/types";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SectionCard } from "./shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Trash2 } from "lucide-react";
import { formatClientErrorMessage } from "@/lib/client-facing";
import * as Sentry from "@/lib/sentry";
import { useIsInSandbox, useLogout } from "@/hooks";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { requireCredentialAssurance } from "@/features/account/client";

interface DangerZoneProps {
  organization: Organization;
}

export default function DangerZone({ organization }: DangerZoneProps) {
  const isInSandbox = useIsInSandbox();
  const { signOut } = useLogout();
  const stepUp = useStepUpAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const confirmPhrase = `DELETE ${organization.name}`;

  function closeDialog() {
    if (isDeleting) return;
    setConfirmOpen(false);
    setTyped("");
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      await stepUp.run(async (accessToken) => {
        const res = await fetch(
          `/api/organizations/export?orgId=${encodeURIComponent(organization.id)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw Object.assign(
            new Error(data?.error || "We couldn't prepare your organization's data. Try again."),
            { status: res.status, code: data?.code, method: data?.method },
          );
        }
        const filename =
          /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
          "dubgrid-export.zip";
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      toast.error(
        formatClientErrorMessage(err, "We couldn't prepare your organization's data. Try again."),
      );
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const res = await fetch("/api/organizations/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ orgId: organization.id, confirmation: typed }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw Object.assign(
            new Error(data?.error || "We couldn't delete that organization. Try again."),
            { status: res.status, code: data?.code, method: data?.method },
          );
        }
      });
      if (!completed) return;
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
    } finally {
      // Successful deletion navigates away. Every other outcome must restore
      // the original typed confirmation so the user can retry or cancel.
      if (confirmOpen) setIsDeleting(false);
    }
  }

  return (
    <SectionCard
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <Button
            className="dg-btn dg-btn-danger"
            onClick={() => setConfirmOpen(true)}
            disabled={isInSandbox}
            title={
              isInSandbox ? "Deleting the organization isn't available in sandbox mode." : undefined
            }
          >
            Delete organization
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2 className="dg-card-title">Delete this organization</h2>
          <p className="dg-card-description">
            Everyone loses access and billing stops. We can restore it for 90 days, then it's
            deleted for good.
          </p>
        </div>
      </div>

      {confirmOpen && !stepUp.dialog && (
        <ConfirmDialog
          icon={Trash2}
          title={`Delete ${organization.name}?`}
          variant="danger"
          confirmLabel="Delete organization"
          isLoading={isDeleting}
          confirmDisabled={typed !== confirmPhrase}
          onCancel={closeDialog}
          onConfirm={handleDelete}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="dg-card-description">
                Download your data first: a ZIP of your staff list, every published day, every
                request and the activity log.
              </p>
              <Button
                className="dg-btn dg-btn-secondary"
                onClick={handleDownload}
                disabled={isDeleting || isDownloading}
              >
                <ButtonLoading loading={isDownloading}>Download your data</ButtonLoading>
              </Button>
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
          summary={{
            points: [
              "Billing for the organization is canceled.",
              `Everyone in ${organization.name} loses access.`,
              "We can restore it for 90 days. After that it's deleted for good, with your staff's data.",
            ],
          }}
        />
      )}
      {stepUp.dialog}
    </SectionCard>
  );
}
