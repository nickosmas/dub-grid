"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { checkIsSuperAdmin } from "@/lib/db";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const { user, signOut, isLoading: isAuthLoading } = useAuth();
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => {
    if (isAuthLoading) return;

    if (user) {
      checkIsSuperAdmin(user.id)
        .then((isSuper) => {
          setIsSuper(isSuper);
          if (isSuper) {
            router.replace("/admin");
          } else {
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Failed to check super admin status:", err);
          setLoading(false);
        });
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

  if (isSuper) {
    return null; // Redirecting to /admin
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.svg"
          alt="DubGrid"
          width={48}
          height={48}
          style={{ display: "block", margin: "0 auto 24px" }}
        />

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
