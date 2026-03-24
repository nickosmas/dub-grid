"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
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
        const [empShifts, recShifts, empInvitations, empRequests] =
          await Promise.all([
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

        // Fetch role history only if employee has a linked user AND caller is gridmaster
        // (get_audit_log RPC is restricted to gridmaster role)
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

  // Compute this week's hours at the page level (shared by header + overview)
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

  // Pending invitation (shared by header)
  const pendingInvite = useMemo(() => {
    return invitations.find(i => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date()) ?? null;
  }, [invitations]);

  const isLoading = loading || orgLoading || perms.isLoading;

  if (error && !employee) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>{error}</p>
          <button
            onClick={() => router.push("/staff")}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              fontWeight: 600,
              fontSize: "var(--dg-fs-body-sm)",
              cursor: "pointer",
            }}
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
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "24px 20px 60px",
          }}
        >
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

          <Tabs.Root defaultValue="overview">
            <Tabs.List
              style={{
                display: "flex",
                gap: 0,
                borderBottom: "2px solid var(--color-border-light)",
                marginBottom: 24,
                marginTop: 24,
              }}
            >
              {["overview", "schedule", "activity"].map((tab) => (
                <Tabs.Tab
                  key={tab}
                  value={tab}
                  style={{
                    padding: "10px 20px",
                    fontSize: "var(--dg-fs-body-sm)",
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    background: "none",
                    border: "none",
                    borderBottom: "2px solid transparent",
                    marginBottom: -2,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "color 150ms ease, border-color 150ms ease",
                    whiteSpace: "nowrap",
                  }}
                  className="staff-detail-tab"
                >
                  {tab}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            <Tabs.Panel value="overview">
              <OverviewTab
                employee={employee}
                focusAreas={focusAreas}
                certifications={certifications}
                orgRoles={orgRoles}
                org={org}
                recurringShifts={recurringShifts}
                shifts={shifts}
                shiftCodeById={shiftCodeById}
                categoryById={categoryById}
                focusAreaById={focusAreaById}
                thisWeekHours={thisWeekHours}
              />
            </Tabs.Panel>

            <Tabs.Panel value="schedule">
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
            </Tabs.Panel>

            <Tabs.Panel value="activity">
              <ActivityTab
                employee={employee}
                roleHistory={roleHistory}
                invitations={invitations}
              />
            </Tabs.Panel>

          </Tabs.Root>
        </div>
      )}
    </>
  );
}
