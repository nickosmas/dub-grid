"use client";

import { useState } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Form } from "@/components/Form";
import { PasswordInput } from "@/components/auth/PasswordInput";

/**
 * The email + password sign-in form shared by the org and gridmaster login
 * flows. Manages its own show/hide-password state; the parent owns the
 * field values and submit handler.
 */
export function EmailPasswordForm({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  onSubmit,
  submitLabel,
  forgotPasswordHref,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  forgotPasswordHref?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <Form onSubmit={onSubmit} className="dg-auth-form">
      <div>
        <label htmlFor="auth-email" className="dg-auth-field-label">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          required
          autoComplete="email"
          className="dg-auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="auth-password" className="dg-auth-field-label">
          Password
        </label>
        <PasswordInput
          id="auth-password"
          placeholder=""
          value={password}
          onChange={setPassword}
          showPassword={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          autoComplete="current-password"
          minLength={1}
          disabled={loading}
        />
      </div>

      {forgotPasswordHref && (
        <div className="dg-auth-forgot">
          <a href={forgotPasswordHref} className="dg-auth-link dg-auth-link--subtle">
            Forgot password?
          </a>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="dg-btn dg-btn-primary dg-btn-lg dg-auth-submit"
      >
        <ButtonLoading
          loading={loading}
          spinnerColor="var(--dg-color-text-inverse)"
          spinnerSize={20}
        >
          {submitLabel}
        </ButtonLoading>
      </button>
    </Form>
  );
}
