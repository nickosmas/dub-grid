"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { usePermissions } from "@/hooks";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  type AccountSectionId,
  buildAccountNavGroups,
  getDefaultAccountSection,
  resolveAccountSection,
} from "./account-nav-config";
import { ProfilePanel } from "./ProfilePanel";
import { SecurityPanel } from "./SecurityPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { PrivacyPanel } from "./PrivacyPanel";
import { OrganizationsPanel } from "./OrganizationsPanel";
import { fetchAccessibleOrganizations } from "@/features/account/client";

export function AccountPage() {
  const searchParams = useSearchParams();
  const {
    orgId,
    canManageEmployees,
    isSuperAdmin,
    isGridmaster,
  } = usePermissions();
  const { user, profile, employee, setProfile, setEmployee } = useSelfProfileData({ orgId });

  // Cheap probe — only render the Organizations section when the user has 2+ orgs.
  const orgsProbe = useQuery({
    queryKey: ["account", "accessible-organizations"],
    queryFn: () => fetchAccessibleOrganizations(),
    staleTime: 60_000,
  });
  const hasMultipleOrganizations = (orgsProbe.data?.organizations.length ?? 0) > 1;

  const navGroups = useMemo(
    () => buildAccountNavGroups({ hasMultipleOrganizations }),
    [hasMultipleOrganizations],
  );

  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const defaultSection = getDefaultAccountSection();
  const sectionFromPath = resolveAccountSection(searchParams.get("section"));
  const activeSection: AccountSectionId =
    sectionFromPath && allItems.some((i) => i.id === sectionFromPath)
      ? sectionFromPath
      : defaultSection;

  const canEditProfileDirectly =
    Boolean(canManageEmployees) || Boolean(isSuperAdmin) || Boolean(isGridmaster);

  return (
    <SettingsShell<AccountSectionId>
      basePath="/account"
      navGroups={navGroups}
      defaultSection={defaultSection}
      activeSection={activeSection}
    >
      {activeSection === "profile" && (
        <ProfilePanel
          user={user}
          profile={profile}
          employee={employee}
          orgId={orgId}
          canEditProfileDirectly={canEditProfileDirectly}
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

      {activeSection === "privacy" && (
        <PrivacyPanel
          orgId={orgId}
          canEditProfileDirectly={canEditProfileDirectly}
          isGridmaster={Boolean(isGridmaster)}
        />
      )}

      {activeSection === "organizations" && hasMultipleOrganizations && (
        <OrganizationsPanel />
      )}
    </SettingsShell>
  );
}
