"use client";
import { Search } from "lucide-react";

import { useState, useMemo } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import type { PlatformUser, Organization } from "@/types";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { sectionStyle, ROLE_BADGE_COLORS } from "@/lib/styles";
import { toDarkPillColors } from "@/lib/colors";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { CloseButton } from "@/components/ui/CloseButton";
import { MaybeHint } from "@/components/ui/hint";
import { fetchGridmasterUsers, type GridmasterPersonTarget } from "@/features/gridmaster/client";
import { queryKeys } from "@/lib/query-keys";
import { gmHeaderStyle, gmTableStyle, gmTdStyle } from "@/components/gridmaster/table-styles";
import GridmasterPersonView from "@/components/gridmaster/person/GridmasterPersonView";
import type { OrganizationDetailTab } from "@/components/gridmaster/OrganizationDetail";

function RoleBadge({ role }: { role: string }) {
  const { resolvedTheme } = useTheme();
  const c0 = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
  // Only the "gridmaster" entry is a literal hex triple (others are already
  // var(--color-*) tokens, which toDarkPillColors can't parse as hex).
  const isDarkTheme = resolvedTheme === "dark";
  const c =
    isDarkTheme && c0.bg.startsWith("#")
      ? { bg: toDarkPillColors(c0.bg).bg, text: toDarkPillColors(c0.bg).text, border: c0.border }
      : c0;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {formatOrganizationRoleLabel(role)}
    </span>
  );
}

