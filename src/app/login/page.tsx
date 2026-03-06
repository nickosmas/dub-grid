"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { PublicRoute } from "@/components/RouteGuards";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Redirecting...");
        // loading stays true — PublicRoute handles the redirect once auth state resolves.
        // Safety net: if the redirect hasn't fired within 12 seconds, unblock the user.
        redirectTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          setMessage("Redirect timed out. Please refresh the page and try again.");
        }, 12000);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage(
          "Account created successfully! You can now sign in. Note: You will need an administrator to assign you to an organization before you can view the schedule.",
        );
        setLoading(false); // Only set to false on signup success. On login success, let PublicRoute take over.
      }
    } catch (err: any) {
      setMessage(err.message || "An error occurred");
      setLoading(false);
    }
  }

  return (
    <PublicRoute>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "20px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          background: "var(--color-bg)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "360px",
            padding: "32px",
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              marginBottom: "8px",
              textAlign: "center",
              color: "#0F172A",
            }}
          >
            {isLogin ? "Welcome Back" : "Create Account"}
          </h1>

          {!isLogin ? (
            <p
              style={{
                fontSize: "13px",
                color: "#64748B",
                textAlign: "center",
                marginBottom: "24px",
                lineHeight: 1.4,
                padding: "0 10px",
              }}
            >
              Register your email to accept an organization invite. You must be
              invited by an administrator to access a workspace.
            </p>
          ) : (
            <div style={{ marginBottom: "24px" }} />
          )}

          {message && (
            <div
              style={{
                padding: "12px",
                background: "#FEE2E2",
                color: "#B91C1C",
                borderRadius: "6px",
                fontSize: "14px",
                marginBottom: "16px",
                lineHeight: 1.4,
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
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "6px",
                  color: "#475569",
                }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #CBD5E1",
                  borderRadius: "6px",
                  fontSize: "15px",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "6px",
                  color: "#475569",
                }}
              >
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #CBD5E1",
                  borderRadius: "6px",
                  fontSize: "15px",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "8px",
                width: "100%",
                padding: "12px",
                background: "#0F172A",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? message === "Redirecting..."
                  ? "Redirecting..."
                  : "Please wait..."
                : isLogin
                  ? "Sign In"
                  : "Sign Up"}
            </button>
          </form>

          <div
            style={{
              marginTop: "20px",
              textAlign: "center",
              fontSize: "14px",
              color: "#64748B",
            }}
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "#2563EB",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>

          <div
            style={{ marginTop: "12px", textAlign: "center", fontSize: "13px" }}
          >
            <button
              onClick={() => router.push("/")}
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "#94A3B8",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </PublicRoute>
  );
}
