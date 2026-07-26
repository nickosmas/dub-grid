"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import { ACCOUNT_DISABLED_CODE } from "@dubgrid/domain";
import { extractErrorMessage } from "@/lib/error-handling";
import { markAuthTransition } from "@/lib/auth-transition";
import { DubGridLogo } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  refreshBrowserSession,
  setBrowserSession,
  signOutFromBrowser,
} from "@/features/account/client";
import {
  AccountDisabledModal,
  resolvePostLoginDestination,
  useClientHost,
  useSessionInvalidToast,
} from "./shared";

export default function GridmasterLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);

  useSessionInvalidToast();

  const { parsed, protocol } = useClientHost();
  const landingUrl = `${protocol}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      // Use server-side login route for brute-force protection. For the
      // non-MFA path it also resolves the post-refresh session and
      // destination server-side (see orchestratePostSignIn in
      // api/auth/login/route.ts) — no separate refreshSession/terms round
      // trips needed here.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(
            extractErrorMessage(result.error, "Too many login attempts. Please try again later."),
          );
          setLoading(false);
          return;
        }
        if (res.status === 403 && result.code === ACCOUNT_DISABLED_CODE) {
          setAccountDisabled(true);
          setPassword("");
          setLoading(false);
          return;
        }
        if (res.status === 401) {
          toast.error("Invalid email or password.");
          setLoading(false);
          return;
        }
        toast.error(extractErrorMessage(result.error, "Unable to sign in. Please try again."));
        setLoading(false);
        return;
      }

      // Set the session in the client using the tokens from the server
      await setBrowserSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

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
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("Network issue. Please check your connection.");
      } else {
        toast.error("Unable to sign in. Please try again.");
      }
      setLoading(false);
    }
  }

  async function handleMFAVerified() {
    // After MFA verification, refresh session and navigate. Must handle a
    // refresh failure (network/token hiccup) — otherwise the MFA screen hangs
    // forever with an unhandled rejection. Mirrors the org-login path. (H-3)
    try {
      await refreshBrowserSession();
      markAuthTransition();
      router.replace(await resolvePostLoginDestination());
    } catch {
      toast.error("Your session could not be verified. Please sign in again.");
      void signOutFromBrowser("local");
      setMfaRequired(false);
      setLoading(false);
    }
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
        <Card>
          <a href={landingUrl} className="dg-auth-logo-block">
            <DubGridLogo size={52} />
            <span
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-text-subtle)",
              }}
            >
              Gridmaster Portal
            </span>
          </a>

          <h1 className="dg-auth-heading">Platform Admin Sign In</h1>

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
          <div
            style={{
              marginTop: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <a
              href={`${protocol}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/login`}
              className="dg-auth-link"
            >
              Back to Standard Login
            </a>
            <a href={landingUrl} className="dg-auth-link">
              Back to Home
            </a>
          </div>
        </Card>
        {accountDisabled && <AccountDisabledModal onClose={() => setAccountDisabled(false)} />}
      </PageShell>
    </PublicRoute>
  );
}
