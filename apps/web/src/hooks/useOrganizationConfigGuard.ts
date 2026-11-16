"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { captureMessage } from "@/lib/sentry";
import { findOrgConfigGaps } from "@/lib/org-config-consistency";

type GuardInput = Parameters<typeof findOrgConfigGaps>[0];

// Kept outside the component: a page can unmount and remount while settings
// reload (a loading screen above it), and the one automatic reload and the one
// report must survive that or the guard reloads forever.
const autoReloaded = new Set<string>();
const reported = new Set<string>();

/** Test hook: forget what this page load has already reloaded and reported. */
export function resetOrganizationConfigGuardMemory() {
  autoReloaded.clear();
  reported.clear();
}

/**
 * Stops a page from quietly rendering settings that disagree with its own
 * staff and schedule (2026-11-15: production showed an empty Schedule and "?"
 * shifts for a few minutes while the data was intact). On a contradiction it
 * refetches the organization's settings once; if the fresh settings still
 * disagree it reports the counts to Sentry and asks the page to show the
 * recovery screen, with Retry, instead of a plausible empty one.
 *
 * Pass null until the page's settings and staff have loaded.
 */
export function useOrganizationConfigGuard(input: GuardInput | null): {
  failed: boolean;
  retry: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const report = useMemo(() => (input ? findOrgConfigGaps(input) : null), [input]);
  const gapKey = report?.gaps.join(",") ?? "";
  const countsKey = report ? JSON.stringify(report.counts) : "";
  const [refetching, setRefetching] = useState(false);

  // Refetch in place rather than reset: the page keeps its settings on screen
  // instead of dropping to a loading screen that would unmount it.
  const refetch = useCallback(async () => {
    setRefetching(true);
    try {
      await queryClient.refetchQueries({ queryKey: queryKeys.org.bootstrap() });
    } finally {
      setRefetching(false);
    }
  }, [queryClient]);

  const needsAutoReload = gapKey !== "" && !autoReloaded.has(gapKey);

  useEffect(() => {
    if (!needsAutoReload) return;
    autoReloaded.add(gapKey);
    void refetch();
  }, [needsAutoReload, gapKey, refetch]);

  const failed = gapKey !== "" && !needsAutoReload && !refetching;

  useEffect(() => {
    if (!failed || reported.has(gapKey)) return;
    reported.add(gapKey);
    captureMessage(
      `Organization settings disagree with the page after a reload: ${gapKey} ${countsKey}`,
      "error",
    );
  }, [failed, gapKey, countsKey]);

  return { failed, retry: refetch };
}
