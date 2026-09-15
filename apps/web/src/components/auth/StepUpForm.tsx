"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/Button";
import type { StepUpMethod } from "@/features/account/client/step-up";

interface StepUpFormProps {
  method: StepUpMethod;
  error: string | null;
  onConfirm: (credential: string) => Promise<void>;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  description?: string;
  descriptionId?: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  disabled?: boolean;
}

/** Shared credential entry; callers retain ownership of authorization and mutations. */
export function StepUpForm({
  method,
  error,
  onConfirm,
  onCancel,
  onBusyChange,
  description,
  descriptionId,
  confirmLabel = "Continue",
  variant = "primary",
  disabled = false,
}: StepUpFormProps) {
  const id = useId();
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const isPassword = method === "password";
  const canSubmit = isPassword ? credential.length > 0 : /^\d{6}$/.test(credential);
  const displayedError = error ?? submitError;

  async function submit() {
    if (inFlight.current || disabled || !canSubmit) return;
    inFlight.current = true;
    onBusyChange?.(true);
    setBusy(true);
    setSubmitError(null);
    const value = credential;
    setCredential("");
    try {
      await onConfirm(value);
    } catch {
      setSubmitError("We couldn't confirm your identity. Try again.");
    } finally {
      inFlight.current = false;
      onBusyChange?.(false);
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        return submit();
      }}
    >
      <p
        id={descriptionId ?? `${id}-description`}
        className="text-sm text-[var(--dg-color-text-muted)]"
      >
        {description ??
          (isPassword
            ? "Enter your password to continue with this action."
            : "Enter the six-digit code from your authenticator app to continue.")}
      </p>
      <div>
        <label htmlFor={id} className="dg-label">
          {isPassword ? "Password" : "Authenticator code"}
        </label>
        <input
          id={id}
          className="dg-input"
          type={isPassword ? "password" : "text"}
          autoComplete={isPassword ? "current-password" : "one-time-code"}
          inputMode={isPassword ? undefined : "numeric"}
          maxLength={isPassword ? 1024 : 6}
          value={credential}
          disabled={busy || disabled}
          aria-invalid={displayedError ? true : undefined}
          aria-describedby={displayedError ? `${id}-error` : undefined}
          onChange={(event) =>
            setCredential(
              isPassword ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6),
            )
          }
        />
      </div>
      {displayedError && (
        <p id={`${id}-error`} role="alert" className="dg-form-error">
          {displayedError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary w-full"
          disabled={busy || disabled}
          onClick={() => {
            if (!inFlight.current && !disabled) onCancel();
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className={`dg-btn dg-btn-${variant} w-full`}
          disabled={!canSubmit || disabled}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
