// src/hooks/useRoleChange.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/lib/supabase";

export interface RoleChangeParams {
  targetUserId: string;
  newRole: string;
}

export interface RoleChangeResult {
  status: "success" | "already_applied";
  from_role?: string;
  to_role?: string;
}

export interface OrgMember {
  id: string;
  role: string;
  [key: string]: unknown;
}

/**
 * Generates a unique idempotency key for role change operations.
 * Exported for testing purposes.
 */
export function generateIdempotencyKey(): string {
  return uuidv4();
}

/**
 * React Query mutation hook for changing user roles.
 * 
 * Features:
 * - Generates unique idempotency key per call to prevent double-submission
 * - Implements optimistic update for immediate UI feedback
 * - Rolls back optimistic update on error
 * - Invalidates query cache on success for data consistency
 * 
 * @returns UseMutation result with mutate/mutateAsync functions
 */
export function useRoleChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RoleChangeParams): Promise<RoleChangeResult> => {
      const idempotencyKey = generateIdempotencyKey();

      const { data: userData } = await supabase.auth.getUser();
      const changedById = userData.user?.id;

      if (!changedById) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase.rpc("change_user_role", {
        p_target_user_id: params.targetUserId,
        p_new_role: params.newRole,
        p_changed_by_id: changedById,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;
      return data as RoleChangeResult;
    },
    onMutate: async (vars: RoleChangeParams) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["org-members"] });

      // Snapshot the previous value
      const prev = queryClient.getQueryData<OrgMember[]>(["org-members"]);

      // Optimistically update to the new value
      queryClient.setQueryData<OrgMember[]>(["org-members"], (old) =>
        old?.map((m) =>
          m.id === vars.targetUserId ? { ...m, role: vars.newRole } : m,
        ),
      );

      // Return context with the snapshotted value
      return { prev };
    },
    onSuccess: async () => {
      // The change_user_role RPC already inserts a jwt_refresh_locks row,
      // which forces the target user to re-authenticate and get fresh claims.
    },
    onError: (_err, _vars, ctx) => {
      // Rollback to the previous value on error
      if (ctx?.prev) {
        queryClient.setQueryData(["org-members"], ctx.prev);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
  });
}
