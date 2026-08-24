import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { loadGridmasterOrgHealth } from "@/app/api/gridmaster/_lib/oversight";
import logger from "@/lib/logger";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const summaries = await loadGridmasterOrgHealth(getServiceClient(), parsed.data.orgId);
    return NextResponse.json({ organizations: summaries });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/org-health" },
      "gridmaster org-health GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load that organization's health. Refresh and try again." },
      { status: 500 },
    );
  }
}
