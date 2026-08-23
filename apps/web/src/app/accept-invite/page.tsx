"use client";

import { useState, useEffect } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { getPasswordMismatchError, isPasswordAcceptable } from "@dubgrid/domain";
import { parseHost, buildSubdomainHost } from "@/lib/subdomain";
import * as Sentry from "@/lib/sentry";
import {
  fetchInvitationLookup,
  recordCurrentTermsAcceptance,
  registerInvitedUser,
  signInBrowserWithPassword,
  signOutFromBrowser,
} from "@/features/account/client";
import { acceptInvitation } from "@/features/organization/client";

type PageState = "loading" | "no-token" | "form" | "processing" | "success";

function AcceptInviteContent() {
  const [state, setState] = useState<PageState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailFromUrl, setEmailFromUrl] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  // Extract token and email from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const emailParam = params.get("email");
    if (!t) {
      setState("no-token");
    } else {
      setToken(t);
      if (emailParam) {
        setEmail(emailParam);
        setEmailFromUrl(true);
      }
      setState("form");
      // Fetch org name for context (best-effort)
      fetchInvitationLookup(t)
        .then(({ orgName: name }) => {
          if (name) setOrgName(name);
        })
        .catch(() => {
          /* best-effort */
        });
    }
  }, []);

  function getLoginUrl(slug: string | null) {
    if (!slug) return "/login";
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) return "/login";
    const parsed = parseHost(window.location.host);
    // Already on this org's subdomain — use relative redirect
    if (parsed.subdomain === slug) return "/login";
    const host = buildSubdomainHost(slug, parsed);
    return `${window.location.protocol}//${host}/login`;
  }

  // Derived so the warning appears as the user types the confirmation.
  const mismatchError = getPasswordMismatchError(password, confirmPassword);
  const canSubmit = isPasswordAcceptable(password) && mismatchError === null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (mismatchError) {
      setFormError(mismatchError);
      return;
    }
    if (!isPasswordAcceptable(password)) {
      setFormError("Choose a stronger password.");
      return;
    }

    setLoading(true);
    setState("processing");

    try {
      // 1. Create the auth account server-side, already confirmed. The invite
      //    link was mailed to this address, so the address is already proven —
      //    a second "confirm your email" round trip would only stall the invite.
      const { status } = await registerInvitedUser({ token: token!, email, password });

      // 2. Sign in. A new account takes the password just chosen; an address
      //    that already has one needs that account's existing password.
      const { error: signInError } = await signInBrowserWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw new Error(
          status === "existing"
            ? "This email already has a DubGrid account. Enter that account's password to accept the invitation."
            : "Unable to sign in. Please try again or contact support.",
        );
      }

      // 3. Accept the invitation (now authenticated)
      let slug: string | null = null;
      try {
        const result = await acceptInvitation(token!);
        slug = result.orgSlug;
      } catch (acceptErr: unknown) {
        const msg: string =
          (acceptErr instanceof Error ? acceptErr.message : String(acceptErr)) ?? "";
        const code: string = (acceptErr as { code?: string })?.code ?? "";
        // "Already accepted" is fine — just proceed to success.
        // Match on Postgres error code P0001 (RAISE EXCEPTION) + message, or message alone as fallback.
        const isAlreadyAccepted =
          (code === "P0001" && msg.toLowerCase().includes("already")) ||
          msg.toLowerCase().includes("already been accepted");
        if (!isAlreadyAccepted) {
          throw new Error(
            "Your account was created, but this invitation is no longer valid. " +
              "Please contact your organization administrator for a new invitation.",
          );
        }
        // Try to look up the org slug for redirect
        try {
          const lookup = await fetchInvitationLookup(token!);
          slug = lookup.orgSlug;
        } catch {
          // Best-effort
        }
      }

      // 3b. Record terms acceptance (best-effort — user is already authenticated)
      try {
        await recordCurrentTermsAcceptance();
      } catch {
        // Non-blocking — login will route the user through /accept-terms if
        // this didn't persist for any reason.
      }

      // 4. Sign out so user re-authenticates with fresh JWT claims.
      // Use global scope to revoke the server-side refresh token too,
      // otherwise the login page will find a stale token in cookies.
      await signOutFromBrowser("global");

      setOrgSlug(slug);
      setState("success");
    } catch (err: unknown) {
      Sentry.captureException(err, { extra: { context: "accept-invite" } });
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setState("form");
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <div className="dg-auth-logo-block" style={{ gap: "8px" }}>
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </div>

        {state === "loading" || state === "processing" ? (
          <AuthStateCard
            icon="spinner"
            heading={state === "processing" ? "Setting up your account" : "Loading"}
            message="Please wait while we process your invitation."
          />
        ) : state === "no-token" ? (
          <AuthStateCard
            heading="Invalid link"
            message="This invitation link is missing a token. Please check the link you received and try again."
            primaryCta={{ label: "Go to login", href: "/login" }}
          />
        ) : state === "success" ? (
          <SuccessState orgSlug={orgSlug} getLoginUrl={getLoginUrl} />
        ) : (
          <>
            <h1 className="dg-auth-heading" style={{ marginBottom: "8px" }}>
              Accept Invitation
            </h1>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              {orgName ? (
                <>
                  Set your password to join <strong>{orgName}</strong> on DubGrid.
                </>
              ) : (
                "Set your password to join your organization on DubGrid."
              )}
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div>
                <label htmlFor="invite-email" className="dg-auth-field-label">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  placeholder="you@example.com"
                  className="dg-auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  readOnly={emailFromUrl}
                  autoComplete="email"
                  style={
                    emailFromUrl
                      ? {
                          background: "var(--color-bg-secondary)",
                          color: "var(--color-text-subtle)",
                        }
                      : undefined
                  }
                />
              </div>

              <div>
                <label htmlFor="invite-password" className="dg-auth-field-label">
                  Password
                </label>
                <PasswordInput
                  id="invite-password"
                  placeholder="Create a password"
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  ariaDescribedBy={
                    "password-strength-label password-strength-hints" +
                    (formError ? " invite-form-error" : "")
                  }
                />
                {password.length > 0 && <PasswordStrength password={password} />}
              </div>

              <div>
                <label htmlFor="invite-confirm-password" className="dg-auth-field-label">
                  Confirm Password
                </label>
                <PasswordInput
                  id="invite-confirm-password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  ariaDescribedBy={
                    mismatchError
                      ? "invite-confirm-error"
                      : formError
                        ? "invite-form-error"
                        : undefined
                  }
                />
                {mismatchError && (
                  <p className="dg-form-error" id="invite-confirm-error">
                    {mismatchError}
                  </p>
                )}
              </div>

              {formError && (
                <p className="dg-form-error" id="invite-form-error">
                  {formError}
                </p>
              )}

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: "var(--dg-fs-body-sm)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
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
                  </a>{" "}
                  and{" "}
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
                type="submit"
                disabled={loading || !termsAccepted || !canSubmit}
                className="dg-btn dg-btn-primary dg-btn-lg"
                style={{ marginTop: "4px", width: "100%" }}
              >
                <ButtonLoading
                  loading={loading}
                  loadingLabel="Setting Password"
                  spinnerColor="var(--color-text-inverse)"
                  spinnerSize={20}
                >
                  Set Password & Accept
                </ButtonLoading>
              </button>
            </form>
          </>
        )}
      </Card>
    </PageShell>
  );
}

// ── Success state (with redirect countdown) ───────────────────────────────────

function SuccessState({
  orgSlug,
  getLoginUrl,
}: {
  orgSlug: string | null;
  getLoginUrl: (slug: string | null) => string;
}) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          window.location.href = getLoginUrl(orgSlug);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AuthStateCard
      icon="check"
      heading="You're all set"
      message={
        <>
          Your account has been created and invitation accepted. Sign in to get started with your
          onboarding.
          {countdown > 0 ? ` Redirecting in ${countdown}...` : " Redirecting..."}
        </>
      }
      primaryCta={{
        label: "Sign In Now",
        onClick: () => (window.location.href = getLoginUrl(orgSlug)),
      }}
    />
  );
}

export default function AcceptInvitePage() {
  return (
    <PublicRoute>
      <AcceptInviteContent />
    </PublicRoute>
  );
}
