"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks";
import { ProtectedRoute } from "@/components/RouteGuards";
import type { User } from "@supabase/supabase-js";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  scheduler: "Admin",   // legacy
  supervisor: "Admin",  // legacy
  user: "User",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  gridmaster:  { bg: "#EFF6FF", text: "#2563EB" },
  super_admin: { bg: "#F0FDF4", text: "#15803D" },
  admin:       { bg: "#EFF6FF", text: "#3B82F6" },
  scheduler:   { bg: "#EFF6FF", text: "#3B82F6" },
  supervisor:  { bg: "#EFF6FF", text: "#3B82F6" },
  user:        { bg: "var(--color-surface-overlay)", text: "var(--color-text-muted)" },
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--dg-fs-body-sm)", color: value ? "var(--color-text-primary)" : "var(--color-text-subtle)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function ProfilePageContent() {
  const router = useRouter();
  const { role, orgId, isLoading } = usePermissions();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      setUser(data.session.user);
      const { data: prof } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", data.session.user.id)
        .single();
      setProfile(prof ?? null);
    })();
  }, []);

  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  const initials = name
    ? name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  const roleColor = ROLE_COLORS[role] ?? ROLE_COLORS.user;

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      {/* Minimal top bar */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid var(--color-border)",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "var(--shadow-raised)",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-muted)",
            fontFamily: "inherit",
            padding: "4px 0",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span style={{ color: "var(--color-border)", fontSize: 16, fontWeight: 300, userSelect: "none" }}>|</span>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>Profile</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Avatar + name card */}
          <div style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            padding: "28px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            boxShadow: "var(--shadow-raised)",
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "var(--color-accent-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}>
              {isLoading ? "" : initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
                {name ?? user?.email?.split("@")[0] ?? "—"}
              </div>
              <span style={{
                display: "inline-block",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: 20,
                background: roleColor.bg,
                color: roleColor.text,
              }}>
                {ROLE_LABELS[role] ?? "User"}
              </span>
            </div>
          </div>

          {/* Details card */}
          <div style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-raised)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Account details
              </span>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
              <Field label="First name" value={firstName} />
              <Field label="Last name" value={lastName} />
              <Field label="Email" value={user?.email} />
              <Field label="Organization role" value={ROLE_LABELS[role] ?? "User"} />
              {role === "gridmaster" && (
                <Field label="Platform role" value="Gridmaster" />
              )}
              <Field label="Organization ID" value={orgId} />
              <Field label="Member since" value={createdAt} />
              <Field label="Last sign in" value={lastSignIn} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfilePageContent />
    </ProtectedRoute>
  );
}
