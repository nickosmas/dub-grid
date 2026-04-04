"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Organization, FocusArea, ShiftCategory, ShiftCode, IndicatorType, NamedItem, CoverageRequirement, AbsenceType } from "@/types";
import { saveCertifications, saveOrganizationRoles } from "@/lib/db";
import { helpText } from "@/lib/help-content";
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

import { type SectionId, resolveSection, buildNavGroups, getDefaultSection, getMaxWidth, type NavPermissions } from "./nav-config";
import { Section } from "./shared";
import OrganizationGeneral from "./OrganizationGeneral";
import OrganizationLabels from "./OrganizationLabels";
import DisplayMode from "./DisplayMode";
import ScheduleRules from "./ScheduleRules";
import ShiftCategories from "./ShiftCategories";
import ShiftCodes from "./ShiftCodes";
import Coverage from "./Coverage";
import FocusAreas from "./FocusAreas";
import StringListSettings from "./StringListSettings";
import Indicators from "./Indicators";

// ── Props ────────────────────────────────────────────────────────────────────
export interface SettingsPageProps {
  organization: Organization;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  onOrganizationSave: (organization: Organization) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  onShiftCodesChange: (codes: ShiftCode[]) => void;
  onShiftCategoriesChange: (categories: ShiftCategory[]) => void;
  onIndicatorTypesChange: (types: IndicatorType[]) => void;
  onCertificationsChange: (items: NamedItem[]) => void;
  onOrgRolesChange: (items: NamedItem[]) => void;
  canManageOrg: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canManageShiftCodes: boolean;
  canManageIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canManageCoverageRequirements: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage({
  organization,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes,
  certifications,
  orgRoles,
  onOrganizationSave,
  onFocusAreasChange,
  onShiftCodesChange,
  onShiftCategoriesChange,
  onIndicatorTypesChange,
  onCertificationsChange,
  onOrgRolesChange,
  canManageOrg,
  isSuperAdmin,
  isGridmaster,
  canManageOrgLabels,
  canManageFocusAreas,
  canManageShiftCodes,
  canManageIndicatorTypes,
  canManageOrgSettings,
  coverageRequirements,
  onCoverageRequirementsChange,
  canManageCoverageRequirements,
  absenceTypes,
  onAbsenceTypesChange,
}: SettingsPageProps) {
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);

  const perms: NavPermissions = useMemo(() => ({
    canManageOrg,
    isSuperAdmin,
    isGridmaster,
    canManageOrgLabels,
    canManageFocusAreas,
    canManageShiftCodes,
    canManageIndicatorTypes,
    canManageOrgSettings,
    canManageCoverageRequirements,
  }), [canManageOrg, isSuperAdmin, isGridmaster, canManageOrgLabels, canManageFocusAreas, canManageShiftCodes, canManageIndicatorTypes, canManageOrgSettings, canManageCoverageRequirements]);

  const focusAreaLabel = organization.focusAreaLabel || "Focus Areas";
  const certificationLabel = organization.certificationLabel || "Certifications";
  const roleLabel = organization.roleLabel || "Roles";

