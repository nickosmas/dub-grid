"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PublicRoute } from "@/components/RouteGuards";
import { parseHost } from "@/lib/subdomain";

import { DubGridLogo, DubGridWordmark } from "@/components/Logo";

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  const [showHelp, setShowHelp] = useState(false);

  // Determine base domain dynamically if not in env
  const envBase = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = envBase || (parsed ? parsed.rootDomain : "localhost");
  const suffix = `.${baseDomain}`;

  function handleContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
    if (!trimmed) {
      setError("Please enter your domain name.");
      return;
    }
    const { protocol, port } = window.location;
    const portStr = port ? `:${port}` : "";
    window.location.href = `${protocol}//${trimmed}.${baseDomain}${portStr}/login`;
  }

  return (
    <PageShell footerCenteredOnly>
      <Card>
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            marginBottom: "32px",
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
              style={{
                background: "#1B3A2D",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                padding: "12px 28px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Continue
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
    </PageShell>
  );
}

// ── Step 2: Email + password (org subdomain) ───────────────────────────────────

function OrgLogin({ orgSlug }: { orgSlug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    try {
      if (!isSignUp) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Navigate immediately — don't wait for AuthProvider's async chain.
        // org membership is enforced server-side (middleware + RLS) and by
        // ProtectedRoute on the /schedule page.
        window.location.replace("/schedule");

        // Safety net: if navigation hasn't happened within 8s (e.g. redirect
        // loop or network issue), reset the button so the user isn't stuck.
        setTimeout(() => {
          setLoading(false);
          setMessage("Navigation timed out. Please try refreshing the page.");
          setIsError(true);
        }, 8000);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage(
          "Account created! You can now sign in. An administrator must assign you to this organization before you can access the schedule.",
        );
        setLoading(false);
      }
    } catch (err: any) {
      setMessage(err.message || "An error occurred");
      setIsError(true);
      setLoading(false);
    }
  }

  const envBase = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  const parsed = typeof window !== "undefined" ? parseHost(window.location.host) : null;
  const baseDomain = envBase || (parsed ? parsed.rootDomain : "localhost");

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

        {/* Org badge */}
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
            {orgSlug}.{baseDomain}
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
          {isSignUp ? "Create an account" : "Sign in to your workspace"}
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
              autoComplete={isSignUp ? "new-password" : "current-password"}
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
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
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
          <div style={{ fontSize: "14px", color: "#6B7280" }}>
            {isSignUp ? "Already have an account? " : "Need an account? "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setMessage("");
                setIsError(false);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#1B3A2D",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const { protocol, port } = window.location;
              const portStr = port ? `:${port}` : "";
              window.location.href = `${protocol}//${baseDomain}${portStr}/login`;
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
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setOrgSlug(getOrgSlug());
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — render nothing until client knows the hostname
  if (!mounted) return null;

  return (
    <PublicRoute>
      {orgSlug ? <OrgLogin orgSlug={orgSlug} /> : <DomainSelector />}
    </PublicRoute>
  );
}
