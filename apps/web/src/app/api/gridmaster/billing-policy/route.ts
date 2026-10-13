import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  BILLING_POLICY_KEYS,
  BILLING_POLICY_LIMITS,
  BILLING_POLICY_OVERRIDE_COLUMNS,
  BILLING_POLICY_OVERRIDE_SELECT,
  billingPolicyOverridesFromRow,
  type BillingPolicy,
  type BillingPolicyKey,
} from "@dubgrid/domain";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { getServiceClient } from "@/lib/supabase-service";
import { invalidatePlatformBillingPolicyCache } from "@/lib/billing-policy";
import { invalidateOrganizationBillingCache } from "@/lib/stripe";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const PLATFORM_COLUMNS: Record<BillingPolicyKey, string> = {
  trialDays: "default_trial_days",
  trialGraceDays: "trial_grace_days",
  trialReminderDays: "trial_reminder_days",
  paymentGraceDays: "payment_grace_days",
};
const PLATFORM_SELECT = `${Object.values(PLATFORM_COLUMNS).join(", ")}, updated_at`;

function dayCount(key: BillingPolicyKey) {
  const { min, max } = BILLING_POLICY_LIMITS[key];
  return z.number().int().min(min).max(max);
}

const policySchema = z.object({
  trialDays: dayCount("trialDays"),
  trialGraceDays: dayCount("trialGraceDays"),
  trialReminderDays: dayCount("trialReminderDays"),
  paymentGraceDays: dayCount("paymentGraceDays"),
});

const overridesSchema = z
  .object({
    trialDays: dayCount("trialDays").nullable(),
    trialGraceDays: dayCount("trialGraceDays").nullable(),
    trialReminderDays: dayCount("trialReminderDays").nullable(),
    paymentGraceDays: dayCount("paymentGraceDays").nullable(),
  })
  .partial()
  .refine((overrides) => Object.keys(overrides).length > 0, "Change at least one value.");

const bodySchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("platform"),
    values: policySchema,
    expectedUpdatedAt: z.string().min(1),
  }),
  z.object({
    scope: z.literal("organization"),
    orgId: z.string().uuid(),
    overrides: overridesSchema,
  }),
]);

function platformFromRow(row: Record<string, unknown>): BillingPolicy & { updatedAt: string } {
  return {
    trialDays: row.default_trial_days as number,
    trialGraceDays: row.trial_grace_days as number,
    trialReminderDays: row.trial_reminder_days as number,
    paymentGraceDays: row.payment_grace_days as number,
    updatedAt: row.updated_at as string,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;

  try {
    const { data, error } = await getServiceClient()
      .from("platform_billing_settings")
      .select(PLATFORM_SELECT)
      .eq("id", true)
      .single();
    if (error) throw error;
    return NextResponse.json({
      platform: platformFromRow(data as unknown as Record<string, unknown>),
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-billing-policy-get" } });
    logger.error({ err }, "Failed to load the billing policy");
    return NextResponse.json(
      { error: "We couldn't load the billing policy. Refresh and try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

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

  // Either write changes when organizations lock, for one organization or all.
  const assurance = await requireSensitiveActionAuth(req);
  if ("response" in assurance) return assurance.response;

  const { limited, reset, misconfigured } = await checkRateLimit(
    apiLimiter,
    `gridmaster-billing-policy:${user.id}`,
  );
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  const serviceClient = getServiceClient();
  try {
    if (parsed.data.scope === "platform") {
      const { values, expectedUpdatedAt } = parsed.data;
      const { data: before, error: beforeError } = await serviceClient
        .from("platform_billing_settings")
        .select(PLATFORM_SELECT)
        .eq("id", true)
        .single();
      if (beforeError) throw beforeError;

      const update: Record<string, unknown> = {
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      for (const key of BILLING_POLICY_KEYS) update[PLATFORM_COLUMNS[key]] = values[key];

      const { data: updated, error } = await serviceClient
        .from("platform_billing_settings")
        .update(update)
        .eq("id", true)
        .eq("updated_at", expectedUpdatedAt)
        .select(PLATFORM_SELECT)
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        return NextResponse.json(
          {
            error: "The billing policy was changed by someone else. Review it and try again.",
            platform: platformFromRow(before as unknown as Record<string, unknown>),
          },
          { status: 409 },
        );
      }

      await invalidatePlatformBillingPolicyCache();
      const previous = platformFromRow(before as unknown as Record<string, unknown>);
      await writeGridmasterAuditLog({
        serviceClient,
        actor: user,
        action: "billing.policy_updated",
        resourceType: "platform",
        resourceId: "billing_policy",
        orgId: null,
        details: {
          previous: Object.fromEntries(BILLING_POLICY_KEYS.map((key) => [key, previous[key]])),
          next: values,
        },
        request: req,
      });
      return NextResponse.json({
        platform: platformFromRow(updated as unknown as Record<string, unknown>),
      });
    }

    const { orgId, overrides } = parsed.data;
    const { data: org, error: orgError } = await serviceClient
      .from("organizations")
      .select(`id, ${BILLING_POLICY_OVERRIDE_SELECT}`)
      .eq("id", orgId)
      .eq("workspace_kind", "real")
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const previous = billingPolicyOverridesFromRow(org as unknown as Record<string, unknown>);
    const update: Record<string, number | null> = {};
    const changes: Record<string, { from: number | null; to: number | null }> = {};
    for (const key of BILLING_POLICY_KEYS) {
      if (!(key in overrides)) continue;
      const next = overrides[key] ?? null;
      update[BILLING_POLICY_OVERRIDE_COLUMNS[key]] = next;
      changes[key] = { from: previous[key] ?? null, to: next };
    }

    const { error: updateError } = await serviceClient
      .from("organizations")
      .update(update)
      .eq("id", orgId);
    if (updateError) throw updateError;

    await invalidateOrganizationBillingCache(orgId);
    await writeGridmasterAuditLog({
      serviceClient,
      actor: user,
      action: "billing.policy_overridden",
      resourceType: "organization",
      resourceId: orgId,
      orgId,
      details: { changes },
      request: req,
    });
    return NextResponse.json({
      overrides: {
        ...previous,
        ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
      },
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-billing-policy-post" } });
    logger.error({ err }, "Failed to update the billing policy");
    return NextResponse.json(
      { error: "We couldn't save the billing policy. Try again." },
      { status: 500 },
    );
  }
}
