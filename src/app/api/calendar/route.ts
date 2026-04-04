import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { generateICS } from "@/lib/ical";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

function getClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );
}

/**
 * GET /api/calendar?weeks=4
 * Returns an ICS file for the authenticated user's shifts.
 * Looks up the employee record linked to the user, then fetches shifts.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getClient(req);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    // Rate limit by user ID
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, session.user.id);
    if (misconfigured) {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
      );
    }

    const userId = session.user.id;
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
      .select("id, employee_id, date, shift_code_id, start_time, end_time")
      .eq("employee_id", employee.id)
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

    // Fetch shift code names for labels
    const codeIds = [...new Set(shifts.map((s) => (s as Record<string, unknown>).shift_code_id).filter(Boolean))];
    const { data: codes } = codeIds.length > 0
      ? await supabase.from("shift_codes").select("id, label").in("id", codeIds)
      : { data: [] };
    const codeMap = new Map((codes ?? []).map((c: Record<string, unknown>) => [c.id as number, c.label as string]));

    // Cache calendar for 5 minutes (private — user-specific data)
    const cacheHeaders = {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="dubgrid-schedule.ics"`,
      "Cache-Control": "private, max-age=300",
    };

    const events = shifts.map((s: Record<string, unknown>) => {
      const date = s.date as string;
      const codeLabel = codeMap.get(s.shift_code_id as number) ?? "Shift";
      const startTime = (s.start_time as string) ?? "08:00";
      const endTime = (s.end_time as string) ?? "16:00";

      const dtstart = new Date(`${date}T${startTime}:00`);
      const dtend = new Date(`${date}T${endTime}:00`);

      // Handle overnight shifts
      if (dtend <= dtstart) {
        dtend.setDate(dtend.getDate() + 1);
      }

      return {
        uid: `shift-${s.id}@dubgrid.com`,
        summary: `${codeLabel} — DubGrid`,
        dtstart,
        dtend,
        description: `${employee.first_name} ${employee.last_name} — ${codeLabel}`,
      };
    });

    const ics = generateICS(events, `DubGrid — ${employee.first_name} ${employee.last_name}`);

    return new NextResponse(ics, { headers: cacheHeaders });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "calendar-export" } });
    logger.error({ error: err }, "Calendar export failed");
    return NextResponse.json({ error: "Calendar export failed" }, { status: 500 });
  }
}
