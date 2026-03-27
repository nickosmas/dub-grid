"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PublicRoute } from "@/components/RouteGuards";
import { decodeJwt } from "jose";
import { toast } from "sonner";

import Link from "next/link";
import { parseHost, getValidPort, buildSubdomainHost } from "@/lib/subdomain";
import { extractErrorMessage } from "@/lib/error-handling";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { Eye, EyeOff } from "lucide-react";

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
    toast.error(msg);
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
  }, []);

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
        <a
          href="/"
          onClick={handleLogoTap}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            textDecoration: "none",
          }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </a>

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
              style={{
                background: "var(--color-brand)",
                color: "var(--color-text-inverse)",
                border: "none",
                borderRadius: "999px",
                padding: "12px 28px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.85 : 1,
              }}
            >
              <ButtonLoading loading={loading} spinnerColor="var(--color-text-inverse)" spinnerSize={28}>Continue</ButtonLoading>
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-subtle)",
                fontSize: "var(--dg-fs-body-sm)",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Need help with your subdomain?
            </button>
          </div>
        </form>
      </Card>

      {/* Help popup */}
      {showHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="subdomain-help-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "rgba(0,0,0,0.4)",
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "360px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="subdomain-help-title"
              style={{
                margin: "0 0 12px",
                fontSize: "var(--dg-fs-heading)",
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              How to find your subdomain
            </h2>
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
              style={{
                width: "100%",
                padding: "10px 16px",
                background: "var(--color-brand)",
                color: "var(--color-text-inverse)",
                border: "none",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body-sm)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
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

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const landingUrl = `${typeof window !== "undefined" ? window.location.protocol : "https:"}//${parsed?.rootDomain ?? "localhost"}${parsed?.port ?? ""}/`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      window.location.replace("/dashboard");

      setTimeout(() => {
        setLoading(false);
        toast.error("Navigation timed out. Please try refreshing the page.");
      }, 8000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid email") || msg.includes("invalid credentials")) {
        toast.error("Invalid email or password.");
      } else if (msg.includes("hook") || msg.includes("unexpected") || msg.includes("hook_payload")) {
        toast.error("Something went wrong during sign in. Please try again.");
      } else if (msg.includes("fetch") || msg.includes("network")) {
        toast.error("Network error — please check your connection.");
      } else {
        toast.error("Unable to sign in. Please try again.");
      }
      setLoading(false);
    }
  }

  // Gridmaster login has no Toaster of its own — it's rendered inside PublicRoute
  // which is inside AuthProvider (which has the Toaster).

  return (
    <PageShell footerCenteredOnly>
      <Card>
        <a
          href={landingUrl}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "28px",
            textDecoration: "none",
          }}
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

        <h1
          style={{
            fontSize: "var(--dg-fs-card-title)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          Platform Admin Sign In
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                marginBottom: "6px",
                color: "var(--color-text-secondary)",
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              className="dg-standalone-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1.5px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                marginBottom: "6px",
                color: "var(--color-text-secondary)",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="dg-standalone-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 40px 11px 13px",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "var(--dg-fs-body)",
                  outline: "none",
                  boxSizing: "border-box",
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
              style={{
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-subtle)",
                textDecoration: "underline",
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              padding: "13px",
              background: "var(--color-brand)",
              color: "var(--color-text-inverse)",
              border: "none",
              borderRadius: "999px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: loading ? 0.85 : 1,
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
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-faint)",
              fontSize: "var(--dg-fs-label)",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Back to Standard Login
          </a>
          <a
            href={landingUrl}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-faint)",
              fontSize: "var(--dg-fs-label)",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
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
      // Sign in — the response already includes the session (no extra getSession() needed)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const session = data.session;
      if (session) {
        const claims = decodeJwt(session.access_token);
        const isGridmaster = claims.platform_role === "gridmaster";

        if (!isGridmaster) {
          const userSlug = typeof claims.org_slug === "string" ? claims.org_slug : null;

          if (userSlug !== orgSlug) {
            // Slug mismatch — check membership. If JWT had no slug, the hook may
            // not be configured; fall back to DB via get_my_organizations.
            const { data: orgs, error: rpcError } = await supabase.rpc("get_my_organizations");

            if (rpcError || !orgs) {
              await supabase.auth.signOut({ scope: "local" });
              toast.error("Unable to verify workspace access. Please try again.");
              setLoading(false);
              return;
            }

            const targetOrg = orgs.find((o: any) => o.org_slug === orgSlug);

            if (targetOrg) {
              // Switch org + refresh JWT in parallel-ish (switch must complete first)
              const { error: switchError } = await supabase.rpc("switch_org", {
                target_org_id: targetOrg.org_id,
              });

              if (switchError) {
                await supabase.auth.signOut({ scope: "local" });
                toast.error("Failed to switch workspace. Please try again.");
                setLoading(false);
                return;
              }

              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                await supabase.auth.signOut({ scope: "local" });
                toast.error("Failed to switch workspace. Please sign in again.");
                setLoading(false);
                return;
              }
            } else {
              await supabase.auth.signOut({ scope: "local" });
              toast.error("Your account is not associated with this workspace.");
              setLoading(false);
              return;
            }
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
      if (msg.includes("invalid login") || msg.includes("invalid email") || msg.includes("invalid credentials")) {
        toast.error("Invalid email or password. Please try again.");
      } else if (msg.includes("email not confirmed")) {
        window.location.replace(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      } else if (msg.includes("hook") || msg.includes("unexpected")) {
        toast.error("Something went wrong during sign in. Please try again.");
      } else if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
        toast.error("Network error — please check your connection and try again.");
      } else {
        toast.error("Unable to sign in. Please try again.");
      }
      setLoading(false);
    }
  }

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = parsed?.rootDomain ?? "localhost";

  return (
    <PageShell>
      <Card>
        {/* Logo — links to apex landing page */}
        <a
          href={`${typeof window !== "undefined" ? window.location.protocol : "https:"}//${baseDomain}${parsed?.port ?? ""}/`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "28px",
            textDecoration: "none",
          }}
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

        <h1
          style={{
            fontSize: "var(--dg-fs-card-title)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          Sign in to your workspace
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                marginBottom: "6px",
                color: "var(--color-text-secondary)",
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              className="dg-standalone-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1.5px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                marginBottom: "6px",
                color: "var(--color-text-secondary)",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="dg-standalone-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 40px 11px 13px",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "var(--dg-fs-body)",
                  outline: "none",
                  boxSizing: "border-box",
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
              style={{
                fontSize: "var(--dg-fs-label)",
                color: "var(--color-text-subtle)",
                textDecoration: "underline",
              }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              padding: "13px",
              background: "var(--color-brand)",
              color: "var(--color-text-inverse)",
              border: "none",
              borderRadius: "999px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: loading ? 0.85 : 1,
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
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-faint)",
              fontSize: "var(--dg-fs-label)",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            ← Use a different domain
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
