import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  mobileShiftRequestHistoryQuerySchema,
  mobileShiftRequestHistoryResponseSchema,
} from "@dubgrid/contracts";
import { loadMobileShiftRequestHistoryPayload } from "@dubgrid/mobile-api-core";
import logger from "@/lib/logger";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileShiftRequestHistory,
  requireMobileAuth,
} from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const parsed = mobileShiftRequestHistoryQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }

  try {
    const payload = await loadMobileShiftRequestHistoryPayload(auth, parsed.data, {
      fetchLinkedEmployeeForUser,
      fetchMobileShiftRequestHistory,
    });

    return NextResponse.json(mobileShiftRequestHistoryResponseSchema.parse(payload));
  } catch (err) {
    logger.error(
      { err, route: "mobile/shift-requests/history" },
      "Mobile shift request history failed",
    );
    return NextResponse.json(
      { error: "We couldn't load request history. Try again." },
      { status: 500 },
    );
  }
}
