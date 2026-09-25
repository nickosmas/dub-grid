"use client";

import { useState, useEffect, useRef } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { Form } from "@/components/Form";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { AuthStateCard } from "@/components/auth/AuthStateCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ApexLandingLink } from "@/components/auth/ApexLandingLink";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { getPasswordMismatchError, isPasswordAcceptable } from "@dubgrid/domain";
import { describeSignInFailure, EXISTING_ACCOUNT_MESSAGE } from "./signInFailure";
import {
  classifyAcceptFailure,
  describeAcceptFailure,
  describeDeadInvitation,
} from "./acceptFailure";
import { MFAVerify } from "@/components/profile/MFAVerify";
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
import { scrubBrowserSecretQuery } from "@/lib/auth/browser-secret-query";
import { formatInvitationExpiry } from "@/emails/invitation-expiry";

type PageState = "loading" | "no-token" | "invalid" | "form" | "processing" | "mfa" | "success";

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
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  // Set once the server has confirmed this address already has an account. The
  // form then asks for that account's password instead of a new one — without
  // it, someone whose password predates the current strength rules can never
  // satisfy `isPasswordAcceptable` and the invitation is a dead end.
  const [existingAccount, setExistingAccount] = useState(false);
  // How the account step ended, kept across the second-factor handoff so a
  // dead token is described the same way after the challenge as before it.
  const registerStatusRef = useRef("existing");
  // Whether this attempt signed in, so a dead link signs out only the session
  // it made and never one the browser already held.
  const signedInRef = useRef(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const capturedUrlSecrets = useRef(false);

  // Extract token and email from URL on mount
  useEffect(() => {
    if (capturedUrlSecrets.current) return;
    capturedUrlSecrets.current = true;
    const captured = scrubBrowserSecretQuery(["token", "email"]);
    const t = captured.token;
    const emailParam = captured.email;
    if (!t) {
      setState("no-token");
    } else {
      setToken(t);
      if (emailParam) {
        setEmail(emailParam);
        setEmailFromUrl(true);
      }
      // Wait for the lookup before showing anything: a dead link must never
      // reach the form (finding F-07). Only the opaque dead-token response
      // closes the page. An outage or a throttle still shows the form, since
      // acceptance checks the token again on submit.
      fetchInvitationLookup(t)
        .then(({ orgName: name, expiresAt: deadline }) => {
          if (name) setOrgName(name);
          if (deadline) setExpiresAt(deadline);
          setState("form");
        })
        .catch((lookupError: unknown) => {
          setState(classifyAcceptFailure(lookupError) === "dead" ? "invalid" : "form");
        });
    }
  }, []);

  function getLoginUrl(slug: string | null) {
    if (!slug) return "/login";
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) return "/login";
    const parsed = parseHost(window.location.host);
    if (parsed.subdomain === slug) return "/login";
    const host = buildSubdomainHost(slug, parsed);
    return `${window.location.protocol}//${host}/login`;
  }

  // The viewer's own zone: the email states the organization's, since it has
  // no viewer, but here the person reading it is known.
  const expiryText = formatInvitationExpiry(
    expiresAt,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  // Derived so the warning appears as the user types the confirmation.
  const mismatchError = existingAccount
    ? null
    : getPasswordMismatchError(password, confirmPassword);
  const canSubmit = existingAccount
    ? password.length > 0
    : isPasswordAcceptable(password) && mismatchError === null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!existingAccount) {
      if (mismatchError) {
        setFormError(mismatchError);
        return;
      }
      if (!isPasswordAcceptable(password)) {
        setFormError("Choose a stronger password.");
        return;
      }
    }

    setLoading(true);
    setState("processing");

    try {
      // 1. Create the auth account server-side, already confirmed. The invite
      //    link was mailed to this address, so the address is already proven —
      //    a second "confirm your email" round trip would only stall the invite.
      //    Skipped once we know the address already has an account: there is
      //    nothing left to create, and re-posting only spends the per-address
      //    rate-limit budget the retry needs.
      const status = existingAccount
        ? "existing"
        : (await registerInvitedUser({ token: token!, email, password })).status;
      registerStatusRef.current = status;

      // 2. Sign in. A new account takes the password just chosen; an address
      //    that already has one needs that account's existing password.
      const { error: signInError } = await signInBrowserWithPassword({
        email,
        password,
      });
      if (signInError) {
        // Only a rejected credential means "wrong password for an existing
        // account" — switch the form over for that case alone, so a throttle
        // or an outage doesn't relabel a first-time signup as a returning user.
        const message = describeSignInFailure(signInError, status);
        if (message === EXISTING_ACCOUNT_MESSAGE) setExistingAccount(true);
        // Carry the real GoTrue error as `cause` so Sentry's linked-errors
        // integration reports it alongside the sentence shown to the user.
        throw new Error(message, { cause: signInError });
      }
      signedInRef.current = true;

      // 3. Accept the invitation (now authenticated)
      if ((await finishAcceptance()) === "needs-mfa") {
        setState("mfa");
        setLoading(false);
      }
    } catch (err: unknown) {
      failAcceptance(err);
    }
  }

  // Accept with whatever session the browser now holds. An account with a
  // verified TOTP factor is refused until it answers a challenge, so that
  // refusal hands over to the login page's MFAVerify screen and acceptance
  // resumes on the promoted session rather than failing as a dead link.
  async function finishAcceptance(): Promise<"accepted" | "needs-mfa"> {
    let slug: string | null = null;
    try {
      const result = await acceptInvitation(token!);
      slug = result.orgSlug;
    } catch (acceptErr: unknown) {
      const failure = classifyAcceptFailure(acceptErr);
      if (failure === "step-up") return "needs-mfa";
      // Raw, so failAcceptance recognises the dead-token contract.
      if (failure === "dead") throw acceptErr;
      if (failure !== "already-accepted") {
        throw new Error(describeAcceptFailure(failure), { cause: acceptErr });
      }
      try {
        const lookup = await fetchInvitationLookup(token!);
        slug = lookup.orgSlug;
      } catch {
        // Best-effort
      }
    }

    // 3b. Record terms acceptance (best-effort: the user is already authenticated)
    try {
      await recordCurrentTermsAcceptance();
    } catch {
      // Non-blocking: login will route the user through /accept-terms if
      // this didn't persist for any reason.
    }

    // 4. Sign out so user re-authenticates with fresh JWT claims.
    // Use global scope to revoke the server-side refresh token too,
    // otherwise the login page will find a stale token in cookies.
    await signOutFromBrowser("global");

    setOrgSlug(slug);
    setState("success");
    return "accepted";
  }

  function failAcceptance(err: unknown) {
    // A link that died while the page was open (a reissue, a revoke, the
    // deadline passing) goes to the same card as one that was dead on
    // arrival, since retrying the form cannot succeed.
    if (classifyAcceptFailure(err) === "dead") {
      showDeadInvitation();
      return;
    }
    Sentry.captureException(err, {
      extra: {
        context: "accept-invite",
        existingAccount,
        cause: err instanceof Error ? (err.cause ?? null) : null,
      },
    });
    setFormError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    setState("form");
    setLoading(false);
  }

  function showDeadInvitation() {
    setAccountCreated(registerStatusRef.current === "created");
    setLoading(false);
    setState("invalid");
    if (signedInRef.current) {
      signedInRef.current = false;
      void signOutFromBrowser("local").catch(() => {});
    }
  }

  async function handleMfaVerified() {
    setState("processing");
    try {
      if ((await finishAcceptance()) === "needs-mfa") {
        throw new Error(describeAcceptFailure("step-up"));
      }
    } catch (err: unknown) {
      failAcceptance(err);
    }
  }

  async function handleMfaCancel() {
    // Leave no password-only session behind on an account that has a factor.
    await signOutFromBrowser("local").catch(() => {});
    setState("form");
    setLoading(false);
  }

  if (state === "mfa") {
    return <MFAVerify onVerified={handleMfaVerified} onCancel={handleMfaCancel} />;
  }

  return (
    <PageShell>
      <Card>
        {/* Logo */}
        <ApexLandingLink className="dg-auth-logo-block dg-auth-logo-block--compact">
          <DubGridLogo size={44} />
          <DubGridWordmark />
        </ApexLandingLink>

        {state === "loading" || state === "processing" ? (
          <AuthStateCard
            icon="spinner"
            heading={
              state === "processing"
                ? existingAccount
                  ? "Accepting your invitation"
                  : "Setting up your account"
                : "Loading"
            }
            message="Please wait while we process your invitation."
          />
        ) : state === "invalid" ? (
          // One message for accepted, expired, revoked, replaced and unknown
          // links, so the page never reveals which it was.
          <AuthStateCard
            heading="Invitation no longer valid"
            message={describeDeadInvitation(accountCreated)}
            primaryCta={{ label: "Go to login", href: "/login" }}
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
            <h1 className="dg-auth-heading dg-auth-page-heading">Accept invitation</h1>
            <p className="dg-auth-description">
              {existingAccount ? (
                orgName ? (
                  <>
                    Sign in with your DubGrid password to join <strong>{orgName}</strong>.
                  </>
                ) : (
                  "Sign in with your DubGrid password to join your organization."
                )
              ) : orgName ? (
                <>
                  Set your password to join <strong>{orgName}</strong> on DubGrid.
                </>
              ) : (
                "Set your password to join your organization on DubGrid."
              )}
            </p>
            {expiryText && (
              <p className="dg-auth-footnote">This invitation expires on {expiryText}.</p>
            )}

            <Form onSubmit={handleSubmit} className="dg-auth-form">
              <div>
                <label htmlFor="invite-email" className="dg-auth-field-label">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  placeholder="you@example.com"
                  className={`dg-auth-input${emailFromUrl ? " dg-auth-input--readonly" : ""}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  readOnly={emailFromUrl}
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="invite-password" className="dg-auth-field-label">
                  {existingAccount ? "DubGrid password" : "Password"}
                </label>
                <PasswordInput
                  id="invite-password"
                  placeholder={existingAccount ? "Your existing password" : "Create a password"}
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  autoComplete={existingAccount ? "current-password" : "new-password"}
                  minLength={existingAccount ? 1 : 10}
                  ariaDescribedBy={
                    existingAccount
                      ? formError
                        ? "invite-form-error"
                        : undefined
                      : "password-strength-label password-strength-hints" +
                        (formError ? " invite-form-error" : "")
                  }
                />
                {!existingAccount && password.length > 0 && (
                  <PasswordStrength password={password} />
                )}
                {existingAccount && (
                  <div className="dg-auth-forgot">
                    <a href="/forgot-password" className="dg-auth-link dg-auth-link--subtle">
                      Forgot password?
                    </a>
                  </div>
                )}
              </div>

              {/* Unmounted, not hidden: PasswordInput is `required`, and Chrome
                  refuses to submit a form holding an invalid control it cannot
                  focus ("An invalid form control is not focusable"). */}
              {!existingAccount && (
                <div>
                  <label htmlFor="invite-confirm-password" className="dg-auth-field-label">
                    Confirm password
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
              )}

              {formError && (
                <p className="dg-form-error" id="invite-form-error">
                  {formError}
                </p>
              )}

              <label className="dg-auth-agreement">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="dg-auth-agreement-checkbox"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dg-auth-policy-link"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dg-auth-policy-link"
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !termsAccepted || !canSubmit}
                className="dg-btn dg-btn-primary dg-btn-lg dg-auth-submit"
              >
                <ButtonLoading
                  loading={loading}
                  spinnerColor="var(--dg-color-text-inverse)"
                  spinnerSize={20}
                >
                  {existingAccount ? "Sign In & Accept" : "Set Password & Accept"}
                </ButtonLoading>
              </button>
            </Form>
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
          Your account is ready and your invitation is accepted. Sign in to start your setup.
          {countdown > 0 ? ` Redirecting in ${countdown}` : " Redirecting"}
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
