"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { decodeJwt } from "jose";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import { Button } from "@/components/Button";
import { ACCOUNT_DISABLED_CODE } from "@dubgrid/domain";
import { getValidPort } from "@/lib/subdomain";
import { withThemeParam } from "@/lib/theme-preference";
import { extractErrorMessage } from "@/lib/error-handling";
import { markAuthTransition } from "@/lib/auth-transition";
import { setUserViewActive } from "@/hooks";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  exitSandbox,
  fetchAccessibleOrganizations,
  getBrowserAuthSession,
  refreshBrowserSession,
  setBrowserSession,
  signOutFromBrowser,
  startBrowserTrial,
  switchBrowserOrganization,
} from "@/features/account/client";
import {
  AccountDisabledModal,
  orgNameCacheKey,
  resolvePostLoginDestination,
  useClientHost,
  useSessionInvalidToast,
} from "./shared";

export default function OrgLogin({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Same-org login → soft nav (smooth, no reload). After an ORG SWITCH → hard
  // nav: a soft nav leaves useOrganizationData's one-time org context pinned to
  // the previous org, which destabilizes the onboarding gate (the orientation
  // wizard flickers/shows twice or is skipped). A full reload resets every
  // org-context source to the switched org.
  function navigateToDashboard(destination: string, didSwitchOrg: boolean) {
    if (didSwitchOrg) {
      window.location.replace(destination);
    } else {
      router.replace(destination);
    }
  }
  // Switches to targetOrgId (already confirmed as one of the user's
  // memberships), refreshes the session, starts the org's trial if
  // applicable, and clears sandbox/query-cache state. On failure, signs the
  // user out and shows an error toast. Shared by the fast-path (server said
  // needsClientOrgSwitch) and the MFA-verified path (which can't go through
  // the server route a second time — see handleMFAVerified).
  async function switchToOrgAndPrepare(targetOrgId: string): Promise<boolean> {
    try {
      await switchBrowserOrganization(targetOrgId);
      await refreshBrowserSession();
      // Don't carry a prior session's "view as user" toggle into the org we
      // just switched into (it would silently force read-only).
      setUserViewActive(false);
      // Drop the prior org's React Query cache so the new org's dashboard
      // never paints with stale cross-org data. The hard nav below would
      // eventually reset this, but clearing here guarantees nothing in
      // between hits the old cache.
      queryClient.clear();
    } catch {
      await signOutFromBrowser("local");
      toast.error("We couldn't switch organizations. Try again.");
      return false;
    }
    // First super_admin login starts this org's trial. Idempotent and
    // self-gated server-side, so safe to fire whenever a super_admin signs
    // in. Non-fatal: never blocks sign-in on failure.
    try {
      await startBrowserTrial(targetOrgId);
    } catch {
      // Non-fatal: never block sign-in on trial activation.
    }
    // Fresh login = previous session ended. Wipe any sandbox left over from
    // that session (involuntary logout / browser close that never ran the
    // explicit exit) so stale sandbox data is never resumed.
    //
    // Awaited, not fire-and-forget: the caller hard-navigates immediately after
    // this returns, which aborted the in-flight request often enough that the
    // sandbox routinely survived the switch — and a surviving sandbox cookie
    // pins every later request to a clone of the org the user just left, at an
    // elevated role. Failure is still non-fatal, because the switch route now
    // clears the cookie server-side; this call is what deletes the org row.
    try {
      await exitSandbox();
    } catch {
      // Non-fatal: never block sign-in on sandbox teardown.
    }
    // The prior org's permissions are cached in a module-level singleton keyed
    // by user id, which a same-user org switch does not invalidate on its own.
    return true;
  }

  // Looks up the user's membership in `orgSlug` and switches to it via
  // switchToOrgAndPrepare. Returns false (having already shown a toast and
  // signed the user out) when the lookup fails or no membership exists.
  async function findAndSwitchToOrg(): Promise<boolean> {
    const { organizations: orgs } = await fetchAccessibleOrganizations();
    if (!orgs) {
      await signOutFromBrowser("local");
      toast.error("We couldn't confirm your access to that organization. Try again.");
      return false;
    }
    const targetOrg = orgs.find((o) => o.org_slug === orgSlug);
    if (!targetOrg) {
      await signOutFromBrowser("local");
      toast.error("Your account is not associated with this organization.");
      return false;
    }
    return switchToOrgAndPrepare(targetOrg.org_id);
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [orgNotFound, setOrgNotFound] = useState(false);
  // Starts null (not read from window/localStorage here) so the client's
  // first hydration pass matches the server-rendered HTML — OrgLogin is now
  // server-rendered (see app/login/page.tsx), so a lazy useState initializer
  // that branches on `typeof window` would render "null → orgSlug" on the
  // server and a different value on the client's first paint, which is a
  // hydration mismatch React has to discard and re-render around. The
  // ?name=/localStorage-derived value is instead applied in the effect
  // below, after hydration.
  const [orgName, setOrgName] = useState<string | null>(null);

  useSessionInvalidToast();

  // Seed from the ?name= param forwarded by the domain selector (which
  // already validated this subdomain before redirecting here), or a cached
  // value from a prior visit on this subdomain, then re-confirm on arrival —
  // a cheap, Redis-cached confirmatory check when arriving via
  // DomainSelector, and the authoritative check for direct/bookmarked
  // visits that skip DomainSelector entirely.
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("name");
    if (n && n.trim()) {
      setOrgName(n);
      try {
        window.localStorage.setItem(orgNameCacheKey(orgSlug), n);
      } catch {
        /* storage disabled */
      }
    } else {
      try {
        const cached = window.localStorage.getItem(orgNameCacheKey(orgSlug));
        if (cached && cached.trim()) setOrgName(cached);
      } catch {
        /* storage disabled */
      }
    }

    let cancelled = false;
    fetch(`/api/validate-domain?slug=${encodeURIComponent(orgSlug)}`)
      .then((r) => r.json())
      .then((d: { valid?: boolean; name?: string | null }) => {
        if (cancelled) return;
        if (!d?.valid) {
          setOrgNotFound(true);
          return;
        }
        if (d.name) {
          setOrgName(d.name);
          try {
            window.localStorage.setItem(orgNameCacheKey(orgSlug), d.name);
          } catch {
            /* storage disabled */
          }
        }
      })
      .catch(() => {
        /* best-effort: don't block the form on a network blip */
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      // Use server-side login route for brute-force protection. For the
      // common case (JWT's org already matches this subdomain, or the
      // caller is gridmaster) it also resolves trial activation and the
      // terms check server-side (see orchestratePostSignIn in
      // api/auth/login/route.ts) and returns a destination directly. Org
      // switching stays client-orchestrated (result.needsClientOrgSwitch) —
      // see that function's doc comment for why.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(
            extractErrorMessage(
              result.error,
              "Too many sign-in attempts. Wait a few minutes and try again.",
            ),
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
        if (result.code === "SESSION_REFRESH_FAILED") {
          toast.error("We couldn't verify your session. Sign in again.");
          setLoading(false);
          return;
        }
        if (res.status === 401) {
          toast.error("Check your email and password and try again.");
          setLoading(false);
          return;
        }
        toast.error(extractErrorMessage(result.error, "We couldn't sign you in. Try again."));
        setLoading(false);
        return;
      }

      // Check if email is confirmed
      if (!result.user.email_confirmed_at) {
        window.location.replace(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }

      // Set the session in the client using the tokens from the server.
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

      if (result.needsClientOrgSwitch) {
        const switched = await findAndSwitchToOrg();
        if (!switched) {
          setLoading(false);
          return;
        }
        markAuthTransition();
        navigateToDashboard(await resolvePostLoginDestination(), true);
        return;
      }

      // Fresh login = previous session ended. Wipe any sandbox left over
      // from that session (involuntary logout / browser close that never
      // ran the explicit exit) so stale sandbox data is never resumed.
      // Fire-and-forget: never block or fail sign-in.
      void exitSandbox().catch(() => {});

      markAuthTransition();
      navigateToDashboard(result.destination, false);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
        toast.error("Check your connection and try again.");
      } else {
        toast.error("We couldn't sign you in. Try again.");
      }
      setLoading(false);
    }
  }

  function handleMFAVerified() {
    // After MFA verification, proceed with the org slug verification and
    // dashboard redirect. Unlike handleSubmit above, this can't go through
    // POST /api/auth/login (that already happened before MFA) — the second
    // factor is verified directly against Supabase from the browser, so
    // this orchestrates org-switch/trial/terms client-side same as before.
    async function proceed() {
      try {
        const session = await getBrowserAuthSession();
        if (!session) {
          toast.error("Your session expired. Sign in again.");
          setMfaRequired(false);
          return;
        }

        const claims = decodeJwt(session.access_token);
        const isGridmaster = claims.platform_role === "gridmaster";
        let didSwitchOrg = false;

        if (!isGridmaster) {
          const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;
          const signedInOrgId = typeof claims.org_id === "string" ? claims.org_id : null;

          if (userSlug !== orgSlug) {
            const switched = await findAndSwitchToOrg();
            if (!switched) {
              setMfaRequired(false);
              return;
            }
            didSwitchOrg = true;
          } else {
            // Already in the right org — still start the trial if
            // applicable and clear any leftover sandbox from a prior
            // session, same as switchToOrgAndPrepare does for the switch
            // case (see that function for why each step exists).
            if (signedInOrgId) {
              try {
                await startBrowserTrial(signedInOrgId);
              } catch {
                // Non-fatal: never block sign-in on trial activation.
              }
            }
            void exitSandbox().catch(() => {});
          }
        }

        markAuthTransition();
        navigateToDashboard(await resolvePostLoginDestination(), didSwitchOrg);
      } catch {
        toast.error("We couldn't finish signing you in. Try again.");
        setMfaRequired(false);
      }
    }
    proceed();
  }

  function handleMFACancel() {
    void signOutFromBrowser("local");
    setMfaRequired(false);
    setLoading(false);
  }

  const { theme } = useTheme();
  const { parsed, protocol } = useClientHost();
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // The apex is a separate origin with its own localStorage, so carry the theme
  // over rather than letting the landing page resolve its own. Gated on
  // `parsed` for the same reason `useClientHost` exists: it stays null through
  // SSR *and* the first hydration pass, so the rendered href matches on both
  // and only picks up the param once the client-only effect has run.
  const apexOrigin = `${protocol}//${baseDomain}${parsed?.port ?? ""}`;
  const apexHref = parsed ? withThemeParam(`${apexOrigin}/`, theme) : `${apexOrigin}/`;

  if (mfaRequired) {
    return (
      <MFAVerify
        onVerified={handleMFAVerified}
        onCancel={handleMFACancel}
        orgSlug={orgSlug}
        baseDomain={baseDomain}
      />
    );
  }

  return (
    <PublicRoute>
      <PageShell signInDisclaimer={!orgNotFound}>
        <Card>
          {/* Logo — links to apex landing page */}
          <a href={apexHref} className="dg-auth-logo-block" style={{ marginBottom: "32px" }}>
            <DubGridLogo size={52} />
            <DubGridWordmark />
          </a>

          {orgNotFound ? (
            <>
              <h1 className="dg-auth-heading">Organization not found</h1>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "var(--dg-fs-body)",
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  margin: "0 0 4px",
                }}
              >
                We couldn&apos;t find an organization at this subdomain. Check the address, or use a
                different one below.
              </p>
            </>
          ) : (
            <>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "var(--dg-fs-body)",
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  margin: "0 0 4px",
                }}
              >
                Sign in to
              </p>
              <h1 className="dg-auth-heading">{orgName ?? orgSlug}</h1>

              <EmailPasswordForm
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                loading={loading}
                onSubmit={handleSubmit}
                submitLabel="Sign In"
                submitPendingLabel="Signing In"
                forgotPasswordHref="/forgot-password"
              />
            </>
          )}

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <Button
              type="button"
              onClick={() => {
                const { protocol, port } = window.location;
                const portStr = getValidPort(port);
                const target = `${protocol}//${baseDomain}${portStr}/login`;
                window.location.href = withThemeParam(target, theme);
              }}
              className="dg-auth-link"
            >
              &larr; Use a different organization
            </Button>
          </div>
        </Card>
        {accountDisabled && <AccountDisabledModal onClose={() => setAccountDisabled(false)} />}
      </PageShell>
    </PublicRoute>
  );
}
