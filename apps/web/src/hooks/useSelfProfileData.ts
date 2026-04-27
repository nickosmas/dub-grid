import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/components/AuthProvider";
import { fetchEmployeeByUserId, fetchEmployeeShifts, fetchRecurringShifts, fetchShiftRequests } from "@/lib/db";
import { extractErrorMessage } from "@/lib/error-handling";
import { supabase } from "@/lib/supabase";
import type { Employee, RecurringShift, ShiftMap, ShiftRequest } from "@/types";

export interface SelfProfileRecord {
  first_name: string | null;
  last_name: string | null;
  mfa_enabled: boolean;
}

interface UseSelfProfileDataOptions {
  orgId: string | null;
  assignmentLabelMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
}

interface UseSelfProfileDataResult {
  user: User | null;
  profile: SelfProfileRecord | null;
  employee: Employee | null;
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  shiftRequests: ShiftRequest[];
  auditNames: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  setProfile: Dispatch<SetStateAction<SelfProfileRecord | null>>;
  setEmployee: Dispatch<SetStateAction<Employee | null>>;
}

export function useSelfProfileData({
  orgId,
  assignmentLabelMap,
  absenceTypeMap,
}: UseSelfProfileDataOptions): UseSelfProfileDataResult {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<SelfProfileRecord | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([]);
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  const [baseLoading, setBaseLoading] = useState(true);
  const [workLoading, setWorkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return () => { cancelled = true; };

    if (!user) {
      setProfile(null);
      setEmployee(null);
      setShifts({});
      setRecurringShifts([]);
      setShiftRequests([]);
      setAuditNames(new Map());
      setError(null);
      setBaseLoading(false);
      setWorkLoading(false);
      return () => { cancelled = true; };
    }

    setBaseLoading(true);
    setError(null);

    void (async () => {
      try {
        const [{ data: prof, error: profileError }, linkedEmployee] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name, last_name, mfa_enabled")
            .eq("id", user.id)
            .maybeSingle(),
          orgId ? fetchEmployeeByUserId(user.id, orgId) : Promise.resolve(null),
        ]);

        if (profileError) throw profileError;
        if (cancelled) return;

        setProfile(prof ? {
          first_name: prof.first_name,
          last_name: prof.last_name,
          mfa_enabled: prof.mfa_enabled ?? false,
        } : null);
        setEmployee(linkedEmployee);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(extractErrorMessage(err, "Failed to load your profile."));
          setProfile(null);
          setEmployee(null);
        }
      } finally {
        if (!cancelled) {
          setBaseLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, orgId, user]);

  useEffect(() => {
    let cancelled = false;
    const employeeId = employee?.id ?? null;

    if (!user || !orgId || !employeeId) {
      setShifts({});
      setRecurringShifts([]);
      setShiftRequests([]);
      setAuditNames(new Map());
      setWorkLoading(false);
      return () => { cancelled = true; };
    }

    setWorkLoading(true);

    void (async () => {
      try {
        const [nextShifts, nextRecurringShifts, nextShiftRequests] = await Promise.all([
          fetchEmployeeShifts(employeeId, orgId, assignmentLabelMap, absenceTypeMap),
          fetchRecurringShifts(orgId, employeeId, assignmentLabelMap, false, absenceTypeMap),
          fetchShiftRequests(orgId, assignmentLabelMap, { empId: employeeId }),
        ]);

        const auditIds = new Set<string>();
        for (const entry of Object.values(nextShifts)) {
          if (entry.createdBy) auditIds.add(entry.createdBy);
          if (entry.updatedBy) auditIds.add(entry.updatedBy);
        }

        let nextAuditNames = new Map<string, string>();
        if (auditIds.size > 0) {
          const { data, error: auditError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", Array.from(auditIds));
          if (auditError) throw auditError;
          nextAuditNames = new Map(
            (data ?? [])
              .map((row: { id: string; first_name: string | null; last_name: string | null }) => {
                const name = [row.first_name?.trim(), row.last_name?.trim()]
                  .filter(Boolean)
                  .join(" ");
                return name ? [row.id, name] as const : null;
              })
              .filter((entry: readonly [string, string] | null): entry is readonly [string, string] => entry !== null),
          );
        }

        if (cancelled) return;
        setShifts(nextShifts);
        setRecurringShifts(nextRecurringShifts);
        setShiftRequests(nextShiftRequests);
        setAuditNames(nextAuditNames);
      } catch (err: unknown) {
        if (!cancelled) {
          setError((current) => current ?? extractErrorMessage(err, "Failed to load your work profile."));
          setShifts({});
          setRecurringShifts([]);
          setShiftRequests([]);
          setAuditNames(new Map());
        }
      } finally {
        if (!cancelled) {
          setWorkLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [absenceTypeMap, employee?.id, orgId, assignmentLabelMap, user]);

  return {
    user,
    profile,
    employee,
    shifts,
    recurringShifts,
    shiftRequests,
    auditNames,
    isLoading: authLoading || baseLoading || workLoading,
    error,
    setProfile,
    setEmployee,
  };
}
