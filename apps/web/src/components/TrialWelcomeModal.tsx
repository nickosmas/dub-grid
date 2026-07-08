"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/Modal";
import { usePermissions, useTermsAcceptanceStatus } from "@/hooks";
import { queryKeys } from "@/lib/query-keys";
import { fetchTrialWelcomeState, dismissTrialWelcome } from "@/features/billing/client";

function formatTrialEndDate(value: string | null): string {
  if (!value) return "soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// One-time welcome shown to the super_admin whose first sign-in started the
// org's 14-day trial. Explains the trial and that a subscription is needed to
// keep access once it ends. Dismissal is persisted server-side so it does not
// reappear on later sign-ins.
export default function TrialWelcomeModal() {
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const terms = useTermsAcceptanceStatus();
  const [dismissed, setDismissed] = useState(false);

  // Don't surface the welcome until terms are known and accepted — otherwise it
  // can paint a frame before the (higher z-index) terms gate drops on top of
  // it, which read as a flash.
  const termsAccepted = terms.data?.acceptedCurrentTerms === true;

  const enabled =
    Boolean(perms.orgId) &&
    perms.isSuperAdmin &&
    !perms.isGridmaster &&
    !perms.isImpersonating &&
    termsAccepted;

  const { data } = useQuery({
    queryKey: queryKeys.org.trialWelcome(perms.orgId ?? "none"),
    queryFn: fetchTrialWelcomeState,
    enabled,
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: dismissTrialWelcome,
    onSettled: () => {
      if (perms.orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.org.trialWelcome(perms.orgId),
        });
      }
    },
  });

  if (!enabled || dismissed || !data?.shouldShowWelcome) return null;

  const handleClose = () => {
    setDismissed(true);
    dismiss.mutate();
  };

  return (
    <Modal
      title="Your trial has started"
      onClose={handleClose}
      disableOverlayClose
      style={{ maxWidth: 460 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-body)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Your 14-day free trial is now active, and every feature is unlocked. The trial ends on{" "}
          <strong style={{ color: "var(--color-text-primary)" }}>
            {formatTrialEndDate(data.trialEndsAt)}
          </strong>
          .
        </p>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-body)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          To keep using DubGrid after the trial, add a subscription before it ends. You can do that
          any time from Billing in Settings.
        </p>
      </div>
    </Modal>
  );
}
