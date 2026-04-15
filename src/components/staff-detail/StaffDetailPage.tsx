"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  benchEmployee,
  activateEmployee,
  deleteEmployee,
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
import { supabase } from "@/lib/supabase";
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
    absenceTypes,
    shiftCategories,
    certifications,
    orgRoles,
    shiftCodeMap,
    absenceTypeMap,
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

  useEffect(() => {
    if (perms.isLoading) return;
    if (perms.canViewEmployeeDetails) return;
    toast.info("You don't have access to employee details.");
    router.replace("/people");
  }, [perms.canViewEmployeeDetails, perms.isLoading, router]);

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

  const absenceTypeById = useMemo(() => {
    const map = new Map<number, (typeof absenceTypes)[number]>();
    for (const at of absenceTypes) map.set(at.id, at);
    return map;
  }, [absenceTypes]);

  // Fetch employee data once we have orgId
  useEffect(() => {
    if (perms.isLoading || !perms.canViewEmployeeDetails) return;
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
          fetchEmployeeShifts(employeeId, orgId, shiftCodeMap, absenceTypeMap),
          perms.canViewRecurringShifts
            ? fetchRecurringShifts(orgId, employeeId, shiftCodeMap, false, absenceTypeMap)
            : Promise.resolve([]),
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
  }, [
    employeeId,
    orgId,
    orgLoading,
    shiftCodeMap,
    absenceTypeMap,
    perms.canViewEmployeeDetails,
    perms.canViewRecurringShifts,
    perms.isGridmaster,
    perms.isLoading,
  ]);

  // ── Status action handlers ──────────────────────────────────────────────────
  const handleBench = useCallback(async (empId: string, note?: string) => {
    if (!orgId) return;
    setEmployee((prev) => prev ? { ...prev, status: "benched" as const, statusNote: note ?? "", statusChangedAt: new Date().toISOString() } : prev);
    try {
      await benchEmployee(empId, note, orgId);
      toast.success("Employee benched");
    } catch {
      // Revert on failure
      setEmployee((prev) => prev ? { ...prev, status: "active" as const, statusNote: "" } : prev);
      toast.error("Failed to bench employee");
    }
  }, [orgId]);

  const handleActivate = useCallback(async (empId: string) => {
    if (!orgId) return;
    const prevStatus = employee?.status;
    setEmployee((prev) => prev ? { ...prev, status: "active" as const, statusNote: "", statusChangedAt: new Date().toISOString() } : prev);
    try {
      await activateEmployee(empId, orgId);
      toast.success("Employee activated");
    } catch {
      setEmployee((prev) => prev ? { ...prev, status: prevStatus ?? "benched" } : prev);
      toast.error("Failed to activate employee");
    }
  }, [orgId, employee?.status]);

  const handleTerminate = useCallback(async (empId: string) => {
    if (!orgId) return;
    const prevStatus = employee?.status;
    setEmployee((prev) => prev ? { ...prev, status: "terminated" as const, statusChangedAt: new Date().toISOString() } : prev);
    try {
      await deleteEmployee(empId, orgId);
      toast.success("Employee terminated");
    } catch {
      setEmployee((prev) => prev ? { ...prev, status: prevStatus ?? "active" } : prev);
      toast.error("Failed to terminate employee");
    }
  }, [orgId, employee?.status]);

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
    );
  }, [employee, shifts, shiftCodeById, categoryById]);

  // Batch-fetch profile names for shift audit display (who created/edited each shift)
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(shifts)) {
      if (entry.createdBy) ids.add(entry.createdBy);
      if (entry.updatedBy) ids.add(entry.updatedBy);
    }
    if (ids.size === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", Array.from(ids));
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const row of data ?? []) {
          const first = row.first_name?.trim() || "";
          const last = row.last_name?.trim() || "";
          const name = [first, last].filter(Boolean).join(" ");
          if (name) map.set(row.id, name);
        }
        setAuditNames(map);
      } catch {
        // Non-critical — audit names are informational
      }
    })();
    return () => { cancelled = true; };
  }, [shifts]);

  const pendingInvite = useMemo(() => {
    return invitations.find(i => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date()) ?? null;
  }, [invitations]);

  const isLoading = loading || orgLoading || perms.isLoading;

  if (!perms.isLoading && !perms.canViewEmployeeDetails) {
    return <ProgressBar loading />;
  }

  if (error && !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => router.push("/people")}
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
            onBench={perms.canManageEmployees ? handleBench : undefined}
            onActivate={perms.canManageEmployees ? handleActivate : undefined}
            onTerminate={perms.canManageEmployees ? handleTerminate : undefined}
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
                certifications={certifications}
                orgRoles={orgRoles}
                shiftDisplayMode={org?.shiftDisplayMode}
              />
            </TabsContent>

            <TabsContent value="schedule" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
              <ScheduleTab
                employee={employee}
                shifts={shifts}
                shiftCodeById={shiftCodeById}
                focusAreas={focusAreas}
                categoryById={categoryById}
                focusAreaById={focusAreaById}
                absenceTypeById={absenceTypeById}
                auditNames={auditNames}
                shiftRequests={shiftRequests}
                recurringShifts={recurringShifts}
                canViewRecurringShifts={perms.canViewRecurringShifts}
                shiftDisplayMode={org?.shiftDisplayMode}
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
