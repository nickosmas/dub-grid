import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import {
  CalendarSubscriptionError,
  getLinkedCalendarEmployee,
  renderPublishedEmployeeCalendar,
} from "@/features/account/server";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * GET /api/calendar?weeks=4
 * Returns an ICS file for the authenticated user's shifts.
 * Looks up the employee record linked to the user, then fetches shifts.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const orgId = typeof auth.claims.org_id === "string" ? auth.claims.org_id : null;
    if (!orgId) {
      return new NextResponse("No employee record found", { status: 404 });
    }

    // Rate limit by user ID
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
    if (misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
      );
    }

    const userId = user.id;
    const weeks = Math.min(parseInt(req.nextUrl.searchParams.get("weeks") ?? "4") || 4, 12);

    let employee;
    try {
      employee = await getLinkedCalendarEmployee(userId, orgId);
    } catch (error) {
      if (!(error instanceof CalendarSubscriptionError)) throw error;
      return new NextResponse("No employee record found", { status: 404 });
    }

    const cacheHeaders = {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="dubgrid-schedule.ics"`,
      "Cache-Control": "private, max-age=300",
    };
    const ics = await renderPublishedEmployeeCalendar(getServiceClient(), employee, weeks);

    return new NextResponse(ics, { headers: cacheHeaders });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "calendar-export" } });
    logger.error({ error: err }, "Calendar export failed");
    return NextResponse.json({ error: "Calendar export failed" }, { status: 500 });
  }
}
