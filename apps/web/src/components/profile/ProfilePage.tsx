"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";

import ProgressBar from "@/components/ProgressBar";
import { Button } from "@/components/Button";
import { SpanTabs } from "@/components/ui/span-tabs";
import { usePermissions, useOrganizationData } from "@/hooks";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { useClipTrailingWhitespace } from "@/hooks/useClipTrailingWhitespace";
import {
  getProfileOverviewCurrentWeekDateKeys,
  getProfileOverviewDateRange,
} from "@/features/account/shared/profile-schedule";
import { getEmployeeDisplayName } from "@/lib/utils";
import type { OrganizationRole } from "@/types";
import { ProfilePanel } from "@/components/account/ProfilePanel";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { NotificationsPanel } from "@/components/account/NotificationsPanel";
import { DataPrivacyPanel } from "@/components/account/DataPrivacyPanel";
import { EmployeeStatusCard } from "@/components/staff-detail/EmployeeStatusCard";
import { AccessCard, RecordLine, WorkCard } from "@/components/staff-detail/PersonInfoCards";
import { StaffOverviewTab } from "@/components/staff-detail/tabs/StaffOverviewTab";
import { ScheduleTab } from "@/components/staff-detail/tabs/ScheduleTab";
import { CalendarSubscriptionCard } from "./CalendarSubscriptionCard";
import { ProfileHeader } from "./ProfileHeader";
import {
  availableProfileTabs,
  resolveProfileLink,
  type ProfileAccountSection,
  type ProfileTab,
} from "./profile-tabs";

const TAB_LABELS: Record<ProfileTab, string> = {
  overview: "Overview",
  schedule: "Schedule",
  account: "Account",
};

const ACCOUNT_HEADINGS: Array<{ id: ProfileAccountSection; title: string }> = [
  { id: "details", title: "Your details" },
  { id: "security", title: "Sign-in and security" },
  { id: "notifications", title: "Alerts" },
  { id: "data-privacy", title: "Data and privacy" },
];

const PERIOD_PHRASE = "in the last 12 weeks";

const toLocalDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * /profile: your own staff page. Overview and Schedule show your record the
 * way a manager sees it; Account holds your details, sign-in, alerts and
 * privacy settings.
 */
