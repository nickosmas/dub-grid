"use client";
import CustomSelect from "@/components/CustomSelect";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as db from "@/lib/db";
import type { TenantStats } from "@/lib/db";
import type {
  Organization,
  OrganizationUser,
  Employee,
  FocusArea,
  ShiftCode,
  NamedItem,
  IndicatorType,
  AdminPermissions,
  OrganizationRole,
} from "@/types";
import ConfirmDialog from "@/components/ConfirmDialog";
import AdminPermissionsEditor from "@/components/gridmaster/AdminPermissionsEditor";
import { BOX_SHADOW_CARD } from "@/lib/constants";
import AuditLogView from "@/components/gridmaster/AuditLogView";

type Tab = "overview" | "users" | "employees" | "config" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "employees", label: "Employees" },
  { id: "config", label: "Configuration" },
  { id: "activity", label: "Activity" },
];

// ── Shared styles ────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: BOX_SHADOW_CARD,
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border-light)",
  fontWeight: 700,
  fontSize: 14,
  color: "var(--color-text-secondary)",
};

const sectionBodyStyle: React.CSSProperties = { padding: 20 };

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  borderTop: "1px solid var(--color-border-light)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "#FEF3C7", text: "#92400E" },
  admin: { bg: "#DBEAFE", text: "#1E40AF" },
  user: { bg: "var(--color-surface-overlay)", text: "var(--color-text-muted)" },
  gridmaster: { bg: "#F3E8FF", text: "#6B21A8" },
};

function RoleBadge({ role }: { role: string }) {
  const c = roleBadgeColors[role] ?? roleBadgeColors.user;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active"
      ? "var(--color-success)"
      : status === "benched"
        ? "var(--color-warning)"
        : "var(--color-danger)";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ textTransform: "capitalize", color: "var(--color-text-secondary)" }}>{status}</span>
    </span>
  );
}

