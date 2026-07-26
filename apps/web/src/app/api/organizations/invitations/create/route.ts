import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOptionalUsPhone,
  normalizeRequiredStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { forbidIfSandboxCookie, requireAuthenticatedUser } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees, isOrgSuperAdminOrGridmaster } from "@/app/api/employees/shared";
import type { AssignableOrganizationRole } from "@/types";
import { buildStaffValidationErrorResponse, getStaffFieldErrors } from "@/lib/staff-validation";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { API_ERRORS } from "@dubgrid/client-errors";

const postSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["user", "admin", "super_admin"]),
  orgId: z.string().uuid(),
  employeeId: z.string().uuid().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  departmentIds: z.array(z.number().int()).optional(),
  deptAdminIds: z.array(z.number().int()).optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const {
    email,
    role,
    orgId,
    employeeId,
    firstName,
    lastName,
    phone,
    departmentIds,
    deptAdminIds,
  } = parsed.data;

  try {
    const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }

    // Tier guard: only super_admin or gridmaster can hand out the super_admin
    // role. Regular admins with canManageEmployees can still invite admin/user.
    if (role === "super_admin") {
      const allowed = await isOrgSuperAdminOrGridmaster(serviceClient, user.id, orgId);
      if (!allowed) {
        return NextResponse.json({ error: API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN }, { status: 403 });
      }
    }

    const fieldErrors = getStaffFieldErrors({
      email,
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(phone !== undefined ? { phone } : {}),
    });
    if (Object.keys(fieldErrors).length > 0) {
      return buildStaffValidationErrorResponse(fieldErrors);
    }

    const { data, error } = await serviceClient.rpc("send_invitation", {
      p_email: normalizeRequiredStaffEmail(email),
      p_role: role as AssignableOrganizationRole,
      p_org_id: orgId,
      p_employee_id: employeeId ?? null,
      p_first_name:
        typeof firstName === "string"
          ? firstName.trim()
            ? normalizeStaffName(firstName)
            : null
          : null,
      p_last_name:
        typeof lastName === "string"
          ? lastName.trim()
            ? normalizeStaffName(lastName)
            : null
          : null,
      p_phone: typeof phone === "string" ? normalizeOptionalUsPhone(phone) || null : null,
      p_department_ids: departmentIds ?? [],
      p_dept_admin_ids: deptAdminIds ?? [],
    });
    if (error) throw error;

    void dispatchNotificationEvent(user.id, {
      action: "invitation_created",
      orgId,
      invitationId: data.invitation_id as string,
      inviteeEmail: normalizeRequiredStaffEmail(email),
    });

    return NextResponse.json({
      invitationId: data.invitation_id as string,
      token: data.token as string,
      expiresAt: data.expires_at as string,
    });
  } catch (error) {
    console.error("organization invitation create POST failed", error);
    // Surface the known send_invitation RPC errors with friendly messages
    // and correct status codes. Anything we don't recognize falls through
    // to a generic 500 so we don't leak internals.
    const rawMessage =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
    const text = rawMessage.toLowerCase();
    if (text.includes("user is already a member")) {
      return NextResponse.json(
        {
          error:
            "That user is already a member of this organization. Open their existing record to update their access.",
        },
        { status: 409 },
      );
    }
    if (text.includes("active invitation already exists")) {
      return NextResponse.json(
        {
          error:
            "An invitation has already been sent to that email and is still pending. Revoke or resend the existing invitation instead.",
        },
        { status: 409 },
      );
    }
    if (text.includes("employee not found")) {
      return NextResponse.json(
        { error: "The selected employee record no longer exists." },
        { status: 404 },
      );
    }
    if (text.includes("employee already has a linked user")) {
      return NextResponse.json(
        {
          error: "That employee record is already linked to a user account.",
        },
        { status: 409 },
      );
    }
    if (text.includes("organization not found or archived")) {
      return NextResponse.json(
        { error: "This organization is no longer available." },
        { status: 404 },
      );
    }
    if (text.includes("unauthorized")) {
      return NextResponse.json(
        { error: "You don't have permission to send invitations here." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}
