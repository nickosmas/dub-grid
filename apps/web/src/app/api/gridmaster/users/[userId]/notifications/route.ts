import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { loadPersonNotifications } from "@/features/gridmaster/server/person-notifications";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "We couldn't find that account. Refresh the page and try again." },
        { status: 400 },
      );
    }

    const notifications = await loadPersonNotifications(getServiceClient(), parsed.data.userId);
    return NextResponse.json({ notifications });
  } catch (error) {
    logger.error({ error }, "gridmaster person notifications GET failed");
    return NextResponse.json(
      { error: "We couldn't load notifications. Refresh and try again." },
      { status: 500 },
    );
  }
}
