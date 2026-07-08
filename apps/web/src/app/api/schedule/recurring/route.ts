import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DbRecurringShift } from "@dubgrid/db-types";
import { scheduleCellStateSchema } from "@dubgrid/contracts";
import { requireOrgPermissions, resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { fetchAssignmentIdByPairMap } from "@/app/api/shared/schedule";
import { rowToRecurringShift } from "@/lib/db/mappers";
import { RECURRING_SHIFT_COLS } from "@/lib/db/shared";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const mapEntrySchema = z.array(z.tuple([z.number().int(), z.string()]));

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fetchRecurringShifts"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    assignmentLabels: mapEntrySchema.optional(),
    absenceTypeLabels: mapEntrySchema.optional(),
    includeArchived: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("getRecurringDraft"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("saveRecurringDraft"),
    orgId: z.string().uuid(),
    draftData: z.record(z.string(), z.record(z.string(), scheduleCellStateSchema.nullable())),
  }),
  z.object({
    action: z.literal("deleteRecurringDraft"),
    orgId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("upsertRecurringShift"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6),
    input: scheduleCellStateSchema,
    effectiveFrom: z.string().date(),
  }),
  z.object({
    action: z.literal("deleteRecurringShift"),
    orgId: z.string().uuid(),
    employeeId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6),
  }),
]);

function canReadRecurring(
  permissions: ReturnType<typeof import("@dubgrid/authz").buildPermissionContext>,
) {
  return (
    permissions.isGridmaster ||
    permissions.isSuperAdmin ||
    permissions.canViewRecurringShifts ||
    permissions.canManageRecurringShifts
  );
}

function canManageRecurring(
  permissions: ReturnType<typeof import("@dubgrid/authz").buildPermissionContext>,
) {
  return (
    permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageRecurringShifts
  );
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

  // Sandbox redirect.
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
      case "fetchRecurringShifts": {
        const auth = await requireOrgPermissions(req, data.orgId, canReadRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        let query = auth.serviceClient
          .from("recurring_shifts")
          .select(RECURRING_SHIFT_COLS)
          .eq("org_id", data.orgId)
          .order("day_of_week")
          .order("effective_from", { ascending: false });
        if (!data.includeArchived) {
          query = query.is("archived_at", null);
        }
        if (data.employeeId) {
          query = query.eq("emp_id", data.employeeId);
        }

        const { data: rows, error } = await query;
        if (error) {
          throw error;
        }

        const assignmentLabelMap = new Map<number, string>(data.assignmentLabels ?? []);
        const absenceTypeMap = new Map<number, string>(data.absenceTypeLabels ?? []);
        const assignmentIdByPair = await fetchAssignmentIdByPairMap(auth.serviceClient, data.orgId);

        return NextResponse.json({
          rows: ((rows ?? []) as DbRecurringShift[]).map((row) =>
            rowToRecurringShift(
              row,
              assignmentLabelMap,
              absenceTypeMap,
              undefined,
              assignmentIdByPair,
            ),
          ),
        });
      }

      case "getRecurringDraft": {
        const auth = await requireOrgPermissions(req, data.orgId, canManageRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        const { data: row, error } = await auth.serviceClient
          .from("recurring_shifts_draft_sessions")
          .select("id, org_id, saved_by, draft_data, saved_at")
          .eq("org_id", data.orgId)
          .eq("saved_by", auth.actor.id)
          .maybeSingle();
        if (error) {
          throw error;
        }

        return NextResponse.json({
          draft: row
            ? {
                id: row.id,
                orgId: row.org_id,
                savedBy: row.saved_by,
                draftData: row.draft_data,
                savedAt: row.saved_at,
              }
            : null,
        });
      }

      case "saveRecurringDraft": {
        const auth = await requireOrgPermissions(req, data.orgId, canManageRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        const { data: existing, error: existingError } = await auth.serviceClient
          .from("recurring_shifts_draft_sessions")
          .select("id")
          .eq("org_id", data.orgId)
          .eq("saved_by", auth.actor.id)
          .maybeSingle();
        if (existingError) {
          throw existingError;
        }

        if (existing?.id) {
          const { error } = await auth.serviceClient
            .from("recurring_shifts_draft_sessions")
            .update({
              saved_by: auth.actor.id,
              draft_data: data.draftData,
              saved_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (error) {
            throw error;
          }
        } else {
          const { error } = await auth.serviceClient
            .from("recurring_shifts_draft_sessions")
            .insert({
              org_id: data.orgId,
              saved_by: auth.actor.id,
              draft_data: data.draftData,
              saved_at: new Date().toISOString(),
            });
          if (error) {
            throw error;
          }
        }

        return NextResponse.json({ success: true });
      }

      case "deleteRecurringDraft": {
        const auth = await requireOrgPermissions(req, data.orgId, canManageRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.serviceClient
          .from("recurring_shifts_draft_sessions")
          .delete()
          .eq("org_id", data.orgId)
          .eq("saved_by", auth.actor.id);
        if (error) {
          throw error;
        }

        return NextResponse.json({ success: true });
      }

      case "upsertRecurringShift": {
        const auth = await requireOrgPermissions(req, data.orgId, canManageRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        if (data.input.kind === "worked" && data.input.segments.length === 0) {
          return NextResponse.json(
            { error: "Recurring schedules require at least one worked segment" },
            { status: 400 },
          );
        }

        const { error } = await auth.userClient.rpc("upsert_recurring_shift", {
          p_emp_id: data.employeeId,
          p_org_id: data.orgId,
          p_day_of_week: data.dayOfWeek,
          p_state: data.input,
          p_effective_from: data.effectiveFrom,
        });
        if (error) {
          throw error;
        }

        void dispatchNotificationEvent(auth.actor.id, {
          action: "recurring_shift_updated",
          orgId: data.orgId,
          empId: data.employeeId,
          mode: "upsert",
        });

        return NextResponse.json({ success: true });
      }

      case "deleteRecurringShift": {
        const auth = await requireOrgPermissions(req, data.orgId, canManageRecurring);
        if ("response" in auth) {
          return auth.response;
        }

        const { error } = await auth.serviceClient
          .from("recurring_shifts")
          .update({ archived_at: new Date().toISOString() })
          .eq("org_id", data.orgId)
          .eq("emp_id", data.employeeId)
          .eq("day_of_week", data.dayOfWeek)
          .is("archived_at", null);
        if (error) {
          throw error;
        }

        void dispatchNotificationEvent(auth.actor.id, {
          action: "recurring_shift_updated",
          orgId: data.orgId,
          empId: data.employeeId,
          mode: "delete",
        });

        return NextResponse.json({ success: true });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recurring schedule operation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
