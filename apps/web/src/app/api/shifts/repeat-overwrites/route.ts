import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const repeatOverwritesSchema = z.object({
  empId: z.string().uuid(),
  dates: z.array(dateKeySchema).min(1).max(366),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = repeatOverwritesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const dates = Array.from(new Set(parsed.data.dates)).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const datesToCheck = new Set(dates);

    const supabase = createRequestSupabaseClient(req);
    const { data, error } = await supabase
      .from("schedule_cells")
      .select("date")
      .eq("emp_id", parsed.data.empId)
      .gte("date", minDate)
      .lte("date", maxDate);

    if (error) {
      throw error;
    }

    const overwriteCount = (data ?? []).filter((row: { date: string }) =>
      datesToCheck.has(row.date),
    ).length;

    return NextResponse.json({ overwriteCount });
  } catch (error) {
    logger.error({ error }, "repeat overwrites POST failed");
    return NextResponse.json({ error: "Failed to load repeat overwrite count" }, { status: 500 });
  }
}
