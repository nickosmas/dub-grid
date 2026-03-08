"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";

export default function RootPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGridmaster, setIsGridmaster] = useState(false);

  useEffect(() => {
    // Check if on gridmaster subdomain
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setIsGridmaster(host.startsWith("gridmaster."));
    }

    // Check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/schedule");
      } else {
        setLoading(false);
      }
    };
    checkSession();
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      setLoading(false);
    } else {
      router.replace("/schedule");
    }
  };

  if (loading && !authError) {
    return (
      <div style={styles.page}>
        <div style={styles.spinner} />
        <style>{`
          @keyframes spin { 
            to { transform: rotate(360deg); } 
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <DubGridLogo size={48} />
          <div style={styles.branding}>
            <DubGridWordmark fontSize={28} />
            {isGridmaster && <span style={styles.adminBadge}>GRIDMASTER</span>}
          </div>
        </div>

        <form onSubmit={handleSignIn} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              required
            />
          </div>

          {authError && <div style={styles.error}>{authError}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F8F9FA",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "var(--font-dm-sans), sans-serif",
  },
  card: {
    background: "#FFFFFF",
    padding: "40px",
    borderRadius: "16px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
    width: "100%",
    maxWidth: "400px",
    animation: "fadeIn 0.5s ease-out",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "32px",
    gap: "16px",
  },
  branding: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  },
  adminBadge: {
    fontSize: "10px",
    fontWeight: "800",
    color: "#2563EB",
    background: "#EFF6FF",
    padding: "2px 8px",
    borderRadius: "4px",
    letterSpacing: "0.05em",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #E2E8F0",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  button: {
    padding: "12px",
    borderRadius: "8px",
    background: "#1B3A2D",
    color: "#FFFFFF",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    border: "none",
    transition: "opacity 0.2s",
    marginTop: "10px",
  },
  error: {
    color: "#DC2626",
    fontSize: "13px",
    background: "#FEF2F2",
    padding: "10px",
    borderRadius: "6px",
    textAlign: "center",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid #E2E8F0",
    borderTopColor: "#1B3A2D",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
