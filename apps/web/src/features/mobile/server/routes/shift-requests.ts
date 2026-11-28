import { mobileAbsenceViewer } from "@/features/mobile/server/absence-viewer";
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
import { settleShiftRequestAfterTransition } from "@dubgrid/data-access";
import { createMobileShiftRequest, loadMobileShiftRequestsPayload } from "@dubgrid/mobile-api-core";
import { loadRequestsWorkLimits } from "@/features/schedule/server/request-work-limits";
import { dispatchNotificationEventAfterResponse } from "@/features/notifications/server";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileHiddenPeople,
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
const SHIFT_REQUEST_FALLBACK = "That didn't go through. Try again.";

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
  // Looked up once, and only when a loader the viewer may run needs it.
  let hiddenLookup: Promise<string[]> | undefined;
  const hiddenUserIds = () => (hiddenLookup ??= fetchMobileHiddenPeople(auth));
  const payload = await loadMobileShiftRequestsPayload(auth, range, {
    fetchLinkedEmployeeForUser,
    fetchMobileOpenShifts: async (serviceClient, input) =>
      fetchMobileOpenShifts(serviceClient, { ...input, hiddenUserIds: await hiddenUserIds() }),
    fetchMobileScheduleEntries: async (serviceClient, input) =>
      fetchMobileScheduleEntries(serviceClient, {
        ...input,
        hiddenUserIds: await hiddenUserIds(),
      }),
    fetchMobileShiftRequests: async (serviceClient, input) =>
      fetchMobileShiftRequests(serviceClient, {
        ...input,
        hiddenUserIds: await hiddenUserIds(),
        absenceViewer: mobileAbsenceViewer(auth),
      }),
    loadRequestsWorkLimits,
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
    return NextResponse.json({ error: "That didn't go through. Try again." }, { status: 400 });
  }

  const parsed = mobileCreateShiftRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some of those details look off. Review them and try again." },
      { status: 400 },
    );
  }

  try {
    const payload = await createMobileShiftRequest(auth, parsed.data, {
      dispatchNotificationEvent: async (actorUserId, event) =>
        dispatchNotificationEventAfterResponse(actorUserId, event),
      settleShiftRequestAfterTransition,
    });

    return NextResponse.json(mobileCreateShiftRequestResponseSchema.parse(payload), {
      status: 201,
    });
  } catch (err) {
    logger.error({ err, route: "mobile/shift-requests" }, "Mobile shift request failed");
    return NextResponse.json({ error: clientSafeError(err) }, { status: 400 });
  }
}
