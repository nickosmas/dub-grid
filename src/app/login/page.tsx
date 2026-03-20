"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PublicRoute } from "@/components/RouteGuards";
import { decodeJwt } from "jose";
import { toast } from "sonner";

import { parseHost } from "@/lib/subdomain";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns true only after `delay` ms of `active` being true. Resets immediately when `active` becomes false. */
function useDelayedFlag(active: boolean, delay = 2000): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) { setVisible(false); return; }
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [active, delay]);
  return visible;
}

function getOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = parseHost(window.location.host);
  return parsed.subdomain;
}

// ── Shared layout wrapper ──────────────────────────────────────────────────────

function PageShell({
  children,
  footerCenteredOnly,
}: {
  children: React.ReactNode;
  footerCenteredOnly?: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: "24px 16px",
      }}
    >
      {children}

      {/* Footer */}
      <footer
        style={{
          marginTop: "36px",
          width: "100%",
          maxWidth: "860px",
          display: "flex",
          alignItems: "center",
          justifyContent: footerCenteredOnly ? "center" : "space-between",
          padding: "0 8px",
          fontSize: "var(--dg-fs-label)",
          color: "#9CA3AF",
        }}
      >
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#9CA3AF", textDecoration: "none" }}
          >
            Privacy Policy
          </a>
          <span style={{ margin: "0 4px" }}>·</span>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#9CA3AF", textDecoration: "none" }}
          >
            Terms of Service
          </a>
        </div>
        {!footerCenteredOnly && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <DubGridLogo size={20} />
            <DubGridWordmark fontSize={14} color="#6B7280" />
          </div>
        )}
      </footer>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="dg-auth-card">
      {children}
    </div>
  );
}

// ── Step 1: Domain selector (root domain) ─────────────────────────────────────

function DomainSelector() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showLoadingText = useDelayedFlag(loading);
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
  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      window.location.href = "/gridmaster/login";
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
    const portStr = port ? `:${port}` : "";
    window.location.href = `${protocol}//${trimmed}.${baseDomain}${portStr}/login?verified=1`;
  }

  return (
    <PageShell footerCenteredOnly>
      <Card>
        {/* Logo — hidden gridmaster entry on 5 rapid taps */}
        <div
          onClick={handleLogoTap}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: "var(--dg-fs-body)",
            color: "#374151",
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
              border: `2px solid ${error ? "#EF4444" : "#1B3A2D"}`,
              borderRadius: "10px",
              overflow: "hidden",
              marginBottom: error ? "8px" : "24px",
              background: "#fff",
            }}
          >
            <input
              type="text"
              autoFocus
              className="dg-standalone-input"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setError("");
              }}
              placeholder="yourorg"
              style={{
                flex: 1,
                padding: "13px 14px 13px 16px",
                border: "none",
                outline: "none",
                fontSize: "var(--dg-fs-body)",
                color: "#111827",
                background: "transparent",
                minWidth: 0,
              }}
            />
            <span
              style={{
                padding: "13px 16px",
                fontSize: "var(--dg-fs-body)",
                color: "#6B7280",
                background: "#F9FAFB",
                borderLeft: "1px solid #E5E7EB",
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
                color: "#EF4444",
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
                background: loading ? "#6B7280" : "#1B3A2D",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                padding: "12px 28px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {showLoadingText ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              style={{
                background: "none",
                border: "none",
                color: "#6B7280",
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
              background: "#fff",
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
                color: "#111827",
              }}
            >
              How to find your subdomain
            </h2>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "var(--dg-fs-body-sm)",
                lineHeight: 1.5,
                color: "#374151",
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
                background: "#1B3A2D",
                color: "#fff",
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
  const [loading, setLoading] = useState(false);
  const showLoadingText = useDelayedFlag(loading);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      window.location.replace("/gridmaster");

      setTimeout(() => {
        setLoading(false);
        toast.error("Navigation timed out. Please try refreshing the page.");
      }, 8000);
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? "";
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
    <div
      style={{
        minHeight: "100vh",
        background: "#0F172A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "40px 36px 36px",
          background: "#1E293B",
          borderRadius: "14px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          border: "1px solid #334155",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "28px",
          }}
        >
          <DubGridLogo size={48} color="#F8FAFC" />
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:"#475569",
            }}
          >
            Gridmaster Portal
          </span>
        </div>

        <h1
          style={{
            fontSize: "var(--dg-fs-card-title)",
            fontWeight: 700,
            color: "#F8FAFC",
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
                color:"#64748B",
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
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                background: "#0F172A",
                color: "#F8FAFC",
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
                color:"#64748B",
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="dg-standalone-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                background: "#0F172A",
                color: "#F8FAFC",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              padding: "13px",
              background: loading ? "#475569" : "#2563EB",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {showLoadingText ? "Authenticating…" : "Access Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Step 2: Email + password (organization subdomain) ───────────────────────────

function OrgLogin({ orgSlug }: { orgSlug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const showLoadingText = useDelayedFlag(loading);
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
          const portStr = parsed.port || "";
          window.location.replace(`${protocol}//${parsed.rootDomain}${portStr}/login`);
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

              await supabase.auth.refreshSession();
            } else {
              await supabase.auth.signOut({ scope: "local" });
              toast.error("Your account is not associated with this workspace.");
              setLoading(false);
              return;
            }
          }
        }
      }

      window.location.replace("/schedule");

      setTimeout(() => {
        setLoading(false);
        toast.error("Navigation timed out. Please try refreshing the page.");
      }, 8000);
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? "";
      if (msg.includes("invalid login") || msg.includes("invalid email") || msg.includes("invalid credentials")) {
        toast.error("Invalid email or password. Please try again.");
      } else if (msg.includes("email not confirmed")) {
        toast.error("Your email has not been confirmed. Check your inbox for a confirmation link.");
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
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "28px",
          }}
        >
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </div>

        {/* Organization badge */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <span
            style={{
              display: "inline-block",
              background: "#F0FDF4",
              color: "#1B3A2D",
              border: "1px solid #BBF7D0",
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
            color: "#111827",
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
                color: "#374151",
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
                border: "1.5px solid #D1D5DB",
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
                color: "#374151",
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="dg-standalone-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1.5px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "var(--dg-fs-body)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              width: "100%",
              padding: "13px",
              background: loading ? "#6B7280" : "#1B3A2D",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {showLoadingText ? "Signing in…" : "Sign In"}
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
              const portStr = port ? `:${port}` : "";
              const target = `${protocol}//${baseDomain}${portStr}/login`;
              window.location.href = target;
            }}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
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
