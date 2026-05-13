"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicRoute } from "@/components/RouteGuards";
import { decodeJwt } from "jose";
import { toast } from "sonner";

import Link from "next/link";
import { parseHost, getValidPort, buildSubdomainHost } from "@/lib/subdomain";
import { extractErrorMessage } from "@/lib/error-handling";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import Modal from "@/components/Modal";
import { Eye, EyeOff } from "lucide-react";
import { MFAVerify } from "@/components/profile/MFAVerify";
import {
  fetchAccessibleWorkspaces,
  getBrowserAuthSession,
  refreshBrowserSession,
  setBrowserSession,
  signOutFromBrowser,
  switchBrowserWorkspace,
} from "@/features/account/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = parseHost(window.location.host);
  return parsed.subdomain;
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
  const suffix = `.${baseDomain}`;

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
    const trimmed = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!trimmed) {
      setError("Please enter your domain name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(trimmed)}`);
      const { valid } = await res.json();
      if (!valid) {
        showToast("No workspace found for that domain. Please check and try again.");
        setLoading(false);
        return;
      }
    } catch {
      showToast("Unable to verify domain. Please try again.");
      setLoading(false);
      return;
    }

    const { protocol, port } = window.location;
    const portStr = getValidPort(port);
    window.location.href = `${protocol}//${trimmed}.${baseDomain}${portStr}/login?verified=1`;
  }

  return (
    <PageShell footerCenteredOnly>
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
          Enter your subdomain to log in.
        </p>

        <form onSubmit={handleContinue}>
          {/* Domain input with inline suffix */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: `2px solid ${error ? "var(--color-danger)" : "var(--color-brand)"}`,
              borderRadius: "10px",
              overflow: "hidden",
              marginBottom: error ? "8px" : "24px",
              background: "var(--color-surface)",
            }}
          >
            <input
              type="text"
              autoFocus
              className="dg-standalone-input"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setError("");
              }}
              placeholder="yourorg"
              style={{
                flex: 1,
                padding: "13px 14px 13px 16px",
                border: "none",
                outline: "none",
                fontSize: "var(--dg-fs-body)",
                color: "var(--color-text-primary)",
                background: "transparent",
                minWidth: 0,
              }}
            />
            <span
              style={{
                padding: "13px 16px",
                fontSize: "var(--dg-fs-body)",
                color: "var(--color-text-subtle)",
                background: "var(--color-bg)",
                borderLeft: "1px solid var(--color-border-light)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {suffix}
            </span>
          </div>

          {error && (
            <p
              style={{
                color: "var(--color-danger)",
                fontSize: "var(--dg-fs-label)",
                marginBottom: "16px",
              }}
            >
              {error}
            </p>
          )}

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
              Need help with your subdomain?
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
            Your subdomain is the first part of your workspace URL (e.g.{" "}
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const landingUrl = `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/`;

  // Show an error toast if the middleware redirected back with ?error=session_invalid
  // (happens when JWKS-based jwtVerify fails, e.g. token expired or JWKS endpoint unreachable).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "session_invalid") {
      toast.error("Your session could not be verified. Please sign in again.");
      // Clean the URL so a refresh doesn't re-show the toast
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

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

      window.location.replace("/dashboard");

      setTimeout(() => {
        setLoading(false);
        toast.error("Navigation timed out. Please try refreshing the page.");
      }, 8000);
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

  function handleMFAVerified() {
    // After MFA verification, refresh session and navigate
    refreshBrowserSession().then(() => {
      window.location.replace("/dashboard");
    });
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
    <PageShell footerCenteredOnly>
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

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label className="dg-auth-field-label">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              className="dg-auth-input dg-standalone-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="dg-auth-field-label">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="dg-auth-input dg-standalone-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  padding: "11px 40px 11px 13px",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  color: "var(--color-text-subtle)",
                  fontSize: "var(--dg-fs-body)",
                  lineHeight: 1,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ textAlign: "right", marginTop: "2px" }}>
            <a
              href="/forgot-password"
              className="dg-auth-link"
              style={{
                color: "var(--color-text-subtle)",
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="dg-auth-submit"
            style={{
              marginTop: "4px",
            }}
          >
            <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={28}>Access Portal</ButtonLoading>
          </button>
        </form>

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
    </PageShell>
  );
}

// ── Step 2: Email + password (organization subdomain) ───────────────────────────

function OrgLogin({ orgSlug }: { orgSlug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  // Validate subdomain in the background — never block form render.
  // DomainSelector already validates before redirecting here (?verified=1),
  // and the post-login JWT check catches org mismatches regardless.
  const alreadyVerified = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("verified") === "1";

  useEffect(() => {
    if (alreadyVerified) return;
    let cancelled = false;
    async function validate() {
      try {
        const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(orgSlug)}`);
        const { valid } = await res.json();
        if (!cancelled && !valid) {
          const parsed = parseHost(window.location.host);
          const { protocol } = window.location;
          window.location.replace(`${protocol}//${parsed.rootDomain}${parsed.port}/login`);
        }
      } catch {
        // Network error — allow login attempt; JWT check catches mismatches
      }
    }
    validate();
    return () => { cancelled = true; };
  }, [orgSlug, alreadyVerified]);

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

      if (!isGridmaster) {
        const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;

        if (userSlug !== orgSlug) {
          // Slug mismatch — check membership
          const { organizations: orgs } = await fetchAccessibleWorkspaces();

          if (!orgs) {
            await signOutFromBrowser("local");
            toast.error("Unable to verify workspace access. Please try again.");
            setLoading(false);
            return;
          }

          const targetOrg = orgs.find((o) => o.org_slug === orgSlug);

          if (targetOrg) {
            try {
              await switchBrowserWorkspace(targetOrg.org_id);
              await refreshBrowserSession();
            } catch {
              await signOutFromBrowser("local");
              toast.error("Failed to switch workspace. Please try again.");
              setLoading(false);
              return;
            }
          } else {
            await signOutFromBrowser("local");
            toast.error("Your account is not associated with this workspace.");
            setLoading(false);
            return;
          }
        }
      }

      window.location.replace("/dashboard");

      setTimeout(() => {
        setLoading(false);
        toast.error("Navigation timed out. Please try refreshing the page.");
      }, 8000);
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

        if (!isGridmaster) {
          const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;
          if (userSlug !== orgSlug) {
            const { organizations: orgs } = await fetchAccessibleWorkspaces();
            if (!orgs) {
              await signOutFromBrowser("local");
              toast.error("Unable to verify workspace access. Please try again.");
              setMfaRequired(false);
              return;
            }
            const targetOrg = orgs.find((o) => o.org_slug === orgSlug);
            if (targetOrg) {
              try {
                await switchBrowserWorkspace(targetOrg.org_id);
                await refreshBrowserSession();
              } catch {
                await signOutFromBrowser("local");
                toast.error("Failed to switch workspace.");
                setMfaRequired(false);
                return;
              }
            } else {
              await signOutFromBrowser("local");
              toast.error("Your account is not associated with this workspace.");
              setMfaRequired(false);
              return;
            }
          }
        }

        window.location.replace("/dashboard");
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
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </a>

        {/* Organization badge */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <span
            style={{
              display: "inline-block",
              background: "var(--color-brand-bg)",
              color: "var(--color-brand)",
              border: "1px solid var(--color-brand-border)",
              borderRadius: "999px",
              padding: "4px 14px",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            {orgSlug}.{baseDomain}
          </span>
        </div>

        <h1 className="dg-auth-heading">
          Sign in to your workspace
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label className="dg-auth-field-label">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              className="dg-auth-input dg-standalone-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="dg-auth-field-label">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="dg-auth-input dg-standalone-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  padding: "11px 40px 11px 13px",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  color: "var(--color-text-subtle)",
                  fontSize: "var(--dg-fs-body)",
                  lineHeight: 1,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ textAlign: "right", marginTop: "2px" }}>
            <a
              href="/forgot-password"
              className="dg-auth-link"
              style={{
                color: "var(--color-text-subtle)",
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="dg-auth-submit"
            style={{
              marginTop: "4px",
            }}
          >
            <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={28}>Sign In</ButtonLoading>
          </button>
        </form>

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
            &larr; Use a different domain
          </button>
        </div>
      </Card>
    </PageShell>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const slug = getOrgSlug();
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
