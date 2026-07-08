"use client";

import { useState, useEffect, useRef } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
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
        toast.error("Failed to load authentication factors.");
        return;
      }
      const totpFactor = data.totp.find((f: { status: string }) => f.status === "verified");
      if (totpFactor) {
        setFactorId(totpFactor.id);
      } else {
        toast.error("No authenticator found. Please contact support.");
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
        <div className="dg-auth-logo-block" style={{ marginBottom: 24 }}>
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </div>

        {orgSlug && baseDomain && (
          <OrganizationBadge slug={orgSlug} baseDomain={baseDomain} style={{ marginBottom: 20 }} />
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
            <ShieldCheck size={32} style={{ color: "var(--color-brand)", flexShrink: 0 }} />
            <h1 className="dg-auth-heading" style={{ marginBottom: 0 }}>
              Two-factor authentication
            </h1>
          </div>
          <p
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form
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
              border: `2px solid ${error ? "var(--color-danger)" : "var(--color-brand)"}`,
              borderRadius: "var(--dg-btn-radius)",
              fontSize: 24,
              fontFamily: "monospace",
              letterSpacing: "0.25em",
              textAlign: "center",
              outline: "none",
              color: "var(--color-text-primary)",
              background: "var(--color-surface)",
            }}
          />

          {error && (
            <p
              style={{
                color: "var(--color-danger-dark)",
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
            className="dg-auth-submit"
            style={{ width: "100%", maxWidth: 280, marginTop: 4 }}
          >
            <ButtonLoading
              loading={loading}
              spinnerColor="var(--color-text-inverse)"
              spinnerSize={28}
            >
              Verify
            </ButtonLoading>
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button
            type="button"
            onClick={onCancel}
            className="dg-auth-link"
            style={{ color: "var(--color-text-subtle)" }}
          >
            &larr; Back to login
          </button>
        </div>
      </Card>
    </PageShell>
  );
}
