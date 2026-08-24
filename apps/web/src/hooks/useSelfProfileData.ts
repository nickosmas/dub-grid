import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchSelfProfileData,
  type AccountSelfProfileData,
  type SelfProfileRecord,
} from "@/features/account/client";
import { extractErrorMessage } from "@/lib/error-handling";
import { queryKeys } from "@/lib/query-keys";
import type { Employee, RecurringShift, ShiftMap, ShiftRequest } from "@/types";

interface UseSelfProfileDataOptions {
  orgId: string | null;
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

export type { SelfProfileRecord };

export function useSelfProfileData({ orgId }: UseSelfProfileDataOptions): UseSelfProfileDataResult {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.account.self(user?.id ?? "anonymous", orgId);

  const selfQuery = useQuery({
    queryKey,
    queryFn: () => fetchSelfProfileData(orgId),
    enabled: !authLoading && !!user,
    staleTime: 60_000,
  });

  const data: AccountSelfProfileData | null = user ? (selfQuery.data ?? null) : null;
  const profile = data?.profile ?? null;
  const employee = data?.employee ?? null;
  const shifts = data?.shifts ?? {};
  const recurringShifts = data?.recurringShifts ?? [];
  const shiftRequests = data?.shiftRequests ?? [];
  const auditNames = new Map(data?.auditNames ?? []);

  const setProfile = useCallback<Dispatch<SetStateAction<SelfProfileRecord | null>>>(
    (nextValue) => {
      queryClient.setQueryData<AccountSelfProfileData | undefined>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        const nextProfile =
          typeof nextValue === "function" ? nextValue(current.profile ?? null) : nextValue;

        return {
          ...current,
          profile: nextProfile,
        };
      });
    },
    [queryClient, queryKey],
  );

  const setEmployee = useCallback<Dispatch<SetStateAction<Employee | null>>>(
    (nextValue) => {
      queryClient.setQueryData<AccountSelfProfileData | undefined>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        const nextEmployee =
          typeof nextValue === "function" ? nextValue(current.employee ?? null) : nextValue;

        return {
          ...current,
          employee: nextEmployee,
        };
      });
    },
    [queryClient, queryKey],
  );

  return {
    user,
    profile,
    employee,
    shifts,
    recurringShifts,
    shiftRequests,
    auditNames,
    isLoading: authLoading || (!!user && selfQuery.isLoading),
    error: selfQuery.error
      ? extractErrorMessage(
          selfQuery.error,
          "We couldn't load your profile. Refresh and try again.",
        )
      : null,
    setProfile,
    setEmployee,
  };
}
