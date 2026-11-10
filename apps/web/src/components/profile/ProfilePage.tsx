"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useConfirmLeave } from "@/components/NavigationGuardProvider";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";

import ProgressBar from "@/components/ProgressBar";
import { PersonPageSkeleton } from "@/components/LoadingSkeletons";
import { Button } from "@/components/Button";
import { SpanTabs } from "@/components/ui/span-tabs";
import { usePermissions, useOrganizationData } from "@/hooks";
import { useSelfProfileData } from "@/hooks/useSelfProfileData";
import { useSkeletonGate } from "@/hooks/useSkeletonGate";
import { useClipTrailingWhitespace } from "@/hooks/useClipTrailingWhitespace";
import { usePersonPeriod } from "@/hooks/usePersonPeriod";
import { fetchSelfPeriodShifts } from "@/features/account/client";
import { formatPersonPeriodPhrase } from "@/lib/person-period";
import { queryKeys } from "@/lib/query-keys";
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
import DeleteAccountCard from "@/components/account/DeleteAccountCard";
import { RequestDeletionCard } from "@/components/account/RequestDeletionCard";
import { EmployeeStatusCard } from "@/components/staff-detail/EmployeeStatusCard";
import { WorkAndRecordCard } from "@/components/staff-detail/PersonInfoCards";
import { StaffOverviewTab } from "@/components/staff-detail/tabs/StaffOverviewTab";
import { ScheduleTab } from "@/components/staff-detail/tabs/ScheduleTab";
import { PersonPeriodControl } from "@/components/staff-detail/PersonPeriodControl";
import { CalendarSubscriptionCard } from "./CalendarSubscriptionCard";
import { UnsavedChangesScope } from "@/components/ui/UnsavedChangesBar";
import { ProfileHeader } from "./ProfileHeader";
import { availableProfileTabs, resolveProfileLink, type ProfileTab } from "./profile-tabs";

const TAB_LABELS: Record<ProfileTab, string> = {
  account: "Account",
  schedule: "Schedule",
  alerts: "Alerts",
  security: "Security",
  privacy: "Privacy",
};

const toLocalDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** A settings card, its title in the header bar, its parts ruled apart. */
function SettingsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`profile-${id}-title`} className="dg-card">
      <div className="dg-card-header">
        <h2 id={`profile-${id}-title`} className="dg-card-title">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * /profile: your own page. Account holds your details and record, Schedule
 * shows your record the way a manager sees it, and Alerts, Security and
 * Privacy hold your settings.
 */
