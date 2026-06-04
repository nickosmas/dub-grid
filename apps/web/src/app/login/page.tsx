"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { decodeJwt } from "jose";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ACCOUNT_DISABLED_CODE } from "@dubgrid/domain";
import { parseHost, getValidPort, buildSubdomainHost } from "@/lib/subdomain";
import { extractErrorMessage } from "@/lib/error-handling";
import { markAuthTransition } from "@/lib/auth-transition";
import { setUserViewActive } from "@/hooks";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { SubdomainField } from "@/components/auth/SubdomainField";
import Modal from "@/components/Modal";
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = parseHost(window.location.host);
  return parsed.subdomain;
}

/**
 * Surfaces a toast when the middleware redirected back with
 * ?error=session_invalid (JWKS-based jwtVerify failed, e.g. token expired or
 * the JWKS endpoint was unreachable). Runs on both the org and gridmaster
 * login flows.
 */
function useSessionInvalidToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "session_invalid") {
      toast.error("Your session could not be verified. Please sign in again.");
      // Clean the URL so a refresh doesn't re-show the toast
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
}

// ── Account-disabled modal ─────────────────────────────────────────────────
// Shown when /api/auth/login returns 403 with code ACCOUNT_DISABLED — the JWT
// hook refuses terminated employees with a sentinel message that the route
// translates into this structured response. A modal (not a toast) so the user
// has to acknowledge it and there's no ambiguity with the generic 401 toast.

function AccountDisabledModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Account disabled" onClose={onClose} style={{ maxWidth: 400 }}>
      <p
        style={{
          margin: "0 0 20px",
          fontSize: "var(--dg-fs-body-sm)",
          lineHeight: 1.5,
          color: "var(--color-text-secondary)",
        }}
      >
        This account has been disabled by your organization. Please contact your
        administrator if you believe this is a mistake.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="dg-btn dg-btn-primary"
        style={{ width: "100%" }}
      >
        OK
      </button>
    </Modal>
  );
}

// ── Step 1: Domain selector (root domain) ─────────────────────────────────────

function DomainSelector() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  function showToast(msg: string) {
    toast.error(msg, { id: "login-error" });
  }

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // Hidden gridmaster entry — 5 taps on logo within 3s
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = useCallback((e: React.MouseEvent) => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      e.preventDefault();
      tapCountRef.current = 0;
      const gridmasterHost = buildSubdomainHost("gridmaster", parsed!);
      window.location.href = `${window.location.protocol}//${gridmasterHost}/login`;
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 3000);
  }, [parsed]);

  async function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      setError("Please enter your subdomain.");
      return;
    }
    // Reject anything that isn't a valid subdomain rather than silently
    // stripping it — a space or symbol means the user typed the wrong thing.
    if (!/^[a-z0-9-]+$/.test(normalized)) {
      setError("Use letters, numbers, and hyphens only.");
      return;
    }

    setLoading(true);
    setError("");

    let orgName: string | null = null;
    try {
      const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(normalized)}`);
      const { valid, name } = await res.json();
      if (!valid) {
        showToast("No organization found for that subdomain. Please check and try again.");
        setLoading(false);
        return;
      }
      orgName = typeof name === "string" ? name : null;
    } catch {
      showToast("Unable to verify that subdomain. Please try again.");
      setLoading(false);
      return;
    }

    const { protocol, port } = window.location;
    const portStr = getValidPort(port);
    // Forward the resolved name so the org login heading renders it instantly.
    const nameParam = orgName ? `&name=${encodeURIComponent(orgName)}` : "";
    window.location.href = `${protocol}//${normalized}.${baseDomain}${portStr}/login?verified=1${nameParam}`;
  }

  return (
    <PageShell>
      <Card>
        {/* Logo — links to landing page; hidden gridmaster entry on 5 rapid taps */}
        <Link
          href="/"
          onClick={handleLogoTap}
          className="dg-auth-logo-block"
          style={{
            marginBottom: "32px",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </Link>

        <p
          style={{
            textAlign: "center",
            fontSize: "var(--dg-fs-body)",
            color: "var(--color-text-secondary)",
            marginBottom: "28px",
            fontWeight: 500,
          }}
        >
          Enter your organization&apos;s subdomain to sign in.
        </p>

        <form onSubmit={handleContinue}>
          <SubdomainField
            value={slug}
            onChange={(v) => {
              setSlug(v);
              setError("");
            }}
            baseDomain={baseDomain}
            error={error || null}
            autoFocus
            disabled={loading}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <button
              type="submit"
              disabled={loading}
              className="dg-auth-submit"
              style={{
                padding: "12px 28px",
                width: "auto",
                whiteSpace: "nowrap",
                display: "inline-flex",
              }}
            >
              <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={28}>Continue</ButtonLoading>
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="dg-auth-link"
              style={{
                color: "var(--color-text-subtle)",
                fontSize: "var(--dg-fs-body-sm)",
              }}
            >
              Need help finding your subdomain?
            </button>
          </div>
        </form>
      </Card>

      {showHelp && (
        <Modal
          title="How to find your subdomain"
          onClose={() => setShowHelp(false)}
          style={{ maxWidth: 360 }}
        >
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "var(--dg-fs-body-sm)",
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
            }}
          >
            Your organization subdomain is the first part of your URL (e.g.{" "}
            <strong>yourorg</strong>.{baseDomain}). If you don&apos;t know
            it, contact your organization administrator.
          </p>
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="dg-btn dg-btn-primary"
            style={{ width: "100%" }}
          >
            Got it
          </button>
        </Modal>
      )}

    </PageShell>
  );
}

