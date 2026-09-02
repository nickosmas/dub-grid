import { NextRequest, NextResponse } from "next/server";

import { renderPublishedEmployeeCalendar, resolveCalendarFeed } from "@/features/account/server";
import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";

const CALENDAR_HEADERS = {
  "Cache-Control": "private, max-age=300",
  "Content-Disposition": 'inline; filename="dubgrid-schedule.ics"',
  "Content-Type": "text/calendar; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function unavailableFeed() {
  return new NextResponse("Calendar feed unavailable", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const employee = await resolveCalendarFeed(token);
    if (!employee) return unavailableFeed();

    const calendar = await renderPublishedEmployeeCalendar(getServiceClient(), employee, 12);
    return new NextResponse(calendar, { headers: CALENDAR_HEADERS });
  } catch (error) {
    logger.error({ error }, "private calendar feed failed");
    return unavailableFeed();
  }
}
