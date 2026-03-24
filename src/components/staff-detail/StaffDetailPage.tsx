"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ProgressBar from "@/components/ProgressBar";
import { useOrganizationData, usePermissions } from "@/hooks";
import {
  fetchEmployeeById,
  fetchEmployeeShifts,
  fetchRecurringShifts,
  fetchEmployeeInvitations,
  fetchEmployeeRoleHistory,
  fetchShiftRequests,
} from "@/lib/db";
import {
  computeEmployeeWeeklyHours,
  formatDateKey,
  getWeekDates,
  getWeekStart,
} from "@/lib/dashboard-stats";
import type {
  Employee,
  RecurringShift,
  ShiftMap,
  Invitation,
  AuditLogEntry,
  ShiftRequest,
} from "@/types";
import { StaffDetailHeader } from "./StaffDetailHeader";
import { OverviewTab } from "./tabs/OverviewTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { ActivityTab } from "./tabs/ActivityTab";

interface StaffDetailPageProps {
  employeeId: string;
}

export function StaffDetailPage({ employeeId }: StaffDetailPageProps) {
  const router = useRouter();
  const perms = usePermissions();
  const {
    org,
    focusAreas,
    shiftCodes,
    shiftCategories,
    certifications,
    orgRoles,
    shiftCodeMap,
    loading: orgLoading,
  } = useOrganizationData();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roleHistory, setRoleHistory] = useState<AuditLogEntry[]>([]);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = perms.orgId ?? org?.id ?? null;

  const shiftCodeById = useMemo(() => {
    const map = new Map<number, (typeof shiftCodes)[number]>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    return map;
  }, [shiftCodes]);

  const categoryById = useMemo(() => {
    const map = new Map<number, (typeof shiftCategories)[number]>();
    for (const cat of shiftCategories) map.set(cat.id, cat);
    return map;
  }, [shiftCategories]);

  const focusAreaById = useMemo(() => {
    const map = new Map<number, (typeof focusAreas)[number]>();
    for (const fa of focusAreas) map.set(fa.id, fa);
    return map;
  }, [focusAreas]);

  // Fetch employee data once we have orgId
  useEffect(() => {
    if (!orgId || orgLoading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const emp = await fetchEmployeeById(employeeId, orgId);
        if (cancelled) return;
        if (!emp) {
          setError("Employee not found");
          setLoading(false);
          return;
        }
        setEmployee(emp);

        // Fetch the rest in parallel
        const [empShifts, recShifts, empInvitations, empRequests] = await Promise.all([
          fetchEmployeeShifts(employeeId, orgId, shiftCodeMap),
          fetchRecurringShifts(orgId, employeeId, shiftCodeMap),
          fetchEmployeeInvitations(orgId, employeeId),
          fetchShiftRequests(orgId, shiftCodeMap, { empId: employeeId }),
        ]);

        if (cancelled) return;
        setShifts(empShifts);
        setRecurringShifts(recShifts);
        setInvitations(empInvitations);
        setShiftRequests(empRequests);

        if (emp.userId && perms.isGridmaster) {
          try {
            const history = await fetchEmployeeRoleHistory(emp.userId);
            if (!cancelled) setRoleHistory(history);
          } catch {
            // Non-critical — don't crash the page if audit log is unavailable
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load employee data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [employeeId, orgId, orgLoading, shiftCodeMap, perms.isGridmaster]);

  const thisWeekHours = useMemo(() => {
    if (!employee) return null;
    const weekStart = getWeekStart(new Date());
    const weekDateKeys = getWeekDates(weekStart).map(formatDateKey);
    return computeEmployeeWeeklyHours(
      employee.id,
      weekDateKeys,
      shifts,
      shiftCodeById,
      40,
      categoryById,
      focusAreaById,
    );
  }, [employee, shifts, shiftCodeById, categoryById, focusAreaById]);

  const pendingInvite = useMemo(() => {
    return invitations.find(i => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date()) ?? null;
  }, [invitations]);

  const isLoading = loading || orgLoading || perms.isLoading;

  if (error && !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => router.push("/staff")}
            className="px-5 py-2 rounded-lg border border-border bg-card text-card-foreground font-semibold text-sm cursor-pointer hover:bg-muted transition-colors"
          >
            Back to Staff
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProgressBar loading={isLoading} />

      {!isLoading && employee && org && (
        <div className="max-w-[1100px] mx-auto px-5 py-6 pb-16">
          <StaffDetailHeader
            employee={employee}
            focusAreas={focusAreas}
            certifications={certifications}
            orgRoles={orgRoles}
            org={org}
            canManageEmployees={perms.canManageEmployees}
            thisWeekHours={thisWeekHours}
            pendingInvite={pendingInvite}
          />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList variant="line" className="w-full justify-start h-auto p-0 mb-6 mt-4 border-b border-border">
              {["overview", "schedule", "activity"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="px-4 py-2.5 text-[13px] font-semibold capitalize"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <OverviewTab
                employee={employee}
                shifts={shifts}
                shiftCodeById={shiftCodeById}
                categoryById={categoryById}
                focusAreaById={focusAreaById}
                certifications={certifications}
                orgRoles={orgRoles}
              />
            </TabsContent>

            <TabsContent value="schedule" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <ScheduleTab
                employee={employee}
                shifts={shifts}
                shiftCodeById={shiftCodeById}
                shiftCodes={shiftCodes}
                focusAreas={focusAreas}
                categoryById={categoryById}
                focusAreaById={focusAreaById}
                shiftRequests={shiftRequests}
                recurringShifts={recurringShifts}
              />
            </TabsContent>

            <TabsContent value="activity" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <ActivityTab
                employee={employee}
                roleHistory={roleHistory}
                invitations={invitations}
              />
            </TabsContent>


          </Tabs>
        </div>
      )}
    </>
  );
}
