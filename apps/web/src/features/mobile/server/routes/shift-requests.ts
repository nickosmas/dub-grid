import { NextResponse, type NextRequest } from "next/server";
import { formatClientErrorMessage, API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import {
  mobileCreateShiftRequestBodySchema,
  mobileScheduleQuerySchema,
  mobileCreateShiftRequestResponseSchema,
  mobileShiftRequestsResponseSchema,
  normalizeMobileScheduleRange,
} from "@dubgrid/contracts";
import { createMobileShiftRequest, loadMobileShiftRequestsPayload } from "@dubgrid/mobile-api-core";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileOpenShifts,
  fetchMobileScheduleEntries,
  fetchMobileShiftRequests,
  requireMobileAuth,
} from "@/features/mobile/server";

export const dynamic = "force-dynamic";

/**
 * A shift-request failure is usually a rule the caller broke ("You already
 * volunteered for this open shift"), so the message is worth surfacing — but
 * the same catch also sees Postgres and Zod errors. `formatClientErrorMessage`
 * keeps the intentional copy and swaps anything technical for the fallback.
 */
const SHIFT_REQUEST_FALLBACK = "We couldn't complete that request. Try again.";

function clientSafeError(err: unknown): string {
  return formatClientErrorMessage(err, SHIFT_REQUEST_FALLBACK);
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const startDate = req.nextUrl.searchParams.get("startDate") ?? undefined;
  const endDate = req.nextUrl.searchParams.get("endDate") ?? undefined;
  const queryResult = mobileScheduleQuerySchema.safeParse({ startDate, endDate });
  if (!queryResult.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }
  let range: { startDate: string; endDate: string };
  try {
    range = normalizeMobileScheduleRange(queryResult.data);
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
  }
  const payload = await loadMobileShiftRequestsPayload(auth, range, {
    fetchLinkedEmployeeForUser,
    fetchMobileOpenShifts,
    fetchMobileScheduleEntries,
    fetchMobileShiftRequests,
  });

  return NextResponse.json(mobileShiftRequestsResponseSchema.parse(payload));
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileCreateShiftRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  try {
    const payload = await createMobileShiftRequest(auth, parsed.data, {
      dispatchNotificationEvent,
    });

    return NextResponse.json(mobileCreateShiftRequestResponseSchema.parse(payload), {
      status: 201,
    });
  } catch (err) {
    logger.error({ err, route: "mobile/shift-requests" }, "Mobile shift request failed");
    return NextResponse.json({ error: clientSafeError(err) }, { status: 400 });
  }
}