function StatusBadge({
  deactivatedAt,
  terminatedAt,
}: {
  deactivatedAt: string | null | undefined;
  terminatedAt?: string | null;
}) {
  if (!deactivatedAt && !terminatedAt) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
        background: "var(--dg-color-danger-bg)",
        color: "var(--dg-color-danger)",
        textTransform: "uppercase",
        marginLeft: 4,
      }}
    >
      {terminatedAt ? "Terminated" : "Deactivated"}
    </span>
  );
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export default function AllUsersView({
  organizations,
  onNavigateToOrg,
  onImpersonate,
}: {
  organizations: Organization[];
  onNavigateToOrg: (orgId: string, tab?: OrganizationDetailTab) => void;
  onImpersonate: (userId: string, orgId?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [openPerson, setOpenPerson] = useState<GridmasterPersonTarget | null>(null);
  const usersQuery = useQuery({
    queryKey: queryKeys.gridmaster.allUsers(),
    queryFn: fetchGridmasterUsers,
    staleTime: 30_000,
  });
  const users = usersQuery.data?.users ?? [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (u.platformRole === "gridmaster") return false;
      if (q && !(u.email ?? "").toLowerCase().includes(q)) return false;
      if (roleFilter !== "all") {
        if (u.orgRole !== roleFilter) return false;
      }
      if (orgFilter !== "all" && u.orgId !== orgFilter) return false;
      if (statusFilter === "active" && (u.deactivatedAt || u.terminatedAt)) return false;
      if (statusFilter === "deactivated" && !u.deactivatedAt) return false;
      if (statusFilter === "terminated" && !u.terminatedAt) return false;
      if (statusFilter === "inactive" && u.lastSignInAt) return false;
      return true;
    });
  }, [users, search, roleFilter, orgFilter, statusFilter]);

  if (openPerson) {
    return (
      <GridmasterPersonView
        target={openPerson}
        onBack={() => setOpenPerson(null)}
        onImpersonate={onImpersonate}
        onOpenOrganization={(orgId) => onNavigateToOrg(orgId, "employees")}
      />
    );
  }

  if (usersQuery.isLoading) {
    return (
      <div>
        <div className="dg-skeleton dg-skeleton--heading" style={{ marginBottom: 16 }} />
        <div style={sectionStyle}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "12px 14px",
                borderBottom: "1px solid var(--dg-color-border-light)",
              }}
            >
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "25%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "18%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "10%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "10%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "13%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        All Users
      </h2>

      {usersQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(
            usersQuery.error,
            "We couldn't load users. Refresh and try again.",
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: "var(--dg-type-field-title-size)",
              fontWeight: "var(--dg-type-field-title-weight)",
              color: "var(--dg-type-field-title-color)",
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          >
            Filter
          </span>
          <CustomSelect
            value={roleFilter}
            options={[
              { value: "all", label: "All Roles" },
              { value: "super_admin", label: "Super Admin" },
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
            ]}
            onChange={setRoleFilter}
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <CustomSelect
            value={orgFilter}
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setOrgFilter}
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          <CustomSelect
            value={statusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "deactivated", label: "Deactivated" },
              { value: "terminated", label: "Terminated" },
              { value: "inactive", label: "Never Logged In" },
            ]}
            onChange={setStatusFilter}
            style={{ flex: "1 1 auto" }}
            fontSize={12}
          />
          {(search || roleFilter !== "all" || orgFilter !== "all" || statusFilter !== "all") && (
            <Button
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setOrgFilter("all");
                setStatusFilter("all");
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--dg-color-today-text)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            aria-live="polite"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            Showing {filtered.length} of {users.length}
          </span>
          <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
            <Search
              size={13}
              strokeWidth={2.5}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--dg-color-text-faint)",
              }}
            />
            <input
              className="dg-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              style={{
                paddingLeft: 32,
                paddingRight: search ? 30 : 12,
                fontSize: "var(--dg-fs-caption)",
                background: "var(--dg-color-surface)",
                border: "1px solid var(--dg-color-border-light)",
              }}
            />
            {search && (
              <CloseButton
                size="sm"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div style={sectionStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={gmTableStyle}>
              <thead>
                <tr>
                  <th style={gmHeaderStyle("Email")}>Email</th>
                  <th style={gmHeaderStyle("Platform role")}>Platform role</th>
                  <th style={gmHeaderStyle("Organization role")}>Organization role</th>
                  <th style={gmHeaderStyle("Organization")}>Organization</th>
                  <th style={gmHeaderStyle("Sessions")}>Sessions</th>
                  <th style={gmHeaderStyle("Mobile")}>Mobile</th>
                  <th style={gmHeaderStyle("Memberships")}>Memberships</th>
                  <th style={gmHeaderStyle("Last login")}>Last login</th>
                  <th style={gmHeaderStyle("Date joined")}>Date joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isDeactivated = !!u.deactivatedAt;
                  return (
                    <tr
                      key={u.id}
                      style={{ opacity: isDeactivated ? 0.6 : 1, cursor: "pointer" }}
                      onClick={() => setOpenPerson({ kind: "user", userId: u.id })}
                    >
                      <td
                        style={{ ...gmTdStyle, fontWeight: 600, fontSize: "var(--dg-fs-caption)" }}
                      >
                        {u.email ?? "—"}
                        <StatusBadge
                          deactivatedAt={u.deactivatedAt as string | null}
                          terminatedAt={u.terminatedAt}
                        />
                      </td>
                      <td style={gmTdStyle}>
                        {u.platformRole !== "none" && <RoleBadge role={u.platformRole} />}
                      </td>
                      <td style={gmTdStyle}>{u.orgRole && <RoleBadge role={u.orgRole} />}</td>
                      <td style={gmTdStyle}>
                        {u.orgName ? (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (u.orgId) onNavigateToOrg(u.orgId);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--dg-color-info)",
                              cursor: "pointer",
                              fontSize: "var(--dg-fs-label)",
                              fontWeight: 500,
                              fontFamily: "inherit",
                              padding: 0,
                              textDecoration: "underline",
                              whiteSpace: "normal",
                              textAlign: "left",
                            }}
                          >
                            {u.orgName}
                          </Button>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.activeSessionCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.mobileDeviceCount ?? 0}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {u.membershipCount ?? (u.orgId ? 1 : 0)}
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        <MaybeHint
                          content={
                            u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"
                          }
                          side="bottom"
                        >
                          <span>{formatRelativeDate(u.lastSignInAt)}</span>
                        </MaybeHint>
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {new Date(u.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          title="No users found"
          description="There are no matching users for these filters."
        />
      )}
    </>
  );
}
