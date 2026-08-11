import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { AccessibilityInfo } from "react-native";
import { hapticNotify } from "../lib/haptics";
import { pushClientFriendlyErrorToast } from "../lib/errors";
import { useToast, type ToastInput } from "../providers/ToastProvider";

export type OptimisticPatch<TVariables> = {
  queryKey: readonly unknown[];
  update: (previous: unknown, variables: TVariables) => unknown;
};

/**
 * Builds a typed patch without forcing the caller to cast inside `update`.
 *
 * `TData` cannot be inferred from the callback, so annotate it at the call site:
 * `optimisticPatch<RequestsResponse, Vars>(key, (previous, variables) => ...)`.
 */
export function optimisticPatch<TData, TVariables>(
  queryKey: readonly unknown[],
  update: (previous: TData | undefined, variables: TVariables) => TData | undefined,
): OptimisticPatch<TVariables> {
  return {
    queryKey,
    update: (previous, variables) => update(previous as TData | undefined, variables),
  };
}

export type OptimisticMutationOptions<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /**
   * Cache writes to apply before the request goes out. Prefer exact keys: these
   * are passed to `cancelQueries`, and a broad prefix cancels far more
   * in-flight work than intended.
   */
  patches?:
    OptimisticPatch<TVariables>[] | ((variables: TVariables) => OptimisticPatch<TVariables>[]);
  successToast?: ToastInput | ((data: TData, variables: TVariables) => ToastInput | null);
  errorToast?: { title: string; fallbackMessage: string };
  /** Spoken by the screen reader on success, which a toast alone never is. */
  announceOnSuccess?: string | ((data: TData, variables: TVariables) => string | null);
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  /** Extra keys to refetch once settled, beyond the patched ones. */
  invalidateKeys?: readonly (readonly unknown[])[];
  haptics?: boolean;
};

export type OptimisticSnapshot = { queryKey: readonly unknown[]; previous: unknown };
export type OptimisticContext = { snapshots: OptimisticSnapshot[] };

type LifecycleDeps = {
  queryClient: QueryClient;
  pushToast: (toast: ToastInput) => void;
  notify: (type: "success" | "warning" | "error") => void;
  announce: (message: string) => void;
};

function resolvePatches<TData, TVariables>(
  options: OptimisticMutationOptions<TData, TVariables>,
  variables: TVariables,
): OptimisticPatch<TVariables>[] {
  const { patches } = options;
  return typeof patches === "function" ? patches(variables) : (patches ?? []);
}

/**
 * The cache lifecycle of an optimistic mutation, with no React in it.
 *
 * Kept separate from the hook so it can be tested against a real `QueryClient`.
 * The mobile app carries two React copies (`apps/mobile` and the workspace
 * root), so rendering a real `QueryClientProvider` under vitest blows up on a
 * null dispatcher, and every screen test mocks react-query for that reason.
 * Ordering and rollback are the parts worth proving, and neither needs a tree.
 *
 * The sequence matters:
 *   1. `cancelQueries` first, or a request already in flight lands on top of
 *      the optimistic write and undoes it.
 *   2. Snapshot before writing, so the rollback restores the exact prior value
 *      rather than refetching and hoping.
 *   3. Write.
 *   4. Invalidate on settle, so server truth always wins in the end.
 */
export function createOptimisticMutationLifecycle<TData, TVariables>(
  options: OptimisticMutationOptions<TData, TVariables>,
  deps: LifecycleDeps,
) {
  const { queryClient, pushToast, notify, announce } = deps;
  const haptics = options.haptics ?? true;

  return {
    onMutate: async (variables: TVariables): Promise<OptimisticContext> => {
      const snapshots: OptimisticSnapshot[] = [];

      for (const patch of resolvePatches(options, variables)) {
        await queryClient.cancelQueries({ queryKey: patch.queryKey });
        snapshots.push({
          queryKey: patch.queryKey,
          previous: queryClient.getQueryData(patch.queryKey),
        });
        queryClient.setQueryData(patch.queryKey, (current: unknown) =>
          patch.update(current, variables),
        );
      }

      return { snapshots };
    },

    onError: (error: unknown, _variables: TVariables, context: OptimisticContext | undefined) => {
      // Put every touched key back exactly as it was, so a failure never leaves
      // a half-applied view behind.
      for (const snapshot of context?.snapshots ?? []) {
        if (snapshot.previous === undefined) {
          // `setQueryData(key, undefined)` is a no-op in react-query, so a
          // patch that created an entry from nothing has to be removed rather
          // than written back, or the optimistic value survives the rollback.
          queryClient.removeQueries({ queryKey: snapshot.queryKey, exact: true });
          continue;
        }

        queryClient.setQueryData(snapshot.queryKey, snapshot.previous);
      }

      if (haptics) {
        notify("error");
      }

      if (options.errorToast) {
        pushClientFriendlyErrorToast(pushToast, {
          error,
          title: options.errorToast.title,
          fallbackMessage: options.errorToast.fallbackMessage,
        });
      }
    },

    onSuccess: async (data: TData, variables: TVariables) => {
      if (haptics) {
        notify("success");
      }

      const toast =
        typeof options.successToast === "function"
          ? options.successToast(data, variables)
          : (options.successToast ?? null);
      if (toast) {
        pushToast(toast);
      }

      const announcement =
        typeof options.announceOnSuccess === "function"
          ? options.announceOnSuccess(data, variables)
          : (options.announceOnSuccess ?? null);
      if (announcement) {
        announce(announcement);
      }

      await options.onSuccess?.(data, variables);
    },

    onSettled: (_data: TData | undefined, _error: unknown, variables: TVariables) => {
      // Reconcile against the server regardless of outcome. The optimistic
      // value is a stand-in, never the final word.
      const keys = [
        ...resolvePatches(options, variables).map((patch) => patch.queryKey),
        ...(options.invalidateKeys ?? []),
      ];

      for (const queryKey of keys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}

/**
 * `useMutation` with the four steps an optimistic update actually needs.
 *
 * Every mutation in this app used to wait for a round trip *and* a refetch
 * before anything moved, and the one screen that did patch the cache did it
 * outside the mutation lifecycle, so an in-flight refetch could clobber it.
 *
 * Patch what the user directly toggled. Do not patch values the server derives
 * (coverage percentages, gap counts): guessing those means reimplementing
 * server math on the client, and being confidently wrong about someone's
 * coverage is worse than being slow.
 */
export function useOptimisticMutation<TData, TVariables>(
  options: OptimisticMutationOptions<TData, TVariables>,
): UseMutationResult<TData, unknown, TVariables, OptimisticContext> {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const lifecycle = createOptimisticMutationLifecycle(options, {
    queryClient,
    pushToast,
    notify: hapticNotify,
    announce: (message) => AccessibilityInfo.announceForAccessibility(message),
  });

  return useMutation<TData, unknown, TVariables, OptimisticContext>({
    mutationFn: options.mutationFn,
    ...lifecycle,
  });
}