// ── Gridmaster login (gridmaster subdomain) ─────────────────────────────────

function GridmasterLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);

  useSessionInvalidToast();

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const landingUrl = `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      // Use server-side login route for brute-force protection
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(extractErrorMessage(result.error, "Too many login attempts. Please try again later."));
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

      // Refresh the session so the custom_access_token_hook has a chance to
      // bake platform_role=gridmaster into the new JWT before we navigate.
      await refreshBrowserSession();

      // Soft client navigation — keeps the SPA alive (no full-page reload).
      // markAuthTransition() keeps ProtectedRoute from bouncing to /login
      // while the auth context finishes settling after sign-in.
      markAuthTransition();
      router.replace("/dashboard");
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
      router.replace("/dashboard");
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
    return (
      <MFAVerify
        onVerified={handleMFAVerified}
        onCancel={handleMFACancel}
      />
    );
  }

  return (
    <PageShell>
      <Card>
        <a
          href={landingUrl}
          className="dg-auth-logo-block"
        >
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

        <h1 className="dg-auth-heading">
          Platform Admin Sign In
        </h1>

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
            href={`${typeof window !== "undefined" ? window.location.protocol : "https:"}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/login`}
            className="dg-auth-link"
          >
            Back to Standard Login
          </a>
          <a
            href={landingUrl}
            className="dg-auth-link"
          >
            Back to Home
          </a>
        </div>
      </Card>
      {accountDisabled && (
        <AccountDisabledModal onClose={() => setAccountDisabled(false)} />
      )}
    </PageShell>
  );
}

// ── Step 2: Email + password (organization subdomain) ───────────────────────────

function OrgLogin({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();

  // Same-org login → soft nav (smooth, no reload). After an ORG SWITCH → hard
  // nav: a soft nav leaves useOrganizationData's one-time org context pinned to
  // the previous org, which destabilizes the onboarding gate (the orientation
  // wizard flickers/shows twice or is skipped). A full reload resets every
  // org-context source to the switched org.
  function navigateToDashboard(didSwitchOrg: boolean) {
    if (didSwitchOrg) {
      window.location.replace("/dashboard");
    } else {
      router.replace("/dashboard");
    }
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  // Seed from the ?name= param forwarded by the domain selector so the heading
  // renders the real org name on first paint (no "organization" flash). Falls back
  // to the slug for direct visits, then the fetch below corrects it.
  const [orgName, setOrgName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const n = new URLSearchParams(window.location.search).get("name");
    return n && n.trim() ? n : null;
  });

  useSessionInvalidToast();

  // Resolve the authoritative display name for direct visits (no ?name= param)
  // and to correct any stale value. Best-effort; validate-domain is cached.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/validate-domain?slug=${encodeURIComponent(orgSlug)}`)
      .then((r) => r.json())
      .then((d: { name?: string | null }) => {
        if (!cancelled && d?.name) setOrgName(d.name);
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [orgSlug]);

  // Note: we no longer validate the subdomain on mount and redirect mid-read —
  // that yanked users out of the form. DomainSelector validates before
  // redirecting here, and the post-login membership check below catches any
  // mismatch and shows a clear message.

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      // Use server-side login route for brute-force protection
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(extractErrorMessage(result.error, "Too many login attempts. Please try again later."));
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
          toast.error("Invalid email or password. Please try again.");
          setLoading(false);
          return;
        }
        toast.error(extractErrorMessage(result.error, "Unable to sign in. Please try again."));
        setLoading(false);
        return;
      }

      // Check if email is confirmed
      if (!result.user.email_confirmed_at) {
        window.location.replace(`/verify-email?email=${encodeURIComponent(email)}`);
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

      const claims = decodeJwt(result.session.access_token);
      const isGridmaster = claims.platform_role === "gridmaster";
      let didSwitchOrg = false;

      if (!isGridmaster) {
        const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;
        // The org this login lands in: the JWT org when it already matches the
        // subdomain, else the org we reconcile to below.
        let signedInOrgId =
          typeof claims.org_id === "string" ? claims.org_id : null;

        if (userSlug !== orgSlug) {
          // Slug mismatch — check membership
          const { organizations: orgs } = await fetchAccessibleOrganizations();

          if (!orgs) {
            await signOutFromBrowser("local");
            toast.error("Unable to verify organization access. Please try again.");
            setLoading(false);
            return;
          }

          const targetOrg = orgs.find((o) => o.org_slug === orgSlug);

          if (targetOrg) {
            try {
              await switchBrowserOrganization(targetOrg.org_id);
              await refreshBrowserSession();
              signedInOrgId = targetOrg.org_id;
              didSwitchOrg = true;
              // Don't carry a prior session's "view as user" toggle into the
              // org we just switched into (it would silently force read-only).
              setUserViewActive(false);
            } catch {
              await signOutFromBrowser("local");
              toast.error("Failed to switch organization. Please try again.");
              setLoading(false);
              return;
            }
          } else {
            await signOutFromBrowser("local");
            toast.error("Your account is not associated with this organization.");
            setLoading(false);
            return;
          }
        }

        // First super_admin login starts this org's trial. Idempotent + self-gated
        // server-side, so it is safe to call on every login and never blocks it.
        if (signedInOrgId) {
          try {
            await startBrowserTrial(signedInOrgId);
          } catch {
            // Non-fatal: never block sign-in on trial activation.
          }
        }

        // A fresh login means the previous session ended. Wipe any sandbox left
        // over from that session (involuntary logout / browser close that never
        // ran the explicit exit) so stale sandbox data is never resumed.
        // Fire-and-forget: never block or fail sign-in.
        void exitSandbox().catch(() => {});
      }

      markAuthTransition();
      navigateToDashboard(didSwitchOrg);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
        toast.error("Network issue. Please check your connection and try again.");
      } else {
        toast.error("Unable to sign in. Please try again.");
      }
      setLoading(false);
    }
  }

  function handleMFAVerified() {
    // After MFA verification, proceed with the org slug verification and dashboard redirect
    async function proceed() {
      try {
        const session = await getBrowserAuthSession();
        if (!session) {
          toast.error("Session expired. Please sign in again.");
          setMfaRequired(false);
          return;
        }

        const claims = decodeJwt(session.access_token);
        const isGridmaster = claims.platform_role === "gridmaster";
        let didSwitchOrg = false;

        if (!isGridmaster) {
          const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;
          let signedInOrgId =
            typeof claims.org_id === "string" ? claims.org_id : null;
          if (userSlug !== orgSlug) {
            const { organizations: orgs } = await fetchAccessibleOrganizations();
            if (!orgs) {
              await signOutFromBrowser("local");
              toast.error("Unable to verify organization access. Please try again.");
              setMfaRequired(false);
              return;
            }
            const targetOrg = orgs.find((o) => o.org_slug === orgSlug);
            if (targetOrg) {
              try {
                await switchBrowserOrganization(targetOrg.org_id);
                await refreshBrowserSession();
                signedInOrgId = targetOrg.org_id;
                didSwitchOrg = true;
                // Don't carry a prior session's "view as user" toggle into the
                // org we just switched into (it would silently force read-only).
                setUserViewActive(false);
              } catch {
                await signOutFromBrowser("local");
                toast.error("Failed to switch organization.");
                setMfaRequired(false);
                return;
              }
            } else {
              await signOutFromBrowser("local");
              toast.error("Your account is not associated with this organization.");
              setMfaRequired(false);
              return;
            }
          }

          // First super_admin login starts this org's trial (idempotent, self-gated).
          if (signedInOrgId) {
            try {
              await startBrowserTrial(signedInOrgId);
            } catch {
              // Non-fatal: never block sign-in on trial activation.
            }
          }

          // Fresh login = previous session ended. Wipe any leftover sandbox
          // (involuntary logout / browser close) so stale data isn't resumed.
          void exitSandbox().catch(() => {});
        }

        markAuthTransition();
        navigateToDashboard(didSwitchOrg);
      } catch {
        toast.error("Unable to complete sign in. Please try again.");
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

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = parsed?.rootDomain ?? "localhost";

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
    <PageShell>
      <Card>
        {/* Logo — links to apex landing page */}
        <a
          href={`${typeof window !== "undefined" ? window.location.protocol : "https:"}//${baseDomain}${parsed?.port ?? ""}/`}
          className="dg-auth-logo-block"
          style={{ marginBottom: "32px" }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </a>

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
        <h1 className="dg-auth-heading">
          {orgName ?? orgSlug}
        </h1>

        <EmailPasswordForm
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          loading={loading}
          onSubmit={handleSubmit}
          submitLabel="Sign In"
          forgotPasswordHref="/forgot-password"
        />

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const { protocol, port } = window.location;
              const portStr = getValidPort(port);
              const target = `${protocol}//${baseDomain}${portStr}/login`;
              window.location.href = target;
            }}
            className="dg-auth-link"
          >
            &larr; Use a different organization
          </button>
        </div>
      </Card>
      {accountDisabled && (
        <AccountDisabledModal onClose={() => setAccountDisabled(false)} />
      )}
    </PageShell>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const slug = getOrgSlug();
    setOrgSlug(slug);
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — render nothing until client knows the hostname
  if (!mounted) return null;

  return (
    <PublicRoute>
      {orgSlug === "gridmaster" ? (
        <GridmasterLogin />
      ) : orgSlug ? (
        <OrgLogin orgSlug={orgSlug} />
      ) : (
        <DomainSelector />
      )}
    </PublicRoute>
  );
}
