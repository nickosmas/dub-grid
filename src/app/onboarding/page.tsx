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
        padding: "20px",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "32px",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          <DubGridLogo size={48} />
        </div>

        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "12px",
            color: "#0F172A",
          }}
        >
          Pending Organization Assignment
        </h1>

        <p
          style={{
            fontSize: "15px",
            color: "#475569",
            lineHeight: 1.5,
            marginBottom: "32px",
          }}
        >
          Your account has been successfully created, but you haven't been
          assigned to an organization yet. Please contact your administrator and
          ask them to invite you to their workspace.
        </p>

        <button
          onClick={signOut}
          style={{
            width: "100%",
            padding: "12px",
            background: "#F1F5F9",
            color: "#475569",
            border: "none",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
