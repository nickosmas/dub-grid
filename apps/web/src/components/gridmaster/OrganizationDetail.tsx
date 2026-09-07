"use client";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import { StatusDot, InfoRow, MiniStat } from "@/components/gridmaster/organization-detail/shared";
import { ConfigTab } from "./organization-detail/ConfigTab";

import { EmployeesTab } from "./organization-detail/EmployeesTab";

import { UsersTab } from "./organization-detail/UsersTab";

import { OverviewTab } from "./organization-detail/OverviewTab";

import { BillingTab } from "./organization-detail/BillingTab";

import { InvitationsTab } from "./organization-detail/InvitationsTab";

import {
  BillingConfirmDialog,
  ExtendTrialDialog,
  type BillingConfirmAction,
} from "@/components/gridmaster/BillingActionDialogs";
import OrganizationChangeReviewModal from "@/components/organization/OrganizationChangeReviewModal";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";
import { getEmployeeDisplayName } from "@/lib/utils";
import { useEmployeeCount } from "@/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOrganizationAddressFields,
  withComposedOrganizationAddress,
} from "@/lib/organization-profile";
import {
  buildOrganizationSettingsChanges,
  pickOrganizationSettings,
} from "@/lib/organization-settings";
import { formatTimezoneLabel } from "@/lib/timezones";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { resolveShiftPillColors, toDarkPillColors } from "@/lib/colors";
import { toast } from "sonner";
import {
  fetchAbsenceTypes,
  fetchCertifications,
  fetchDepartments,
  fetchFocusAreas,
  fetchIndicatorTypes,
  fetchJobDefinitions,
  fetchOrganizationRoles,
  fetchShiftCategories,
} from "@/features/settings/client";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
  updateOrganizationMembershipGuarded,
  removeOrganizationMembershipGuarded,
  OrganizationAccessConflictError,
  revokeOrganizationInvitationGuarded,
  InvitationAccessConflictError,
} from "@/features/organization/client";
import { fetchEmployees } from "@/features/employees/client";
import { fetchOrganizationUsers } from "@/features/organization/client";
import { queueNotification } from "@/lib/notify";
import type { TenantStats } from "@/features/gridmaster/client";
import { queryKeys } from "@/lib/query-keys";
import type {
  Organization,
  OrganizationUser,
  Employee,
  FocusArea,
  ShiftCategory,
  AbsenceType,
  NamedItem,
  IndicatorType,
  AdminPermissions,
  OrganizationRole,
  JobDefinition,
  GridmasterBillingOrgSummary,
} from "@/types";
import { buildMembershipAccessChanges } from "@/lib/access-management";

/** Raw invitation row from supabase (snake_case columns). */
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionsEditor from "@/components/PermissionsEditor";
import {
  sectionStyle,
  sectionHeaderStyle,
  sectionBodyStyle,
  thStyle,
  tdStyle,
  labelStyle,
} from "@/lib/styles";
import {
  formatBillingStatusLabel,
  formatClientLabel,
  formatClientErrorMessage,
  formatOrganizationRoleLabel,
} from "@/lib/client-facing";
import AuditLogView from "@/components/gridmaster/AuditLogView";
import ReadOnlyScheduleView from "@/components/gridmaster/ReadOnlyScheduleView";
import {
  archiveGridmasterOrganization,
  assignGridmasterOrgRoleByEmail,
  fetchGridmasterBilling,
  fetchGridmasterInvitations,
  fetchGridmasterOrgHealth,
  restoreGridmasterOrganization,
  syncGridmasterBilling,
  suspendGridmasterOrganization,
  unsuspendGridmasterOrganization,
  updateGridmasterSubscription,
} from "@/features/gridmaster/client";

export type OrganizationDetailTab =
  | "overview"
  | "billing"
  | "users"
  | "employees"
  | "config"
  | "activity"
  | "invitations"
  | "schedule";

const TABS: { id: OrganizationDetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "billing", label: "Billing" },
  { id: "users", label: "Users" },
  { id: "employees", label: "Employees" },
  { id: "config", label: "Configuration" },
  { id: "activity", label: "Activity" },
  { id: "invitations", label: "Invitations" },
  { id: "schedule", label: "Schedule" },
];

// A trialing org with no end date hasn't started its trial yet: show "Trial
// pending" (muted) rather than the green "Trial active" the bare status maps to.

// ── Main component ───────────────────────────────────────────────────────────

