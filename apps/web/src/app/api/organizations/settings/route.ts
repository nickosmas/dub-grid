import { NextRequest, NextResponse } from "next/server";
import { normalizeOptionalUsPhone } from "@dubgrid/contracts";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
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
import { cacheDel, CacheKey } from "@/lib/cache";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import {
  getLineTextError,
  getOptionalUsPhoneFieldError,
  normalizeLineText,
} from "@/lib/form-validation";

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
  shiftDisplayMode: z.enum(["code", "name"]).optional(),
  showShiftDetailHoverCards: z.boolean().optional(),
  useCompactRoleCertificationLabels: z.boolean().optional(),
  timezone: z.string().trim().optional(),
  payPeriodStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  enforceConflictPrevention: z.boolean().optional(),
  defaultShiftEnabled: z.boolean().optional(),
  coverageRuleConfig: z
    .object({
      mentoredCoverageCreditPercent: z.number().int().min(0).max(100),
    })
    .optional(),
  openShiftVisibility: z
    .object({
      coverageGap: z.enum(["hidden", "matched", "always"]),
      calloff: z.enum(["hidden", "matched", "always"]),
    })
    .optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
  featureOverrides: z.record(z.string(), z.boolean()).optional(),
});

function timestampsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
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

  // bodyOrgId is what the client sent. The effective orgId we ultimately
  // read and write against is `orgId`, assigned below from the auth
  // result — it may have been redirected to the user's sandbox by
  // requireOrgPermissions.
  const { orgId: bodyOrgId, expectedUpdatedAt, ...fields } = parsed.data;
  const fieldErrors = {
    ...(fields.name !== undefined
      ? {
          name: getLineTextError(fields.name, {
            label: "Organization name",
            maxLength: 200,
            required: true,
          }),
        }
      : {}),
    ...(fields.phone !== undefined ? { phone: getOptionalUsPhoneFieldError(fields.phone) } : {}),
    ...(fields.addressLine1 !== undefined
      ? {
          addressLine1: getLineTextError(fields.addressLine1, {
            label: "Address line 1",
            maxLength: 120,
          }),
        }
      : {}),
    ...(fields.addressLine2 !== undefined
      ? {
          addressLine2: getLineTextError(fields.addressLine2, {
            label: "Address line 2",
            maxLength: 120,
          }),
        }
      : {}),
    ...(fields.addressCity !== undefined
      ? {
          addressCity: getLineTextError(fields.addressCity, {
            label: "City",
            maxLength: 80,
          }),
        }
      : {}),
    ...(fields.addressState !== undefined
      ? {
          addressState: getLineTextError(fields.addressState, {
            label: "State / province",
            maxLength: 80,
          }),
        }
      : {}),
    ...(fields.addressPostalCode !== undefined
      ? {
          addressPostalCode: getLineTextError(fields.addressPostalCode, {
            label: "Postal code",
            maxLength: 20,
          }),
        }
      : {}),
    ...(fields.addressCountry !== undefined
      ? {
          addressCountry: getLineTextError(fields.addressCountry, {
            label: "Country",
            maxLength: 80,
          }),
        }
      : {}),
    ...(fields.focusAreaLabel !== undefined
      ? {
          focusAreaLabel: getLineTextError(fields.focusAreaLabel, {
            label: "Focus area label",
            maxLength: 50,
            required: true,
          }),
        }
      : {}),
    ...(fields.certificationLabel !== undefined
      ? {
          certificationLabel: getLineTextError(fields.certificationLabel, {
            label: "Certification label",
            maxLength: 50,
            required: true,
          }),
        }
      : {}),
    ...(fields.roleLabel !== undefined
      ? {
          roleLabel: getLineTextError(fields.roleLabel, {
            label: "Role label",
            maxLength: 50,
            required: true,
          }),
        }
      : {}),
  } as const;
  const firstFieldError = Object.values(fieldErrors).find(Boolean);
  if (firstFieldError) {
    return NextResponse.json({ error: firstFieldError, fieldErrors }, { status: 400 });
  }

  try {
    // ── Permission check ──────────────────────────────────────────────
    const orgAuth = await requireOrgPermissions(
      req,
      bodyOrgId,
      (permissions) =>
        permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageOrgSettings,
      { allowDuringSetup: true, actor: user },
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    // requireOrgPermissions may have redirected the orgId to the user's
    // sandbox. Every read/write below uses the effective orgId, not the
    // body's — otherwise the validation lands on sandbox while writes
    // hit the real organization.
    const orgId = orgAuth.orgId;
    const serviceClient = orgAuth.serviceClient;

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

    const normalizedAddress = {
      addressLine1: normalizeLineText(nextAddress.addressLine1, {
        label: "Address line 1",
        maxLength: 120,
      }),
      addressLine2: normalizeLineText(nextAddress.addressLine2, {
        label: "Address line 2",
        maxLength: 120,
      }),
      addressCity: normalizeLineText(nextAddress.addressCity, {
        label: "City",
        maxLength: 80,
      }),
      addressState: normalizeLineText(nextAddress.addressState, {
        label: "State / province",
        maxLength: 80,
      }),
      addressPostalCode: normalizeLineText(nextAddress.addressPostalCode, {
        label: "Postal code",
        maxLength: 20,
      }),
      addressCountry: normalizeLineText(nextAddress.addressCountry, {
        label: "Country",
        maxLength: 80,
      }),
    };

    const nextOrg = {
      ...currentOrg,
      name:
        fields.name !== undefined
          ? normalizeLineText(fields.name, {
              label: "Organization name",
              maxLength: 200,
              required: true,
            })
          : currentOrg.name,
      phone: fields.phone !== undefined ? normalizeOptionalUsPhone(fields.phone) : currentOrg.phone,
      addressLine1: normalizedAddress.addressLine1,
      addressLine2: normalizedAddress.addressLine2,
      addressCity: normalizedAddress.addressCity,
      addressState: normalizedAddress.addressState,
      addressPostalCode: normalizedAddress.addressPostalCode,
      addressCountry: normalizedAddress.addressCountry,
      address: composeOrganizationAddress(normalizedAddress),
      focusAreaLabel:
        fields.focusAreaLabel !== undefined
          ? normalizeLineText(fields.focusAreaLabel, {
              label: "Focus area label",
              maxLength: 50,
              required: true,
            })
          : currentOrg.focusAreaLabel,
      certificationLabel:
        fields.certificationLabel !== undefined
          ? normalizeLineText(fields.certificationLabel, {
              label: "Certification label",
              maxLength: 50,
              required: true,
            })
          : currentOrg.certificationLabel,
      roleLabel:
        fields.roleLabel !== undefined
          ? normalizeLineText(fields.roleLabel, {
              label: "Role label",
              maxLength: 50,
              required: true,
            })
          : currentOrg.roleLabel,
      shiftDisplayMode: fields.shiftDisplayMode ?? currentOrg.shiftDisplayMode,
      showShiftDetailHoverCards:
        fields.showShiftDetailHoverCards ?? currentOrg.showShiftDetailHoverCards,
      useCompactRoleCertificationLabels:
        fields.useCompactRoleCertificationLabels ?? currentOrg.useCompactRoleCertificationLabels,
      timezone: fields.timezone !== undefined ? fields.timezone || null : currentOrg.timezone,
      payPeriodStartDate:
        fields.payPeriodStartDate !== undefined
          ? fields.payPeriodStartDate
          : currentOrg.payPeriodStartDate,
      enforceConflictPrevention:
        fields.enforceConflictPrevention ?? currentOrg.enforceConflictPrevention,
      defaultShiftEnabled: fields.defaultShiftEnabled ?? currentOrg.defaultShiftEnabled,
      coverageRuleConfig: fields.coverageRuleConfig ?? currentOrg.coverageRuleConfig,
      openShiftVisibility: fields.openShiftVisibility ?? currentOrg.openShiftVisibility,
      dataRetentionDays: fields.dataRetentionDays ?? currentOrg.dataRetentionDays,
      featureOverrides: fields.featureOverrides ?? currentOrg.featureOverrides,
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
    if (changeKeys.has("shiftDisplayMode")) {
      update.shift_display_mode = nextOrg.shiftDisplayMode;
    }
    if (changeKeys.has("showShiftDetailHoverCards")) {
      update.show_shift_detail_hover_cards = nextOrg.showShiftDetailHoverCards;
    }
    if (changeKeys.has("useCompactRoleCertificationLabels")) {
      update.use_compact_role_certification_labels = nextOrg.useCompactRoleCertificationLabels;
    }
    if (changeKeys.has("timezone")) {
      update.timezone = nextOrg.timezone;
    }
    if (changeKeys.has("payPeriodStartDate")) {
      update.pay_period_start_date = nextOrg.payPeriodStartDate;
    }
    if (changeKeys.has("enforceConflictPrevention")) {
      update.enforce_conflict_prevention = nextOrg.enforceConflictPrevention;
    }
    if (changeKeys.has("defaultShiftEnabled")) {
      update.default_shift_enabled = nextOrg.defaultShiftEnabled;
    }
    if (changeKeys.has("coverageRuleConfig")) {
      update.coverage_rule_config = nextOrg.coverageRuleConfig;
    }
    if (changeKeys.has("openShiftVisibility")) {
      update.open_shift_visibility = nextOrg.openShiftVisibility;
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
      return buildConflictResponse(rowToOrganization(latestRow as DbOrganization));
    }

    const updatedOrg = rowToOrganization(updatedRow as DbOrganization);

    // The organization key also invalidates the aggregate bootstrap cache.
    // Await it so the client's immediate post-save refetch cannot race stale Redis data.
    await cacheDel(
      CacheKey.organization(orgId),
      ...(changeKeys.has("name") && updatedOrg.slug ? [CacheKey.orgBySlug(updatedOrg.slug)] : []),
    );

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

    const { error: auditError } = await serviceClient.from("audit_log").insert(auditPayload);

    if (auditError) {
      logger.error(
        { error: auditError, orgId, userId: user.id },
        "Organization settings audit log write failed",
      );
    }

    if (changeKeys.has("featureOverrides")) {
      const { error: featureAuditError } = await serviceClient.from("audit_log").insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email ?? null,
        action: "feature_flags.updated",
        resource_type: "organization",
        resource_id: orgId,
        details: {
          from: currentOrg.featureOverrides,
          to: nextOrg.featureOverrides,
        },
        ip_address: getRequestIp(req),
        user_agent: req.headers.get("user-agent"),
      });

      if (featureAuditError) {
        logger.error(
          { error: featureAuditError, orgId, userId: user.id },
          "Runtime controls audit log write failed",
        );
      }
    }

    return NextResponse.json({ success: true, organization: updatedOrg });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { context: "organizations/settings", orgId: bodyOrgId },
    });
    logger.error({ error: err, orgId: bodyOrgId }, "Organization settings update failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
