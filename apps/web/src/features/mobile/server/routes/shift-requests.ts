import { NextResponse, type NextRequest } from "next/server";
import {
  mobileCreateShiftRequestBodySchema,
  mobileCreateShiftRequestResponseSchema,
  mobileShiftRequestsResponseSchema,
} from "@dubgrid/contracts";
import {
  createMobileShiftRequest,
  loadMobileShiftRequestsPayload,
} from "@dubgrid/mobile-api-core";
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
  const payload = await loadMobileShiftRequestsPayload(
    auth,
    { startDate, endDate },
    {
      fetchLinkedEmployeeForUser,
      fetchMobileOpenShifts,
      fetchMobileScheduleEntries,
      fetchMobileShiftRequests,
    },
  );

  return NextResponse.json(
    mobileShiftRequestsResponseSchema.parse(payload),
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = mobileCreateShiftRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const payload = await createMobileShiftRequest(auth, parsed.data, {
      dispatchNotificationEvent,
    });

    return NextResponse.json(
      mobileCreateShiftRequestResponseSchema.parse(payload),
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