export default function OrganizationDetail({
  organization,
  stats,
  initialTab,
  onOrgUpdated,
  onImpersonate,
}: {
  organization: Organization;
  stats: TenantStats | undefined;
  initialTab?: OrganizationDetailTab;
  onOrgUpdated?: (updated: Organization) => void;
  onImpersonate?: (userId: string, orgId?: string) => void;
}) {
  const [tab, setTab] = useState<OrganizationDetailTab>(initialTab ?? "overview");
  const queryClient = useQueryClient();

  // Reset state when organization changes
  useEffect(() => {
    setTab(initialTab ?? "overview");
  }, [initialTab, organization.id]);

  const usersQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgUsers(organization.id),
    queryFn: () => fetchOrganizationUsers(organization.id),
    enabled: tab === "users",
    staleTime: 30_000,
  });
  const employeesQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgEmployees(organization.id),
    queryFn: async () => {
      const [active, inactive, removed] = await Promise.all([
        fetchEmployees(organization.id, ["active"]),
        fetchEmployees(organization.id, ["inactive"]),
        fetchEmployees(organization.id, ["removed"]),
      ]);
      return { active, inactive, removed };
    },
    enabled: tab === "employees",
    staleTime: 30_000,
  });
  const invitationsQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgInvitations(organization.id),
    queryFn: async () => {
      const data = await fetchGridmasterInvitations(organization.id);
      return data.invitations ?? [];
    },
    enabled: tab === "invitations",
    staleTime: 30_000,
  });
  const configQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgConfig(organization.id),
    queryFn: async () => {
      const [
        focusAreas,
        shiftCategories,
        jobs,
        certifications,
        orgRoles,
        indicatorTypes,
        absenceTypes,
      ] = await Promise.all([
        fetchFocusAreas(organization.id, true),
        fetchShiftCategories(organization.id, true),
        fetchJobDefinitions(organization.id, true),
        fetchCertifications(organization.id, true),
        fetchOrganizationRoles(organization.id, true),
        fetchIndicatorTypes(organization.id, true),
        fetchAbsenceTypes(organization.id, true),
      ]);
      return {
        focusAreas,
        shiftCategories,
        jobs,
        certifications,
        orgRoles,
        indicatorTypes,
        absenceTypes,
      };
    },
    enabled: tab === "config",
    staleTime: 30_000,
  });
  const orgHealthQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgHealth(organization.id),
    queryFn: async () => {
      const data = await fetchGridmasterOrgHealth({ orgId: organization.id });
      return data.organizations[0] ?? null;
    },
    staleTime: 30_000,
  });

  const activeTabQuery =
    tab === "users"
      ? usersQuery
      : tab === "employees"
        ? employeesQuery
        : tab === "invitations"
          ? invitationsQuery
          : tab === "config"
            ? configQuery
            : null;
  const tabLoading = activeTabQuery?.isLoading ?? false;
  const tabError = activeTabQuery?.error
    ? formatClientErrorMessage(
        activeTabQuery.error,
        "We couldn't load this section. Refresh and try again.",
      )
    : null;

  return (
    <div>
      {/* Organization header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-type-page-title-size)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {organization.name}
        </h2>
        {organization.slug && (
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontFamily: "var(--font-dm-mono), monospace",
              color: "var(--dg-color-text-muted)",
              background: "var(--dg-color-bg-secondary)",
              padding: "2px 8px",
              borderRadius: "var(--dg-radius-xs)",
            }}
          >
            {organization.slug}
          </span>
        )}
        {organization.archivedAt && (
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "var(--dg-radius-xs)",
              background: "var(--dg-color-danger-bg)",
              color: "var(--dg-color-danger)",
              textTransform: "uppercase",
            }}
          >
            Archived
          </span>
        )}
        {organization.suspendedAt && (
          <span
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "var(--dg-radius-xs)",
              background: "var(--dg-color-warning-bg)",
              color: "var(--dg-color-warning)",
              textTransform: "uppercase",
            }}
          >
            Suspended
          </span>
        )}
      </div>
      {organization.timezone && (
        <div
          style={{
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-subtle)",
            marginBottom: 20,
          }}
        >
          {formatTimezoneLabel(organization.timezone)} · {organization.timezone}
        </div>
      )}

      {orgHealthQuery.data && (
        <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <MiniStat label="Oversight" value={orgHealthQuery.data.oversightScore} />
            <MiniStat
              label="Active users 30d"
              value={orgHealthQuery.data.supportSnapshot.activeUsers30d}
            />
            <MiniStat label="Sessions" value={orgHealthQuery.data.supportSnapshot.activeSessions} />
            <MiniStat
              label="Open Requests"
              value={orgHealthQuery.data.supportSnapshot.openShiftRequests}
            />
            <MiniStat
              label="Pending Invites"
              value={orgHealthQuery.data.supportSnapshot.pendingInvitations}
            />
            <MiniStat
              label="Mobile Devices"
              value={orgHealthQuery.data.supportSnapshot.mobileDevices}
            />
          </div>
          <div style={sectionStyle}>
            <div
              style={{
                ...sectionHeaderStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Support Snapshot</span>
              <span
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: orgHealthQuery.data.setup.isComplete
                    ? "var(--dg-color-success)"
                    : "var(--dg-color-warning)",
                }}
              >
                {orgHealthQuery.data.setup.isComplete
                  ? "Setup complete"
                  : `Missing ${orgHealthQuery.data.setup.missing.join(", ")}`}
              </span>
            </div>
            <div
              style={{
                ...sectionBodyStyle,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <InfoRow
                label="Last login"
                value={
                  orgHealthQuery.data.supportSnapshot.lastLoginAt
                    ? new Date(orgHealthQuery.data.supportSnapshot.lastLoginAt).toLocaleString()
                    : "Never"
                }
              />
              <InfoRow
                label="Last publish"
                value={
                  orgHealthQuery.data.supportSnapshot.lastSchedulePublishAt
                    ? new Date(
                        orgHealthQuery.data.supportSnapshot.lastSchedulePublishAt,
                      ).toLocaleString()
                    : "—"
                }
              />
              <InfoRow
                label="Settings change"
                value={
                  orgHealthQuery.data.supportSnapshot.recentSettingsChangeAt
                    ? new Date(
                        orgHealthQuery.data.supportSnapshot.recentSettingsChangeAt,
                      ).toLocaleString()
                    : "—"
                }
              />
              <InfoRow
                label="Cells created 30d"
                value={String(orgHealthQuery.data.supportSnapshot.scheduleCellsCreated30d)}
              />
              <InfoRow
                label="Risk flags"
                value={
                  orgHealthQuery.data.riskFlags.length
                    ? orgHealthQuery.data.riskFlags.map(formatClientLabel).join(", ")
                    : "None"
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Organization sections"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid var(--dg-color-border-light)",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <Button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px",
              fontSize: "var(--dg-fs-label)",
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--dg-color-brand)" : "var(--dg-color-text-muted)",
              background: "transparent",
              border: "none",
              borderBottom:
                tab === t.id ? "2px solid var(--dg-color-brand)" : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 150ms ease",
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tabError && (
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
          {tabError}
        </div>
      )}

      {tabLoading && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Loading…
        </div>
      )}

      {!tabLoading && tab === "overview" && (
        <OverviewTab organization={organization} stats={stats} onOrgUpdated={onOrgUpdated} />
      )}
      {!tabLoading && tab === "billing" && <BillingTab organization={organization} />}
      {!tabLoading && tab === "users" && usersQuery.data && (
        <UsersTab
          users={usersQuery.data ?? []}
          orgId={organization.id}
          onUsersChanged={() => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.gridmaster.orgUsers(organization.id),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.gridmaster.orgAudit(organization.id, 0, 50),
            });
          }}
          onImpersonate={onImpersonate}
        />
      )}
      {!tabLoading && tab === "employees" && employeesQuery.data && (
        <EmployeesTab
          active={employeesQuery.data.active}
          inactive={employeesQuery.data.inactive}
          removed={employeesQuery.data.removed}
        />
      )}
      {!tabLoading && tab === "config" && configQuery.data && (
        <ConfigTab
          focusAreas={configQuery.data.focusAreas}
          shiftCategories={configQuery.data.shiftCategories}
          jobs={configQuery.data.jobs}
          absenceTypes={configQuery.data.absenceTypes}
          certifications={configQuery.data.certifications}
          orgRoles={configQuery.data.orgRoles}
          indicatorTypes={configQuery.data.indicatorTypes}
          organization={organization}
        />
      )}
      {!tabLoading && tab === "activity" && (
        <AuditLogView
          orgId={organization.id}
          title="Organization Activity"
          timeZone={organization.timezone ?? null}
        />
      )}
      {!tabLoading && tab === "invitations" && invitationsQuery.data && (
        <InvitationsTab
          invitations={invitationsQuery.data}
          orgId={organization.id}
          onRefresh={() => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.gridmaster.orgInvitations(organization.id),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.gridmaster.orgAudit(organization.id, 0, 50),
            });
          }}
        />
      )}
      {!tabLoading && tab === "schedule" && (
        <ReadOnlyScheduleView
          orgId={organization.id}
          payPeriodStartDate={organization.payPeriodStartDate}
        />
      )}
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

// ── Users tab ────────────────────────────────────────────────────────────────

// ── Employees tab ────────────────────────────────────────────────────────────

// ── Configuration tab ────────────────────────────────────────────────────────

// ── Invitations tab ─────────────────────────────────────────────────────────
