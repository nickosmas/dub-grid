"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { DubGridLogo } from "@/components/Logo";
import { acceptInvitation } from "@/lib/db";

type PageState =
  | "loading"
  | "no-token"
  | "needs-auth"
  | "accepting"
  | "success"
  | "error";

export default function AcceptInvitePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Login form state (shown when user is not authenticated)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setState("no-token");
    } else {
      setToken(t);
    }
  }, []);

  // Once auth state is resolved and we have a token, determine next step
  useEffect(() => {
    if (!token || isAuthLoading) return;

    if (!user) {
      setState("needs-auth");
    } else {
      // User is authenticated — attempt to accept
      handleAccept(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, isAuthLoading]);

  async function handleAccept(inviteToken: string) {
    setState("accepting");
    try {
      await acceptInvitation(inviteToken);

      // Sign out so the user re-authenticates with fresh JWT claims
      // containing their new org context
      await supabase.auth.signOut({ scope: "local" });

      setState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to accept invitation";
      setError(message);
      setState("error");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoginError(authError.message);
      setLoginLoading(false);
      return;
    }

    // Auth state change will trigger the useEffect above to call handleAccept
    setLoginLoading(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "48px 40px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          borderRadius: "24px",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
          textAlign: "center",
          border: "1px solid rgba(255, 255, 255, 0.5)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              padding: "16px",
              background:
                "linear-gradient(135deg, #1B3A2D 0%, #2D5A47 100%)",
              borderRadius: "20px",
              boxShadow: "0 8px 16px rgba(27, 58, 45, 0.2)",
            }}
          >
            <DubGridLogo size={40} color="#fff" />
          </div>
        </div>

        {state === "loading" || state === "accepting" ? (
          <LoadingState
            message={
              state === "accepting"
                ? "Accepting invitation..."
                : "Loading..."
            }
          />
        ) : state === "no-token" ? (
          <ErrorState
            title="Invalid Link"
            message="This invitation link is missing a token. Please check the link you received and try again."
          />
        ) : state === "needs-auth" ? (
          <LoginForm
            email={email}
            password={password}
            error={loginError}
            loading={loginLoading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
          />
        ) : state === "success" ? (
          <SuccessState />
        ) : state === "error" ? (
          <ErrorState
            title="Invitation Failed"
            message={error ?? "An unexpected error occurred."}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingState({ message }: { message: string }) {
  return (
    <>
      <h1 style={headingStyle}>{message}</h1>
      <p style={subtextStyle}>Please wait while we process your invitation.</p>
    </>
  );
}

function SuccessState() {
  return (
    <>
      <h1 style={headingStyle}>Invitation Accepted</h1>
      <p style={subtextStyle}>
        You have been added to the organization. Please sign in to access your
        new workspace.
      </p>
      <button
        onClick={() => (window.location.href = "/login")}
        style={primaryButtonStyle}
      >
        Sign In
      </button>
    </>
  );
}

function ErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <>
      <h1 style={headingStyle}>{title}</h1>
      <p style={subtextStyle}>{message}</p>
      <button
        onClick={() => (window.location.href = "/login")}
        style={secondaryButtonStyle}
      >
        Go to Login
      </button>
    </>
  );
}

function LoginForm({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <h1 style={headingStyle}>Accept Invitation</h1>
      <p style={subtextStyle}>
        Sign in to accept your organization invitation.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          style={inputStyle}
        />

        {error && (
          <p
            style={{
              color: "#DC2626",
              fontSize: "14px",
              margin: 0,
              textAlign: "left",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...primaryButtonStyle,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign In & Accept"}
        </button>
      </form>
    </>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 800,
  marginBottom: "16px",
  color: "#0F172A",
  letterSpacing: "-0.03em",
};

const subtextStyle: React.CSSProperties = {
  fontSize: "16px",
  color:"#475569",
  lineHeight: 1.6,
  marginBottom: "24px",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "#1B3A2D",
  color: "#fff",
  border: "none",
  borderRadius: "12px",
  fontSize: "16px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 0.15s, box-shadow 0.15s",
  boxShadow: "0 4px 12px rgba(27, 58, 45, 0.15)",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "#F1F5F9",
  color: "#475569",
  border: "none",
  borderRadius: "12px",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.2s",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: "12px",
  fontSize: "15px",
  color: "#0F172A",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
};
