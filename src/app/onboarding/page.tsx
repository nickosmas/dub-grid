"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { DubGridLogo } from "@/components/Logo";

export default function OnboardingPage() {
  const { user, signOut, isLoading: isAuthLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    if (isAuthLoading) return;

    if (user) {
      setLoading(false);
    } else {
      router.replace("/login");
    }
  }, [user, isAuthLoading, router]);

  if (isAuthLoading || loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
          <div style={{ 
            padding: "16px", 
            background: "linear-gradient(135deg, #1B3A2D 0%, #2D5A47 100%)", 
            borderRadius: "20px",
            boxShadow: "0 8px 16px rgba(27, 58, 45, 0.2)"
          }}>
            <DubGridLogo size={40} color="#fff" />
          </div>
        </div>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: 800,
            marginBottom: "16px",
            color: "#0F172A",
            letterSpacing: "-0.03em",
          }}
        >
          Pending Organization Assignment
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: "#64748B",
            lineHeight: 1.6,
            marginBottom: "40px",
          }}
        >
          Your account has been successfully created, but you haven&apos;t been
          assigned to an organization yet. Please contact your administrator and
          ask them to invite you to their workspace.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
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
            }}
          >
            I've been invited — refresh
          </button>
          
          <button
            onClick={signOut}
            style={{
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
            }}
          >
            Sign Out
          </button>
        </div>
        
        <div style={{ marginTop: "40px", paddingTop: "24px", borderTop: "1px solid #F1F5F9" }}>
          <p style={{ fontSize: "14px", color: "#94A3B8" }}>
            Setting up a new facility? <br />
            <span style={{ color: "#2563EB", fontWeight: 600, cursor: "pointer" }}>Contact sales</span>
          </p>
        </div>
      </div>
    </div>
  );
}
