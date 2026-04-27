import { NextResponse, type NextRequest } from "next/server";
import {
  mobileCreateShiftRequestBodySchema,
  mobileCreateShiftRequestResponseSchema,
  mobileShiftRequestsResponseSchema,
} from "@dubgrid/contracts";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import {
  fetchLinkedEmployeeForUser,
  fetchMobileOpenShifts,
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

  const linkedEmployee = await fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );

  if (!auth.permissions.canApproveShiftRequests && !linkedEmployee) {
    return NextResponse.json(
      mobileShiftRequestsResponseSchema.parse({ requests: [], openShifts: [] }),
    );
  }

  const employeeId = auth.permissions.canApproveShiftRequests
    ? undefined
    : linkedEmployee?.id;
  const startDate = req.nextUrl.searchParams.get("startDate") ?? undefined;
  const endDate = req.nextUrl.searchParams.get("endDate") ?? undefined;

  const [requests, openShifts] = await Promise.all([
    fetchMobileShiftRequests(auth.serviceClient, {
      orgId: auth.currentOrg.id,
      employeeId,
      includeOpenPickupRequests: !auth.permissions.canApproveShiftRequests,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    }),
    linkedEmployee
      ? fetchMobileOpenShifts(auth.serviceClient, {
          orgId: auth.currentOrg.id,
          employee: linkedEmployee,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json(
    mobileShiftRequestsResponseSchema.parse({ requests, openShifts }),
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

  const data = parsed.data;

  try {
    const { data: requestId, error } = await auth.userClient.rpc(
      "create_shift_request",
      {
        p_org_id: auth.currentOrg.id,
        p_type: data.type,
        p_requester_emp_id: data.requesterEmpId,
        p_requester_shift_date: data.requesterShiftDate,
        p_target_emp_id: data.targetEmpId ?? null,
        p_target_shift_date: data.targetShiftDate ?? null,
        p_absence_type_id: data.absenceTypeId ?? null,
      },
    );

    if (error || !requestId) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create shift request" },
        { status: 400 },
      );
    }

    await dispatchNotificationEvent(auth.user.id, {
      action: "shift_request_created",
      orgId: auth.currentOrg.id,
      requestId: requestId as string,
      requestType: data.type,
    });

    return NextResponse.json(
      mobileCreateShiftRequestResponseSchema.parse({
        requestId,
      }),
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
