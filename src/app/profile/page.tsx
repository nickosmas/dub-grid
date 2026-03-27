"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks";
import { ProtectedRoute } from "@/components/RouteGuards";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/error-handling";
import type { User } from "@supabase/supabase-js";
import { ChevronDown, Pencil, X, Check } from "lucide-react";

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
  gridmaster:  { bg: "var(--color-brand-bg)", text: "var(--color-brand)" },
  super_admin: { bg: "var(--color-success-bg)", text: "var(--color-success-text)" },
  admin:       { bg: "var(--color-info-bg)", text: "var(--color-info)" },
  scheduler:   { bg: "var(--color-info-bg)", text: "var(--color-info)" },
  supervisor:  { bg: "var(--color-info-bg)", text: "var(--color-info)" },
  user:        { bg: "var(--color-bg-secondary)", text: "var(--color-text-muted)" },
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  boxShadow: "var(--shadow-raised)",
  overflow: "hidden",
};

const cardHeaderStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderBottom: "1px solid var(--color-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const cardHeaderLabelStyle: React.CSSProperties = {
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const inputFieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  border: "1.5px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "var(--dg-fs-body-sm)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
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

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password change
  const [securityOpen, setSecurityOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Session management
  const [signingOut, setSigningOut] = useState<"others" | "global" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      setUser(data.session.user);
      const { data: prof } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", data.session.user.id)
        .single();
      if (!cancelled) setProfile(prof ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const firstName = profile?.first_name?.trim() || null;
  const lastName = profile?.last_name?.trim() || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  const initials = name
    ? name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  const roleColor = ROLE_COLORS[role] ?? ROLE_COLORS.user;

  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;

  function startEditingName() {
    setEditFirstName(firstName ?? "");
    setEditLastName(lastName ?? "");
    setEditingName(true);
  }

  async function saveName() {
    if (!user) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editFirstName.trim() || null,
          last_name: editLastName.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      setProfile({
        first_name: editFirstName.trim() || null,
        last_name: editLastName.trim() || null,
      });
      setEditingName(false);
      toast.success("Name updated.");
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "Failed to update name."));
    } finally {
      setSavingName(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Password must be at least 10 characters.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully.");
      setNewPassword("");
      setConfirmNewPassword("");
      setSecurityOpen(false);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "").toLowerCase();
      if (msg.includes("same") || msg.includes("different")) {
        setPasswordError("New password must be different from your current password.");
      } else if (msg.includes("reauthentication") || msg.includes("recently")) {
        setPasswordError("Please sign out and sign in again before changing your password.");
      } else if (msg.includes("weak") || msg.includes("short")) {
        setPasswordError("Password is too weak. Please choose a stronger password.");
      } else {
        toast.error("Failed to update password. Please try again.");
      }
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOutOthers() {
    setSigningOut("others");
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("All other sessions have been signed out.");
    } catch {
      toast.error("Failed to sign out other sessions.");
    } finally {
      setSigningOut(null);
    }
  }

  async function handleSignOutAll() {
    setSigningOut("global");
    try {
      await supabase.auth.signOut({ scope: "global" });
      window.location.replace("/login");
    } catch {
      toast.error("Failed to sign out. Please try again.");
      setSigningOut(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      {/* Minimal top bar */}
      <div style={{
        background: "var(--color-surface)",
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
          onClick={() => window.history.length > 1 ? router.back() : router.push("/schedule")}
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
        <span style={{ color: "var(--color-border)", fontSize: "var(--dg-fs-body)", fontWeight: 300, userSelect: "none" }}>|</span>
        <span style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>Profile</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Avatar + name card */}
          <div style={{
            ...cardStyle,
            padding: "28px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            overflow: "visible",
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "var(--color-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 700,
              color: "var(--color-text-inverse)",
              flexShrink: 0,
            }}>
              {isLoading ? "" : initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {editingName ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder="First name"
                      style={{ ...inputFieldStyle, flex: 1 }}
                      autoFocus
                    />
                    <input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder="Last name"
                      style={{ ...inputFieldStyle, flex: 1 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={saveName}
                      disabled={savingName}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 12px",
                        background: "var(--color-brand)",
                        color: "var(--color-text-inverse)",
                        border: "none",
                        borderRadius: 8,
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        cursor: savingName ? "not-allowed" : "pointer",
                      }}
                    >
                      <Check size={14} />
                      {savingName ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "6px 12px",
                        background: "transparent",
                        color: "var(--color-text-muted)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {name ?? user?.email?.split("@")[0] ?? "—"}
                    </span>
                    <button
                      onClick={startEditingName}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        color: "var(--color-text-subtle)",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                      aria-label="Edit name"
                    >
                      <Pencil size={14} />
                    </button>
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
                </>
              )}
            </div>
          </div>

          {/* Details card */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span style={cardHeaderLabelStyle}>Account details</span>
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

          {/* Security card */}
          <div style={cardStyle}>
            <button
              onClick={() => {
                setSecurityOpen((v) => !v);
                if (!securityOpen) {
                  setPasswordError(null);
                  setNewPassword("");
                  setConfirmNewPassword("");
                }
              }}
              style={{
                ...cardHeaderStyle,
                width: "100%",
                background: "none",
                cursor: "pointer",
                borderBottom: securityOpen ? "1px solid var(--color-border)" : "none",
                fontFamily: "inherit",
              }}
            >
              <span style={cardHeaderLabelStyle}>Security</span>
              <ChevronDown
                size={16}
                style={{
                  color: "var(--color-text-muted)",
                  transition: "transform 150ms ease",
                  transform: securityOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {securityOpen && (
              <div style={{ padding: "20px 24px" }}>
                <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", marginBottom: 16, marginTop: 0 }}>
                  Choose a strong password with at least 10 characters.
                </p>
                <form
                  onSubmit={handlePasswordChange}
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
                      New Password
                    </label>
                    <PasswordInput
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={setNewPassword}
                      showPassword={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      autoComplete="new-password"
                      ariaDescribedBy="password-strength-label"
                      style={inputFieldStyle}
                    />
                    {newPassword.length > 0 && <PasswordStrength password={newPassword} />}
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
                      Confirm New Password
                    </label>
                    <PasswordInput
                      placeholder="Confirm new password"
                      value={confirmNewPassword}
                      onChange={setConfirmNewPassword}
                      showPassword={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      autoComplete="new-password"
                      style={inputFieldStyle}
                    />
                  </div>
                  {passwordError && (
                    <p style={{ color: "var(--color-danger-dark)", fontSize: "var(--dg-fs-body-sm)", margin: 0 }}>
                      {passwordError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={savingPassword || !newPassword || !confirmNewPassword}
                    className="dg-btn dg-btn-primary"
                    style={{ alignSelf: "flex-start", marginTop: 4 }}
                  >
                    <ButtonLoading loading={savingPassword} spinnerColor="var(--color-text-inverse)" spinnerSize={16}>
                      Update Password
                    </ButtonLoading>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Sessions card */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <span style={cardHeaderLabelStyle}>Sessions</span>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", margin: 0 }}>
                Manage your active sessions across devices.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={handleSignOutOthers}
                  disabled={signingOut !== null}
                  className="dg-btn dg-btn-secondary"
                >
                  <ButtonLoading loading={signingOut === "others"} spinnerSize={14}>
                    Sign out other devices
                  </ButtonLoading>
                </button>
                <button
                  onClick={handleSignOutAll}
                  disabled={signingOut !== null}
                  className="dg-btn dg-btn-danger"
                >
                  <ButtonLoading loading={signingOut === "global"} spinnerSize={14}>
                    Sign out everywhere
                  </ButtonLoading>
                </button>
              </div>
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