export function ProfilePage() {
  const router = useRouter();
  const confirmLeave = useConfirmLeave();
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
  const activeTab = resolveProfileLink(
    { tab: searchParams.get("tab"), section: searchParams.get("section") },
    tabs,
  );
  // Each tab unmounts the one before it, edits included, so a switch asks first.
  const openTab = useCallback(
    (tab: ProfileTab) => {
      confirmLeave(() =>
        router.replace(tab === tabs[0] ? "/profile" : `/profile?tab=${tab}`, { scroll: false }),
      );
    },
    [confirmLeave, router, tabs],
  );

  const canEditProfileDirectly =
    Boolean(canManageEmployees) || Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageManagementAccess = Boolean(isSuperAdmin) || Boolean(isGridmaster);
  const canManageScheduleEmployees = Boolean(canManageEmployees);
  const orgRole: OrganizationRole | null =
    !isGridmaster && (role === "user" || role === "admin" || role === "super_admin") ? role : null;
  // Read in the record card when nothing on Account lets you change it.
  const recordAccessRole = employee && !canManageManagementAccess ? orgRole : null;

  const payPeriodStartDate = org?.payPeriodStartDate ?? null;
  const {
    span: periodSpan,
    period,
    today: periodToday,
    setSpan: setPeriodSpan,
    step: stepPeriod,
    goToToday: goToPeriodToday,
    setCustomRange: setPeriodRange,
  } = usePersonPeriod(payPeriodStartDate);
  const periodPhrase = formatPersonPeriodPhrase(period, periodToday, payPeriodStartDate);
  const periodShiftsQuery = useQuery({
    queryKey: queryKeys.account.selfShifts(
      user?.id ?? "anonymous",
      orgId,
      period.range.startDate,
      period.range.endDate,
    ),
    queryFn: () => fetchSelfPeriodShifts(orgId!, period.range),
    enabled: Boolean(orgId && user && isOnSchedule) && activeTab === "schedule",
    staleTime: 60_000,
  });
  // Looking at another period, this week would be off the subject.
  const periodIncludesToday =
    period.range.startDate <= periodToday && periodToday <= period.range.endDate;

  const today = useMemo(() => getIsoDateInTimeZone(new Date(), org?.timezone), [org?.timezone]);
  const thisWeek = useMemo(
    () =>
      getProfileOverviewCurrentWeekDateKeys(
        getProfileOverviewDateRange(new Date(), org?.timezone),
      ).map(toLocalDate),
    [org?.timezone],
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

  const showSkeleton = useSkeletonGate(permsLoading || profileLoading);

  // Wait for real permissions before rendering: canEditProfileDirectly
  // defaults to false while perms are loading, which would otherwise flash
  // the non-admin "request a name change" UI at admins for a moment.
  if (permsLoading || profileLoading || showSkeleton) {
    return (
      <>
        <ProgressBar loading={permsLoading || profileLoading} />
        {showSkeleton ? <PersonPageSkeleton variant="profile" tabCount={tabs.length} /> : null}
      </>
    );
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
    items.filter((item) => ids.includes(item.id)).map((item) => item.name);
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
        />

        {employee ? (
          <EmployeeStatusCard employee={employee} absenceTypes={absenceTypes} hideWhenActive />
        ) : null}

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-full overflow-x-auto">
              <SpanTabs<ProfileTab>
                aria-label="Profile sections"
                className="w-max max-sm:[&_.dg-span-tab]:px-1!"
                items={tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
                value={activeTab}
                onChange={(tab) => openTab(tab)}
              />
            </div>
            {activeTab === "schedule" && isOnSchedule ? (
              <PersonPeriodControl
                span={periodSpan}
                period={period}
                today={periodToday}
                payPeriodStartDate={payPeriodStartDate}
                onSpanChange={setPeriodSpan}
                onStep={stepPeriod}
                onToday={goToPeriodToday}
                onCustomRangeChange={setPeriodRange}
              />
            ) : null}
          </div>

          <section aria-label={TAB_LABELS[activeTab]}>
            {activeTab === "schedule" && employee && isOnSchedule && (
              <>
                <StaffOverviewTab
                  employee={employee}
                  periodShifts={periodShiftsQuery.data}
                  range={period.range}
                  periodPhrase={periodPhrase}
                  assignments={assignments}
                  shiftCategories={shiftCategories}
                  jobs={jobs}
                  absenceTypes={absenceTypes}
                  focusAreas={focusAreas}
                  nextDays={periodIncludesToday ? { dates: thisWeek, shifts } : null}
                  nextDaysCopy={{
                    title: "This week",
                    periodLabel: "Your published shifts",
                    emptyTitle: "You're not scheduled this week",
                    emptyDescription: "When your shifts get published, they'll show up right here.",
                  }}
                  mixTitle="What you work"
                />
                <div className="mt-6">
                  <ScheduleTab
                    employee={employee}
                    shifts={periodShiftsQuery.data}
                    loading={periodShiftsQuery.isPending}
                    range={period.range}
                    today={today}
                    periodPhrase={periodPhrase}
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
                </div>
              </>
            )}

            {activeTab === "account" && (
              <div className="flex flex-col gap-4">
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
                  showAccessRole={!recordAccessRole}
                />
                {employee ? (
                  <WorkAndRecordCard
                    employee={employee}
                    orgRole={recordAccessRole}
                    work={
                      !canEditProfileDirectly && isOnSchedule
                        ? {
                            focusAreas,
                            certifications,
                            roles: orgRoles,
                            focusAreaLabel: org?.focusAreaLabel,
                            certificationLabel: org?.certificationLabel,
                            roleLabel: org?.roleLabel,
                          }
                        : null
                    }
                  />
                ) : null}
              </div>
            )}

            {activeTab === "alerts" && (
              <UnsavedChangesScope>
                <SettingsSection id="notifications" title="Alerts">
                  <NotificationsPanel
                    isGridmaster={Boolean(isGridmaster)}
                    isSuperAdmin={Boolean(isSuperAdmin)}
                  />
                </SettingsSection>
              </UnsavedChangesScope>
            )}

            {activeTab === "security" && (
              <div className="flex flex-col gap-4">
                <SecurityPanel user={user} profile={profile} setProfile={setProfile} />
              </div>
            )}

            {activeTab === "privacy" && (
              <div className="flex flex-col gap-4">
                <SettingsSection id="data-privacy" title="Data and privacy">
                  <DataPrivacyPanel />
                </SettingsSection>
                {isGridmaster ? null : isSuperAdmin ? (
                  <DeleteAccountCard />
                ) : (
                  <RequestDeletionCard orgId={orgId} isOrgMember={isOrgMember} />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
