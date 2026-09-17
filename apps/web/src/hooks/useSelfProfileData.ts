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
import type { Employee, RecurringShift, ShiftMap } from "@/types";

interface UseSelfProfileDataOptions {
  orgId: string | null;
}

interface UseSelfProfileDataResult {
  user: User | null;
  profile: SelfProfileRecord | null;
  isOrgMember: boolean;
  employee: Employee | null;
  managementDepartmentIds: number[];
  shifts: ShiftMap;
  recurringShifts: RecurringShift[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<unknown>;
  setProfile: Dispatch<SetStateAction<SelfProfileRecord | null>>;
  setEmployee: Dispatch<SetStateAction<Employee | null>>;
  setManagementDepartmentIds: Dispatch<SetStateAction<number[]>>;
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
  const isOrgMember = data?.isOrgMember ?? false;
  const employee = data?.employee ?? null;
  const managementDepartmentIds = data?.managementDepartmentIds ?? [];
  const shifts = data?.shifts ?? {};
  const recurringShifts = data?.recurringShifts ?? [];

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

  const setManagementDepartmentIds = useCallback<Dispatch<SetStateAction<number[]>>>(
    (nextValue) => {
      queryClient.setQueryData<AccountSelfProfileData | undefined>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        const nextIds =
          typeof nextValue === "function"
            ? nextValue(current.managementDepartmentIds ?? [])
            : nextValue;

        return {
          ...current,
          managementDepartmentIds: nextIds,
        };
      });
    },
    [queryClient, queryKey],
  );

  return {
    user,
    profile,
    isOrgMember,
    employee,
    managementDepartmentIds,
    shifts,
    recurringShifts,
    isLoading: authLoading || (!!user && selfQuery.isLoading),
    error: selfQuery.error
      ? extractErrorMessage(
          selfQuery.error,
          "We couldn't load your profile. Refresh and try again.",
        )
      : null,
    refetch: selfQuery.refetch,
    setProfile,
    setEmployee,
    setManagementDepartmentIds,
  };
}
