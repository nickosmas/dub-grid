"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Organization } from "@/types";
import {
  fetchAllOrganizationsAsSuperAdmin,
  createOrganizationAsSuperAdmin,
  assignOrgAdminByEmail,
  fetchSuperAdminProfile,
  updateSuperAdminProfile,
  SuperAdminProfile,
} from "@/lib/db";
import {
  LayoutDashboard,
  User,
  Building2,
  Plus,
  ArrowRight,
  X,
} from "lucide-react";
import { ProtectedRoute } from "@/components/RouteGuards";

// ── Types ────────────────────────────────────────────────────────────────────

type ActiveSection = "dashboard" | "profile" | "organizations";

// ── Shared Styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1.5px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  background: "#fff",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 6,
};

// ── Section Card ─────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-border-light)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--color-text-secondary)",
        }}
      >
        {title}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: {
  id: ActiveSection;
  label: string;
  Icon: typeof LayoutDashboard;
}[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "profile", label: "Profile", Icon: User },
  { id: "organizations", label: "Organizations", Icon: Building2 },
];

function Sidebar({
  activeSection,
  onSectionChange,
  email,
}: {
  activeSection: ActiveSection;
  onSectionChange: (s: ActiveSection) => void;
  email?: string;
}) {
  return (
    <div
      style={{
        width: 240,
        minWidth: 240,
        background: "#0F172A",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #1E293B",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 20px 28px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.svg"
          alt="DubGrid"
          width={32}
          height={32}
          style={{ flexShrink: 0 }}
        />
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#F8FAFC",
              letterSpacing: "-0.3px",
            }}
          >
            DubGrid
          </div>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 500 }}>
            Super Admin
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "0 12px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 8px 8px",
          }}
        >
          Menu
        </div>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                marginBottom: 2,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                background: active ? "rgba(56, 189, 248, 0.1)" : "transparent",
                color: active ? "#38BDF8" : "#94A3B8",
                transition: "all 0.15s",
              }}
              onMouseOver={(e) => {
                if (!active)
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseOut={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* User Info */}
      {email && (
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid #1E293B",
            fontSize: 12,
            color: "#64748B",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {email}
        </div>
      )}
    </div>
  );
}

// ── Dashboard View ───────────────────────────────────────────────────────────

