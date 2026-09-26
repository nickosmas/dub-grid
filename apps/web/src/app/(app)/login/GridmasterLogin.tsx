"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import { useAuth } from "@/components/AuthProvider";
import { ACCOUNT_DISABLED_CODE } from "@dubgrid/domain";
import { markAuthTransition } from "@/lib/auth-transition";
import { DubGridLogo } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  recordBrowserSignInCompleted,
  refreshBrowserSession,
  setBrowserSession,
  signOutFromBrowser,
  syncBrowserSessionInBackground,
} from "@/features/account/client";
import {
  AccountDisabledModal,
  resolvePostLoginDestination,
  useClientHost,
  useSessionInvalidToast,
} from "./shared";
import { fetchWithTimeout, settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "@/lib/auth-recovery";
import { withThemeParam, type ThemePreference } from "@/lib/theme-preference";

export default function GridmasterLogin({
  initialTheme,
}: {
  /** The theme the request arrived with, resolved by the server page. */
  initialTheme?: ThemePreference;
}) {
  const router = useRouter();
  const { user: signedInUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  // Mirrors OrgLogin's marker so browser automation can wait for the form to
  // be interactive instead of typing into inert server-rendered markup.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  const submittingRef = useRef(false);

  useSessionInvalidToast();

  const { theme } = useTheme();
  const { parsed, protocol } = useClientHost();
  // The apex is a separate origin with its own localStorage, so every link
  // back to it hands the theme over, the way the domain selector does on the
  // way in. next-themes reads localStorage synchronously on the client but
  // has nothing on the server, so its value only takes over once hydration
  // has finished; until then the server-resolved theme keeps both renders
  // building the same href.
  const handoverTheme = isHydrated ? theme : initialTheme;
  const apexOrigin = `${protocol}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}`;
  const landingUrl = withThemeParam(`${apexOrigin}/`, handoverTheme);
  const apexLoginUrl = withThemeParam(`${apexOrigin}/login`, handoverTheme);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const priorUserId = signedInUser?.id ?? null;
    setLoading(true);

    try {
      // Use server-side login route for brute-force protection. For the
      // non-MFA path it also resolves the post-refresh session and
      // destination server-side (see orchestratePostSignIn in
      // api/auth/login/route.ts) — no separate refreshSession/terms round
      // trips needed here.
      // Deadline, not optional: a stalled connection leaves a bare `fetch`
      // pending indefinitely, and every path that clears this form's loading
      // state runs after the await — so a bad signal would leave the button
      // spinning with no way back.
      const res = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 429) {
          toast.error("Too many sign-in attempts. Wait a few minutes and try again.");
          setLoading(false);
          return;
        }
        if (res.status === 403 && result?.code === ACCOUNT_DISABLED_CODE) {
          setAccountDisabled(true);
          setPassword("");
          setLoading(false);
          return;
        }
        if (res.status === 401) {
          toast.error("Check your email and password and try again.");
          setLoading(false);
          return;
        }
        toast.error(
          getWebAuthRecoveryMessage({ status: res.status }, "We couldn't sign you in. Try again."),
        );
        setLoading(false);
        return;
      }
      if (!result) throw Object.assign(new Error("Unexpected login response"), { status: 502 });

      // The login route wrote the session cookies: navigate now and sync the
      // auth client alongside the page load (see OrgLogin's handleSubmit).
      if (result.sessionCookieSet && (priorUserId === null || priorUserId === result.user.id)) {
        void syncBrowserSessionInBackground(result.session);
        markAuthTransition();
        router.replace(result.destination);
        return;
      }

      // Set the session in the client using the tokens from the server
      await settleWithRequestTimeout(
        setBrowserSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        }),
      );

      // Check if MFA is required before proceeding
      if (result.mfa_required) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      // Soft client navigation — keeps the SPA alive (no full-page reload).
      // markAuthTransition() keeps ProtectedRoute from bouncing to /login
      // while the auth context finishes settling after sign-in.
      markAuthTransition();
      router.replace(result.destination);
    } catch (err: unknown) {
      toast.error(getWebAuthRecoveryMessage(err, "We couldn't sign you in. Try again."));
      setLoading(false);
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleMFAVerified() {
    // After MFA verification, refresh session and navigate. Must handle a
    // refresh failure (network/token hiccup) — otherwise the MFA screen hangs
    // forever with an unhandled rejection. Mirrors the org-login path. (H-3)
    await settleWithRequestTimeout(refreshBrowserSession());
    await recordBrowserSignInCompleted();
    markAuthTransition();
    router.replace(await settleWithRequestTimeout(resolvePostLoginDestination()));
  }

  function handleMFACancel() {
    void signOutFromBrowser("local");
    setMfaRequired(false);
    setLoading(false);
  }

  if (mfaRequired) {
    return <MFAVerify onVerified={handleMFAVerified} onCancel={handleMFACancel} />;
  }

  return (
    <PublicRoute>
      <PageShell signInDisclaimer>
        <Card data-testid="gridmaster-login" data-hydrated={isHydrated}>
          <a href={landingUrl} className="dg-auth-logo-block">
            <DubGridLogo size={52} />
            <span className="dg-auth-portal-label">Gridmaster portal</span>
          </a>

          <h1 className="dg-auth-heading">Platform admin sign in</h1>

          <EmailPasswordForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            onSubmit={handleSubmit}
            submitLabel="Access Portal"
            forgotPasswordHref="/forgot-password"
          />

          {/* Navigation links */}
          <div className="dg-auth-login-navigation">
            <a href={apexLoginUrl} className="dg-auth-link">
              Back to standard login
            </a>
            <a href={landingUrl} className="dg-auth-link">
              Back to home
            </a>
          </div>
        </Card>
        {accountDisabled && <AccountDisabledModal onClose={() => setAccountDisabled(false)} />}
      </PageShell>
    </PublicRoute>
  );
}
