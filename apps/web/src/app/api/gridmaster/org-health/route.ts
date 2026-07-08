import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { loadGridmasterOrgHealth } from "@/app/api/gridmaster/_lib/oversight";

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
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const summaries = await loadGridmasterOrgHealth(getServiceClient(), parsed.data.orgId);
    return NextResponse.json({ organizations: summaries });
  } catch (error) {
    console.error("gridmaster org-health GET failed", error);
    return NextResponse.json({ error: "Failed to load organization health" }, { status: 500 });
  }
}
