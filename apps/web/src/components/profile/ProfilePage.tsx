"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

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

/**
 * Self-work surface for an employee: their schedule and their work overview,
 * presented under the shared SettingsShell so the chrome matches /settings
 * and /account. Account-scope concerns (profile, security, notifications,
 * privacy) live at /account; users without a linked employee record have
 * nothing to view here and are redirected there.
 */
export function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId } = usePermissions();
  const { org, focusAreas, assignments, shiftCategories, absenceTypes, certifications, orgRoles } =
    useOrganizationData();
  const { employee, shifts, recurringShifts, shiftRequests, auditNames, isLoading } =
    useSelfProfileData({ orgId });

  // No linked employee → no self-work to show; send the user to their
  // account settings instead.
  useEffect(() => {
    if (!isLoading && !employee) {
      router.replace("/settings?section=profile");
    }
  }, [isLoading, employee, router]);

  const navGroups = useMemo(() => buildProfileNavGroups(), []);
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const defaultSection = getDefaultProfileSection();
  const sectionFromPath = resolveProfileSection(searchParams.get("section"));
  const activeSection: ProfileSectionId =
    sectionFromPath && allItems.some((i) => i.id === sectionFromPath)
      ? sectionFromPath
      : defaultSection;

  // Render an account-shortcut banner so users can jump to settings from here.
  const banner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 14px",
        background: "var(--color-surface)",
        borderRadius: "var(--dg-radius-sm)",
        border: "1px solid var(--color-border)",
        fontSize: "var(--dg-fs-caption)",
        color: "var(--color-text-muted)",
      }}
    >
      <span>Looking for name, email, password, or notification settings?</span>
      <Link href="/settings?section=profile" className="dg-btn dg-btn-secondary dg-btn-sm">
        Open account settings
      </Link>
    </div>
  );

  if (!employee) {
    // While the redirect effect runs, render nothing rather than the shell
    // (avoids a flash of the work surface for non-employees).
    return null;
  }

  return (
    <SettingsShell<ProfileSectionId>
      basePath="/profile"
      navGroups={navGroups}
      defaultSection={defaultSection}
      activeSection={activeSection}
      banner={banner}
    >
      {activeSection === "overview" && (
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

      {activeSection === "schedule" && (
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
