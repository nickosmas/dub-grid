import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import {
  buildOrganizationSettingsChanges,
  pickOrganizationSettings,
} from "@/lib/organization-settings";
import { rowToOrganization } from "@/lib/db/mappers";
import type { DbOrganization } from "@/lib/db/types";
import { ORGANIZATION_COLS } from "@/lib/db/shared";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  addressLine1: z.string().trim().max(120).optional(),
  addressLine2: z.string().trim().max(120).optional(),
  addressCity: z.string().trim().max(80).optional(),
  addressState: z.string().trim().max(80).optional(),
  addressPostalCode: z.string().trim().max(20).optional(),
  addressCountry: z.string().trim().max(80).optional(),
  focusAreaLabel: z.string().trim().max(50).optional(),
  certificationLabel: z.string().trim().max(50).optional(),
  roleLabel: z.string().trim().max(50).optional(),
  departmentLabel: z.string().trim().max(50).optional(),
  shiftDisplayMode: z.enum(["code", "name"]).optional(),
  timezone: z.string().trim().optional(),
  enforceConflictPrevention: z.boolean().optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
  featureOverrides: z.record(z.string(), z.boolean()).optional(),
});

function timestampsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return new Date(left).getTime() === new Date(right).getTime();
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

function buildConflictResponse(latestOrg: ReturnType<typeof rowToOrganization>) {
  return NextResponse.json(
    {
      error:
        "Organization settings changed elsewhere. Review the latest values before saving again.",
      code: "ORG_SETTINGS_CONFLICT",
      organization: latestOrg,
    },
    { status: 409 },
  );
}

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

  const { orgId, expectedUpdatedAt, ...fields } = parsed.data;

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

    const { data: existingRow, error: existingError } = await serviceClient
      .from("organizations")
      .select(ORGANIZATION_COLS)
      .eq("id", orgId)
      .single();

    if (existingError) throw existingError;

    const currentOrg = rowToOrganization(existingRow as DbOrganization);

    if (!timestampsMatch(currentOrg.updatedAt, expectedUpdatedAt)) {
      return buildConflictResponse(currentOrg);
    }

    const nextAddress = {
      addressLine1: fields.addressLine1 ?? currentOrg.addressLine1 ?? "",
      addressLine2: fields.addressLine2 ?? currentOrg.addressLine2 ?? "",
      addressCity: fields.addressCity ?? currentOrg.addressCity ?? "",
      addressState: fields.addressState ?? currentOrg.addressState ?? "",
      addressPostalCode: fields.addressPostalCode ?? currentOrg.addressPostalCode ?? "",
      addressCountry: fields.addressCountry ?? currentOrg.addressCountry ?? "",
    };

    const nextOrg = {
      ...currentOrg,
      name: fields.name ?? currentOrg.name,
      phone: fields.phone ?? currentOrg.phone,
      addressLine1: nextAddress.addressLine1,
      addressLine2: nextAddress.addressLine2,
      addressCity: nextAddress.addressCity,
      addressState: nextAddress.addressState,
      addressPostalCode: nextAddress.addressPostalCode,
      addressCountry: nextAddress.addressCountry,
      address: composeOrganizationAddress(nextAddress),
      focusAreaLabel: fields.focusAreaLabel ?? currentOrg.focusAreaLabel,
      certificationLabel:
        fields.certificationLabel ?? currentOrg.certificationLabel,
      roleLabel: fields.roleLabel ?? currentOrg.roleLabel,
      departmentLabel: fields.departmentLabel ?? currentOrg.departmentLabel,
      shiftDisplayMode: fields.shiftDisplayMode ?? currentOrg.shiftDisplayMode,
      timezone:
        fields.timezone !== undefined
          ? fields.timezone || null
          : currentOrg.timezone,
      enforceConflictPrevention:
        fields.enforceConflictPrevention ??
        currentOrg.enforceConflictPrevention,
      dataRetentionDays:
        fields.dataRetentionDays ?? currentOrg.dataRetentionDays,
      featureOverrides:
        fields.featureOverrides ?? currentOrg.featureOverrides,
    };

    const changes = buildOrganizationSettingsChanges(
      pickOrganizationSettings(currentOrg),
      pickOrganizationSettings(nextOrg),
    );

    if (changes.length === 0) {
      return NextResponse.json({ success: true, organization: currentOrg });
    }

    const update: Record<string, unknown> = { updated_by: user.id };
    const changeKeys = new Set(changes.map((change) => change.key));

    if (changeKeys.has("name")) update.name = nextOrg.name;
    if (changeKeys.has("phone")) update.phone = nextOrg.phone;
    if (
      changeKeys.has("addressLine1") ||
      changeKeys.has("addressLine2") ||
      changeKeys.has("addressCity") ||
      changeKeys.has("addressState") ||
      changeKeys.has("addressPostalCode") ||
      changeKeys.has("addressCountry")
    ) {
      update.address_line_1 = nextOrg.addressLine1;
      update.address_line_2 = nextOrg.addressLine2;
      update.address_city = nextOrg.addressCity;
      update.address_state = nextOrg.addressState;
      update.address_postal_code = nextOrg.addressPostalCode;
      update.address_country = nextOrg.addressCountry;
      update.address = nextOrg.address;
    }
    if (changeKeys.has("focusAreaLabel")) {
      update.focus_area_label = nextOrg.focusAreaLabel;
    }
    if (changeKeys.has("certificationLabel")) {
      update.certification_label = nextOrg.certificationLabel;
    }
    if (changeKeys.has("roleLabel")) {
      update.role_label = nextOrg.roleLabel;
    }
    if (changeKeys.has("departmentLabel")) {
      update.department_label = nextOrg.departmentLabel;
    }
    if (changeKeys.has("shiftDisplayMode")) {
      update.shift_display_mode = nextOrg.shiftDisplayMode;
    }
    if (changeKeys.has("timezone")) {
      update.timezone = nextOrg.timezone;
    }
    if (changeKeys.has("enforceConflictPrevention")) {
      update.enforce_conflict_prevention = nextOrg.enforceConflictPrevention;
    }
    if (changeKeys.has("dataRetentionDays")) {
      update.data_retention_days = nextOrg.dataRetentionDays;
    }
    if (changeKeys.has("featureOverrides")) {
      update.feature_overrides = nextOrg.featureOverrides;
    }

    const { data: updatedRow, error: updateError } = await serviceClient
      .from("organizations")
      .update(update)
      .eq("id", orgId)
      .eq("updated_at", expectedUpdatedAt)
      .select(ORGANIZATION_COLS)
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedRow) {
      const { data: latestRow, error: latestError } = await serviceClient
        .from("organizations")
        .select(ORGANIZATION_COLS)
        .eq("id", orgId)
        .single();

      if (latestError) throw latestError;
      return buildConflictResponse(
        rowToOrganization(latestRow as DbOrganization),
      );
    }

    const updatedOrg = rowToOrganization(updatedRow as DbOrganization);

    const auditPayload = {
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: "org.updated",
      resource_type: "organization",
      resource_id: orgId,
      details: {
        changedFields: changes.map((change) => change.key),
        changes: changes.map((change) => ({
          field: change.key,
          label: change.label,
          from: change.previousValue,
          to: change.nextValue,
        })),
      },
      ip_address: getRequestIp(req),
      user_agent: req.headers.get("user-agent"),
    };

    const { error: auditError } = await serviceClient
      .from("audit_log")
      .insert(auditPayload);

    if (auditError) {
      logger.error(
        { error: auditError, orgId, userId: user.id },
        "Organization settings audit log write failed",
      );
    }

    return NextResponse.json({ success: true, organization: updatedOrg });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "organizations/settings", orgId } });
    logger.error({ error: err, orgId }, "Organization settings update failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
