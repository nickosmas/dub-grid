import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { revokeAllUserSessions } from "@/lib/auth/revocation";
import { isCallerInactive, resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS, cacheDel, CacheKey } from "@/lib/db/shared";
import { SELF_ACTION_FORBIDDEN_CODE, SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  empId: z.string().uuid(),
  orgId: z.string().uuid(),
  action: z.enum(["deactivate", "activate", "remove"]),
  expectedVersion: z.number().int().min(0),
  note: z.string().optional(),
});

function buildConflictResponse(employee: ReturnType<typeof rowToEmployee>) {
  return NextResponse.json(
    {
      error: "Employee status changed elsewhere. Review the latest values before saving again.",
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
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
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
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const { empId, action, expectedVersion, note } = parsed.data;
  // Effective (sandbox-redirected) org; resolved inside the try, declared here
  // so the catch block can reference it for logging. (H-1)
  let orgId = parsed.data.orgId;

  try {
    // Resolve the effective org: if the caller is in sandbox mode, route the
    // check AND the mutation to their sandbox, never the raw request orgId
    // (otherwise a sandbox user could mutate the real org). See H-1.
    orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);

    // ── Permission check ──────────────────────────────────────────────
    const serviceClient = getServiceClient();
    const [{ data: membership }, { data: profile }, inactive] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient.from("profiles").select("platform_role").eq("id", user.id).single(),
      isCallerInactive(serviceClient, user.id, orgId),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";
    const isAdmin = membership?.org_role === "admin";
    const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;

    // Inactive employees keep their session but lose every manage capability —
    // mirrors requireOrgPermissions / resolveMobileAuthContext. Gridmaster/super_admin
    // bypass: those tiers aren't meant to be sidelined by a stale employees.status row.
    const hasPermission =
      isGridmaster ||
      isSuperAdmin ||
      (isAdmin && !inactive && adminPerms?.canManageEmployees === true);

    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
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

    // Removing staff already fully blocks login at the JWT hook regardless of
    // org_role (see 002_functions_triggers.sql), so removing the org's only
    // super_admin here would lock the org out just as surely as deleting their
    // membership would — the same guard DELETE /api/organizations/access
    // applies before letting a super_admin be removed.
    if (action === "remove" && currentEmployee.userId) {
      const { data: targetMembership } = await serviceClient
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", currentEmployee.userId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle();

      if (targetMembership?.org_role === "super_admin") {
        const { count } = await serviceClient
          .from("organization_memberships")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("org_role", "super_admin")
          .is("archived_at", null);

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "Cannot remove the only super admin. Transfer ownership first." },
            { status: 400 },
          );
        }
      }
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
      case "deactivate":
        update.status = "inactive";
        update.status_note = note ?? "";
        auditAction = "employee.deactivated";
        auditDetails = {
          ...auditDetails,
          toStatus: "inactive",
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
      case "remove":
        update.status = "removed";
        update.status_note = note ?? "";
        update.archived_at = now;
        auditAction = "employee.removed";
        auditDetails = {
          ...auditDetails,
          toStatus: "removed",
          note: note ?? "",
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

    // Cut the person's live tokens, not just their next sign-in.
    //
    // The JWT hook refuses to mint for a terminated employee, so they can't
    // sign in or refresh again — but an access token they already hold stays
    // cryptographically valid until it expires, and API routes verify tokens
    // locally now. Org-scoped routes would still reject them on the
    // per-request membership check; this covers the routes that only
    // authenticate. Non-fatal: never fail the status change over it.
    if ((action === "remove" || action === "deactivate") && currentEmployee.userId) {
      try {
        await revokeAllUserSessions(currentEmployee.userId);
      } catch (err) {
        logger.error(
          { error: err, orgId, empId, userId: currentEmployee.userId, action },
          "Failed to revoke sessions after employee status change",
        );
      }
    }

    // Remove/activate a linked user's org membership in lockstep with their
    // employees.status, in the same request that already committed the status
    // change — not as a second, separately-triggered client call — so the two
    // can't diverge (e.g. the status update fails but access is revoked
    // anyway, or status flips back to active while access stays revoked).
    // Gated to gridmaster/super_admin — the same tier required by
    // DELETE /api/organizations/access — so a plain admin with only
    // canManageEmployees can't use Remove/Activate as a side door to change
    // org access they aren't allowed to touch directly.
    if (
      (action === "remove" || action === "activate") &&
      currentEmployee.userId &&
      (isGridmaster || isSuperAdmin)
    ) {
      const { error: membershipError } =
        action === "remove"
          ? await serviceClient
              .from("organization_memberships")
              .update({ archived_at: now, archived_by: user.id })
              .eq("user_id", currentEmployee.userId)
              .eq("org_id", orgId)
              .is("archived_at", null)
          : await serviceClient
              .from("organization_memberships")
              .update({ archived_at: null, archived_by: null })
              .eq("user_id", currentEmployee.userId)
              .eq("org_id", orgId)
              .not("archived_at", "is", null);

      if (membershipError) {
        logger.error(
          { error: membershipError, orgId, empId, userId: currentEmployee.userId, action },
          "Failed to sync organization membership with employee status change",
        );
      } else {
        await cacheDel(
          CacheKey.orgUsers(orgId),
          CacheKey.orgDirectory(orgId),
          CacheKey.employees(orgId),
          CacheKey.allUsers(),
        );
      }
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
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
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
