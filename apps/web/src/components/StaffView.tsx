"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, type WheelEvent, useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useSetMobileSubNav, type SubNavItem } from "@/components/MobileSubNavContext";
import { useMediaQuery, MOBILE } from "@/hooks";
import type {
  AbsenceType,
  Department,
  Employee,
  FocusArea,
  Invitation,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
} from "@/types";
import { MembersSection } from "@/components/staff/MembersSection";
import { ProfileChangeRequestQueue } from "@/components/staff/ProfileChangeRequestQueue";
import { RecurringScheduleSection } from "@/components/staff/RecurringScheduleSection";

const EMPTY_CODE_MAP = new Map<number, string>();

const MEMBERS_ICON = (
  <svg
    width="14"
    height="14"
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
);

const REQUESTS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 15h6" />
    <path d="M9 11h2" />
  </svg>
);

const CALENDAR_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

type StaffSection = "directory" | "requests" | "access" | "recurring-schedule";

interface StaffViewProps {
  employees: Employee[];
  inactiveEmployees?: Employee[];
  removedEmployees?: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => boolean | Promise<boolean>;
  /** Called instead of `onSave` when the admin confirms changing an
   *  on-schedule employee's email while a pending invitation exists — see
   *  EditEmployeePanel. */
  onSaveWithReinvite?: (
    updatedEmployee: Employee,
    oldInvitation: Invitation,
  ) => boolean | Promise<boolean>;
  onRemove: (empId: string, note?: string) => void;
  onDeactivate: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  orgId?: string;
  assignments?: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  assignmentLabelMap?: Map<number, string>;
  absenceTypes?: AbsenceType[];
  departments?: Department[];
  departmentLabel?: string;
  canEditShifts?: boolean;
  canViewRecurringShifts?: boolean;
  canManageRecurringShifts?: boolean;
  canViewEmployeeDetails?: boolean;
  canManageEmployees?: boolean;
  isSuperAdmin?: boolean;
  isGridmaster?: boolean;
  isManagementUser?: boolean;
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  shiftDisplayMode?: ShiftDisplayMode;
  defaultShiftEnabled?: boolean;
  setupIncomplete?: boolean;
  useCompactRoleCertificationLabels?: boolean;
}

