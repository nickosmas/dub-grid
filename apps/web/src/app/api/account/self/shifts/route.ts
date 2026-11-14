import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { fetchSelfPeriodShifts } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { isValidCustomRange } from "@/lib/period-presets";
import logger from "@/lib/logger";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z
  .object({ orgId: z.guid(), start: isoDate, end: isoDate })
  .refine(({ start, end }) => isValidCustomRange({ startDate: start, endDate: end }));

/** Your own published shifts for the period My profile shows. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const params = req.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      orgId: params.get("orgId") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const { orgId, start, end } = parsed.data;
    const effectiveOrgId = await resolveEffectiveOrgId(req, auth.user.id, orgId);
    const shifts = await fetchSelfPeriodShifts(auth.user.id, effectiveOrgId, {
      startDate: start,
      endDate: end,
    });
    return NextResponse.json({ shifts });
  } catch (error) {
    logger.error({ error }, "account self shifts GET failed");
    return NextResponse.json(
      { error: "We couldn't load your shifts. Refresh and try again." },
      { status: 500 },
    );
  }
}
