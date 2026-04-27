"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Organization, FocusArea, ShiftCategory, IndicatorType, NamedItem, Department, CoverageRequirement, AbsenceType, JobDefinition } from "@/types";
import { saveCertifications, saveOrganizationRoles, checkCertificationDependencies, checkRoleDependencies } from "@/lib/db";
import { toast } from "sonner";
import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import ImpersonationPanel from "@/components/ImpersonationPanel";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { PreviewFrame } from "@/components/ui/explainer-section";

import { type SectionId, resolveSection, buildNavGroups, getDefaultSection, getMaxWidth, type NavPermissions } from "./nav-config";
import { SectionCard } from "./shared";
import OrganizationGeneral from "./OrganizationGeneral";
import OrganizationLabels from "./OrganizationLabels";
import DisplayMode from "./DisplayMode";
import ScheduleRules from "./ScheduleRules";
import ShiftCategories from "./ShiftCategories";
import Jobs from "./Jobs";
import AbsenceTypes from "./AbsenceTypes";
import Coverage from "./Coverage";
import StringListSettings from "./StringListSettings";
import DepartmentsSettings from "./DepartmentsSettings";
import Indicators from "./Indicators";

// ── Props ────────────────────────────────────────────────────────────────────
export interface SettingsPageProps {
  organization: Organization;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  onOrganizationSave: (organization: Organization) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  onShiftCategoriesChange: (categories: ShiftCategory[]) => void;
  onJobsChange: (jobs: JobDefinition[]) => void;
  onIndicatorTypesChange: (types: IndicatorType[]) => void;
  onCertificationsChange: (items: NamedItem[]) => void;
  onOrgRolesChange: (items: NamedItem[]) => void;
  onDepartmentsChange: (items: Department[]) => void;
  canManageOrg: boolean;
  canAccessSettings: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canViewOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canViewFocusAreas: boolean;
  canManageScheduleDefinitions: boolean;
  canViewScheduleDefinitions: boolean;
  canManageIndicatorTypes: boolean;
  canViewIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canManageCoverageRequirements: boolean;
  canViewCoverageRequirements: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage({
  organization,
  focusAreas,
  shiftCategories,
  jobs,
  indicatorTypes,
  certifications,
  orgRoles,
  departments,
  onOrganizationSave,
  onFocusAreasChange,
  onShiftCategoriesChange,
  onJobsChange,
  onIndicatorTypesChange,
  onCertificationsChange,
  onOrgRolesChange,
  onDepartmentsChange,
  canManageOrg,
  canAccessSettings,
  isSuperAdmin,
  isGridmaster,
  canManageOrgLabels,
  canViewOrgLabels,
  canManageFocusAreas,
  canViewFocusAreas,
  canManageScheduleDefinitions,
  canViewScheduleDefinitions,
  canManageIndicatorTypes,
  canViewIndicatorTypes,
  canManageOrgSettings,
  coverageRequirements,
  onCoverageRequirementsChange,
  canManageCoverageRequirements,
  canViewCoverageRequirements,
  absenceTypes,
  onAbsenceTypesChange,
}: SettingsPageProps) {
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  const perms: NavPermissions = useMemo(() => ({
    canManageOrg,
    canAccessSettings,
    isSuperAdmin,
    isGridmaster,
    canManageOrgLabels,
    canViewOrgLabels,
    canManageFocusAreas,
    canViewFocusAreas,
    canManageScheduleDefinitions,
    canViewScheduleDefinitions,
    canManageIndicatorTypes,
    canViewIndicatorTypes,
    canManageOrgSettings,
    canManageCoverageRequirements,
    canViewCoverageRequirements,
  }), [canManageOrg, canAccessSettings, isSuperAdmin, isGridmaster, canManageOrgLabels, canViewOrgLabels, canManageFocusAreas, canViewFocusAreas, canManageScheduleDefinitions, canViewScheduleDefinitions, canManageIndicatorTypes, canViewIndicatorTypes, canManageOrgSettings, canManageCoverageRequirements, canViewCoverageRequirements]);

  const focusAreaLabel = organization.focusAreaLabel || "Focus Areas";
  const certificationLabel = organization.certificationLabel || "Certifications";
  const roleLabel = organization.roleLabel || "Roles";
  const departmentLabel = organization.departmentLabel || "Scheduled Departments";
  const certificationsExplainer = {
    title: `How ${certificationLabel.toLowerCase()} work`,
    defaultOpen: true,
    storageKey: "dg-explainer-certifications",
    points: [
      {
        title: "These show on staff and schedule surfaces",
        description: `${certificationLabel} help people quickly see qualifications in schedule and staffing views.`,
      },
      {
        title: "Jobs and shifts can require them",
        description: `When a shift requires a ${certificationLabel.replace(/s$/i, "").toLowerCase()}, only qualified staff can be assigned to that shift.`,
      },
      {
        title: "Use them for true qualifications",
        description: `Reserve ${certificationLabel.toLowerCase()} for real assignment rules. Use ${roleLabel.toLowerCase()} for visible responsibilities that should not block assignment.`,
      },
    ],
    preview: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <PreviewFrame
          title="Visible on the schedule"
          subtitle={`Staff badges and shift requirements`}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-sm)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-light)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
                Jordan Smith
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                Day Shift
              </div>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: "var(--color-brand-bg)",
                border: "1px solid var(--color-brand-border)",
                color: "var(--color-brand)",
              }}
            >
              Level 2
            </span>
          </div>
        </PreviewFrame>

        <PreviewFrame
          title="Assignment gate"
          subtitle="Required qualification on a shift"
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-sm)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-light)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
              Day Shift
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              Requires Level 2
            </div>
            <div style={{ fontSize: 11, color: "var(--color-success-text)" }}>
              Qualified staff can be assigned
            </div>
          </div>
        </PreviewFrame>
      </div>
    ),
  };
  const rolesExplainer = {
    title: `How ${roleLabel.toLowerCase()} work`,
    defaultOpen: true,
    storageKey: "dg-explainer-roles",
    points: [
      {
        title: "Roles can be cosmetic or schedule-eligible",
        description: `Mark only the ${roleLabel.toLowerCase()} that should gate jobs on the schedule. Titles like director can stay visible without affecting job eligibility.`,
      },
      {
        title: "Roles do not grant permissions",
        description: `A ${roleLabel.replace(/s$/i, "").toLowerCase()} tag does not make someone an app admin or change what they can access.`,
      },
      {
        title: "Jobs only use schedule-eligible roles",
        description: `Job eligibility ignores cosmetic ${roleLabel.toLowerCase()}, so your schedule rules stay focused on real staffing responsibilities.`,
      },
    ],
    preview: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <PreviewFrame
          title="Visible responsibility tag"
          subtitle="What teammates see on the schedule"
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-sm)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>
              Jordan Smith
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-text-secondary)",
              }}
            >
              Supervisor
            </span>
          </div>
        </PreviewFrame>

        <PreviewFrame
          title="Permissions stay separate"
          subtitle="Roles do not control app access"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--dg-radius-sm)",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border-light)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {roleLabel.replace(/s$/i, "")}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 4 }}>
                Supervisor
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--dg-radius-sm)",
                background: "var(--color-brand-bg)",
                border: "1px solid var(--color-brand-border)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-brand)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                App access
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 4 }}>
                Managed elsewhere
              </div>
            </div>
          </div>
        </PreviewFrame>
      </div>
    ),
  };

  const navGroups = useMemo(() => buildNavGroups(perms, {
    focusAreaLabel,
    certificationLabel,
    roleLabel,
    departmentLabel,
  }), [perms, organization.shiftDisplayMode, focusAreaLabel, certificationLabel, roleLabel, departmentLabel]);

  const allItems = useMemo(() => navGroups.flatMap(g => g.items), [navGroups]);
  const defaultSection = getDefaultSection(perms);
  const sectionFromPath = resolveSection(searchParams.get("section"));
  const activeSection: SectionId = sectionFromPath && allItems.some(i => i.id === sectionFromPath) ? sectionFromPath : defaultSection;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dg-sidebar-manual-collapse") !== "true";
  });

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("dg-sidebar-manual-collapse", String(!open));
  }, []);

  // Register sub-nav items for the mobile bottom sheet (with group labels)
  const subNavItems: SubNavItem[] = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          href: item.id === defaultSection ? "/settings" : `/settings?section=${item.id}`,
          active: activeSection === item.id,
          group: group.label,
        }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSection, canManageOrg, isSuperAdmin, isGridmaster],
  );
  useSetMobileSubNav(subNavItems);

  // Get the title for the active section
  const activeItem = allItems.find(i => i.id === activeSection);
  const maxWidth = getMaxWidth(activeSection);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "calc(100dvh - var(--app-shell-header-h, 56px))", width: "100%", overflow: "hidden", position: "relative" }}>
        {/* Sidebar — hidden on mobile (shown in bottom sheet), visible on desktop/tablet */}
        {!isMobile && (
          <Sidebar data-tour="settings-sidebar" collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: "var(--app-shell-header-h, 56px)", height: "calc(100dvh - var(--app-shell-header-h, 56px))" }}>
            <SidebarContent className="pt-2 overscroll-contain">
              {navGroups.map((group) => (
                <SidebarGroup key={group.id}>
                  <SidebarGroupLabel
                    className="text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--color-text-faint)] px-3 pb-0"
                  >
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            render={<Link href={item.id === defaultSection ? "/settings" : `/settings?section=${item.id}`} replace />}
                            isActive={activeSection === item.id}
                            tooltip={item.label}
                            className="h-9 data-[active=true]:bg-[var(--color-brand-bg)] data-[active=true]:text-[var(--color-brand)] data-[active=true]:ring-[var(--color-brand-border)] transition-all ease-in-out duration-150"
                          >
                            <span className={activeSection === item.id ? "text-[var(--color-brand)] flex shrink-0 items-center justify-center transition-colors" : "text-[var(--color-text-faint)] flex shrink-0 items-center justify-center transition-colors"}>
                              {item.icon}
                            </span>
                            <span className="font-semibold">{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleSidebarOpenChange(!sidebarOpen)}
                    tooltip={sidebarOpen ? "Collapse Menu" : "Expand Menu"}
                    className="h-9 text-[var(--color-text-faint)] hover:text-black transition-all ease-in-out duration-150"
                  >
                    <span className="flex shrink-0 items-center justify-center">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sidebarOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                        <polyline points="13 17 18 12 13 7" />
                        <polyline points="6 17 11 12 6 7" />
                      </svg>
                    </span>
                    <span className="font-semibold ml-2">Collapse Menu</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

        {/* Content */}
        <div data-tour="settings-content" style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: isMobile ? "16px" : isTablet ? "24px" : "32px 40px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>

        {activeItem && (
          <div style={{ width: "100%", maxWidth, marginBottom: 32 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              {activeItem.label}
            </h1>
            {activeItem.description && (
              <p style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", margin: "5px 0 0", lineHeight: 1.5 }}>
                {activeItem.description}
              </p>
            )}
          </div>
        )}

        {/* Permission info for users with limited access */}
        {canAccessSettings && !isSuperAdmin && !isGridmaster && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", marginBottom: 16,
            background: "var(--color-info-bg)", borderRadius: "var(--dg-radius-sm)",
            border: "1px solid var(--color-info-border)",
            fontSize: "var(--dg-fs-caption)", color: "var(--color-info-text)",
            width: "100%", maxWidth,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Some settings are read-only based on your permissions. Contact your super admin to request changes.
          </div>
        )}

        {/* ── Organization group ────────────────────────────────── */}

        {activeSection === "org-general" && isSuperAdmin && (
          <div style={{ width: "100%", maxWidth }}>
            <SectionCard>
              <OrganizationGeneral
                organization={organization}
                onSave={onOrganizationSave}
              />
            </SectionCard>
          </div>
        )}

        {activeSection === "org-labels" && (isSuperAdmin || canManageOrgLabels || canViewOrgLabels) && (
          <div style={{ width: "100%", maxWidth }}>
            <OrganizationLabels
              organization={organization}
              onSave={onOrganizationSave}
              readOnly={!isSuperAdmin && !canManageOrgLabels}
            />
          </div>
        )}

        {activeSection === "org-display" && canManageOrgSettings && (
          <div style={{ width: "100%", maxWidth }}>
            <DisplayMode
              organization={organization}
              shiftCategories={shiftCategories}
              jobs={jobs}
              onSave={onOrganizationSave}
            />
          </div>
        )}

        {/* ── Scheduling group ─────────────────────────────────── */}

        {activeSection === "schedule-rules" && isSuperAdmin && (
          <div style={{ width: "100%", maxWidth }}>
            <SectionCard>
              <ScheduleRules
                organization={organization}
                onOrganizationSave={onOrganizationSave}
              />
            </SectionCard>
          </div>
        )}

        {activeSection === "schedule-shifts" && (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <div style={{ width: "100%", maxWidth }}>
            <ShiftCategories
              shiftCategories={shiftCategories}
              focusAreas={focusAreas}
              orgId={organization.id}
              onChange={onShiftCategoriesChange}
              canManageScheduleDefinitions={canManageScheduleDefinitions}
            />
          </div>
        )}

        {activeSection === "schedule-jobs" && (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <div style={{ width: "100%", maxWidth }}>
            <Jobs
              jobs={jobs}
              orgId={organization.id}
              orgRoles={orgRoles}
              certifications={certifications}
              departments={departments}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              roleLabel={roleLabel}
              certificationLabel={certificationLabel}
              onChange={onJobsChange}
              canManageScheduleDefinitions={canManageScheduleDefinitions}
              shiftDisplayMode={organization.shiftDisplayMode}
            />
          </div>
        )}

        {activeSection === "schedule-absence-types" && (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <div style={{ width: "100%", maxWidth }}>
            <AbsenceTypes
              absenceTypes={absenceTypes}
              orgId={organization.id}
              onChange={onAbsenceTypesChange}
              canManageScheduleDefinitions={canManageScheduleDefinitions}
              shiftDisplayMode={organization.shiftDisplayMode}
            />
          </div>
        )}

        {activeSection === "schedule-coverage" && (canManageCoverageRequirements || canViewCoverageRequirements) && (
          <div style={{ width: "100%", maxWidth }}>
            <Coverage
              orgId={organization.id}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              jobs={jobs}
              orgRoles={orgRoles}
              certifications={certifications}
              coverageRequirements={coverageRequirements}
              onCoverageRequirementsChange={onCoverageRequirementsChange}
              canEdit={canManageCoverageRequirements}
              shiftDisplayMode={organization.shiftDisplayMode}
            />
          </div>
        )}

        {/* ── Staff & Designations group ──────────────────────── */}

        {/* Focus areas section removed — now managed under Departments */}

        {activeSection === "staff-certifications" && (canManageOrgLabels || canViewOrgLabels) && (
          <div style={{ width: "100%", maxWidth }}>
            <StringListSettings
              label={certificationLabel}
              sectionTitle={certificationLabel}
              explainer={certificationsExplainer}
              maxWidth={maxWidth}
              wideTable
              items={certifications}
              placeholder="e.g. RN"
              onSave={async (updated) => {
                try {
                  const saved = await saveCertifications(organization.id, updated, certifications);
                  onCertificationsChange(saved);
                  toast.success("Certifications saved");
                } catch (err) {
                  toast.error("Failed to save certifications");
                  throw err;
                }
              }}
              canEdit={canManageOrgLabels}
              departments={departments}
              onCheckDependencies={(id) => checkCertificationDependencies(id, organization.id)}
            />
          </div>
        )}

        {activeSection === "staff-roles" && (canManageOrgLabels || canViewOrgLabels) && (
          <div style={{ width: "100%", maxWidth }}>
            <StringListSettings
              label={roleLabel}
              sectionTitle={roleLabel}
              explainer={rolesExplainer}
              maxWidth={maxWidth}
              wideTable
              items={orgRoles}
              placeholder="e.g. Charge Nurse"
              onSave={async (updated) => {
                try {
                  const saved = await saveOrganizationRoles(organization.id, updated, orgRoles);
                  onOrgRolesChange(saved);
                  toast.success("Roles saved");
                } catch (err) {
                  toast.error("Failed to save roles");
                  throw err;
                }
              }}
              canEdit={canManageOrgLabels}
              departments={departments}
              showScheduleRoleToggle
              onCheckDependencies={(id) => checkRoleDependencies(id, organization.id)}
            />
          </div>
        )}

        {activeSection === "staff-departments" && (canManageFocusAreas || canViewFocusAreas || canManageOrgLabels || canViewOrgLabels) && (
          <div style={{ width: "100%", maxWidth }}>
            <DepartmentsSettings
              departments={departments}
              focusAreas={focusAreas}
              orgId={organization.id}
              focusAreaLabel={focusAreaLabel}
              departmentLabel={departmentLabel}
              canManageFocusAreas={canManageFocusAreas}
              canManageOrgLabels={canManageOrgLabels}
              onDepartmentsChange={onDepartmentsChange}
              onFocusAreasChange={onFocusAreasChange}
            />
          </div>
        )}

        {activeSection === "staff-indicators" && (canManageIndicatorTypes || canViewIndicatorTypes) && (
          <div style={{ width: "100%", maxWidth }}>
            <SectionCard>
              <Indicators
                indicatorTypes={indicatorTypes}
                orgId={organization.id}
                onChange={onIndicatorTypesChange}
                canManageIndicatorTypes={canManageIndicatorTypes}
              />
            </SectionCard>
          </div>
        )}

        {/* ── Platform group ──────────────────────────────────── */}

        {activeSection === "platform-impersonation" && isGridmaster && (
          <div style={{ width: "100%", maxWidth }}>
            <ImpersonationPanel />
          </div>
        )}

        {allItems.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "60px 20px", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)", textAlign: "center", gap: 12,
          }}>
            <span style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-secondary)" }}>No access</span>
            <span>You don&apos;t have permission to view settings. Contact your organization admin for access.</span>
          </div>
        )}
      </div>
    </div>
    </SidebarProvider>
  );
}
