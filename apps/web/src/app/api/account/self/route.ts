import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchSelfWorkProfileSnapshot } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";

const querySchema = z.object({
  orgId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const parsed = querySchema.safeParse({
      orgId: req.nextUrl.searchParams.get("orgId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const requestedOrgId = parsed.data.orgId ?? null;
    const effectiveOrgId = requestedOrgId
      ? await resolveEffectiveOrgId(req, auth.user.id, requestedOrgId)
      : null;

    return NextResponse.json(await fetchSelfWorkProfileSnapshot(auth.user.id, effectiveOrgId));
  } catch (error) {
    logger.error({ error }, "account self GET failed");
    return NextResponse.json({ error: "Failed to load your profile" }, { status: 500 });
  }
}
