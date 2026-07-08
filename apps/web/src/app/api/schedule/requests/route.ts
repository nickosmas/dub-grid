import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbShiftRequest } from "@dubgrid/db-types";
import { scheduleCellStateSchema } from "@dubgrid/contracts";
import { requireOrgPermissions, resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { fetchAssignmentIdByPairMap } from "@/app/api/shared/schedule";
import { dispatchNotificationEvent } from "@/features/notifications/server";
import { rowToShiftRequest } from "@/lib/db/mappers";
import { assertSafeFilterValue } from "@/lib/db/shared";
import { apiErrorResponse } from "@/lib/error-handling";
import type { ShiftRequestStatus, ShiftRequestType } from "@/types";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const mapEntrySchema = z.array(z.tuple([z.number().int(), z.string()]));
const shiftRequestTypeSchema = z.enum(["pickup", "swap", "calloff"]);
const shiftRequestStatusSchema = z.enum([
  "open",
  "pending_approval",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

const requestSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("fetchShiftRequests"),
      orgId: z.string().uuid(),
      assignmentLabels: mapEntrySchema,
      status: z.array(shiftRequestStatusSchema).optional(),
      type: shiftRequestTypeSchema.optional(),
      empId: z.string().uuid().optional(),
    }),
    z.object({
      action: z.literal("createShiftRequest"),
      orgId: z.string().uuid(),
      type: shiftRequestTypeSchema,
      requesterEmpId: z.string().uuid(),
      requesterShiftDate: z.string().date(),
      requesterSegmentIndex: z.number().int().nonnegative().optional(),
      targetEmpId: z.string().uuid().optional(),
      targetShiftDate: z.string().date().optional(),
      targetSegmentIndex: z.number().int().nonnegative().optional(),
      absenceTypeId: z.number().int().optional(),
    }),
    z.object({
      action: z.literal("claimShiftRequest"),
      orgId: z.string().uuid(),
      requestId: z.string().uuid(),
      claimerEmpId: z.string().uuid(),
    }),
    z.object({
      action: z.literal("volunteerForOpenShift"),
      orgId: z.string().uuid(),
      empId: z.string().uuid(),
      shiftDate: z.string().date(),
      input: scheduleCellStateSchema,
      focusAreaId: z.number().int(),
    }),
    z.object({
      action: z.literal("respondToShiftRequest"),
      orgId: z.string().uuid(),
      requestId: z.string().uuid(),
      empId: z.string().uuid(),
      accept: z.boolean(),
    }),
    z.object({
      action: z.literal("resolveShiftRequest"),
      orgId: z.string().uuid(),
      requestId: z.string().uuid(),
      approved: z.boolean(),
      note: z.string().optional(),
    }),
    z.object({
      action: z.literal("cancelShiftRequest"),
      orgId: z.string().uuid(),
      requestId: z.string().uuid(),
      empId: z.string().uuid(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.action !== "createShiftRequest") {
      return;
    }

    const isTargetedPickup = value.type === "pickup" && value.targetEmpId && value.targetShiftDate;
    const hasTargetedPickupField =
      value.type === "pickup" &&
      (value.targetEmpId != null || value.targetShiftDate != null || value.absenceTypeId != null);

    if (value.absenceTypeId != null && value.type !== "calloff" && value.type !== "pickup") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only calloff and targeted pickup requests can include an absence type",
        path: ["absenceTypeId"],
      });
    }

    if (hasTargetedPickupField && !isTargetedPickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Targeted pickup requests require a target employee, target shift date, and absence type",
        path: ["targetEmpId"],
      });
    }

    if (isTargetedPickup && value.absenceTypeId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeted pickup requests require an absence type",
        path: ["absenceTypeId"],
      });
    }

    if (isTargetedPickup && value.targetShiftDate !== value.requesterShiftDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeted pickup requests must target the requester shift date",
        path: ["targetShiftDate"],
      });
    }
  });

async function fetchActorEmployeeId(
  serviceClient: SupabaseClient,
  actorId: string,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", actorId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data?.id as string | undefined) ?? null;
}

