"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { PublicRoute } from "@/components/RouteGuards";
import { checkIsSuperAdmin } from "@/lib/db";

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Check super admin status directly — don't rely on AuthProvider context timing
      const isSuper = await checkIsSuperAdmin(data.user.id);
      if (!isSuper) {
        await supabase.auth.signOut();
        setMessage(
          "This account is not a Super Admin. Please use the standard login page.",
        );
        setLoading(false);
        return;
      }

      // Verified — PublicRoute will redirect to /admin once session propagates
      setMessage("Redirecting...");
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
          background: "#0F172A",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "360px",
            padding: "32px",
            background: "#1E293B",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            border: "1px solid #334155",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "24px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="DubGrid" width={48} height={48} />
          </div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 700,
              marginBottom: "24px",
              textAlign: "center",
              color: "#F8FAFC",
            }}
          >
            Super Admin Portal
          </h1>

          {message && (
            <div
              style={{
                padding: "12px",
                background: "#7F1D1D",
                color: "#FECACA",
                borderRadius: "6px",
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
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "6px",
                  color: "#94A3B8",
                }}
              >
                Admin Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  fontSize: "15px",
                  background: "#0F172A",
                  color: "#F8FAFC",
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
                  color: "#94A3B8",
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
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  fontSize: "15px",
                  background: "#0F172A",
                  color: "#F8FAFC",
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
                background: "#2563EB",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "15px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.background = "#1D4ED8";
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.background = "#2563EB";
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
              fontSize: "13px",
              color: "#64748B",
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
                color: "#94A3B8",
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
                color: "#64748B",
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
