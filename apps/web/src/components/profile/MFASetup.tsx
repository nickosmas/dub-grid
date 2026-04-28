"use client";

import { useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import Image from "next/image";
import { MaybeHint } from "@/components/ui/hint";
import {
  disableBrowserMfaFactor,
  listBrowserMfaFactors,
  startBrowserTotpEnrollment,
  updateMfaStatus,
  verifyBrowserTotpEnrollment,
} from "@/features/account/client";

type MFAStep = "idle" | "enrolling" | "verifying" | "disabling";

interface MFASetupProps {
  /** Whether the user currently has MFA enabled */
  mfaEnabled: boolean;
  /** Called after MFA status changes */
  onStatusChange: (enabled: boolean) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 5,
};

export function MFASetup({ mfaEnabled, onStatusChange }: MFASetupProps) {
  const [step, setStep] = useState<MFAStep>("idle");
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function startEnrollment() {
    setLoading(true);
    try {
      const { data, error } = await startBrowserTotpEnrollment();
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("verifying");
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to start MFA enrollment."));
    } finally {
      setLoading(false);
    }
  }

  async function verifyEnrollment() {
    if (!factorId || verifyCode.length !== 6) return;
    setLoading(true);
    setVerifyError(null);

    try {
      const { error } = await verifyBrowserTotpEnrollment({
        factorId,
        code: verifyCode,
      });
      if (error) throw error;

      await updateMfaStatus(true);

      toast.success("Two-factor authentication enabled.");
      onStatusChange(true);
      resetState();
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("invalid") || msg.includes("code") || msg.includes("verify")) {
        setVerifyError("Invalid verification code. Please try again.");
      } else {
        setVerifyError(extractErrorMessage(err, "Verification failed. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function disableMFA() {
    setLoading(true);
    try {
      const { data: factorsData, error: listError } = await listBrowserMfaFactors();
      if (listError) throw listError;

      const totpFactors = factorsData.totp.filter((f: { status: string }) => f.status === "verified");
      for (const factor of totpFactors) {
        const { error } = await disableBrowserMfaFactor(factor.id);
        if (error) throw error;
      }

      await updateMfaStatus(false);

      toast.success("Two-factor authentication disabled.");
      onStatusChange(false);
      resetState();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to disable MFA."));
    } finally {
      setLoading(false);
    }
  }

  function resetState() {
    setStep("idle");
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    setVerifyError(null);
    setCopied(false);
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  }

  // ── Idle state: show status and enable/disable button ──
  if (step === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {mfaEnabled ? (
            <ShieldCheck size={18} style={{ color: "var(--color-success-text)" }} />
          ) : (
            <ShieldOff size={18} style={{ color: "var(--color-text-muted)" }} />
          )}
          <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-primary)", fontWeight: 500 }}>
            {mfaEnabled
              ? "Two-factor authentication is enabled."
              : "Two-factor authentication is not enabled."}
          </span>
        </div>
        <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", margin: 0 }}>
          {mfaEnabled
            ? "Your account is protected with an authenticator app. You can disable it below."
            : "Add an extra layer of security by requiring a verification code from an authenticator app."}
        </p>
        {mfaEnabled ? (
          <button
            onClick={() => setStep("disabling")}
            className="dg-btn dg-btn-danger"
            style={{ alignSelf: "flex-start" }}
          >
            Disable 2FA
          </button>
        ) : (
          <button
            onClick={startEnrollment}
            disabled={loading}
            className="dg-btn dg-btn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={14}>
              Enable 2FA
            </ButtonLoading>
          </button>
        )}
      </div>
    );
  }

  // ── Disabling confirmation ──
  if (step === "disabling") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-danger-dark)", margin: 0, fontWeight: 500 }}>
          Are you sure you want to disable two-factor authentication? This will make your account less secure.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={disableMFA}
            disabled={loading}
            className="dg-btn dg-btn-danger"
          >
            <ButtonLoading loading={loading} spinnerSize={14}>
              Confirm Disable
            </ButtonLoading>
          </button>
          <button
            onClick={resetState}
            disabled={loading}
            className="dg-btn dg-btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Enrollment: QR code + verification ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-primary)", margin: 0, fontWeight: 500 }}>
        Scan this QR code with your authenticator app
      </p>
      <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", margin: 0 }}>
        Use an app like Google Authenticator, Authy, or 1Password to scan the QR code below.
      </p>

      {qrCode && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          padding: 16,
          background: "white",
          borderRadius: "var(--dg-radius-md)",
          border: "1px solid var(--color-border)",
          width: "fit-content",
          alignSelf: "center",
        }}>
          <Image
            src={qrCode}
            alt="Scan this QR code with your authenticator app"
            width={200}
            height={200}
            unoptimized
          />
        </div>
      )}

      {secret && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>Or enter this code manually</label>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border)",
            fontFamily: "monospace",
            fontSize: "var(--dg-fs-body-sm)",
            wordBreak: "break-all",
          }}>
            <span style={{ flex: 1, color: "var(--color-text-primary)" }}>{secret}</span>
            <MaybeHint content="Copy secret" side="top">
              <button
                onClick={copySecret}
                aria-label="Copy secret"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--color-text-muted)",
                  flexShrink: 0,
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </MaybeHint>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={labelStyle}>Enter the 6-digit code from your app</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="000000"
          value={verifyCode}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
            setVerifyCode(val);
            setVerifyError(null);
          }}
          style={{
            width: "100%",
            maxWidth: 200,
            padding: "10px 13px",
            border: `1.5px solid ${verifyError ? "var(--color-danger)" : "var(--color-border)"}`,
            borderRadius: "var(--dg-btn-radius)",
            fontSize: "var(--dg-fs-heading)",
            fontFamily: "monospace",
            letterSpacing: "0.2em",
            textAlign: "center",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {verifyError && (
          <p style={{ color: "var(--color-danger-dark)", fontSize: "var(--dg-fs-body-sm)", margin: 0 }}>
            {verifyError}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={verifyEnrollment}
          disabled={loading || verifyCode.length !== 6}
          className="dg-btn dg-btn-primary"
        >
          <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={14}>
            Verify &amp; Enable
          </ButtonLoading>
        </button>
        <button
          onClick={() => {
            // Cancel enrollment — unenroll the pending factor
            if (factorId) {
              disableBrowserMfaFactor(factorId).catch(() => {});
            }
            resetState();
          }}
          disabled={loading}
          className="dg-btn dg-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