export default function StaffView({
  employees,
  inactiveEmployees = [],
  removedEmployees = [],
  focusAreas,
  certifications,
  roles,
  onSave,
  onSaveWithReinvite,
  onRemove,
  onDeactivate,
  onActivate,
  onAdd,
  orgId,
  assignments,
  shiftCategories,
  jobs,
  assignmentLabelMap,
  absenceTypes,
  departments: departmentsProp = [],
  departmentLabel: departmentLabelProp = "Scheduled Departments",
  canViewRecurringShifts,
  canManageRecurringShifts,
  canViewEmployeeDetails,
  canManageEmployees,
  isSuperAdmin = false,
  isGridmaster = false,
  isManagementUser = false,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certifications",
  roleLabel = "Roles",
  shiftDisplayMode = "code",
  defaultShiftEnabled = true,
  useCompactRoleCertificationLabels = false,
}: StaffViewProps) {
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery(MOBILE);
  const { user } = useAuth();
  const scheduledDepartmentLabel = departmentLabelProp || "Scheduled Departments";
  const managementDepartmentLabel = "Management Departments";
  const canAccessPeopleAdminSurfaces = Boolean(canManageEmployees || isSuperAdmin || isGridmaster);
  // canViewRecurringShifts is what the recurring API itself requires
  // (api/schedule/recurring canReadRecurring), and authz derives it from
  // canManageRecurringShifts. Also demanding staff-management rights made the
  // granted permission unreachable for anyone who held only it.
  const canAccessPeopleRecurring = Boolean(orgId && canViewRecurringShifts);

  const allowedSections: StaffSection[] = [
    "directory",
    ...(canAccessPeopleAdminSurfaces ? ["requests" as const] : []),
    ...(canAccessPeopleRecurring ? ["recurring-schedule" as const] : []),
  ];
  const sectionParam = searchParams.get("section") as StaffSection | null;
  const resolvedSection =
    sectionParam === ("members" as string)
      ? ("directory" as StaffSection)
      : sectionParam === ("users" as string) || sectionParam === ("access" as string)
        ? ("directory" as StaffSection)
        : sectionParam;
  const activeSection: StaffSection =
    resolvedSection && allowedSections.includes(resolvedSection) ? resolvedSection : "directory";

  const links: { id: StaffSection; label: string; icon: ReactNode }[] = useMemo(
    () => [
      { id: "directory", label: "Directory", icon: MEMBERS_ICON },
      ...(canAccessPeopleAdminSurfaces
        ? [{ id: "requests" as StaffSection, label: "Requests", icon: REQUESTS_ICON }]
        : []),
      ...(canAccessPeopleRecurring
        ? [
            {
              id: "recurring-schedule" as StaffSection,
              label: "Recurring Shifts",
              icon: CALENDAR_ICON,
            },
          ]
        : []),
    ],
    [canAccessPeopleAdminSurfaces, canAccessPeopleRecurring],
  );

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dg-sidebar-manual-collapse") !== "true";
  });

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("dg-sidebar-manual-collapse", String(!open));
  }, []);

  const subNavItems: SubNavItem[] = useMemo(
    () =>
      links.map((link) => ({
        id: link.id,
        label: link.label,
        icon: link.icon,
        href: link.id === "directory" ? "/people" : `/people?section=${link.id}`,
        active: activeSection === link.id,
      })),
    [activeSection, links],
  );
  useSetMobileSubNav(subNavItems);

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={{ minHeight: "unset" }}
    >
      {!isMobile && links.length > 1 && (
        <Sidebar
          collapsible="icon"
          className="border-r border-[var(--dg-color-border)] bg-[var(--dg-color-surface)]"
          style={{
            top: "var(--dg-app-shell-header-height)",
            height: "calc(100dvh - var(--dg-app-shell-header-height))",
          }}
          onWheel={(event: WheelEvent) => event.preventDefault()}
        >
          <SidebarContent className="pt-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => (
                    <SidebarMenuItem key={link.id}>
                      <SidebarMenuButton
                        render={
                          <Link
                            href={
                              link.id === "directory" ? "/people" : `/people?section=${link.id}`
                            }
                            replace
                          />
                        }
                        isActive={activeSection === link.id}
                        tooltip={link.label}
                        className="h-9 transition-all duration-150 ease-in-out data-[active=true]:bg-[var(--dg-color-nav-active-bg)] data-[active=true]:text-[var(--dg-type-attention-primary-color)]"
                      >
                        <span className="flex shrink-0 items-center justify-center text-[var(--dg-type-navigation-color)] transition-colors">
                          {link.icon}
                        </span>
                        <span className="text-[length:var(--dg-type-navigation-size)] font-medium tracking-normal">
                          {link.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleSidebarOpenChange(!sidebarOpen)}
                  tooltip={sidebarOpen ? "Collapse Menu" : "Expand Menu"}
                  className="h-9 text-[var(--dg-type-navigation-color)] transition-all duration-150 ease-in-out"
                >
                  <span className="flex shrink-0 items-center justify-center">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: sidebarOpen ? "rotate(180deg)" : "none",
                        transition: "transform 150ms ease",
                      }}
                    >
                      <polyline points="13 17 18 12 13 7" />
                      <polyline points="6 17 11 12 6 7" />
                    </svg>
                  </span>
                  <span className="ml-2 text-[length:var(--dg-type-navigation-size)] font-medium tracking-normal">
                    Collapse Menu
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      )}

      <SidebarInset className="dg-page-enter bg-[var(--dg-color-bg)]">
        {activeSection === "directory" && (
          <MembersSection
            employees={employees}
            inactiveEmployees={inactiveEmployees}
            removedEmployees={removedEmployees}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={roles}
            useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
            onSave={onSave}
            onSaveWithReinvite={onSaveWithReinvite}
            onRemove={onRemove}
            onDeactivate={onDeactivate}
            onActivate={onActivate}
            onAdd={onAdd}
            canViewEmployeeDetails={canViewEmployeeDetails ?? false}
            canManageEmployees={canManageEmployees ?? false}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            roleLabel={roleLabel}
            orgId={orgId}
            isSuperAdmin={isSuperAdmin}
            isGridmaster={isGridmaster}
            isManagementUser={isManagementUser}
            departments={departmentsProp}
            departmentLabel={scheduledDepartmentLabel}
            managementDepartmentLabel={managementDepartmentLabel}
          />
        )}

        {activeSection !== "directory" && (
          <div className="px-[var(--dg-page-gutter)] py-4 md:py-6 lg:py-10">
            {activeSection === "requests" && canAccessPeopleAdminSurfaces && orgId && (
              <ProfileChangeRequestQueue
                orgId={orgId}
                focusAreas={focusAreas}
                certifications={certifications}
                roles={roles}
                departments={departmentsProp}
              />
            )}

            {activeSection === "recurring-schedule" && orgId && canAccessPeopleRecurring && (
              <RecurringScheduleSection
                employees={employees}
                orgId={orgId}
                currentUserId={user?.id ?? null}
                assignments={assignments ?? []}
                shiftCategories={shiftCategories ?? []}
                jobs={jobs ?? []}
                orgRoles={roles}
                assignmentMap={assignmentLabelMap ?? EMPTY_CODE_MAP}
                canManage={canManageRecurringShifts ?? false}
                focusAreas={focusAreas}
                certifications={certifications}
                absenceTypes={absenceTypes}
                shiftDisplayMode={shiftDisplayMode}
                defaultShiftEnabled={defaultShiftEnabled}
              />
            )}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
