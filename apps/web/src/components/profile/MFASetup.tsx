"use client";

import type { Factor } from "@supabase/supabase-js";
import { useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { MaybeHint } from "@/components/ui/hint";
import {
  BROWSER_TOTP_FRIENDLY_NAME,
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

/**
 * Supabase reports a rejected TOTP as `mfa_verification_failed`, which covers
 * both real causes: the app is generating from a different secret than the one
 * on screen, or the phone's clock has drifted. Both are the user's to fix, so
 * name them instead of saying "invalid code" and leaving them to guess.
 *
 * This used to be a substring match on the message ("invalid", "code",
 * "verify"), which reported anything matching those as a bad code. A missing
 * factor, a failed status write, a network blip: all of them surfaced as
 * "Invalid verification code", which sends the user back to retype a code that
 * was never the problem. Match on the error code, and let anything unrecognised
 * say what it actually was.
 */
function verificationErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === "mfa_verification_failed") {
    return "That code didn't match. If you have scanned this before, delete the older DubGrid entry in your authenticator app and scan again, then enter the new code. If it still fails, check that your phone's clock is set automatically.";
  }
  if (code === "mfa_factor_not_found") {
    return "This setup is no longer active. Cancel and start again to get a fresh QR code.";
  }
  return extractErrorMessage(err, "Verification failed. Please try again.");
}

function isVerifiedTotpFactor(factor: Factor): boolean {
  return factor.factor_type === "totp" && factor.status === "verified";
}

function isStaleDubGridTotpFactor(factor: Factor): boolean {
  return (
    factor.factor_type === "totp" &&
    factor.status === "unverified" &&
    factor.friendly_name === BROWSER_TOTP_FRIENDLY_NAME
  );
}

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
      const { data: factorsData, error: listError } = await listBrowserMfaFactors();
      if (listError) throw listError;

      const existingVerifiedTotp = factorsData.all.find(isVerifiedTotpFactor);
      if (existingVerifiedTotp) {
        await updateMfaStatus(true);
        toast.info("Two-factor authentication is already enabled.");
        onStatusChange(true);
        resetState();
        return;
      }

      const staleFactors = factorsData.all.filter(isStaleDubGridTotpFactor);
      for (const factor of staleFactors) {
        const { error: unenrollError } = await disableBrowserMfaFactor(factor.id);
        if (unenrollError) throw unenrollError;
      }

      const { data, error } = await startBrowserTotpEnrollment();
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("verifying");
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "We couldn't start MFA enrollment. Try again."));
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
      setVerifyError(verificationErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function disableMFA() {
    setLoading(true);
    try {
      const { data: factorsData, error: listError } = await listBrowserMfaFactors();
      if (listError) throw listError;

      const totpFactors = factorsData.totp.filter(
        (f: { status: string }) => f.status === "verified",
      );
      for (const factor of totpFactors) {
        const { error } = await disableBrowserMfaFactor(factor.id);
        if (error) throw error;
      }

      await updateMfaStatus(false);

      toast.success("Two-factor authentication disabled.");
      onStatusChange(false);
      resetState();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "We couldn't disable MFA. Try again."));
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
      toast.error("We couldn't copy that. Copy it manually instead.");
    }
  }

  // Latched rather than spinner-ed: the check-mark swap is already this
  // button's feedback, and an icon-only control has no label to put in the
  // progressive form. The latch just stops two overlapping copies racing their
  // `copied` timers.
  const copy = useAsyncAction(copySecret);

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
          <span
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-primary)",
              fontWeight: 500,
            }}
          >
            {mfaEnabled
              ? "Two-factor authentication is enabled."
              : "Two-factor authentication is not enabled."}
          </span>
        </div>
        <p
          style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", margin: 0 }}
        >
          {mfaEnabled
            ? "Your account is protected with an authenticator app. You can disable it below."
            : "Add an extra layer of security by requiring a verification code from an authenticator app."}
        </p>
        {mfaEnabled ? (
          <Button
            onClick={() => setStep("disabling")}
            className="dg-btn dg-btn-danger"
            style={{ alignSelf: "flex-start" }}
          >
            Disable 2FA
          </Button>
        ) : (
          <Button
            onClick={startEnrollment}
            disabled={loading}
            className="dg-btn dg-btn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            <ButtonLoading
              loading={loading}
              loadingLabel="Starting"
              spinnerColor="var(--color-text-inverse)"
              spinnerSize={14}
            >
              Enable 2FA
            </ButtonLoading>
          </Button>
        )}
      </div>
    );
  }

  // ── Disabling confirmation ──
  if (step === "disabling") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-danger-dark)",
            margin: 0,
            fontWeight: 500,
          }}
        >
          Are you sure you want to disable two-factor authentication? This will make your account
          less secure.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={disableMFA} disabled={loading} className="dg-btn dg-btn-danger">
            <ButtonLoading loading={loading} loadingLabel="Disabling" spinnerSize={14}>
              Confirm Disable
            </ButtonLoading>
          </Button>
          <Button onClick={resetState} disabled={loading} className="dg-btn dg-btn-secondary">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Enrollment: QR code + verification ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: "var(--color-text-primary)",
          margin: 0,
          fontWeight: 500,
        }}
      >
        Scan this QR code with your authenticator app
      </p>
      <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", margin: 0 }}>
        Use an app like Google Authenticator, Authy, or 1Password to scan the QR code below.
      </p>

      {qrCode && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 16,
            background: "white",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border)",
            width: "fit-content",
            alignSelf: "center",
          }}
        >
          <img
            src={qrCode.trimEnd()}
            alt="Scan this QR code with your authenticator app"
            width={200}
            height={200}
            style={{ display: "block", height: 200, width: 200 }}
          />
        </div>
      )}

      {secret && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={labelStyle}>Or enter this code manually</label>
          <div
            style={{
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
            }}
          >
            <span style={{ flex: 1, color: "var(--color-text-primary)" }}>{secret}</span>
            <MaybeHint content="Copy secret" side="top">
              <Button
                onClick={copy.run}
                disabled={copy.isRunning}
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
              </Button>
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
          <p
            style={{
              color: "var(--color-danger-dark)",
              fontSize: "var(--dg-fs-body-sm)",
              margin: 0,
            }}
          >
            {verifyError}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Button
          onClick={verifyEnrollment}
          disabled={loading || verifyCode.length !== 6}
          className="dg-btn dg-btn-primary"
        >
          <ButtonLoading
            loading={loading}
            loadingLabel="Verifying"
            spinnerColor="var(--color-text-inverse)"
            spinnerSize={14}
          >
            Verify &amp; Enable
          </ButtonLoading>
        </Button>
        <Button
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
        </Button>
      </div>
    </div>
  );
}
