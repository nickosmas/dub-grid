"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { decodeJwt } from "jose";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PublicRoute } from "@/components/RouteGuards";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
import { Button } from "@/components/Button";
import { ACCOUNT_DISABLED_CODE } from "@dubgrid/domain";
import { withThemeParam } from "@/lib/theme-preference";
import { consumeAuthTransition, markAuthTransition } from "@/lib/auth-transition";
import { setUserViewActive } from "@/hooks";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  exitSandbox,
  clearBrowserAuthState,
  fetchAccessibleOrganizations,
  getBrowserAuthSession,
  recordBrowserSignInCompleted,
  refreshBrowserSession,
  setBrowserSession,
  signOutFromBrowser,
  startBrowserTrial,
  switchBrowserOrganization,
} from "@/features/account/client";
import { ORG_NOT_FOUND_PARAM } from "./constants";
import {
  AccountDisabledModal,
  apexLoginHref,
  resolvePostLoginDestination,
  useClientHost,
  useSessionInvalidToast,
} from "./shared";
import { fetchWithTimeout, settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import { getWebAuthRecoveryMessage } from "@/lib/auth-recovery";
import { ACTION_SIGN_IN } from "@/lib/action-copy";

const GRIDMASTER_PORTAL_REQUIRED_CODE = "GRIDMASTER_PORTAL_REQUIRED";

/**
 * What the server already knows about this subdomain. A subdomain with no
 * organization never reaches this component — app/login/page.tsx redirects it
 * to the domain selector — so the only two cases here are a resolved name and
 * `unresolved`, meaning the lookup itself couldn't answer and the client
 * re-asks.
 */
export type OrgLoginSeed =
  | { status: "found"; name: string; suspended?: boolean }
  | { status: "deleted"; name: string }
  | { status: "not-found" }
  | { status: "unresolved" };

export type OrgLockout = "suspended" | "deleted";

const ORG_SUSPENDED_CODE = "ORG_SUSPENDED";
const ORG_DELETED_CODE = "ORG_DELETED";

const LOCKOUT_COPY: Record<OrgLockout, { title: string; body: string }> = {
  suspended: {
    title: "This organization is suspended",
    body: "Access has been paused by the DubGrid platform team. Contact support to restore it.",
  },
  deleted: {
    title: "This organization has been deleted",
    body: "Its subdomain no longer signs anyone in. Contact support if you believe this is a mistake.",
  },
};

function initialLockout(seed: OrgLoginSeed, lockout: OrgLockout | null): OrgLockout | null {
  if (lockout) return lockout;
  if (seed.status === "deleted") return "deleted";
  if (seed.status === "found" && seed.suspended) return "suspended";
  return null;
}

export default function OrgLogin({
  orgSlug,
  seed,
  lockout = null,
}: {
  orgSlug: string;
  seed: OrgLoginSeed;
  lockout?: OrgLockout | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);
  const submittingRef = useRef(false);
  const flowGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const organizationHandoffActiveRef = useRef(false);
  const switchAttemptRef = useRef<{ targetOrgId: string; promise: Promise<boolean> } | null>(null);
  const mfaProceedRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    setIsHydrated(true);
    return () => {
      mountedRef.current = false;
      flowGenerationRef.current += 1;
    };
  }, []);

  function isCurrentFlow(generation: number): boolean {
    return mountedRef.current && flowGenerationRef.current === generation;
  }

  function beginOrganizationHandoff() {
    organizationHandoffActiveRef.current = true;
    setHandoffActive(true);
    setHandoffFailed(false);
    markAuthTransition();
    setUserViewActive(false);
    void queryClient.cancelQueries();
    queryClient.clear();
  }

  function failClosedOrganizationHandoff() {
    clearBrowserAuthState();
    void queryClient.cancelQueries();
    queryClient.clear();
    consumeAuthTransition();
    organizationHandoffActiveRef.current = false;
    if (!mountedRef.current) return;
    setHandoffActive(false);
    setHandoffFailed(true);
    setMfaRequired(false);
    setLoading(false);
  }

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
  // applicable, and clears sandbox/query-cache state. Once switch_org commits,
  // any incomplete handoff fails closed to a fresh sign-in surface. Shared by
  // the fast-path (server said
  // needsClientOrgSwitch) and the MFA-verified path (which can't go through
  // the server route a second time — see handleMFAVerified).
  async function switchToOrgAndPrepare(targetOrgId: string, generation: number): Promise<boolean> {
    const existing = switchAttemptRef.current;
    if (existing?.targetOrgId === targetOrgId) return existing.promise;

    const promise = (async () => {
      await settleWithRequestTimeout(switchBrowserOrganization(targetOrgId));
      if (!isCurrentFlow(generation)) {
        failClosedOrganizationHandoff();
        return false;
      }

      // switch_org has committed. From this point onward no failure may put
      // the old organization's interactive session back on screen.
      beginOrganizationHandoff();

      let refreshedSession;
      try {
        refreshedSession = await settleWithRequestTimeout(refreshBrowserSession());
      } catch (error) {
        failClosedOrganizationHandoff();
        throw error;
      }

      if (!isCurrentFlow(generation)) {
        failClosedOrganizationHandoff();
        return false;
      }

      let refreshedOrganizationMatches = false;
      try {
        refreshedOrganizationMatches =
          !!refreshedSession && decodeJwt(refreshedSession.access_token).org_id === targetOrgId;
      } catch {
        refreshedOrganizationMatches = false;
      }
      if (!refreshedOrganizationMatches) {
        failClosedOrganizationHandoff();
        throw new Error("organization_session_mismatch");
      }

      // First super_admin login starts this org's trial (idempotent,
      // self-gated server-side) and wiping any sandbox left over from the
      // previous session (involuntary logout / browser close that never ran
      // the explicit exit) are independent of each other, so run them
      // concurrently rather than one after the other.
      //
      // Both stay awaited, not fire-and-forget: the caller hard-navigates
      // immediately after this returns, which aborted the in-flight sandbox
      // request often enough that the sandbox routinely survived the switch —
      // and a surviving sandbox cookie pins every later request to a clone of
      // the org the user just left, at an elevated role. Both are still
      // non-fatal on failure: trial activation never blocks sign-in, and the
      // switch route now clears the sandbox cookie server-side regardless, so
      // this call is only what deletes the org row.
      await Promise.all([
        settleWithRequestTimeout(startBrowserTrial(targetOrgId)).catch(() => {
          // Non-fatal: never block sign-in on trial activation.
        }),
        settleWithRequestTimeout(exitSandbox()).catch(() => {
          // Non-fatal: never block sign-in on sandbox teardown.
        }),
      ]);
      return isCurrentFlow(generation);
    })();

    switchAttemptRef.current = { targetOrgId, promise };
    const clearAttempt = () => {
      if (switchAttemptRef.current?.promise === promise) switchAttemptRef.current = null;
    };
    void promise.then(clearAttempt, clearAttempt);
    return promise;
  }

  // Looks up the user's membership in `orgSlug` and switches to it via
  // switchToOrgAndPrepare. Returns false (having already shown a toast and
  // signed the user out) when the lookup fails or no membership exists.
  async function findAndSwitchToOrg(generation: number): Promise<boolean> {
    const { organizations: orgs } = await settleWithRequestTimeout(fetchAccessibleOrganizations());
    if (!isCurrentFlow(generation)) return false;
    const targetOrg = orgs.find((o) => o.org_slug === orgSlug);
    if (!targetOrg) {
      await signOutFromBrowser("local");
      toast.error("Your account is not associated with this organization.");
      return false;
    }
    return switchToOrgAndPrepare(targetOrg.org_id, generation);
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [gridmasterPortalRequired, setGridmasterPortalRequired] = useState(false);
  const [handoffActive, setHandoffActive] = useState(false);
  const [handoffFailed, setHandoffFailed] = useState(false);
  // Seeded from the server, which already resolved this subdomain (see
  // app/login/page.tsx). That is what keeps the heading from painting the raw
  // slug first: a client-only source — an effect, `typeof window`, localStorage
  // — cannot contribute to the server-rendered HTML, so the first frame would
  // always be the fallback. A prop is identical on both sides, so there is no
  // hydration mismatch either.
  const [orgName, setOrgName] = useState<string | null>(
    seed.status === "found" || seed.status === "deleted" ? seed.name : null,
  );
  const [orgLockout, setOrgLockout] = useState<OrgLockout | null>(() =>
    initialLockout(seed, lockout),
  );

  const { theme } = useTheme();
  // The re-ask effect below may hop origins, and the apex has its own
  // localStorage — so it needs the live preference, not whatever `theme` was
  // at mount (next-themes reports `undefined` until it has resolved). A ref
  // rather than a dependency, so a theme change doesn't re-run the lookup.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useSessionInvalidToast();

  // Only runs when the server couldn't resolve the subdomain (no service key
  // in local dev, the lookup failed, rate-limited). Everywhere else `seed` is
  // already authoritative and re-asking would be a wasted round trip.
  useEffect(() => {
    if (seed.status !== "unresolved") return;

    let cancelled = false;
    fetch(`/api/validate-domain?slug=${encodeURIComponent(orgSlug)}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }: { ok: boolean; body: { valid?: boolean; name?: string | null } }) => {
        if (cancelled) return;
        // `ok` is load-bearing: a 429/503 also answers `valid: false`, and
        // bouncing a user off a real organization's sign-in page because
        // Redis or Supabase hiccuped is far worse than leaving the form up.
        // Only a clean "no such org" gets to redirect.
        if (ok && !body?.valid) {
          window.location.replace(
            withThemeParam(apexLoginHref(`?${ORG_NOT_FOUND_PARAM}=1`), themeRef.current),
          );
          return;
        }
        if (body?.name) setOrgName(body.name);
      })
      .catch(() => {
        /* best-effort: don't block the form on a network blip */
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, seed.status]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const generation = ++flowGenerationRef.current;
    setLoading(true);
    setHandoffFailed(false);
    setGridmasterPortalRequired(false);

    try {
      // The server route does the whole post-sign-in sequence: re-scoping the
      // session to this subdomain's organization when it isn't the caller's
      // current one, trial activation, sandbox teardown and the terms check.
      // See orchestratePostSignIn in api/auth/login/route.ts.
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
      if (!isCurrentFlow(generation)) return;

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
        if (res.status === 403 && result?.code === ORG_SUSPENDED_CODE) {
          setOrgLockout("suspended");
          setPassword("");
          setLoading(false);
          return;
        }
        if (res.status === 403 && result?.code === ORG_DELETED_CODE) {
          setOrgLockout("deleted");
          setPassword("");
          setLoading(false);
          return;
        }
        if (res.status === 403 && result?.code === GRIDMASTER_PORTAL_REQUIRED_CODE) {
          setGridmasterPortalRequired(true);
          setPassword("");
          setLoading(false);
          return;
        }
        if (result?.code === "SESSION_REFRESH_FAILED") {
          failClosedOrganizationHandoff();
          toast.error("We couldn't verify your session. Sign in again.");
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

      // Check if email is confirmed
      if (!result.user.email_confirmed_at) {
        window.location.replace(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }

      if (result.didSwitchOrg) {
        let switchedOrganizationMatches = false;
        try {
          switchedOrganizationMatches = decodeJwt(result.session.access_token).org_slug === orgSlug;
        } catch {
          switchedOrganizationMatches = false;
        }
        if (!switchedOrganizationMatches) {
          failClosedOrganizationHandoff();
          throw new Error("organization_session_mismatch");
        }
        beginOrganizationHandoff();
      }

      try {
        await settleWithRequestTimeout(
          setBrowserSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          }),
        );
      } catch (error) {
        if (result.didSwitchOrg) failClosedOrganizationHandoff();
        throw error;
      }
      if (!isCurrentFlow(generation)) return;

      // Check if MFA is required before proceeding
      if (result.mfa_required) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      // The server re-scoped the session to this subdomain's organization
      // (see switchSessionToHostOrganization). Everything that used to be
      // driven from here — the org lookup, switch_org, the refresh, the trial
      // start, the sandbox teardown, the terms check — already happened, and
      // the tokens set above are the post-switch ones. What is left is
      // browser-local state the server cannot touch.
      if (result.didSwitchOrg) {
        navigateToDashboard(result.destination, true);
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
      if (organizationHandoffActiveRef.current) failClosedOrganizationHandoff();
      toast.error(getWebAuthRecoveryMessage(err, "We couldn't sign you in. Try again."));
      if (mountedRef.current) setLoading(false);
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleMFAVerified() {
    if (mfaProceedRef.current) return mfaProceedRef.current;
    const generation = ++flowGenerationRef.current;
    // After MFA verification, proceed with the org slug verification and
    // dashboard redirect. Unlike handleSubmit above, this can't go through
    // POST /api/auth/login (that already happened before MFA) — the second
    // factor is verified directly against Supabase from the browser, so
    // this orchestrates org-switch/trial/terms client-side same as before.
    async function proceed() {
      const session = await settleWithRequestTimeout(getBrowserAuthSession());
      if (!isCurrentFlow(generation)) return;
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
          const switched = await findAndSwitchToOrg(generation);
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
              await settleWithRequestTimeout(startBrowserTrial(signedInOrgId));
            } catch {
              // Non-fatal: never block sign-in on trial activation.
            }
          }
          void exitSandbox().catch(() => {});
        }
      }

      if (!isCurrentFlow(generation)) return;

      const destination = await settleWithRequestTimeout(resolvePostLoginDestination());
      if (!isCurrentFlow(generation)) return;

      await recordBrowserSignInCompleted();
      markAuthTransition();
      navigateToDashboard(destination, didSwitchOrg);
    }
    const promise = proceed();
    mfaProceedRef.current = promise;
    const clearProceed = () => {
      if (mfaProceedRef.current === promise) mfaProceedRef.current = null;
    };
    void promise.then(clearProceed, clearProceed);
    return promise;
  }

  function handleMFACancel() {
    flowGenerationRef.current += 1;
    organizationHandoffActiveRef.current = false;
    clearBrowserAuthState();
    void queryClient.cancelQueries();
    queryClient.clear();
    consumeAuthTransition();
    void signOutFromBrowser("local");
    setHandoffActive(false);
    setMfaRequired(false);
    setLoading(false);
  }

  const { parsed, protocol } = useClientHost();
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // The apex is a separate origin with its own localStorage, so carry the theme
  // over rather than letting the landing page resolve its own. Gated on
  // `parsed` for the same reason `useClientHost` exists: it stays null through
  // SSR *and* the first hydration pass, so the rendered href matches on both
  // and only picks up the param once the client-only effect has run.
  const apexOrigin = `${protocol}//${baseDomain}${parsed?.port ?? ""}`;
  const apexHref = parsed ? withThemeParam(`${apexOrigin}/`, theme) : `${apexOrigin}/`;
  const gridmasterPortalHref = `${protocol}//gridmaster.${baseDomain}${parsed?.port ?? ""}/login`;

  if (handoffActive) {
    return <AuthTransitionScreen phase="workspace" />;
  }

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
      <PageShell signInDisclaimer>
        <div
          className="dg-auth-organization-login"
          data-testid="organization-login"
          data-hydrated={isHydrated}
        >
          <Card>
            {/* Logo — links to apex landing page */}
            <a href={apexHref} className="dg-auth-logo-block dg-auth-logo-block--spacious">
              <DubGridLogo size={52} />
              <DubGridWordmark />
            </a>

            {orgLockout ? (
              <div role="alert" data-testid="organization-lockout">
                <p className="dg-auth-org-prefix">{orgName ?? orgSlug}</p>
                <h1 className="dg-auth-heading">{LOCKOUT_COPY[orgLockout].title}</h1>
                <p className="dg-form-hint dg-auth-progress">{LOCKOUT_COPY[orgLockout].body}</p>
              </div>
            ) : (
              <>
                <p className="dg-auth-org-prefix">Sign in to</p>
                <h1 className="dg-auth-heading">{orgName ?? orgSlug}</h1>

                {handoffFailed ? (
                  <p className="dg-form-error" role="alert">
                    We couldn't finish switching organizations. Sign in again.
                  </p>
                ) : null}

                <EmailPasswordForm
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  loading={loading}
                  onSubmit={handleSubmit}
                  submitLabel={ACTION_SIGN_IN}
                  forgotPasswordHref="/forgot-password"
                />
              </>
            )}

            {gridmasterPortalRequired ? (
              <p className="dg-form-hint dg-auth-progress" role="alert">
                This account uses the Gridmaster Portal.{" "}
                <a href={gridmasterPortalHref}>Open portal</a> to sign in and impersonate an
                organization.
              </p>
            ) : null}

            <div className="dg-auth-org-navigation">
              <Button
                type="button"
                onClick={() => {
                  window.location.href = withThemeParam(apexLoginHref(), theme);
                }}
                className="dg-auth-link"
              >
                &larr; Use a different organization
              </Button>
            </div>
          </Card>
        </div>
        {accountDisabled && <AccountDisabledModal onClose={() => setAccountDisabled(false)} />}
      </PageShell>
    </PublicRoute>
  );
}
