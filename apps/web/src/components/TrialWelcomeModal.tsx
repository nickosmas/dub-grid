"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Hourglass } from "lucide-react";
import { TRIAL_GRACE_DAYS } from "@dubgrid/domain";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { useOrganizationData, usePermissions, useTermsAcceptanceStatus } from "@/hooks";
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

function daysRemaining(value: string | null): number | null {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// One-time welcome shown to the super_admin whose first sign-in started the
// org's 14-day trial. Explains the trial and that a subscription is needed to
// keep access once it ends. Dismissal is persisted server-side so it does not
// reappear on later sign-ins.
export default function TrialWelcomeModal() {
  const perms = usePermissions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const terms = useTermsAcceptanceStatus();
  const [dismissed, setDismissed] = useState(false);

  // Don't surface the welcome until terms are known and accepted — otherwise it
  // can paint a frame before the (higher z-index) terms gate drops on top of
  // it, which read as a flash.
  const termsAccepted = terms.data?.acceptedCurrentTerms === true;

  // Nor until onboarding is actually finished. The trial starts on the super
  // admin's first sign-in, which is the same sign-in that walks them through
  // onboarding, so without this the welcome opened over the wizard. The
  // server's completion flag is the authority here, not the session latch that
  // lets the app paint early: the header's trial pill is held back by the same
  // condition (AppShell's hideForSetupLock).
  // This component is mounted by AppShell on every route, public ones
  // included, so the lookup stays disabled until the caller is actually a
  // candidate for the welcome. Otherwise it would put org queries on the
  // sign-in page.
  const isWelcomeCandidate =
    Boolean(perms.orgId) &&
    perms.isSuperAdmin &&
    !perms.isGridmaster &&
    !perms.isImpersonating &&
    termsAccepted;

  const { entryGate } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
    enabled: isWelcomeCandidate,
  });

  const enabled = isWelcomeCandidate && entryGate?.onboardingCompleted === true;

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

  const days = useMemo(() => daysRemaining(data?.trialEndsAt ?? null), [data?.trialEndsAt]);

  if (!enabled || dismissed || !data?.shouldShowWelcome) return null;

  const handleClose = () => {
    setDismissed(true);
    dismiss.mutate();
  };

  const handleGoToBilling = () => {
    setDismissed(true);
    dismiss.mutate();
    router.push("/settings?section=org-billing");
  };

  return (
    <Modal
      title="Your trial has started!"
      onClose={handleClose}
      disableOverlayClose
      style={{ maxWidth: 560 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 16px",
            background: "var(--dg-color-brand-bg, #eff6ff)",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-color-border)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--dg-radius-sm)",
              background: "var(--dg-color-surface)",
              color: "var(--dg-color-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CalendarClock size={20} />
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
              }}
            >
              {days !== null ? `${days} day${days === 1 ? "" : "s"} left` : "Your trial is active"}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Your trial wraps up on{" "}
              <strong style={{ color: "var(--dg-color-text-primary)" }}>
                {formatTrialEndDate(data.trialEndsAt)}
              </strong>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              padding: "12px 14px",
              background: "var(--dg-color-surface-subtle, var(--dg-color-surface))",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--dg-color-border)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ color: "var(--dg-color-brand)", flexShrink: 0, marginTop: 2 }}>
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                  marginBottom: 2,
                }}
              >
                While you&rsquo;re trying it out
              </div>
              <div style={{ fontSize: 12, color: "var(--dg-color-text-muted)", lineHeight: 1.4 }}>
                You get full access, there&rsquo;s just one plan so there&rsquo;s nothing extra to
                unlock later.
              </div>
            </div>
          </div>
          <div
            style={{
              padding: "12px 14px",
              background: "var(--dg-color-surface-subtle, var(--dg-color-surface))",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--dg-color-border)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ color: "var(--dg-color-brand)", flexShrink: 0, marginTop: 2 }}>
              <Hourglass size={18} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--dg-color-text-primary)",
                  marginBottom: 2,
                }}
              >
                If you need more time
              </div>
              <div style={{ fontSize: 12, color: "var(--dg-color-text-muted)", lineHeight: 1.4 }}>
                No rush, you&rsquo;ll still have {TRIAL_GRACE_DAYS} extra days to add billing before
                the organization loses access.
              </div>
            </div>
          </div>
        </div>

        <div className="dg-modal-actions">
          <Button type="button" className="dg-btn dg-btn-secondary" onClick={handleClose}>
            Maybe later
          </Button>
          <Button type="button" className="dg-btn dg-btn-primary" onClick={handleGoToBilling}>
            Set up billing
          </Button>
        </div>
      </div>
    </Modal>
  );
}
