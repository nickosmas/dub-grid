import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { loadPersonHistory } from "@/features/gridmaster/server/person-history";

const paramsSchema = z.object({ userId: z.string().uuid() });

const NOT_FOUND = "We couldn't find that account. Refresh the page and try again.";

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    const history = await loadPersonHistory(getServiceClient(), {
      kind: "user",
      userId: parsed.data.userId,
    });
    if (!history) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json(history);
  } catch (error) {
    logger.error({ error }, "gridmaster person history GET failed");
    return NextResponse.json(
      { error: "We couldn't load this history. Refresh and try again." },
      { status: 500 },
    );
  }
}
