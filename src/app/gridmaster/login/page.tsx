"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { PublicRoute } from "@/components/RouteGuards";

import { DubGridLogo } from "@/components/Logo";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;



      // Navigate directly instead of waiting for PublicRoute to propagate
      window.location.replace("/gridmaster");

      // Safety net: if navigation hasn't happened within 8s, reset
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
    <PublicRoute>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "20px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          background: "var(--color-surface)",
        }}
      >
        <div className="dg-auth-card">
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "24px",
            }}
          >
            <DubGridLogo size={52} />
          </div>
          <h1
            style={{
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 700,
              marginBottom: "24px",
              textAlign: "center",
              color: "var(--color-text-primary)",
            }}
          >
            Gridmaster Portal
          </h1>

          {message && (
            <div
              style={{
                padding: "12px",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger-text)",
                borderRadius: 10,
                fontSize: "14px",
                marginBottom: "16px",
                border: "1px solid var(--color-danger-border)",
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
                  fontSize: "var(--dg-fs-body-sm)",
                  fontWeight: 500,
                  marginBottom: "6px",
                  color: "var(--color-text-muted)",
                }}
              >
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="dg-input"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--dg-fs-body-sm)",
                  fontWeight: 500,
                  marginBottom: "6px",
                  color: "var(--color-text-muted)",
                }}
              >
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="dg-input"
                style={{ width: "100%" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "8px",
                width: "100%",
                padding: "12px",
                background: "var(--color-brand)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 150ms ease",
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.background = "var(--color-brand-light)";
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.background = "var(--color-brand)";
              }}
            >
              {message === "Redirecting..."
                ? "Redirecting..."
                : loading
                  ? "Authenticating..."
                  : "Access Portal"}
            </button>
          </form>

          <div
            style={{
              marginTop: "24px",
              textAlign: "center",
              fontSize: "var(--dg-fs-label)",
              color: "var(--color-text-muted)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => router.push("/login")}
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-subtle)",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Return to Standard Login
            </button>
            <button
              onClick={() => router.push("/")}
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
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