async function requireEmployeeAction(req: NextRequest, orgId: string, employeeId: string) {
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) =>
      permissions.isGridmaster ||
      permissions.isSuperAdmin ||
      permissions.canManageEmployees ||
      permissions.canEditShifts ||
      permissions.canViewSchedule,
  );
  if ("response" in auth) {
    return auth;
  }

  const actorEmployeeId = await fetchActorEmployeeId(auth.serviceClient, auth.actor.id, orgId);
  const canActForOthers =
    auth.permissions.isGridmaster ||
    auth.permissions.isSuperAdmin ||
    auth.permissions.canManageEmployees ||
    auth.permissions.canEditShifts;

  if (!canActForOthers && actorEmployeeId !== employeeId) {
    return {
      response: NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 }),
    } as const;
  }

  return auth;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const data = parsed.data;

  // Sandbox redirect: route body.orgId to the user's sandbox when in
  // sandbox mode, so all downstream queries scope to the right org.
  {
    const auth = await requireAuthenticatedUser(req);
    if (!("response" in auth)) {
      const effective = await resolveEffectiveOrgId(req, auth.user.id, data.orgId);
      if (effective !== data.orgId) {
        (data as { orgId: string }).orgId = effective;
      }
    }
  }

  try {
    switch (data.action) {
      case "fetchShiftRequests": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewSchedule,
        );
        if ("response" in auth) {
          return auth.response;
        }

        let query = auth.serviceClient
          .from("shift_requests")
          .select(
            `*,
             requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
             target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
          )
          .eq("org_id", data.orgId)
          .order("created_at", { ascending: false });

        if (data.status?.length) {
          query = query.in("status", data.status as ShiftRequestStatus[]);
        }
        if (data.type) {
          query = query.eq("type", data.type as ShiftRequestType);
        }
        if (data.empId) {
          assertSafeFilterValue(data.empId, "empId");
          query = query.or(`requester_emp_id.eq.${data.empId},target_emp_id.eq.${data.empId}`);
        }

        const { data: rows, error } = await query;
        if (error) {
          throw error;
        }

        const assignmentLabelMap = new Map<number, string>(data.assignmentLabels);
        const assignmentIdByPair = await fetchAssignmentIdByPairMap(auth.serviceClient, data.orgId);

        return NextResponse.json({
          requests: ((rows ?? []) as Record<string, unknown>[]).map((row) => {
            const requester = row.requester as {
              first_name: string;
              last_name: string;
            } | null;
            const target = row.target as {
              first_name: string;
              last_name: string;
            } | null;
            const mapped: DbShiftRequest = {
              id: row.id as string,
              org_id: row.org_id as string,
              type: row.type as ShiftRequestType,
              status: row.status as ShiftRequestStatus,
              requester_emp_id: row.requester_emp_id as string,
              requester_shift_date: row.requester_shift_date as string,
              requester_state: row.requester_state as DbShiftRequest["requester_state"],
              target_emp_id: (row.target_emp_id as string | null) ?? null,
              target_shift_date: (row.target_shift_date as string | null) ?? null,
              target_state: (row.target_state as DbShiftRequest["target_state"] | null) ?? null,
              absence_type_id: (row.absence_type_id as number | null) ?? null,
              parent_request_id: (row.parent_request_id as string | null) ?? null,
              admin_user_id: (row.admin_user_id as string | null) ?? null,
              admin_note: (row.admin_note as string | null) ?? null,
              expires_at: row.expires_at as string,
              resolved_at: (row.resolved_at as string | null) ?? null,
              created_at: row.created_at as string,
              updated_at: row.updated_at as string,
              requester_first_name: requester?.first_name,
              requester_last_name: requester?.last_name,
              target_first_name: target?.first_name ?? null,
              target_last_name: target?.last_name ?? null,
            };

            return rowToShiftRequest(mapped, assignmentLabelMap, undefined, assignmentIdByPair);
          }),
        });
      }

      case "createShiftRequest": {
        const auth = await requireEmployeeAction(req, data.orgId, data.requesterEmpId);
        if ("response" in auth) {
          return auth.response;
        }

        const { data: requestId, error } = await auth.userClient.rpc("create_shift_request", {
          p_org_id: data.orgId,
          p_type: data.type,
          p_requester_emp_id: data.requesterEmpId,
          p_requester_shift_date: data.requesterShiftDate,
          p_target_emp_id: data.targetEmpId ?? null,
          p_target_shift_date: data.targetShiftDate ?? null,
          p_absence_type_id: data.absenceTypeId ?? null,
          p_requester_segment_index: data.requesterSegmentIndex ?? null,
          p_target_segment_index: data.targetSegmentIndex ?? null,
        });
        if (error) {
          throw error;
        }

        await dispatchNotificationEvent(auth.actor.id, {
          action: "shift_request_created",
          orgId: data.orgId,
          requestId: requestId as string,
          requestType: data.type,
        });

        return NextResponse.json({ requestId: requestId as string });
      }

      case "claimShiftRequest": {
        const auth = await requireEmployeeAction(req, data.orgId, data.claimerEmpId);
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.userClient.rpc("claim_shift_request", {
          p_request_id: data.requestId,
          p_claimer_emp_id: data.claimerEmpId,
        });
        if (error) {
          throw error;
        }

        await dispatchNotificationEvent(auth.actor.id, {
          action: "shift_request_claimed",
          orgId: data.orgId,
          requestId: data.requestId,
          requestType: "pickup",
        });

        return NextResponse.json({ success: true });
      }

      case "volunteerForOpenShift": {
        const auth = await requireEmployeeAction(req, data.orgId, data.empId);
        if ("response" in auth) {
          return auth.response;
        }

        if (data.input.kind !== "worked" || data.input.segments.length === 0) {
          return NextResponse.json(
            { error: "Open-shift volunteering requires a worked assignment" },
            { status: 400 },
          );
        }

        const { data: requestId, error } = await auth.userClient.rpc("volunteer_for_open_shift", {
          p_org_id: data.orgId,
          p_emp_id: data.empId,
          p_shift_date: data.shiftDate,
          p_shift_ids: data.input.segments.map((segment) => segment.shiftId),
          p_job_ids: data.input.segments.map((segment) => segment.jobId),
          p_is_mentored_flags: data.input.segments.map((segment) => segment.isMentored ?? false),
          p_focus_area_id: data.focusAreaId,
          p_custom_start_time: data.input.customStartTime ?? null,
          p_custom_end_time: data.input.customEndTime ?? null,
        });
        if (error) {
          throw error;
        }

        await dispatchNotificationEvent(auth.actor.id, {
          action: "shift_request_created",
          orgId: data.orgId,
          requestId: requestId as string,
          requestType: "pickup",
        });

        return NextResponse.json({ requestId: requestId as string });
      }

      case "respondToShiftRequest": {
        const auth = await requireEmployeeAction(req, data.orgId, data.empId);
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.userClient.rpc("respond_to_shift_request", {
          p_request_id: data.requestId,
          p_emp_id: data.empId,
          p_accept: data.accept,
        });
        if (error) {
          throw error;
        }

        await dispatchNotificationEvent(auth.actor.id, {
          action: "shift_request_responded",
          orgId: data.orgId,
          requestId: data.requestId,
          requestType: "swap",
          accepted: data.accept,
        });

        return NextResponse.json({ success: true });
      }

      case "resolveShiftRequest": {
        const auth = await requireOrgPermissions(
          req,
          data.orgId,
          (permissions) =>
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canApproveShiftRequests,
        );
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.userClient.rpc("resolve_shift_request", {
          p_request_id: data.requestId,
          p_approved: data.approved,
          p_note: data.note ?? null,
        });
        if (error) {
          throw error;
        }

        await dispatchNotificationEvent(auth.actor.id, {
          action: "shift_request_resolved",
          orgId: data.orgId,
          requestId: data.requestId,
          requestType: "pickup",
          approved: data.approved,
          ...(data.note !== undefined ? { adminNote: data.note } : {}),
        });

        return NextResponse.json({ success: true });
      }

      case "cancelShiftRequest": {
        const auth = await requireEmployeeAction(req, data.orgId, data.empId);
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.userClient.rpc("cancel_shift_request", {
          p_request_id: data.requestId,
          p_emp_id: data.empId,
        });
        if (error) {
          throw error;
        }

        return NextResponse.json({ success: true });
      }
    }
  } catch (error) {
    return apiErrorResponse(error, "Shift request operation failed");
  }
}
