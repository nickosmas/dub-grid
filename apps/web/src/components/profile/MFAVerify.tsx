"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { OrganizationBadge } from "@/components/auth/OrganizationBadge";
import { ShieldCheck } from "lucide-react";
import { listBrowserMfaFactors, verifyBrowserTotpEnrollment } from "@/features/account/client";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "@/lib/auth-recovery";
import { isRetryableAuthRecoveryError } from "@dubgrid/client-errors";

interface MFAVerifyProps {
  /** Called after successful MFA verification. Awaited so the button stays
   * in its loading state until any post-verification navigation happens. */
  onVerified: () => void | Promise<void>;
  /** Called when user wants to go back to login */
  onCancel: () => void;
  /** Optional: organization slug shown in the UI */
  orgSlug?: string;
  /** Optional: base domain for display */
  baseDomain?: string;
}

export function MFAVerify({ onVerified, onCancel, orgSlug, baseDomain }: MFAVerifyProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [factorLoading, setFactorLoading] = useState(true);
  const [factorError, setFactorError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);
  const loadingFactorsRef = useRef(false);

  const loadFactors = useCallback(async () => {
    if (loadingFactorsRef.current) return;
    loadingFactorsRef.current = true;
    setFactorLoading(true);
    setFactorError(null);
    try {
      const { data, error: listError } = await settleWithRequestTimeout(listBrowserMfaFactors());
      if (listError) throw listError;
      const totpFactor = data.totp.find(
        (factor: { status: string }) => factor.status === "verified",
      );
      if (!totpFactor) {
        setFactorError(
          "We couldn't find an authenticator app on this account. Contact support for help.",
        );
        return;
      }
      setFactorId(totpFactor.id);
    } catch (loadError) {
      setFactorError(
        getWebAuthRecoveryMessage(loadError, "We couldn't load your sign-in methods. Try again."),
      );
    } finally {
      loadingFactorsRef.current = false;
      setFactorLoading(false);
    }
  }, []);

  // Load the TOTP factor ID on mount
  useEffect(() => {
    void loadFactors();
    // Auto-focus the code input
    inputRef.current?.focus();
  }, [loadFactors]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (verifyingRef.current || !factorId || code.length !== 6) return;

    verifyingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await settleWithRequestTimeout(
        verifyBrowserTotpEnrollment({
          factorId,
          code,
        }),
      );
      if (verifyError) throw verifyError;
      // Stay in the loading state through the caller's post-verification
      // work (org switch, navigation) so the button doesn't flash idle
      // before the page transitions.
      await onVerified();
    } catch (verifyError) {
      const retryable = isRetryableAuthRecoveryError(verifyError);
      setError(
        getWebAuthRecoveryMessage(
          verifyError,
          retryable
            ? "We couldn't verify your code. Try again."
            : "Invalid verification code. Please try again.",
        ),
      );
      if (!retryable) setCode("");
      setLoading(false);
      inputRef.current?.focus();
    } finally {
      verifyingRef.current = false;
    }
  }

  return (
    <PageShell>
      <Card>
        <ApexLandingLink className="dg-auth-logo-block" style={{ marginBottom: 24 }}>
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </ApexLandingLink>

        {orgSlug && baseDomain && (
          <OrganizationBadge
            slug={orgSlug}
            baseDomain={baseDomain}
            className="dg-auth-badge-wrap--compact"
          />
        )}

        <div
          style={{
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <ShieldCheck size={32} style={{ color: "var(--dg-color-brand)", flexShrink: 0 }} />
            <h1 className="dg-auth-heading" style={{ marginBottom: 0 }}>
              Two-factor authentication
            </h1>
          </div>
          <p
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-secondary)",
              margin: 0,
            }}
          >
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <Form
          onSubmit={handleVerify}
          style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(val);
              setError(null);
            }}
            style={{
              width: 200,
              padding: "14px 16px",
              border: `2px solid ${error ? "var(--dg-color-danger)" : "var(--dg-color-brand)"}`,
              borderRadius: "var(--dg-btn-radius)",
              fontSize: 24,
              fontFamily: "monospace",
              letterSpacing: "0.25em",
              textAlign: "center",
              outline: "none",
              color: "var(--dg-color-text-primary)",
              background: "var(--dg-color-surface)",
            }}
          />

          {error && (
            <p
              style={{
                color: "var(--dg-color-danger-dark)",
                fontSize: "var(--dg-fs-body-sm)",
                margin: 0,
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}

          {factorError && (
            <div
              role="alert"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
            >
              <p className="dg-form-error" style={{ margin: 0, textAlign: "center" }}>
                {factorError}
              </p>
              <Button
                type="button"
                onClick={() => loadFactors()}
                disabled={factorLoading}
                className="dg-btn dg-btn-secondary"
              >
                <ButtonLoading loading={factorLoading}>Try again</ButtonLoading>
              </Button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || factorLoading || code.length !== 6 || !factorId}
            className="dg-btn dg-btn-primary dg-btn-lg"
            style={{ width: "100%", maxWidth: 280, marginTop: 4 }}
          >
            <ButtonLoading
              loading={loading}
              spinnerColor="var(--dg-color-text-inverse)"
              spinnerSize={20}
            >
              Verify
            </ButtonLoading>
          </button>
        </Form>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Button
            type="button"
            onClick={onCancel}
            className="dg-auth-link"
            style={{ color: "var(--dg-color-text-subtle)" }}
          >
            &larr; Back to login
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
