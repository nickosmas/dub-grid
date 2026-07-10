import { NextResponse, type NextRequest } from "next/server";
import { mobileDashboardResponseSchema, mobileScheduleQuerySchema } from "@dubgrid/contracts";
import {
  getEffectiveMobileRole,
  loadMobileDashboardPayload,
  MobileApiAuthorizationError,
} from "@dubgrid/mobile-api-core";
import {
  fetchMobileOpenShiftContextRows,
  fetchMobilePublishHistoryRows,
  fetchProfileNameRowsByIds,
  fetchPublishedMobileScheduleRows,
} from "@dubgrid/data-access";
import {
  fetchMobileOpenShifts,
  fetchMobileShiftRequests,
  requireMobileAuth,
  resolveMobileDateRange,
} from "@/features/mobile/server";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

// Sunday-start current week — same alignment as web's dashboard default
// (apps/web/src/lib/dashboard-stats.ts getWeekStart + DashboardView.tsx's
// initial `viewMode: "week"`). This route's other range-consuming siblings
// (org-schedule, me-schedule, shift-requests) intentionally default to a
// forward-looking "today + 13 days" window via resolveMobileDateRange, which
// is right for browsing upcoming shifts but wrong here: coverage/open-shift
// counts and the overtime watch are "this week, so far" snapshots and must
// match what an admin sees on the web dashboard for the same org right now.
function getDefaultDashboardRange(): { startDate: string; endDate: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return withMobileCors(req, auth.response, CORS_METHODS);

  const queryResult = mobileScheduleQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryResult.success) {
    return json({ error: "Invalid query" }, { status: 400 });
  }

  let range: ReturnType<typeof resolveMobileDateRange>;
  try {
    range = queryResult.data.startDate
      ? resolveMobileDateRange(queryResult.data)
      : getDefaultDashboardRange();
  } catch {
    return json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const payload = await loadMobileDashboardPayload(
      {
        currentOrg: { id: auth.currentOrg.id, timezone: auth.currentOrg.timezone },
        effectiveRole: getEffectiveMobileRole(auth.permissions.role),
        serviceClient: auth.serviceClient,
      },
      range,
      {
        fetchMobileOpenShifts,
        fetchMobileShiftRequests,
        fetchMobileOpenShiftContext: fetchMobileOpenShiftContextRows,
        fetchPublishedMobileScheduleRows,
        fetchMobilePublishHistoryRows,
        fetchProfileNameRowsByIds,
      },
    );
    return json(mobileDashboardResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiAuthorizationError) {
      return json(
        { error: "You don't have permission to view the admin dashboard." },
        { status: 403 },
      );
    }

    throw error;
  }
}