function DashboardView({
  profile,
  orgs,
  onNavigate,
}: {
  profile: SuperAdminProfile | null;
  orgs: Organization[];
  onNavigate: (s: ActiveSection) => void;
}) {
  const displayName = profile?.first_name
    ? `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`
    : "Admin";

  return (
    <div style={{ maxWidth: 800 }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 4,
        }}
      >
        Welcome back, {displayName}
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "var(--color-text-muted)",
          marginBottom: 32,
        }}
      >
        Here&apos;s an overview of your DubGrid platform.
      </p>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            TOTAL ORGANIZATIONS
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {orgs.length}
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            YOUR ROLE
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Super Admin
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            ACCOUNT EMAIL
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {profile?.email || "—"}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <Section title="Quick Actions">
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => onNavigate("organizations")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              background: "var(--color-accent-gradient)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Building2 size={16} />
            View Organizations
            <ArrowRight size={14} />
          </button>
          <button
            onClick={() => onNavigate("profile")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              background: "#fff",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <User size={16} />
            Edit Profile
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Profile View ─────────────────────────────────────────────────────────────

function ProfileView({
  profile,
  firstName,
  lastName,
  profileEmail,
  savingProfile,
  message,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onSubmit,
}: {
  profile: SuperAdminProfile | null;
  firstName: string;
  lastName: string;
  profileEmail: string;
  savingProfile: boolean;
  message: { text: string; type: "success" | "error" } | null;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 4,
        }}
      >
        My Profile
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "var(--color-text-muted)",
          marginBottom: 32,
        }}
      >
        Manage your super admin account information.
      </p>

      <Section title="Profile Information">
        <form onSubmit={onSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label style={labelStyle}>FIRST NAME</label>
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => onFirstNameChange(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>LAST NAME</label>
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => onLastNameChange(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>EMAIL ADDRESS</label>
            <input
              type="email"
              placeholder="Email"
              required
              value={profileEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile || !profileEmail.trim()}
            style={{
              padding: "10px 24px",
              background: "var(--color-text-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: savingProfile ? "not-allowed" : "pointer",
              opacity: savingProfile ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {savingProfile ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </Section>

      {profile && (
        <div style={{ marginTop: 24 }}>
          <Section title="Account Details">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: 2 }}>USER ID</div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-dm-mono), monospace",
                  }}
                >
                  {profile.user_id}
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Organizations View ───────────────────────────────────────────────────────

function OrganizationsView({
  orgs,
  newOrgName,
  creating,
  selectedOrgId,
  adminEmail,
  assigningLoading,
  onNewOrgNameChange,
  onCreateOrg,
  onSelectOrg,
  onAdminEmailChange,
  onAssignAdmin,
  onCancelAssign,
}: {
  orgs: Organization[];
  newOrgName: string;
  creating: boolean;
  selectedOrgId: string | null;
  adminEmail: string;
  assigningLoading: boolean;
  onNewOrgNameChange: (v: string) => void;
  onCreateOrg: (e: React.FormEvent) => void;
  onSelectOrg: (id: string) => void;
  onAdminEmailChange: (v: string) => void;
  onAssignAdmin: (e: React.FormEvent) => void;
  onCancelAssign: () => void;
}) {
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: 4,
            }}
          >
            Organizations
          </h1>
          <p style={{ fontSize: 15, color: "var(--color-text-muted)" }}>
            Manage all organizations on the platform.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Organizations List */}
        <Section title={`All Organizations (${orgs.length})`}>
          {orgs.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 14,
              }}
            >
              No organizations yet. Create one to get started.
            </div>
          ) : (
            <div style={{ margin: -20, marginTop: -20 }}>
              {orgs.map((org, index) => (
                <div
                  key={org.id}
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop:
                      index === 0
                        ? "none"
                        : "1px solid var(--color-border-light)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginBottom: 3,
                      }}
                    >
                      {org.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                        fontFamily: "var(--font-dm-mono), monospace",
                      }}
                    >
                      {org.id}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectOrg(org.id)}
                    style={{
                      background:
                        selectedOrgId === org.id
                          ? "#DBEAFE"
                          : "var(--color-bg)",
                      border: `1px solid ${selectedOrgId === org.id ? "#BFDBFE" : "var(--color-border)"}`,
                      color:
                        selectedOrgId === org.id
                          ? "#1D4ED8"
                          : "var(--color-text-muted)",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Assign Admin
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Action Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Create Org */}
          <Section title="Create Organization">
            <form onSubmit={onCreateOrg}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>ORGANIZATION NAME</label>
                <input
                  type="text"
                  placeholder="Enter organization name"
                  required
                  value={newOrgName}
                  onChange={(e) => onNewOrgNameChange(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={creating || !newOrgName.trim()}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px",
                  background: "var(--color-text-primary)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
              >
                <Plus size={16} />
                {creating ? "Creating..." : "Create Organization"}
              </button>
            </form>
          </Section>

          {/* Assign Admin */}
          {selectedOrgId && (
            <div
              style={{
                background: "#F0FDF4",
                borderRadius: 12,
                border: "1px solid #BBF7D0",
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #BBF7D0",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#166534",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Assign Admin to {selectedOrg?.name}</span>
                <button
                  onClick={onCancelAssign}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#166534",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ padding: 20 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: "#15803D",
                    marginBottom: 16,
                    lineHeight: 1.5,
                  }}
                >
                  The user must already have an account created via the standard
                  login page.
                </p>
                <form onSubmit={onAssignAdmin}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...labelStyle, color: "#15803D" }}>
                      USER EMAIL
                    </label>
                    <input
                      type="email"
                      placeholder="admin@example.com"
                      required
                      value={adminEmail}
                      onChange={(e) => onAdminEmailChange(e.target.value)}
                      style={{
                        ...inputStyle,
                        borderColor: "#86EFAC",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={onCancelAssign}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "transparent",
                        color: "#166534",
                        border: "1px solid #86EFAC",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={assigningLoading || !adminEmail.trim()}
                      style={{
                        flex: 1,
                        padding: "10px",
                        background: "#166534",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: assigningLoading ? "not-allowed" : "pointer",
                        opacity: assigningLoading ? 0.7 : 1,
                        fontFamily: "inherit",
                      }}
                    >
                      {assigningLoading ? "Assigning..." : "Assign Admin"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function SuperAdminContent() {
  const { user, isSuperAdmin, isLoading: isAuthLoading, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] =
    useState<ActiveSection>("dashboard");
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  // Profile Form State
  const [profile, setProfile] = useState<SuperAdminProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Selected Org for adding an admin
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [assigningLoading, setAssigningLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (isAuthLoading || !user || !isSuperAdmin) return;

    let mounted = true;
    async function load() {
      try {
        const [orgData, profileData] = await Promise.all([
          fetchAllOrganizationsAsSuperAdmin(),
          fetchSuperAdminProfile(),
        ]);
        if (mounted) {
          setOrgs(orgData);
          setProfile(profileData);
          setFirstName(profileData.first_name || "");
          setLastName(profileData.last_name || "");
          setProfileEmail(profileData.email || "");
        }
      } catch (err: any) {
        // Ignore "Unauthorized" — expected when the session expires or the user
        // signs out while the fetch is already in-flight.
        if (err?.message !== "Unauthorized") {
          console.error("Failed to load data", err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    return () => {
      mounted = false;
    };
  }, [user, isSuperAdmin, isAuthLoading]);

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    try {
      await updateSuperAdminProfile({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: profileEmail.trim(),
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              email: profileEmail.trim(),
            }
          : prev,
      );
      setMessage({ text: "Profile updated successfully!", type: "success" });
    } catch (err: any) {
      setMessage({
        text: err.message || "Failed to update profile",
        type: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const org = await createOrganizationAsSuperAdmin(newOrgName.trim());
      setOrgs([org, ...orgs]);
      setNewOrgName("");
      setMessage({
        text: `Created organization: ${org.name}`,
        type: "success",
      });
    } catch (err: any) {
      setMessage({
        text: err.message || "Failed to create organization",
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleAssignAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrgId || !adminEmail.trim()) return;
    setAssigningLoading(true);
    setMessage(null);
    try {
      await assignOrgAdminByEmail(selectedOrgId, adminEmail.trim());
      const targetOrg = orgs.find((o) => o.id === selectedOrgId);
      setMessage({
        text: `Successfully assigned ${adminEmail} as admin for ${targetOrg?.name}`,
        type: "success",
      });
      setSelectedOrgId(null);
      setAdminEmail("");
    } catch (err: any) {
      setMessage({
        text: err.message || "Failed to assign admin",
        type: "error",
      });
    } finally {
      setAssigningLoading(false);
    }
  }

  if (isAuthLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          color: "var(--color-text-muted)",
        }}
      >
        Loading Super Admin Portal...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      }}
    >
      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        email={profile?.email || user?.email}
      />

      {/* Main Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <header
          style={{
            height: 56,
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            borderBottom: "1px solid var(--color-border)",
            background: "#fff",
            gap: 12,
          }}
        >
          <button
            onClick={signOut}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 6,
              fontFamily: "inherit",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.color = "var(--color-text-primary)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.color = "var(--color-text-muted)")
            }
          >
            Sign Out
          </button>
        </header>

        {/* Content */}
        <main
          style={{
            flex: 1,
            padding: "40px 48px",
            background: "var(--color-bg)",
            overflow: "auto",
          }}
        >
          {/* Message Banner */}
          {message && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 24,
                fontSize: 14,
                fontWeight: 500,
                background: message.type === "success" ? "#DCFCE7" : "#FEE2E2",
                color: message.type === "success" ? "#166534" : "#991B1B",
                border: `1px solid ${message.type === "success" ? "#BBF7D0" : "#FECACA"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {message.text}
              <button
                onClick={() => setMessage(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                  color: message.type === "success" ? "#166534" : "#991B1B",
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {activeSection === "dashboard" && (
            <DashboardView
              profile={profile}
              orgs={orgs}
              onNavigate={setActiveSection}
            />
          )}
          {activeSection === "profile" && (
            <ProfileView
              profile={profile}
              firstName={firstName}
              lastName={lastName}
              profileEmail={profileEmail}
              savingProfile={savingProfile}
              message={message}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onEmailChange={setProfileEmail}
              onSubmit={handleUpdateProfile}
            />
          )}
          {activeSection === "organizations" && (
            <OrganizationsView
              orgs={orgs}
              newOrgName={newOrgName}
              creating={creating}
              selectedOrgId={selectedOrgId}
              adminEmail={adminEmail}
              assigningLoading={assigningLoading}
              onNewOrgNameChange={setNewOrgName}
              onCreateOrg={handleCreateOrg}
              onSelectOrg={setSelectedOrgId}
              onAdminEmailChange={setAdminEmail}
              onAssignAdmin={handleAssignAdmin}
              onCancelAssign={() => {
                setSelectedOrgId(null);
                setAdminEmail("");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function SuperAdminPortal() {
  return (
    <ProtectedRoute requireSuperAdmin>
      <SuperAdminContent />
    </ProtectedRoute>
  );
}
