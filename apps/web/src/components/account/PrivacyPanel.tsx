"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/settings/shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import { openConsentPreferences } from "@/components/CookieConsent";
import { extractErrorMessage } from "@/lib/error-handling";
import {
  cancelOwnProfileChangeRequest,
  createOwnProfileChangeRequest,
  fetchOwnProfileChangeRequests,
  type ProfileChangeRequest,
} from "@/features/account/client";

interface PrivacyPanelProps {
  orgId: string | null;
  /** When true, account deletion is not exposed (admin tier or gridmaster). */
  canEditProfileDirectly: boolean;
  isGridmaster: boolean;
}

export function PrivacyPanel({
  orgId,
  canEditProfileDirectly,
  isGridmaster,
}: PrivacyPanelProps) {
  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const showDeletion = !isGridmaster && !canEditProfileDirectly;

  useEffect(() => {
    if (!orgId || !showDeletion) {
      setChangeRequests([]);
      return;
    }
    let cancelled = false;
    fetchOwnProfileChangeRequests(orgId)
      .then((result) => {
        if (!cancelled) setChangeRequests(result.requests);
      })
      .catch(() => {
        if (!cancelled) setChangeRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, showDeletion]);

  const pendingDeletion = changeRequests.find(
    (r) => r.type === "account_deletion" && r.status === "pending",
  );

  async function sendDeletionRequest() {
    if (!orgId) return;
    setRequesting(true);
    try {
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "account_deletion",
        requestNote: "Account deletion requested from self profile.",
      });
      setChangeRequests((cur) => [result.request, ...cur]);
      toast.success("Account deletion request sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to request account deletion."));
    } finally {
      setRequesting(false);
      setPendingConfirm(false);
    }
  }

  async function cancelDeletion(request: ProfileChangeRequest) {
    if (cancellingId) return;
    setCancellingId(request.id);
    try {
      const result = await cancelOwnProfileChangeRequest(request.id);
      setChangeRequests((cur) =>
        cur.map((r) => (r.id === result.request.id ? result.request : r)),
      );
      toast.success("Account deletion request cancelled.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to cancel that request."));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Policies
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Review how DubGrid handles your data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="dg-btn dg-btn-secondary"
            >
              Privacy policy
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="dg-btn dg-btn-secondary"
            >
              Terms of service
            </a>
            <a
              href="/cookie-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="dg-btn dg-btn-secondary"
            >
              Cookie policy
            </a>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Cookie preferences
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Adjust which cookies and analytics DubGrid uses on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={openConsentPreferences}
            className="dg-btn dg-btn-primary self-start"
          >
            Manage cookie preferences
          </button>
        </div>
      </SectionCard>

      <SectionCard>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderTop: "1px solid var(--color-danger-bg)",
            paddingTop: 16,
          }}
        >
          <div>
            <div
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-danger)" }}
            >
              Delete account
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              {isGridmaster
                ? "Gridmaster accounts cannot be deleted through self-service. Contact another gridmaster or use direct database access."
                : canEditProfileDirectly
                  ? "Your account has employee-management access, so it cannot be self-deleted from here. Contact a super admin or remove yourself from the organization first."
                  : "Request that an admin delete your account. This is irreversible."}
            </p>
          </div>
          {showDeletion && (
            <>
              {pendingDeletion ? (
                <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-[13px] text-[var(--color-warning-text)]">
                  Account deletion request pending admin review.
                  <button
                    type="button"
                    onClick={() => void cancelDeletion(pendingDeletion)}
                    disabled={cancellingId === pendingDeletion.id}
                    className="dg-btn dg-btn-secondary dg-btn-sm ml-3"
                  >
                    {cancellingId === pendingDeletion.id ? "Cancelling..." : "Cancel request"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingConfirm(true)}
                  disabled={requesting || !orgId}
                  className="dg-btn dg-btn-danger self-start"
                >
                  <Trash2 size={14} style={{ marginRight: 4 }} />
                  {requesting ? "Requesting..." : "Request account deletion"}
                </button>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {pendingConfirm && (
        <ConfirmDialog
          title="Request account deletion?"
          message="Confirm that you want to request account deletion. An admin will review and approve before your account is removed."
          confirmLabel="Request deletion"
          variant="danger"
          isLoading={requesting}
          onConfirm={() => void sendDeletionRequest()}
          onCancel={() => {
            if (!requesting) setPendingConfirm(false);
          }}
        />
      )}
    </div>
  );
}
