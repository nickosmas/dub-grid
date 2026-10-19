"use client";

import { useEffect, useState } from "react";
import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";
import { Button } from "@/components/Button";
import { useLatestRef } from "@/hooks/useLatestRef";
import * as Sentry from "@/lib/sentry";

/** How long a wait runs before the screen calls it slow and offers a reload. */
export const SCHEDULE_LOADING_SLOW_MS = 15_000;
/** How long a wait runs before it is reported, once per wait. */
export const SCHEDULE_LOADING_REPORT_MS = 30_000;

// One wait can pass through several of these screens: the route fallback, then
// the page's own. Its start is shared, and holds while any of them is mounted,
// so the slow message and the report count the whole wait.
let mountedScreens = 0;
let waitStartedAt: number | null = null;
let waitReported = false;

/** Test seam: forgets the wait in progress. */
export function resetScheduleLoadingWait(): void {
  mountedScreens = 0;
  waitStartedAt = null;
  waitReported = false;
}

/**
 * Full-screen branded loading state for the schedule grid. Shared by the
 * route-level Suspense fallback (`loading.tsx`) and the client-side data
 * loading states in `SchedulePageClient`, so a navigation into the schedule
 * keeps one Shuffle running from fallback to data with no flash between them.
 * Most schedules load faster than the reveal delay, so the logo never shows.
 *
 * A wait never runs on silently: past SCHEDULE_LOADING_SLOW_MS it says so and
 * offers a reload, and past SCHEDULE_LOADING_REPORT_MS it is reported with
 * whatever `describeWait` says is still outstanding.
 */
export function ScheduleLoadingScreen({
  source = "page",
  describeWait,
}: {
  source?: "route" | "page";
  describeWait?: () => Record<string, unknown>;
}) {
  const [slow, setSlow] = useState(false);
  const describe = useLatestRef(describeWait);

  useEffect(() => {
    mountedScreens += 1;
    if (waitStartedAt === null) {
      waitStartedAt = Date.now();
      waitReported = false;
    }
    const startedAt = waitStartedAt;
    const check = () => {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= SCHEDULE_LOADING_SLOW_MS) setSlow(true);
      if (elapsedMs >= SCHEDULE_LOADING_REPORT_MS && !waitReported) {
        waitReported = true;
        Sentry.captureException(new Error("Schedule loading screen stalled"), {
          tags: { component: "schedule_loading" },
          extra: { source, elapsedMs, ...describe.current?.() },
        });
      }
    };
    check();
    const interval = window.setInterval(check, 1_000);
    return () => {
      window.clearInterval(interval);
      mountedScreens -= 1;
      // A screen that takes over in the same commit keeps the wait going.
      window.setTimeout(() => {
        if (mountedScreens === 0) waitStartedAt = null;
      }, 0);
    };
  }, [describe, source]);

  return (
    <BrandLoadingScreen
      animation="shuffle"
      label="Loading schedule"
      data-schedule-loading
      footer={
        slow ? (
          <div style={{ display: "grid", justifyItems: "center", gap: 12, padding: "0 24px" }}>
            <p
              style={{
                margin: 0,
                textAlign: "center",
                color: "var(--dg-color-text-muted)",
                fontSize: "var(--dg-fs-body)",
              }}
            >
              This is taking longer than usual.
            </p>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        ) : null
      }
    />
  );
}
