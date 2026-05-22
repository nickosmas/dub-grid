import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS } from "@/lib/db/shared";
import {
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
} from "@dubgrid/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  empId: z.string().uuid(),
  orgId: z.string().uuid(),
  action: z.enum(["bench", "activate", "terminate"]),
  expectedVersion: z.number().int().min(0),
  note: z.string().optional(),
});

function buildConflictResponse(employee: ReturnType<typeof rowToEmployee>) {
  return NextResponse.json(
    {
      error:
        "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      employee,
    },
    { status: 409 },
  );
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

/**
 * POST /api/employees/status
 * Server-side employee status change with permission validation.
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // ── Rate limit by user ID ─────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
    );
  }

  // ── Input validation ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { empId, orgId, action, expectedVersion, note } = parsed.data;

  try {
    // ── Permission check ──────────────────────────────────────────────
    const serviceClient = getServiceClient();
    const [{ data: membership }, { data: profile }] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", user.id)
        .single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";
    const isAdmin = membership?.org_role === "admin";
    const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;

    const hasPermission =
      isGridmaster ||
      isSuperAdmin ||
      (isAdmin && adminPerms?.canManageEmployees === true);

    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { data: currentRow, error: currentError } = await serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", empId)
      .eq("org_id", orgId)
      .single();

    if (currentError) throw currentError;

    const currentEmployee = rowToEmployee(currentRow as DbEmployee);

    // Self-action guard: you cannot change your own staffing status
    // (bench / terminate / activate). Another admin must act.
    if (currentEmployee.userId === user.id) {
      return NextResponse.json(
        { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
        { status: 403 },
      );
    }

    if (currentEmployee.version !== expectedVersion) {
      return buildConflictResponse(currentEmployee);
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status_changed_at: now,
      version: expectedVersion + 1,
    };

    let auditAction = "employee.updated";
    let auditDetails: Record<string, unknown> = {
      fromStatus: currentEmployee.status,
    };

    switch (action) {
      case "bench":
        update.status = "benched";
        update.status_note = note ?? "";
        auditAction = "employee.benched";
        auditDetails = {
          ...auditDetails,
          toStatus: "benched",
          note: note ?? "",
        };
        break;
      case "activate":
        update.status = "active";
        update.status_note = "";
        update.archived_at = null;
        auditAction = "employee.activated";
        auditDetails = {
          ...auditDetails,
          toStatus: "active",
        };
        break;
      case "terminate":
        update.status = "terminated";
        update.archived_at = now;
        auditAction = "employee.archived";
        auditDetails = {
          ...auditDetails,
          toStatus: "terminated",
        };
        break;
    }

    const { data: updatedRow, error: updateError } = await serviceClient
      .from("employees")
      .update(update)
      .eq("id", empId)
      .eq("org_id", orgId)
      .eq("version", expectedVersion)
      .select(EMPLOYEE_COLS)
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedRow) {
      const { data: latestRow, error: latestError } = await serviceClient
        .from("employees")
        .select(EMPLOYEE_COLS)
        .eq("id", empId)
        .eq("org_id", orgId)
        .single();

      if (latestError) throw latestError;
      return buildConflictResponse(rowToEmployee(latestRow as DbEmployee));
    }

    const updatedEmployee = rowToEmployee(updatedRow as DbEmployee);

    const { error: auditError } = await serviceClient
      .from("audit_log")
      .insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: auditAction,
        resource_type: "employee",
        resource_id: empId,
        details: {
          ...auditDetails,
          changedFields: ["status"],
        },
        ip_address: getRequestIp(req),
        user_agent: req.headers.get("user-agent"),
      });

    if (auditError) {
      logger.error(
        { error: auditError, orgId, empId, action },
        "Employee status audit log write failed",
      );
    }

    return NextResponse.json({ success: true, employee: updatedEmployee });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/status", empId, orgId, action } });
    logger.error({ error: err, empId, orgId, action }, "Employee status change failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
