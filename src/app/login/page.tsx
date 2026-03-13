"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PublicRoute } from "@/components/RouteGuards";
import { decodeJwt } from "jose";

import { parseHost } from "@/lib/subdomain";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCompanySlug(): string | null {
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
          fontSize: "13px",
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
    <div
      style={{
        background: "#fff",
        borderRadius: "18px",
        padding: "48px 44px 44px",
        width: "100%",
        maxWidth: "440px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
      }}
    >
      {children}
    </div>
  );
}

// ── Step 1: Domain selector (root domain) ─────────────────────────────────────

function DomainSelector() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 4000);
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
      window.location.href = "/admin/login";
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
    window.location.href = `${protocol}//${trimmed}.${baseDomain}${portStr}/login`;
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
            fontSize: "15px",
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
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setError("");
                if (toast) setToast("");
              }}
              placeholder="yourcompany"
              style={{
                flex: 1,
                padding: "13px 14px 13px 16px",
                border: "none",
                outline: "none",
                fontSize: "15px",
                color: "#111827",
                background: "transparent",
                minWidth: 0,
              }}
            />
            <span
              style={{
                padding: "13px 16px",
                fontSize: "15px",
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
                fontSize: "13px",
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
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              style={{
                background: "none",
                border: "none",
                color: "#6B7280",
                fontSize: "14px",
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
                fontSize: "18px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              How to find your subdomain
            </h2>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "14px",
                lineHeight: 1.5,
                color: "#374151",
              }}
            >
              Your subdomain is the first part of your workspace URL (e.g.{" "}
              <strong>yourcompany</strong>.{baseDomain}). If you don&apos;t know
              it, contact your company administrator.
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
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 20px",
            background: "#1F2937",
            color: "#F9FAFB",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            fontSize: "14px",
            fontWeight: 500,
            lineHeight: 1.4,
            maxWidth: "420px",
            animation: "toast-slide-in 0.3s ease-out",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#EF4444",
              flexShrink: 0,
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            !
          </span>
          <span style={{ flex: 1 }}>{toast}</span>
          <button
            type="button"
            onClick={() => setToast("")}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
              fontSize: "18px",
              cursor: "pointer",
              padding: "0 0 0 4px",
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </PageShell>
  );
}

// ── Gridmaster login (gridmaster subdomain) ─────────────────────────────────

function GridmasterLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      window.location.replace("/admin");

      setTimeout(() => {
        setLoading(false);
        setMessage("Navigation timed out. Please try refreshing the page.");
      }, 8000);
    } catch (err: any) {
      setMessage(err.message || "An error occurred");
      setLoading(false);
    }
  }

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
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#64748B",
            }}
          >
            Gridmaster Portal
          </span>
        </div>

        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#F8FAFC",
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          Platform Admin Sign In
        </h1>

        {message && (
          <div
            style={{
              padding: "12px",
              background: "#7F1D1D",
              color: "#FECACA",
              borderRadius: "8px",
              fontSize: "14px",
              marginBottom: "16px",
              border: "1px solid #991B1B",
            }}
          >
            {message}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "6px",
                color: "#94A3B8",
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "15px",
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
                fontSize: "13px",
                fontWeight: 600,
                marginBottom: "6px",
                color: "#94A3B8",
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "15px",
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
              fontSize: "15px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Authenticating…" : "Access Portal"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Step 2: Email + password (company subdomain) ────────────────────────────────

function CompanyLogin({ companySlug }: { companySlug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [validating, setValidating] = useState(true);

  // Validate subdomain corresponds to a real company on mount
  useEffect(() => {
    let cancelled = false;
    async function validate() {
      try {
        const res = await fetch(`/api/validate-domain?slug=${encodeURIComponent(companySlug)}`);
        const { valid } = await res.json();
        if (!cancelled && !valid) {
          // Redirect to apex login with error hint
          const parsed = parseHost(window.location.host);
          const { protocol } = window.location;
          const portStr = parsed.port || "";
          window.location.replace(`${protocol}//${parsed.rootDomain}${portStr}/login`);
          return;
        }
      } catch {
        // If validation fails (network error), allow login attempt —
        // the post-login JWT check will still catch mismatches
      }
      if (!cancelled) setValidating(false);
    }
    validate();
    return () => { cancelled = true; };
  }, [companySlug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Verify the user belongs to this company's workspace
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const claims = decodeJwt(session.access_token);
        const userSlug = typeof claims.company_slug === "string" ? claims.company_slug : null;
        const isGridmaster = claims.platform_role === "gridmaster";

        if (!isGridmaster && userSlug !== companySlug) {
          await supabase.auth.signOut();
          setMessage("Your account is not associated with this workspace.");
          setIsError(true);
          setLoading(false);
          return;
        }
      }

      // Navigate immediately — don't wait for AuthProvider's async chain.
      window.location.replace("/schedule");

      // Safety net: if navigation hasn't happened within 8s
      setTimeout(() => {
        setLoading(false);
        setMessage("Navigation timed out. Please try refreshing the page.");
        setIsError(true);
      }, 8000);
    } catch (err: any) {
      setMessage(err.message || "An error occurred");
      setIsError(true);
      setLoading(false);
    }
  }

  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = parsed?.rootDomain ?? "localhost";

  // Don't render the form until we've confirmed the subdomain is valid
  if (validating) {
    return (
      <PageShell>
        <Card>
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280", fontSize: "15px" }}>
            Verifying workspace…
          </div>
        </Card>
      </PageShell>
    );
  }

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

        {/* Company badge */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <span
            style={{
              display: "inline-block",
              background: "#F0FDF4",
              color: "#1B3A2D",
              border: "1px solid #BBF7D0",
              borderRadius: "999px",
              padding: "4px 14px",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            {companySlug}.{baseDomain}
          </span>
        </div>

        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#111827",
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          Sign in to your workspace
        </h1>

        {message && (
          <div
            style={{
              padding: "12px 14px",
              background: isError ? "#FEF2F2" : "#F0FDF4",
              color: isError ? "#B91C1C" : "#166534",
              borderRadius: "8px",
              fontSize: "14px",
              marginBottom: "20px",
              lineHeight: 1.5,
            }}
          >
            {message}
          </div>
        )}

        {message && isError && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setMessage("");
                setIsError(false);
                window.location.reload();
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                background: "#fff",
                border: "2px solid #B91C1C",
                borderRadius: "8px",
                color: "#B91C1C",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign out and try again
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1.5px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 13px",
                border: "1.5px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "15px",
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
              fontSize: "15px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Please wait…" : "Sign In"}
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
              console.log("[Login] Redirecting to apex:", target);
              window.location.href = target;
            }}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
              fontSize: "13px",
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
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const slug = getCompanySlug();
    console.log("[Login] Detected company slug:", slug, "host:", typeof window !== "undefined" ? window.location.host : "ssr");
    setCompanySlug(slug);
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — render nothing until client knows the hostname
  if (!mounted) return null;

  return (
    <PublicRoute>
      {companySlug === "gridmaster" ? (
        <GridmasterLogin />
      ) : companySlug ? (
        <CompanyLogin companySlug={companySlug} />
      ) : (
        <DomainSelector />
      )}
    </PublicRoute>
  );
}
