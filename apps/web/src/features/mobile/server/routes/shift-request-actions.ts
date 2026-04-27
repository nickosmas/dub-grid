import { NextResponse, type NextRequest } from "next/server";
import {
  mobileUpdateShiftRequestBodySchema,
  mobileUpdateShiftRequestResponseSchema,
} from "@dubgrid/contracts";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unexpected error";
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = mobileUpdateShiftRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "claim": {
        const { error } = await auth.userClient.rpc("claim_shift_request", {
          p_request_id: id,
          p_claimer_emp_id: parsed.data.claimerEmpId,
        });
        if (error) throw error;
        await dispatchNotificationEvent(auth.user.id, {
          action: "shift_request_claimed",
          orgId: auth.currentOrg.id,
          requestId: id,
          requestType: "pickup",
        });
        break;
      }

      case "respond": {
        const { error } = await auth.userClient.rpc(
          "respond_to_shift_request",
          {
            p_request_id: id,
            p_emp_id: parsed.data.empId,
            p_accept: parsed.data.accept,
          },
        );
        if (error) throw error;
        break;
      }

      case "resolve": {
        const { error } = await auth.userClient.rpc("resolve_shift_request", {
          p_request_id: id,
          p_approved: parsed.data.approved,
          p_note: parsed.data.note ?? null,
        });
        if (error) throw error;

        const { data: requestRow } = await auth.serviceClient
          .from("shift_requests")
          .select("type")
          .eq("id", id)
          .single();

        await dispatchNotificationEvent(auth.user.id, {
          action: "shift_request_resolved",
          orgId: auth.currentOrg.id,
          requestId: id,
          requestType:
            (requestRow?.type as "pickup" | "swap" | "calloff" | undefined) ??
            "pickup",
          approved: parsed.data.approved,
          adminNote: parsed.data.note,
        });
        break;
      }

      case "cancel": {
        const { error } = await auth.userClient.rpc("cancel_shift_request", {
          p_request_id: id,
          p_emp_id: parsed.data.empId,
        });
        if (error) throw error;
        break;
      }

      case "volunteer_open_shift": {
        if (
          parsed.data.state.kind !== "worked" ||
          parsed.data.state.segments.length === 0
        ) {
          return NextResponse.json(
            { error: "Open-shift volunteering requires a worked assignment" },
            { status: 400 },
          );
        }

        const { data: requestId, error } = await auth.userClient.rpc(
          "volunteer_for_open_shift",
          {
            p_org_id: auth.currentOrg.id,
            p_emp_id: parsed.data.empId,
            p_shift_date: parsed.data.shiftDate,
            p_shift_ids: parsed.data.state.segments.map(
              (segment) => segment.shiftId,
            ),
            p_job_ids: parsed.data.state.segments.map(
              (segment) => segment.jobId,
            ),
            p_focus_area_id: parsed.data.focusAreaId,
            p_custom_start_time: parsed.data.state.customStartTime ?? null,
            p_custom_end_time: parsed.data.state.customEndTime ?? null,
          },
        );
        if (error || !requestId)
          throw error ?? new Error("Unable to volunteer");
        await dispatchNotificationEvent(auth.user.id, {
          action: "shift_request_created",
          orgId: auth.currentOrg.id,
          requestId: requestId as string,
          requestType: "pickup",
        });
        break;
      }
    }

    return NextResponse.json(
      mobileUpdateShiftRequestResponseSchema.parse({
        success: true,
      }),
    );
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
