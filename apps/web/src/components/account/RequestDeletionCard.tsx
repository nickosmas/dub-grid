"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";
import {
  cancelOwnProfileChangeRequest,
  createOwnProfileChangeRequest,
  fetchOwnProfileChangeRequests,
  type ProfileChangeRequest,
} from "@/features/account/client";
import { extractErrorMessage } from "@/lib/error-handling";

/** The request path: a Super Admin reviews it before the account is deleted. */
export function RequestDeletionCard({
  orgId,
  isOrgMember,
}: {
  orgId: string | null;
  isOrgMember: boolean;
}) {
  const [pending, setPending] = useState<ProfileChangeRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId || !isOrgMember) return;
    let cancelled = false;
    fetchOwnProfileChangeRequests(orgId)
      .then((result) => {
        if (cancelled) return;
        setPending(
          result.requests.find(
            (request) => request.type === "account_deletion" && request.status === "pending",
          ) ?? null,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOrgMember, orgId]);

  async function sendRequest() {
    if (!orgId) return;
    setConfirming(false);
    setBusy(true);
    try {
      const result = await createOwnProfileChangeRequest({
        orgId,
        type: "account_deletion",
        requestNote: "Account deletion requested from self profile.",
      });
      setPending(result.request);
      toast.success("Account deletion request sent.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't request account deletion. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!pending) return;
    setBusy(true);
    try {
      await cancelOwnProfileChangeRequest(pending.id);
      setPending(null);
      toast.success("Account deletion request canceled.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "We couldn't cancel that request. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="profile-delete" aria-labelledby="profile-delete-title" className="dg-card">
      <div className="dg-card-header">
        <h2 id="profile-delete-title" className="dg-card-title">
          Delete account
        </h2>
      </div>
      <div className="dg-card-body">
        {pending ? (
          <Banner
            tone="warning"
            icon={Clock}
            action={
              <Button
                type="button"
                onClick={() => cancelRequest()}
                disabled={busy}
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                <ButtonLoading loading={busy}>Cancel request</ButtonLoading>
              </Button>
            }
          >
            Your request is waiting for a Super Admin.
          </Banner>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 min-w-0 flex-1 basis-60 text-[14px] text-[var(--dg-color-text-secondary)]">
              A Super Admin reviews your request before your account is deleted.
            </p>
            <Button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy || !orgId}
              className="dg-btn dg-btn-danger dg-btn-sm"
            >
              <ButtonLoading loading={busy}>Request account deletion</ButtonLoading>
            </Button>
          </div>
        )}
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Request account deletion?"
          message="A Super Admin reviews and approves the request before your account is removed."
          confirmLabel="Request deletion"
          variant="danger"
          onCancel={() => setConfirming(false)}
          onConfirm={() => sendRequest()}
        />
      ) : null}
    </section>
  );
}
