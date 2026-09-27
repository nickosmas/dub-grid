import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { loadPersonSchedule } from "@/features/gridmaster/server/person-activity";

const paramsSchema = z.object({ employeeId: z.string().uuid() });

const NOT_FOUND = "We couldn't find that staff record. Refresh the page and try again.";

export async function GET(req: NextRequest, context: { params: Promise<{ employeeId: string }> }) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    const schedule = await loadPersonSchedule(getServiceClient(), parsed.data.employeeId);
    if (!schedule) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ schedule });
  } catch (error) {
    logger.error({ error }, "gridmaster staff activity GET failed");
    return NextResponse.json(
      { error: "We couldn't load this schedule. Refresh and try again." },
      { status: 500 },
    );
  }
}
