import { NextRequest, NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  requireAuthenticatedSession,
} from "@/lib/api-auth";
import { generateICS } from "@/lib/ical";
import {
  PUBLISHED_SHIFT_COLS,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * GET /api/calendar?weeks=4
 * Returns an ICS file for the authenticated user's shifts.
 * Looks up the employee record linked to the user, then fetches shifts.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const supabase = createRequestSupabaseClient(req);

    // Rate limit by user ID
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
    if (misconfigured) {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
      );
    }

    const userId = user.id;
    const weeks = Math.min(
      parseInt(req.nextUrl.searchParams.get("weeks") ?? "4") || 4,
      12,
    );

    // Find the employee record linked to this user
    const { data: employee } = await supabase
      .from("employees")
      .select("id, first_name, last_name, org_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (!employee) {
      return new NextResponse("No employee record found", { status: 404 });
    }

    // Get shifts for this employee for the next N weeks
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay()); // Start of current week
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);

    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);

    const { data: shifts } = await supabase
      .from("shifts")
      .select(PUBLISHED_SHIFT_COLS)
      .eq("emp_id", employee.id)
      .gte("date", startKey)
      .lt("date", endKey)
      .order("date");

    if (!shifts || shifts.length === 0) {
      const empty = generateICS([], `DubGrid — ${employee.first_name} ${employee.last_name}`);
      return new NextResponse(empty, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="dubgrid-schedule.ics"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const [{ data: codes }, { data: absenceTypes }] = await Promise.all([
      supabase
        .from("shift_codes")
        .select("id, label, default_start_time, default_end_time")
        .eq("org_id", employee.org_id)
        .is("archived_at", null),
      supabase
        .from("absence_types")
        .select("id, label")
        .eq("org_id", employee.org_id)
        .is("archived_at", null),
    ]);
    const shiftCodeById = new Map(
      (codes ?? []).map((code: Record<string, unknown>) => [
        code.id as number,
        {
          label: code.label as string,
          defaultStartTime: code.default_start_time as string | null,
          defaultEndTime: code.default_end_time as string | null,
        },
      ]),
    );
    const absenceTypeById = new Map(
      (absenceTypes ?? []).map((row: Record<string, unknown>) => [
        row.id as number,
        row.label as string,
      ]),
    );

    // Cache calendar for 5 minutes (private — user-specific data)
    const cacheHeaders = {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="dubgrid-schedule.ics"`,
      "Cache-Control": "private, max-age=300",
    };

    const events = ((shifts ?? []) as unknown as PublishedShiftRow[])
      .map((row) =>
        resolvePublishedScheduleEntry(row, shiftCodeById, absenceTypeById),
      )
      .flatMap((entry) => {
        if (!entry) return [];

        if (entry.kind === "absence") {
          const dtstart = new Date(`${entry.date}T00:00:00`);
          const dtend = new Date(dtstart);
          dtend.setDate(dtend.getDate() + 1);

          return [{
            uid: `absence-${entry.empId}-${entry.date}-${entry.absenceTypeId}@dubgrid.com`,
            summary: `${entry.label} — DubGrid`,
            dtstart,
            dtend,
            description: `${employee.first_name} ${employee.last_name} — ${entry.label}`,
          }];
        }

        if (!entry.startTime || !entry.endTime) {
          return [];
        }

        const dtstart = new Date(`${entry.date}T${entry.startTime}:00`);
        const dtend = new Date(`${entry.date}T${entry.endTime}:00`);

        if (dtend <= dtstart) {
          dtend.setDate(dtend.getDate() + 1);
        }

        return [{
          uid: `shift-${entry.empId}-${entry.date}-${entry.shiftCodeIds.join("-")}@dubgrid.com`,
          summary: `${entry.label} — DubGrid`,
          dtstart,
          dtend,
          description: `${employee.first_name} ${employee.last_name} — ${entry.label}`,
        }];
      });

    const ics = generateICS(events, `DubGrid — ${employee.first_name} ${employee.last_name}`);

    return new NextResponse(ics, { headers: cacheHeaders });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "calendar-export" } });
    logger.error({ error: err }, "Calendar export failed");
    return NextResponse.json({ error: "Calendar export failed" }, { status: 500 });
  }
}
