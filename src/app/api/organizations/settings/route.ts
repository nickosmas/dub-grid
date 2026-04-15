import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  focusAreaLabel: z.string().max(50).optional(),
  certificationLabel: z.string().max(50).optional(),
  roleLabel: z.string().max(50).optional(),
  departmentLabel: z.string().max(50).optional(),
  shiftDisplayMode: z.string().optional(),
  timezone: z.string().optional(),
  enforceConflictPrevention: z.boolean().optional(),
});

/**
 * PUT /api/organizations/settings
 * Server-side organization settings update with permission validation.
 */
export async function PUT(req: NextRequest) {
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

  const { orgId, ...fields } = parsed.data;

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
      (isAdmin && adminPerms?.canManageOrgSettings === true);

    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // ── Build update payload ────────────────────────────────────────
    const update: Record<string, unknown> = {};
    if (fields.name !== undefined) update.name = fields.name;
    if (fields.focusAreaLabel !== undefined) update.focus_area_label = fields.focusAreaLabel;
    if (fields.certificationLabel !== undefined) update.certification_label = fields.certificationLabel;
    if (fields.roleLabel !== undefined) update.role_label = fields.roleLabel;
    if (fields.departmentLabel !== undefined) update.department_label = fields.departmentLabel;
    if (fields.shiftDisplayMode !== undefined) update.shift_display_mode = fields.shiftDisplayMode;
    if (fields.timezone !== undefined) update.timezone = fields.timezone;
    if (fields.enforceConflictPrevention !== undefined) update.enforce_conflict_prevention = fields.enforceConflictPrevention;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // ── Execute update ──────────────────────────────────────────────
    const { error } = await serviceClient
      .from("organizations")
      .update(update)
      .eq("id", orgId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "organizations/settings", orgId } });
    logger.error({ error: err, orgId }, "Organization settings update failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