  const navGroups = useMemo(() => buildNavGroups(perms, {
    shiftCodesLabel: organization.shiftDisplayMode === "name" ? "Shifts" : "Schedule Codes",
    focusAreaLabel,
    certificationLabel,
    roleLabel,
  }), [perms, organization.shiftDisplayMode, focusAreaLabel, certificationLabel, roleLabel]);

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
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "calc(100dvh - 56px)", width: "100%", overflow: "hidden", position: "relative" }}>
        {/* Sidebar — hidden on mobile (shown in bottom sheet), visible on desktop/tablet */}
        {!isMobile && (
          <Sidebar collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: 56, height: "calc(100dvh - 56px)" }}>
            <SidebarContent className="pt-2">
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
                            className="h-9 data-[active=true]:bg-[var(--color-brand-bg)] data-[active=true]:text-[var(--color-brand)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--color-brand)] transition-all ease-in-out duration-150"
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
        <div style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: isMobile ? "16px" : isTablet ? "24px" : "32px 40px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>

        {activeItem && (
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 20px", width: "100%", maxWidth }}>
            {activeItem.label}
          </h1>
        )}

        {/* Permission info for admins with limited access */}
        {canManageOrg && !isSuperAdmin && !isGridmaster && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", marginBottom: 16,
            background: "var(--color-info-bg)", borderRadius: "var(--dg-radius-sm)",
            border: "1px solid var(--color-info-border)",
            fontSize: "var(--dg-fs-caption)", color: "var(--color-info-text)",
            width: "100%", maxWidth: 860,
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
            <Section title="Organization Details">
              <OrganizationGeneral
                organization={organization}
                onSave={onOrganizationSave}
              />
            </Section>
          </div>
        )}

        {activeSection === "org-labels" && (isSuperAdmin || canManageOrgLabels) && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title="Custom Labels" helpText={helpText.settings.orgLabels}>
              <OrganizationLabels
                organization={organization}
                onSave={onOrganizationSave}
              />
            </Section>
          </div>
        )}

        {activeSection === "org-display" && canManageOrgSettings && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title="Shift Display Mode">
              <DisplayMode
                organization={organization}
                shiftCodes={shiftCodes}
                onSave={onOrganizationSave}
              />
            </Section>
          </div>
        )}

        {/* ── Scheduling group ─────────────────────────────────── */}

        {activeSection === "schedule-rules" && isSuperAdmin && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title="Schedule Rules">
              <ScheduleRules
                organization={organization}
                onOrganizationSave={onOrganizationSave}
              />
            </Section>
          </div>
        )}

        {activeSection === "schedule-categories" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <ShiftCategories
              shiftCategories={shiftCategories}
              focusAreas={focusAreas}
              orgId={organization.id}
              onChange={onShiftCategoriesChange}
              canManageShiftCodes={canManageShiftCodes}
              shiftCodes={shiftCodes}
              onShiftCodesChange={onShiftCodesChange}
            />
          </div>
        )}

        {activeSection === "schedule-codes" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <ShiftCodes
              shiftCodes={shiftCodes}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              orgId={organization.id}
              certifications={certifications}
              certificationLabel={certificationLabel}
              focusAreaLabel={focusAreaLabel}
              onChange={onShiftCodesChange}
              canManageShiftCodes={canManageShiftCodes}
              absenceTypes={absenceTypes}
              onAbsenceTypesChange={onAbsenceTypesChange}
              shiftDisplayMode={organization.shiftDisplayMode}
            />
          </div>
        )}

        {activeSection === "schedule-coverage" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <Coverage
              orgId={organization.id}
              focusAreas={focusAreas}
              shiftCategories={shiftCategories}
              shiftCodes={shiftCodes}
              coverageRequirements={coverageRequirements}
              onCoverageRequirementsChange={onCoverageRequirementsChange}
              canEdit={canManageCoverageRequirements}
              shiftDisplayMode={organization.shiftDisplayMode}
            />
          </div>
        )}

        {/* ── Staff & Designations group ──────────────────────── */}

        {activeSection === "staff-focus-areas" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title={focusAreaLabel} noPadding helpText={helpText.staff.focusAreas}>
              <FocusAreas
                focusAreas={focusAreas}
                orgId={organization.id}
                label={focusAreaLabel.replace(/s$/, "")}
                onChange={onFocusAreasChange}
                canManageFocusAreas={canManageFocusAreas}
              />
            </Section>
          </div>
        )}

        {activeSection === "staff-certifications" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title={certificationLabel} noPadding helpText={helpText.staff.certification}>
              <StringListSettings
                label={`Define the ${certificationLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
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
              />
            </Section>
          </div>
        )}

        {activeSection === "staff-roles" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title={roleLabel} noPadding helpText={helpText.staff.roles}>
              <StringListSettings
                label={`Define the ${roleLabel.toLowerCase()} available when adding or editing staff. These also determine the order in which they appear in dropdowns.`}
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
              />
            </Section>
          </div>
        )}

        {activeSection === "staff-indicators" && canManageOrg && (
          <div style={{ width: "100%", maxWidth }}>
            <Section title="Indicators">
              <Indicators
                indicatorTypes={indicatorTypes}
                orgId={organization.id}
                onChange={onIndicatorTypesChange}
                canManageIndicatorTypes={canManageIndicatorTypes}
              />
            </Section>
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
