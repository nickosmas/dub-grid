"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { usePermissions, useOrganizationData } from "@/hooks";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  type ProfileSectionId,
  buildProfileNavGroups,
  getDefaultProfileSection,
  resolveProfileSection,
} from "./profile-nav-config";
import { SelfWorkOverview, SelfWorkSchedule } from "./SelfWorkProfile";
import { ProfilePanel } from "@/components/account/ProfilePanel";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { NotificationsPanel } from "@/components/account/NotificationsPanel";

/**
 * /profile — the user's home for everything about them:
 *   - Account: profile (incl. account deletion request), security, notifications
 *     (incl. cookie preferences)
 *   - My work (employees only): overview, schedule
 *
 * Shares the SettingsShell chrome with /settings so the navigation feels
 * the same across the app. Org admin configuration still lives at /settings.
 * Legal/policy links live in the Header user menu.
 */
export function ProfilePage() {
  const searchParams = useSearchParams();
  const { orgId, canManageEmployees, isSuperAdmin, isGridmaster } = usePermissions();
  const { org, focusAreas, assignments, shiftCategories, absenceTypes, certifications, orgRoles } =
    useOrganizationData();
  const {
    user,
    profile,
    employee,
    shifts,
    recurringShifts,
    shiftRequests,
    auditNames,
    setProfile,
    setEmployee,
  } = useSelfProfileData({ orgId });

  const hasEmployee = Boolean(employee);
  const navGroups = useMemo(
    () => buildProfileNavGroups({ hasEmployee }),
    [hasEmployee],
  );
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const defaultSection = getDefaultProfileSection();
  const sectionFromPath = resolveProfileSection(searchParams.get("section"));
  const activeSection: ProfileSectionId =
    sectionFromPath && allItems.some((i) => i.id === sectionFromPath)
      ? sectionFromPath
      : defaultSection;

  const canEditProfileDirectly =
    Boolean(canManageEmployees) || Boolean(isSuperAdmin) || Boolean(isGridmaster);

  return (
    <SettingsShell<ProfileSectionId>
      basePath="/profile"
      navGroups={navGroups}
      defaultSection={defaultSection}
      activeSection={activeSection}
    >
      {/* ── Account group ─────────────────────────────────────── */}

      {activeSection === "profile" && (
        <ProfilePanel
          user={user}
          profile={profile}
          employee={employee}
          orgId={orgId}
          canEditProfileDirectly={canEditProfileDirectly}
          isGridmaster={Boolean(isGridmaster)}
          setProfile={setProfile}
          setEmployee={setEmployee}
        />
      )}

      {activeSection === "security" && (
        <SecurityPanel user={user} profile={profile} setProfile={setProfile} />
      )}

      {activeSection === "notifications" && (
        <NotificationsPanel isGridmaster={Boolean(isGridmaster)} />
      )}

      {/* ── My work group (employees only) ────────────────────── */}

      {activeSection === "overview" && employee && (
        <SelfWorkOverview
          employee={employee}
          focusAreas={focusAreas}
          focusAreaLabel={org?.focusAreaLabel}
          assignments={assignments}
          shiftCategories={shiftCategories}
          absenceTypes={absenceTypes}
          certifications={certifications}
          orgRoles={orgRoles}
          shiftDisplayMode={org?.shiftDisplayMode}
          shifts={shifts}
          recurringShifts={recurringShifts}
          shiftRequests={shiftRequests}
          auditNames={auditNames}
        />
      )}

      {activeSection === "schedule" && employee && (
        <SelfWorkSchedule
          employee={employee}
          focusAreas={focusAreas}
          focusAreaLabel={org?.focusAreaLabel}
          assignments={assignments}
          shiftCategories={shiftCategories}
          absenceTypes={absenceTypes}
          certifications={certifications}
          orgRoles={orgRoles}
          shiftDisplayMode={org?.shiftDisplayMode}
          shifts={shifts}
          recurringShifts={recurringShifts}
          shiftRequests={shiftRequests}
          auditNames={auditNames}
        />
      )}
    </SettingsShell>
  );
}