export function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollerRef = useClipTrailingWhitespace();
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
  // areas, so they have no personal schedule to show.
  const isOnSchedule = Boolean(employee && employee.focusAreaIds.length > 0);
  const tabs = useMemo(
    () => availableProfileTabs({ hasStaffRecord: Boolean(employee), isOnSchedule }),
    [employee, isOnSchedule],
  );
  const { tab: activeTab, section: linkedSection } = resolveProfileLink(
    { tab: searchParams.get("tab"), section: searchParams.get("section") },
    tabs,
  );
  const openTab = useCallback(
    (tab: ProfileTab, section?: ProfileAccountSection) => {
      const params = new URLSearchParams();
      if (tab !== tabs[0]) params.set("tab", tab);
      if (section) params.set("section", section);
      const query = params.toString();
      router.replace(query ? `/profile?${query}` : "/profile", { scroll: false });
    },
    [router, tabs],
  );

  const canEditProfileDirectly =
    Boolean(canManageEmployees) || Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageManagementAccess = Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canDeleteAccountDirectly = Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageScheduleEmployees = Boolean(canManageEmployees);
  const orgRole: OrganizationRole | null =
    !isGridmaster && (role === "user" || role === "admin" || role === "super_admin") ? role : null;

  const range = useMemo(
    () => getProfileOverviewDateRange(new Date(), org?.timezone),
    [org?.timezone],
  );
  const today = useMemo(() => getIsoDateInTimeZone(new Date(), org?.timezone), [org?.timezone]);
  const thisWeek = useMemo(
    () => getProfileOverviewCurrentWeekDateKeys(range).map(toLocalDate),
    [range],
  );
  const lookups = useMemo(
    () => ({
      assignmentById: new Map(assignments.map((item) => [item.id, item])),
      shiftById: new Map(shiftCategories.map((item) => [item.id, item])),
      jobById: new Map(jobs.map((job) => [job.id, job])),
      focusAreaById: new Map(focusAreas.map((area) => [area.id, area])),
      absenceById: new Map(absenceTypes.map((absence) => [absence.id, absence])),
    }),
    [absenceTypes, assignments, focusAreas, jobs, shiftCategories],
  );

  useEffect(() => {
    if (activeTab !== "account" || !linkedSection) return;
    document
      .getElementById(`profile-${linkedSection}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, linkedSection, profileLoading]);

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

  const namesOf = (ids: number[], items: ReadonlyArray<{ id: number; name: string }>) =>
    ids
      .map((id) => items.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));
  const name = employee
    ? getEmployeeDisplayName(employee)
    : [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      user?.email ||
      "Profile";
  const summary = isGridmaster
    ? "Gridmaster"
    : employee && isOnSchedule
      ? [
          namesOf(employee.roleIds, orgRoles).join(", "),
          namesOf(employee.focusAreaIds, focusAreas).join(", "),
          employee.employmentType === "part_time" ? "Part-time" : "Full-time",
        ]
          .filter(Boolean)
          .join(" · ")
      : namesOf(managementDepartmentIds, departments ?? []).join(", ");
  const managed = namesOf(managementDepartmentIds, departments ?? []);

  return (
    <div
      ref={scrollerRef}
      className="h-[calc(100dvh-var(--dg-app-shell-header-height))] overflow-y-auto px-[var(--dg-page-gutter)] py-4 md:py-6 xl:py-8"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <ProfileHeader
          name={name}
          avatarSeed={employee?.userId ?? employee?.id ?? user?.id ?? name}
          orgRole={orgRole}
          employee={employee}
          summary={summary}
          email={employee?.email || user?.email || null}
          phone={employee?.phone || null}
          actions={
            <Button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={() => openTab("account", "details")}
            >
              Edit details
            </Button>
          }
        />

        {employee ? <EmployeeStatusCard employee={employee} absenceTypes={absenceTypes} /> : null}

        <div className="flex min-w-0 flex-col gap-5">
          {tabs.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SpanTabs<ProfileTab>
                aria-label="Profile sections"
                className="w-max"
                items={tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
                value={activeTab}
                onChange={(tab) => openTab(tab)}
              />
              {activeTab !== "account" && isOnSchedule ? (
                <span className="text-[13px] text-[var(--dg-color-text-subtle)]">
                  The last 12 weeks
                </span>
              ) : null}
            </div>
          ) : null}

          <section aria-label={TAB_LABELS[activeTab]}>
            {activeTab === "overview" && employee && (
              <StaffOverviewTab
                employee={employee}
                periodShifts={isOnSchedule ? shifts : {}}
                range={range}
                periodPhrase={PERIOD_PHRASE}
                assignments={assignments}
                shiftCategories={shiftCategories}
                jobs={jobs}
                absenceTypes={absenceTypes}
                focusAreas={focusAreas}
                nextDays={isOnSchedule ? { dates: thisWeek, shifts } : null}
                nextDaysCopy={{
                  title: "This week",
                  periodLabel: "Your published shifts",
                  emptyTitle: "You're not scheduled this week",
                  emptyDescription: "When your shifts get published, they'll show up right here.",
                }}
                aboutTitle="About you"
                mixTitle="What you work"
                about={
                  <div className="flex flex-col gap-4">
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      <WorkCard
                        employee={employee}
                        focusAreas={focusAreas}
                        certifications={certifications}
                        roles={orgRoles}
                        focusAreaLabel={org?.focusAreaLabel}
                        certificationLabel={org?.certificationLabel}
                        roleLabel={org?.roleLabel}
                        showScheduleDetails={isOnSchedule}
                        onEdit={() => openTab("account", "details")}
                      />
                      <AccessCard
                        orgRole={orgRole}
                        invited={false}
                        managedDepartments={managed.length > 0 ? managed : null}
                        accountState={{ kind: "linked" }}
                      />
                    </div>
                    <RecordLine employee={employee} />
                  </div>
                }
              />
            )}

            {activeTab === "schedule" && employee && isOnSchedule && (
              <ScheduleTab
                employee={employee}
                shifts={shifts}
                loading={false}
                range={range}
                today={today}
                periodPhrase={PERIOD_PHRASE}
                lookups={lookups}
                absenceTypes={absenceTypes}
                dayOffAbsenceTypeId={org?.coverageRuleConfig?.dayOffAbsenceTypeId ?? null}
                recurringSchedule={{
                  orgId: null,
                  editHref: null,
                  recurringShifts,
                  assignments,
                  shiftCategories,
                  jobs,
                  focusAreas,
                  absenceTypes,
                }}
                afterRecurringSchedule={<CalendarSubscriptionCard />}
              />
            )}

            {activeTab === "account" && (
              <div className="flex flex-col gap-10">
                {ACCOUNT_HEADINGS.map(({ id, title }) => (
                  <section
                    key={id}
                    id={`profile-${id}`}
                    aria-labelledby={`profile-${id}-title`}
                    // The settings cards cap themselves at 1120px; here they
                    // line up with the page's 1200px column instead.
                    className="flex scroll-mt-6 flex-col gap-3 [&_.dg-page-enter]:!max-w-none"
                  >
                    <h2
                      id={`profile-${id}-title`}
                      className="m-0 text-[17px] font-semibold tracking-tight text-[var(--dg-color-text-primary)]"
                    >
                      {title}
                    </h2>
                    {id === "details" && (
                      <ProfilePanel
                        user={user}
                        profile={profile}
                        employee={employee}
                        managementDepartmentIds={managementDepartmentIds}
                        isOrgMember={isOrgMember}
                        orgId={orgId}
                        canEditProfileDirectly={canEditProfileDirectly}
                        isGridmaster={Boolean(isGridmaster)}
                        canDeleteAccountDirectly={canDeleteAccountDirectly}
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
                    {id === "security" && (
                      <SecurityPanel user={user} profile={profile} setProfile={setProfile} />
                    )}
                    {id === "notifications" && (
                      <NotificationsPanel
                        isGridmaster={Boolean(isGridmaster)}
                        isSuperAdmin={Boolean(isSuperAdmin)}
                      />
                    )}
                    {id === "data-privacy" && <DataPrivacyPanel />}
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
