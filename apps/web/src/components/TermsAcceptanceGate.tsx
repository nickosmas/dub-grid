"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useTermsAcceptanceStatus } from "@/hooks";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { DubGridLogo } from "@/components/Logo";
import { queryKeys } from "@/lib/query-keys";
import { CURRENT_TERMS_VERSION } from "@/features/account/shared/terms";
import {
  recordCurrentTermsAcceptance,
  signOutFromBrowser,
} from "@/features/account/client";

/**
 * Non-dismissable modal that blocks the app until the user accepts
 * the current terms version. Only shown to authenticated users whose
 * profile.terms_version doesn't match CURRENT_TERMS_VERSION.
 *
 * Acceptance status comes from the shared useTermsAcceptanceStatus query
 * (keyed by stable user id) so auth-event re-renders don't refetch and
 * remount the gate — and so TrialWelcomeModal can gate itself behind the
 * same source of truth.
 */
export default function TermsAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useTermsAcceptanceStatus();
  const [checked, setChecked] = useState(false);

  const accept = useMutation({
    mutationFn: recordCurrentTermsAcceptance,
    onSuccess: () => {
      if (user) {
        // Optimistically flip the shared query — no refetch flicker, and the
        // trial welcome (gated on this) reveals immediately.
        queryClient.setQueryData(queryKeys.account.terms(user.id), {
          acceptedCurrentTerms: true,
          acceptedVersion: CURRENT_TERMS_VERSION,
        });
      }
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
      console.error("Terms acceptance failed:", msg, err);
      // Stale session after db:reset — force re-login
      const isStaleSession =
        msg.includes("JWT") ||
        msg.includes("expired") ||
        msg.includes("foreign key") ||
        msg.includes("not found");
      if (isStaleSession) {
        toast.error("Session expired. Please sign in again.");
        await signOutFromBrowser("local");
        window.location.href = "/login";
        return;
      }
      toast.error("Failed to record acceptance. Please try again.");
    },
  });

  function handleAccept() {
    if (!user) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    accept.mutate();
  }

  const loading = accept.isPending;
  const needsAcceptance = Boolean(data) && data?.acceptedCurrentTerms === false;

  if (!user || !needsAcceptance) return <>{children}</>;

  return (
    <>
      {children}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--dg-overlay)",
          backdropFilter: "blur(var(--dg-overlay-blur))",
          WebkitBackdropFilter: "blur(var(--dg-overlay-blur))",
          animation: "fade-in var(--dg-duration-standard) ease",
        }}
      >
        <div style={{
          background: "var(--color-surface)",
          borderRadius: "var(--dg-radius-xl)",
          padding: "32px 28px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          <div style={{ textAlign: "center" }}>
            <DubGridLogo size={40} />
          </div>

          <h2
            id="terms-gate-title"
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              textAlign: "center",
            }}
          >
            Updated Terms of Service
          </h2>

          <p style={{
            margin: 0,
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            textAlign: "center",
          }}>
            We&apos;ve updated our Terms of Service (v{CURRENT_TERMS_VERSION}).
            Please review and accept to continue using DubGrid.
          </p>

          <div style={{
            padding: "12px 16px",
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--color-border-light)",
            maxHeight: 200,
            overflowY: "auto",
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
          }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Summary of key terms:</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Your data is stored securely and processed per our Privacy Policy</li>
              <li>You are responsible for maintaining your account credentials</li>
              <li>We may update these terms; continued use constitutes acceptance</li>
              <li>Service is provided &quot;as is&quot; without warranty</li>
            </ul>
          </div>

          <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-primary)",
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                marginTop: 2,
                accentColor: "var(--color-brand)",
                cursor: "pointer",
              }}
            />
            <span>
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-brand)", textDecoration: "underline" }}
              >
                Terms of Service
              </a>
              {" "}and{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-brand)", textDecoration: "underline" }}
              >
                Privacy Policy
              </a>
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="dg-btn dg-btn-primary"
            style={{ width: "100%", padding: "12px 16px" }}
          >
            <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={18}>
              Accept &amp; Continue
            </ButtonLoading>
          </button>
        </div>
      </div>
    </>
  );
}
