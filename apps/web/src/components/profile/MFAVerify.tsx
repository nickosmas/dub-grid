"use client";

import { useState, useEffect, useRef } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { OrganizationBadge } from "@/components/auth/OrganizationBadge";
import { ShieldCheck } from "lucide-react";
import { listBrowserMfaFactors, verifyBrowserTotpEnrollment } from "@/features/account/client";

interface MFAVerifyProps {
  /** Called after successful MFA verification */
  onVerified: () => void;
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the TOTP factor ID on mount
  useEffect(() => {
    async function loadFactors() {
      const { data, error: listError } = await listBrowserMfaFactors();
      if (listError) {
        toast.error("We couldn't load your sign-in methods. Refresh and try again.");
        return;
      }
      const totpFactor = data.totp.find((f: { status: string }) => f.status === "verified");
      if (totpFactor) {
        setFactorId(totpFactor.id);
      } else {
        toast.error(
          "We couldn't find an authenticator app on this account. Contact support for help.",
        );
      }
    }
    loadFactors();
    // Auto-focus the code input
    inputRef.current?.focus();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await verifyBrowserTotpEnrollment({
        factorId,
        code,
      });
      if (verifyError) throw verifyError;
      onVerified();
    } catch {
      setError("Invalid verification code. Please try again.");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
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

          <button
            type="submit"
            disabled={loading || code.length !== 6 || !factorId}
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