function shortTz(iana: string | null): string {
  if (!iana) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? iana;
  } catch {
    return iana;
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-subtle)", minWidth: 120, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{value || "—"}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "12px 16px",
        background: "var(--color-bg)",
        borderRadius: 8,
        minWidth: 80,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function OrganizationDetail({
  organization,
  stats,
  onOrgUpdated,
  onImpersonate,
}: {
  organization: Organization;
  stats: TenantStats | undefined;
  onOrgUpdated?: (updated: Organization) => void;
  onImpersonate?: (userId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  // Lazy-loaded data for each tab
  const [users, setUsers] = useState<OrganizationUser[] | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [benchedEmployees, setBenchedEmployees] = useState<Employee[] | null>(null);
  const [terminatedEmployees, setTerminatedEmployees] = useState<Employee[] | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[] | null>(null);
  const [shiftCodes, setShiftCodes] = useState<ShiftCode[] | null>(null);
  const [certifications, setCertifications] = useState<NamedItem[] | null>(null);
  const [orgRoles, setOrgRoles] = useState<NamedItem[] | null>(null);
  const [indicatorTypes, setIndicatorTypes] = useState<IndicatorType[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  // Reset state when organization changes
  useEffect(() => {
    setTab("overview");
    setUsers(null);
    setEmployees(null);
    setBenchedEmployees(null);
    setTerminatedEmployees(null);
    setFocusAreas(null);
    setShiftCodes(null);
    setCertifications(null);
    setOrgRoles(null);
    setIndicatorTypes(null);
    setTabError(null);
  }, [organization.id]);

  // Lazy-load data when tab changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setTabLoading(true);
      setTabError(null);
      try {
        if (tab === "users" && users === null) {
          const data = await db.fetchOrganizationUsers(organization.id);
          if (!cancelled) setUsers(data);
        }
        if (tab === "employees" && employees === null) {
          const [active, benched, terminated] = await Promise.all([
            db.fetchEmployees(organization.id, ["active"]),
            db.fetchEmployees(organization.id, ["benched"]),
            db.fetchEmployees(organization.id, ["terminated"]),
          ]);
          if (!cancelled) {
            setEmployees(active);
            setBenchedEmployees(benched);
            setTerminatedEmployees(terminated);
          }
        }
        if (tab === "config" && focusAreas === null) {
          const [fa, sc, certs, roles, ind] = await Promise.all([
            db.fetchFocusAreas(organization.id, true),
            db.fetchShiftCodes(organization.id, true),
            db.fetchCertifications(organization.id, true),
            db.fetchOrganizationRoles(organization.id, true),
            db.fetchIndicatorTypes(organization.id, true),
          ]);
          if (!cancelled) {
            setFocusAreas(fa);
            setShiftCodes(sc);
            setCertifications(certs);
            setOrgRoles(roles);
            setIndicatorTypes(ind);
          }
        }
      } catch (err: any) {
        if (!cancelled) setTabError(err.message ?? "Failed to load data");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    }

    if (tab !== "overview" && tab !== "activity") load();
    return () => { cancelled = true; };
  }, [tab, organization.id, users, employees, focusAreas]);

  return (
    <div>
      {/* Organization header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {organization.name}
        </h2>
        {organization.slug && (
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-dm-mono), monospace",
              color: "var(--color-text-muted)",
              background: "var(--color-surface-overlay)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {organization.slug}
          </span>
        )}
        {organization.archivedAt && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              textTransform: "uppercase",
            }}
          >
            Archived
          </span>
        )}
      </div>
      {organization.timezone && (
        <div style={{ fontSize: 12, color: "var(--color-text-subtle)", marginBottom: 20 }}>
          {organization.timezone} ({shortTz(organization.timezone)})
        </div>
      )}

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid var(--color-border-light)",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? "2px solid var(--color-text-primary)" : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 120ms ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabError && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {tabError}
        </div>
      )}

      {tabLoading && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!tabLoading && tab === "overview" && (
        <OverviewTab organization={organization} stats={stats} onOrgUpdated={onOrgUpdated} />
      )}
      {!tabLoading && tab === "users" && users && (
        <UsersTab
          users={users}
          orgId={organization.id}
          onUsersChanged={() => setUsers(null)}
          onImpersonate={onImpersonate}
        />
      )}
      {!tabLoading && tab === "employees" && employees && (
        <EmployeesTab active={employees} benched={benchedEmployees ?? []} terminated={terminatedEmployees ?? []} />
      )}
      {!tabLoading && tab === "config" && focusAreas && (
        <ConfigTab
          focusAreas={focusAreas!}
          shiftCodes={shiftCodes!}
          certifications={certifications!}
          orgRoles={orgRoles!}
          indicatorTypes={indicatorTypes!}
          organization={organization}
        />
      )}
      {!tabLoading && tab === "activity" && (
        <AuditLogView orgId={organization.id} title="Organization Activity" />
      )}
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  organization,
  stats,
  onOrgUpdated,
}: {
  organization: Organization;
  stats: TenantStats | undefined;
  onOrgUpdated?: (updated: Organization) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(organization.name);
  const [editAddress, setEditAddress] = useState(organization.address);
  const [editPhone, setEditPhone] = useState(organization.phone);
  const [editTimezone, setEditTimezone] = useState(organization.timezone ?? "");
  const [editFocusAreaLabel, setEditFocusAreaLabel] = useState(organization.focusAreaLabel);
  const [editCertLabel, setEditCertLabel] = useState(organization.certificationLabel);
  const [editRoleLabel, setEditRoleLabel] = useState(organization.roleLabel);
  const [saving, setSaving] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Reset edit state when organization changes
  useEffect(() => {
    setEditing(false);
    setEditName(organization.name);
    setEditAddress(organization.address);
    setEditPhone(organization.phone);
    setEditTimezone(organization.timezone ?? "");
    setEditFocusAreaLabel(organization.focusAreaLabel);
    setEditCertLabel(organization.certificationLabel);
    setEditRoleLabel(organization.roleLabel);
  }, [organization.id, organization.name, organization.address, organization.phone, organization.timezone, organization.focusAreaLabel, organization.certificationLabel, organization.roleLabel]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        name: editName.trim(),
        address: editAddress.trim(),
        phone: editPhone.trim(),
        timezone: editTimezone || null,
        focusAreaLabel: editFocusAreaLabel.trim() || "Focus Areas",
        certificationLabel: editCertLabel.trim() || "Certifications",
        roleLabel: editRoleLabel.trim() || "Roles",
      };
      await db.updateOrganization(updated);
      toast.success("Organization updated");
      setEditing(false);
      onOrgUpdated?.(updated);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      if (organization.archivedAt) {
        await db.restoreOrganization(organization.id);
        toast.success("Organization restored");
        onOrgUpdated?.({ ...organization, archivedAt: null });
      } else {
        await db.archiveOrganization(organization.id);
        toast.success("Organization archived");
        onOrgUpdated?.({ ...organization, archivedAt: new Date().toISOString() });
      }
      setArchiveConfirm(false);
    } catch (err: any) {
      toast.error(err.message ?? "Operation failed");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat label="Users" value={stats?.userCount ?? 0} />
        <MiniStat label="Employees" value={stats?.employeeCount ?? 0} />
      </div>

      {/* Organization info */}
      <div style={sectionStyle}>
        <div style={{ ...sectionHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Organization Details</span>
          {!editing && (
            <button className="dg-btn dg-btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        <div style={sectionBodyStyle}>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input className="dg-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input className="dg-input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input className="dg-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <input className="dg-input" value={editTimezone} onChange={(e) => setEditTimezone(e.target.value)} placeholder="America/New_York" />
              </div>
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 8 }}>
                <button className="dg-btn dg-btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="dg-btn dg-btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <InfoRow label="Name" value={organization.name} />
              <InfoRow label="Slug" value={organization.slug} />
              <InfoRow label="Address" value={organization.address} />
              <InfoRow label="Phone" value={organization.phone} />
              <InfoRow label="Timezone" value={organization.timezone ? `${organization.timezone} (${shortTz(organization.timezone)})` : null} />
              <InfoRow label="Employee count" value={organization.employeeCount?.toString()} />
            </>
          )}
        </div>
      </div>

      {/* Custom labels */}
      <div style={sectionStyle}>
        <div style={{ ...sectionHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Custom Labels</span>
          {editing && <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>Editing above</span>}
        </div>
        <div style={sectionBodyStyle}>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Focus Areas</label>
                <input className="dg-input" value={editFocusAreaLabel} onChange={(e) => setEditFocusAreaLabel(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Certifications</label>
                <input className="dg-input" value={editCertLabel} onChange={(e) => setEditCertLabel(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Roles</label>
                <input className="dg-input" value={editRoleLabel} onChange={(e) => setEditRoleLabel(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <InfoRow label="Focus areas" value={organization.focusAreaLabel} />
              <InfoRow label="Certifications" value={organization.certificationLabel} />
              <InfoRow label="Roles" value={organization.roleLabel} />
            </>
          )}
        </div>
      </div>

      {/* Danger zone: Archive / Restore */}
      <div style={{ ...sectionStyle, borderColor: organization.archivedAt ? "var(--color-warning)" : "var(--color-danger)" }}>
        <div style={{ ...sectionHeaderStyle, borderBottomColor: organization.archivedAt ? "var(--color-warning)" : "var(--color-danger)", color: organization.archivedAt ? "var(--color-warning)" : "var(--color-danger)" }}>
          Danger Zone
        </div>
        <div style={{ ...sectionBodyStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
              {organization.archivedAt ? "Restore this organization" : "Archive this organization"}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {organization.archivedAt
                ? "Restoring will make this organization active again."
                : "Archiving hides the organization from active listings. Data is preserved."}
            </div>
          </div>
          <button
            className={organization.archivedAt ? "dg-btn dg-btn-primary" : "dg-btn dg-btn-danger"}
            onClick={() => setArchiveConfirm(true)}
            style={{ flexShrink: 0 }}
          >
            {organization.archivedAt ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      {archiveConfirm && (
        <ConfirmDialog
          title={organization.archivedAt ? "Restore Organization" : "Archive Organization"}
          message={organization.archivedAt
            ? `Are you sure you want to restore "${organization.name}"?`
            : `Are you sure you want to archive "${organization.name}"? The organization will be hidden from active listings but all data will be preserved.`}
          confirmLabel={organization.archivedAt ? "Restore" : "Archive"}
          variant={organization.archivedAt ? "info" : "danger"}
          isLoading={archiving}
          onConfirm={handleArchive}
          onCancel={() => setArchiveConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({
  users,
  orgId,
  onUsersChanged,
  onImpersonate,
}: {
  users: OrganizationUser[];
  orgId: string;
  onUsersChanged: () => void;
  onImpersonate?: (userId: string) => void;
}) {
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<OrganizationUser | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<OrganizationUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "user">("user");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleRoleChange(userId: string, newRole: OrganizationRole) {
    if (newRole === "super_admin") return; // Handled separately
    setChangingRole(userId);
    try {
      await db.changeOrganizationUserRole(userId, newRole as "admin" | "user");
      toast.success("Role updated");
      onUsersChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change role");
    } finally {
      setChangingRole(null);
    }
  }

  async function handleRemove() {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      await db.removeUserFromOrganization(removeConfirm.id, orgId);
      toast.success("User removed from organization");
      setRemoveConfirm(null);
      onUsersChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove user");
    } finally {
      setRemoving(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      await db.assignOrgRoleByEmail(orgId, addEmail.trim(), addRole);
      toast.success(`User added as ${addRole}`);
      setAddEmail("");
      setShowAddForm(false);
      onUsersChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add user");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
        <div style={{ flex: 1 }} />
        <button className="dg-btn dg-btn-primary" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? (
            "Cancel"
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </>
          )}
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <form onSubmit={handleAddUser} style={{ ...sectionStyle, padding: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Email</label>
              <input
                className="dg-input"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={labelStyle}>Role</label>
              <CustomSelect
                value={addRole}
                options={[
                  { value: "user", label: "User" },
                  { value: "admin", label: "Admin" },
                ]}
                onChange={(v) => setAddRole(v as "admin" | "user")}
                style={{ width: "100%" }}
              />
            </div>
            <button type="submit" className="dg-btn dg-btn-primary" disabled={adding} style={{ fontSize: 12 }}>
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* Users table */}
      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Organization Role</th>
                <th style={thStyle}>Permissions</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)", padding: 32 }}>
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {u.email ?? "—"}
                    </td>
                    <td style={tdStyle}>
                      {u.orgRole === "super_admin" ? (
                        <RoleBadge role={u.orgRole} />
                      ) : (
                        <CustomSelect
                          value={u.orgRole}
                          options={[
                            { value: "user", label: "User" },
                            { value: "admin", label: "Admin" },
                          ]}
                          onChange={(v) => handleRoleChange(u.id, v as OrganizationRole)}
                          disabled={changingRole === u.id}
                          style={{ width: 130 }}
                          fontSize={12}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: "var(--color-text-muted)" }}>
                      {u.orgRole === "admin" ? (
                        <button
                          className="dg-btn dg-btn-ghost"
                          style={{ fontSize: 11, padding: "2px 6px" }}
                          onClick={() => setEditingPerms(u)}
                        >
                          {u.adminPermissions
                            ? formatPermissions(u.adminPermissions)
                            : "Configure"}
                        </button>
                      ) : u.orgRole === "super_admin" ? (
                        "All"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {onImpersonate && u.platformRole !== "gridmaster" && (
                          <button
                            className="dg-btn dg-btn-ghost"
                            style={{ fontSize: 11, padding: "3px 6px" }}
                            onClick={() => onImpersonate(u.id)}
                          >
                            Impersonate
                          </button>
                        )}
                        {u.orgRole !== "super_admin" && (
                          <button
                            className="dg-btn dg-btn-ghost"
                            style={{ fontSize: 11, padding: "3px 6px", color: "var(--color-danger)" }}
                            onClick={() => setRemoveConfirm(u)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions editor modal */}
      {editingPerms && (
        <AdminPermissionsEditor
          userId={editingPerms.id}
          orgId={orgId}
          userName={[editingPerms.firstName, editingPerms.lastName].filter(Boolean).join(" ") || editingPerms.email || "User"}
          currentPermissions={editingPerms.adminPermissions}
          onClose={() => setEditingPerms(null)}
          onSaved={() => onUsersChanged()}
        />
      )}

      {/* Remove confirm */}
      {removeConfirm && (
        <ConfirmDialog
          title="Remove User"
          message={`Remove "${removeConfirm.email ?? removeConfirm.id}" from this organization? They will lose access.`}
          confirmLabel="Remove"
          variant="danger"
          isLoading={removing}
          onConfirm={handleRemove}
          onCancel={() => setRemoveConfirm(null)}
        />
      )}
    </div>
  );
}

function formatPermissions(p: AdminPermissions): string {
  const granted = Object.entries(p)
    .filter(([, v]) => v === true)
    .map(([k]) => k.replace(/^can/, "").replace(/([A-Z])/g, " $1").trim());
  if (granted.length === 0) return "None";
  if (granted.length > 3) return `${granted.length} permissions`;
  return granted.join(", ");
}

// ── Employees tab ────────────────────────────────────────────────────────────

function EmployeesTab({
  active,
  benched,
  terminated,
}: {
  active: Employee[];
  benched: Employee[];
  terminated: Employee[];
}) {
  const [showStatus, setShowStatus] = useState<"active" | "benched" | "terminated">("active");

  const list = showStatus === "active" ? active : showStatus === "benched" ? benched : terminated;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)" }}>
        {([
          { key: "active" as const, label: "Active", count: active.length, color: "var(--color-today-text)" },
          { key: "benched" as const, label: "Benched", count: benched.length, color: "var(--color-warning)" },
          { key: "terminated" as const, label: "Terminated", count: terminated.length, color: "var(--color-danger)" },
        ]).map((tab) => {
          const isActive = showStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setShowStatus(tab.key)}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? tab.color : "var(--color-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: -1,
                fontFamily: "inherit",
                transition: "color 120ms ease, border-color 120ms ease",
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: isActive ? `${tab.color}15` : "var(--color-border-light)",
                  color: isActive ? tab.color : "var(--color-text-faint)",
                  borderRadius: 10,
                  padding: "1px 7px",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Seniority</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Email</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--color-text-muted)", padding: 32 }}>
                    No {showStatus} employees
                  </td>
                </tr>
              ) : (
                list.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{emp.name}</td>
                    <td style={tdStyle}><StatusDot status={emp.status} /></td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{emp.seniority}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)" }}>{emp.phone || "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)" }}>{emp.email || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Configuration tab ────────────────────────────────────────────────────────

function ConfigTab({
  focusAreas,
  shiftCodes,
  certifications,
  orgRoles,
  indicatorTypes,
  organization,
}: {
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  indicatorTypes: IndicatorType[];
  organization: Organization;
}) {
  const activeFocusAreas = focusAreas.filter((fa) => !fa.archivedAt);
  const archivedFocusAreas = focusAreas.filter((fa) => fa.archivedAt);
  const activeShiftCodes = shiftCodes.filter((sc) => !sc.archivedAt);
  const archivedShiftCodes = shiftCodes.filter((sc) => sc.archivedAt);
  const activeCerts = certifications.filter((c) => !c.archivedAt);
  const activeRoles = orgRoles.filter((r) => !r.archivedAt);
  const activeIndicators = indicatorTypes.filter((i) => !i.archivedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Focus Areas */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.focusAreaLabel || "Focus Areas"} ({activeFocusAreas.length})
          {archivedFocusAreas.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>
              +{archivedFocusAreas.length} archived
            </span>
          )}
        </div>
        <div style={sectionBodyStyle}>
          {activeFocusAreas.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None configured</span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeFocusAreas.map((fa) => (
                <span
                  key={fa.id}
                  style={{
                    display: "inline-block",
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: fa.colorBg,
                    color: fa.colorText,
                  }}
                >
                  {fa.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Shift Codes */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Shift Codes ({activeShiftCodes.length})
          {archivedShiftCodes.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>
              +{archivedShiftCodes.length} archived
            </span>
          )}
        </div>
        <div style={{ ...sectionBodyStyle, padding: activeShiftCodes.length > 0 ? 0 : sectionBodyStyle.padding }}>
          {activeShiftCodes.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None configured</span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Code", "Name", "Type", "Times", "Focus Area", "Certifications"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--color-text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid var(--color-border-light)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeShiftCodes.map((sc) => {
                  const faName = focusAreas.find((fa) => fa.id === sc.focusAreaId)?.name;
                  const certNames = (sc.requiredCertificationIds ?? [])
                    .map((cid) => certifications.find((cert) => cert.id === cid)?.name)
                    .filter(Boolean);
                  const hasTime = sc.defaultStartTime || sc.defaultEndTime;
                  return (
                    <tr key={sc.id}>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 32,
                            height: 26,
                            padding: "0 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            background: sc.color,
                            color: sc.text,
                            border: `1.5px solid ${sc.border}`,
                          }}
                        >
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-light)" }}>
                        {sc.name}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, borderBottom: "1px solid var(--color-border-light)" }}>
                        {sc.isOffDay ? (
                          <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Off Day</span>
                        ) : sc.isGeneral ? (
                          <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>General</span>
                        ) : (
                          <span style={{ color: "var(--color-text-subtle)" }}>Shift</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, fontFamily: "var(--font-dm-mono), monospace", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-light)", whiteSpace: "nowrap" }}>
                        {hasTime ? `${sc.defaultStartTime ?? "—"} – ${sc.defaultEndTime ?? "—"}` : "—"}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, color: faName ? "var(--color-text-secondary)" : "var(--color-text-subtle)", fontWeight: faName ? 600 : 400, borderBottom: "1px solid var(--color-border-light)" }}>
                        {faName ?? "Global"}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border-light)" }}>
                        {certNames.length > 0 ? certNames.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Certifications */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.certificationLabel || "Certifications"} ({activeCerts.length})
        </div>
        <div style={sectionBodyStyle}>
          {activeCerts.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None configured</span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeCerts.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--color-surface-overlay)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {c.abbr ? `${c.abbr} — ${c.name}` : c.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Roles */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          {organization.roleLabel || "Roles"} ({activeRoles.length})
        </div>
        <div style={sectionBodyStyle}>
          {activeRoles.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None configured</span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeRoles.map((r) => (
                <span
                  key={r.id}
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--color-surface-overlay)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {r.abbr ? `${r.abbr} — ${r.name}` : r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Indicator Types */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          Indicator Types ({activeIndicators.length})
        </div>
        <div style={sectionBodyStyle}>
          {activeIndicators.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None configured</span>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeIndicators.map((ind) => (
                <span
                  key={ind.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--color-surface-overlay)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ind.color, flexShrink: 0 }} />
                  {ind.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
