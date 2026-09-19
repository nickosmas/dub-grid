"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import ProgressBar from "@/components/ProgressBar";
import { Button } from "@/components/Button";
import { usePermissions, useOrganizationData } from "@/hooks";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  type ProfileSectionId,
  buildProfileNavGroups,
  getDefaultProfileSection,
  resolveProfileSection,
  PROFILE_FOOTER_GROUP_IDS,
} from "./profile-nav-config";
import { SelfWorkOverview } from "./SelfWorkProfile";
import { ProfilePanel } from "@/components/account/ProfilePanel";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { NotificationsPanel } from "@/components/account/NotificationsPanel";
import { DataPrivacyPanel } from "@/components/account/DataPrivacyPanel";

/**
 * /profile — the user's home for everything about them:
 *   - Profile, security, notifications, and data & privacy
 *   - Work overview for on-schedule employees
 *
 * Shares the SettingsShell chrome with /settings so the navigation feels
 * the same across the app. Org admin configuration still lives at /settings.
 */
export function ProfilePage() {
  const searchParams = useSearchParams();
  const {
    orgId,
    role,
    canManageEmployees,
    isSuperAdmin,
    isGridmaster,
    isLoading: permsLoading,
  } = usePermissions();
  const {
    org,
    focusAreas,
    assignments,
    absenceTypes,
    shiftCategories,
    jobs,
    certifications,
    orgRoles,
    departments,
  } = useOrganizationData();
  const {
    user,
    profile,
    isOrgMember,
    employee,
    managementDepartmentIds,
    shifts,
    recurringShifts,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
    setProfile,
    setEmployee,
  } = useSelfProfileData({ orgId });

  // Management-only employees have a row in `employees` but no focus
  // areas, so they have no personal schedule overview.
  const isOnSchedule = Boolean(employee && employee.focusAreaIds.length > 0);
  const navGroups = useMemo(() => buildProfileNavGroups({ isOnSchedule }), [isOnSchedule]);
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const defaultSection = getDefaultProfileSection();
  const sectionFromPath = resolveProfileSection(searchParams.get("section"));
  const activeSection: ProfileSectionId =
    sectionFromPath && allItems.some((i) => i.id === sectionFromPath)
      ? sectionFromPath
      : defaultSection;

  const canEditProfileDirectly =
    Boolean(canManageEmployees) || Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageManagementAccess = Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageScheduleEmployees = Boolean(canManageEmployees);

  // Wait for real permissions before rendering: canEditProfileDirectly
  // defaults to false while perms are loading, which would otherwise flash
  // the non-admin "request a name change" UI at admins for a moment.
  if (permsLoading || profileLoading) {
    return <ProgressBar loading />;
  }

  if (profileError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="m-0 text-[var(--dg-color-text-muted)]">{profileError}</p>
        <Button className="dg-btn dg-btn-secondary" onClick={() => refetchProfile()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <SettingsShell<ProfileSectionId>
      basePath="/profile"
      navGroups={navGroups}
      defaultSection={defaultSection}
      activeSection={activeSection}
      footerGroupIds={PROFILE_FOOTER_GROUP_IDS}
      hideContentGroupLabels
    >
      {activeSection === "profile" && (
        <ProfilePanel
          user={user}
          profile={profile}
          employee={employee}
          managementDepartmentIds={managementDepartmentIds}
          isOrgMember={isOrgMember}
          orgId={orgId}
          canEditProfileDirectly={canEditProfileDirectly}
          isGridmaster={Boolean(isGridmaster)}
          role={role}
          departments={departments}
          isOnSchedule={isOnSchedule}
          canManageManagementAccess={canManageManagementAccess}
          canManageScheduleEmployees={canManageScheduleEmployees}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={orgRoles}
          focusAreaLabel={org?.focusAreaLabel}
          certificationLabel={org?.certificationLabel}
          roleLabel={org?.roleLabel}
          setProfile={setProfile}
          setEmployee={setEmployee}
          refetchProfile={refetchProfile}
        />
      )}

      {activeSection === "security" && (
        <SecurityPanel user={user} profile={profile} setProfile={setProfile} />
      )}

      {activeSection === "notifications" && (
        <NotificationsPanel
          isGridmaster={Boolean(isGridmaster)}
          isSuperAdmin={Boolean(isSuperAdmin)}
        />
      )}

      {activeSection === "data-privacy" && <DataPrivacyPanel />}

      {activeSection === "overview" && isOnSchedule && employee && (
        <SelfWorkOverview
          employee={employee}
          focusAreas={focusAreas}
          focusAreaLabel={org?.focusAreaLabel}
          assignments={assignments}
          absenceTypes={absenceTypes}
          shiftCategories={shiftCategories}
          jobs={jobs}
          certifications={certifications}
          orgRoles={orgRoles}
          shifts={shifts}
          recurringShifts={recurringShifts}
          timeZone={org?.timezone}
        />
      )}
    </SettingsShell>
  );
}
