import { NextResponse, type NextRequest } from "next/server";
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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unexpected error";
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const startDate = req.nextUrl.searchParams.get("startDate") ?? undefined;
  const endDate = req.nextUrl.searchParams.get("endDate") ?? undefined;
  const queryResult = mobileScheduleQuerySchema.safeParse({ startDate, endDate });
  if (!queryResult.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  let range: { startDate: string; endDate: string };
  try {
    range = normalizeMobileScheduleRange(queryResult.data);
  } catch {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
