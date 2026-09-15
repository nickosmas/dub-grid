"use client";

import type { Factor } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
import { StepUpForm } from "@/components/auth/StepUpForm";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import { isRequestTimeout } from "@/lib/fetch-with-timeout";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { MaybeHint } from "@/components/ui/hint";
import {
  BROWSER_TOTP_FRIENDLY_NAME,
  disableBrowserMfaFactor,
  cleanupBrowserMfaFactor,
  getBrowserAuthSession,
  reauthenticateBrowserMfa,
  listBrowserMfaFactors,
  startBrowserTotpEnrollment,
  updateMfaStatus,
  verifyBrowserTotpEnrollment,
} from "@/features/account/client";

type MFAStep = "idle" | "enrolling" | "verifying" | "disabling" | "syncing";

interface MFASetupProps {
  /** Whether the user currently has MFA enabled */
  mfaEnabled: boolean;
  /** Called after MFA status changes */
  onStatusChange: (enabled: boolean) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  color: "var(--dg-type-field-title-color)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
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
function verificationErrorMessage(err: unknown, enrollment = true): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === "mfa_verification_failed") {
    if (!enrollment) return "That code didn't match. Enter a new code from your authenticator app.";
    return "That code didn't match. If you have scanned this before, delete the older DubGrid entry in your authenticator app and scan again, then enter the new code. If it still fails, check that your phone's clock is set automatically.";
  }
  if (code === "mfa_factor_not_found") {
    if (!enrollment) return "Refresh two-factor status before trying again.";
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
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const syncTokenRef = useRef<string | undefined>(undefined);
  const verifyingRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingFactorIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pendingFactorId = pendingFactorIdRef.current;
      if (pendingFactorId && !verifyingRef.current) {
        cleanupBrowserMfaFactor(pendingFactorId).catch(() => {});
      }
    };
  }, []);

  async function startEnrollment(password: string) {
    setLoading(true);
    setVerifyError(null);
    try {
      const { data: factorsData, error: listError } = await listBrowserMfaFactors();
      if (listError) throw listError;

      const existingVerifiedTotp = factorsData.all.find(isVerifiedTotpFactor);
      if (existingVerifiedTotp) {
        await reconcileStatus();
        return;
      }

      await reauthenticateBrowserMfa(password);

      const staleFactors = factorsData.all.filter(isStaleDubGridTotpFactor);
      for (const factor of staleFactors) {
        await cleanupBrowserMfaFactor(factor.id);
      }

      const { data, error } = await startBrowserTotpEnrollment();
      if (error) throw error;
      if (!mountedRef.current) {
        await cleanupBrowserMfaFactor(data.id);
        return;
      }

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      pendingFactorIdRef.current = data.id;
      setFactorId(data.id);
      setStep("verifying");
    } catch (err: unknown) {
      setVerifyError(extractErrorMessage(err, "We couldn't start MFA enrollment. Try again."));
    } finally {
      setLoading(false);
    }
  }

  async function verifyEnrollment() {
    if (!factorId || verifyCode.length !== 6) return;
    setLoading(true);
    setVerifyError(null);
    verifyingRef.current = true;

    try {
      const { data: verifiedSession, error } = await verifyBrowserTotpEnrollment({
        factorId,
        code: verifyCode,
      });
      if (error) throw error;

      pendingFactorIdRef.current = null;
      setNeedsReconciliation(true);
      setStep("syncing");
      if (!verifiedSession?.access_token)
        throw new Error("Refresh two-factor status to finish setup.");
      await reconcileStatus(verifiedSession.access_token);
    } catch (err: unknown) {
      if (isRequestTimeout(err)) {
        // Provider verification may settle after the UI deadline. Never clean
        // up an outcome-unknown factor or automatically replay the mutation.
        pendingFactorIdRef.current = null;
        setNeedsReconciliation(true);
        setStep("syncing");
      }
      setVerifyError(verificationErrorMessage(err));
    } finally {
      verifyingRef.current = false;
      if (!mountedRef.current && pendingFactorIdRef.current) {
        void cleanupBrowserMfaFactor(pendingFactorIdRef.current).catch(() => {});
      }
      setLoading(false);
    }
  }

  async function disableMFA(code: string) {
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true);
    setVerifyError(null);
    try {
      const { data: factorsData, error: listError } = await listBrowserMfaFactors();
      if (listError) throw listError;

      const totpFactors = factorsData.totp.filter(
        (f: { status: string }) => f.status === "verified",
      );
      if (!totpFactors.length) {
        await reconcileStatus();
        return;
      }
      const { data: verifiedSession, error: challengeError } = await verifyBrowserTotpEnrollment({
        factorId: totpFactors[0].id,
        code,
      });
      if (challengeError) throw challengeError;
      if (!verifiedSession?.access_token)
        throw new Error("We couldn't verify your session. Try again.");
      syncTokenRef.current = verifiedSession.access_token;
      setNeedsReconciliation(true);
      // Once a mutation starts, retries reconcile first rather than replaying it.
      setStep("syncing");
      for (const factor of totpFactors) {
        const { error } = await disableBrowserMfaFactor(factor.id, verifiedSession.access_token);
        if (error) throw error;
      }

      await reconcileStatus(verifiedSession.access_token);
    } catch (err: unknown) {
      if (isRequestTimeout(err)) setStep("syncing");
      setVerifyError(verificationErrorMessage(err, false));
    } finally {
      setLoading(false);
    }
  }

  async function reconcileStatus(accessToken?: string) {
    setNeedsReconciliation(true);
    setStep("syncing");
    syncTokenRef.current = accessToken ?? syncTokenRef.current;
    const { profile } = await updateMfaStatus(syncTokenRef.current);
    if (typeof profile?.mfa_enabled !== "boolean")
      throw new Error("We couldn't refresh two-factor status. Try again.");
    onStatusChange(profile.mfa_enabled);
    setNeedsReconciliation(false);
    resetState();
  }

  async function retryStatus() {
    setLoading(true);
    setVerifyError(null);
    try {
      const session = await getBrowserAuthSession();
      await reconcileStatus(session?.access_token);
    } catch (err) {
      setVerifyError(extractErrorMessage(err, "We couldn't refresh two-factor status. Try again."));
    } finally {
      setLoading(false);
    }
  }

  function resetState() {
    pendingFactorIdRef.current = null;
    setStep("idle");
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    setVerifyError(null);
    setCopied(false);
    syncTokenRef.current = undefined;
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
  // button's feedback. The latch just stops two overlapping copies racing
  // their `copied` timers.
  const copy = useAsyncAction(copySecret);

  // ── Idle state: show status and enable/disable button ──
  if (step === "idle") {
    if (needsReconciliation) {
      return (
        <div>
          <p>Two-factor status needs to be refreshed.</p>
          <Button className="dg-btn dg-btn-secondary" onClick={retryStatus}>
            Refresh status
          </Button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {mfaEnabled ? (
            <ShieldCheck size={18} style={{ color: "var(--dg-color-success-text)" }} />
          ) : (
            <ShieldOff size={18} style={{ color: "var(--dg-color-text-muted)" }} />
          )}
          <span
            style={{
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-primary)",
              fontWeight: 500,
            }}
          >
            {mfaEnabled
              ? "Two-factor authentication is enabled."
              : "Two-factor authentication is not enabled."}
          </span>
        </div>
        <p
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-muted)",
            margin: 0,
          }}
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
            onClick={() => setStep("enrolling")}
            disabled={loading}
            className="dg-btn dg-btn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            <ButtonLoading
              loading={loading}
              spinnerColor="var(--dg-color-text-inverse)"
              spinnerSize={14}
            >
              Enable 2FA
            </ButtonLoading>
          </Button>
        )}
      </div>
    );
  }

  if (step === "enrolling" || step === "disabling") {
    const enrolling = step === "enrolling";
    return (
      <StepUpForm
        key={step}
        method={enrolling ? "password" : "totp"}
        description={
          enrolling
            ? "Confirm your password to set up two-factor authentication."
            : "Disabling two-factor authentication makes your account less secure. Enter a new code from your authenticator app to confirm."
        }
        error={verifyError}
        disabled={loading}
        onCancel={resetState}
        onConfirm={enrolling ? startEnrollment : disableMFA}
        confirmLabel={enrolling ? "Continue" : "Disable 2FA"}
        variant={enrolling ? "primary" : "danger"}
      />
    );
  }

  if (step === "syncing") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p>Refresh the account's two-factor status before making another change.</p>
        {verifyError && <p role="alert">{verifyError}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Button className="dg-btn dg-btn-secondary" disabled={loading} onClick={resetState}>
            Cancel
          </Button>
          <Button className="dg-btn dg-btn-primary" disabled={loading} onClick={retryStatus}>
            Refresh status
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
          color: "var(--dg-color-text-primary)",
          margin: 0,
          fontWeight: 500,
        }}
      >
        Scan this QR code with your authenticator app
      </p>
      <p
        style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--dg-color-text-muted)", margin: 0 }}
      >
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
            border: "1px solid var(--dg-color-border)",
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
              background: "var(--dg-color-bg-secondary)",
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--dg-color-border)",
              fontFamily: "monospace",
              fontSize: "var(--dg-fs-body-sm)",
              wordBreak: "break-all",
            }}
          >
            <span style={{ flex: 1, color: "var(--dg-color-text-primary)" }}>{secret}</span>
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
                  color: "var(--dg-color-text-muted)",
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
            border: `1.5px solid ${verifyError ? "var(--dg-color-danger)" : "var(--dg-color-border)"}`,
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
              color: "var(--dg-color-danger-dark)",
              fontSize: "var(--dg-fs-body-sm)",
              margin: 0,
            }}
          >
            {verifyError}
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Button
          onClick={async () => {
            // Cancel enrollment — unenroll the pending factor
            const pendingFactorId = pendingFactorIdRef.current;
            setLoading(true);
            try {
              if (pendingFactorId) await cleanupBrowserMfaFactor(pendingFactorId);
              resetState();
            } catch {
              setVerifyError("We couldn't cancel setup. Refresh its status before trying again.");
              setStep("syncing");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="dg-btn dg-btn-secondary"
        >
          Cancel
        </Button>
        <Button
          onClick={verifyEnrollment}
          disabled={loading || verifyCode.length !== 6}
          className="dg-btn dg-btn-primary"
        >
          <ButtonLoading
            loading={loading}
            spinnerColor="var(--dg-color-text-inverse)"
            spinnerSize={14}
          >
            Verify &amp; Enable
          </ButtonLoading>
        </Button>
      </div>
    </div>
  );
}
