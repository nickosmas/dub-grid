import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { invalidatePlatformFlagsCache, PLATFORM_FLAGS_TAG } from "@/lib/feature-flags";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * Drops both caching layers behind isFeatureEnabled: Redis (shared across
 * instances) and Next's Data Cache (per deployment region, and what the
 * prerendered pages read through). Missing the second one would leave a
 * flipped kill switch invisible for up to its TTL.
 */
async function dropFlagCaches(): Promise<void> {
  await invalidatePlatformFlagsCache();
  // `{ expire: 0 }` purges rather than merely marking stale — a gridmaster
  // flipping a kill switch mid-incident should not be served the old value
  // once more while the new one revalidates. (`updateTag` would be the more
  // direct spelling, but it is Server-Action-only and this codebase has no
  // Server Actions.)
  revalidateTag(PLATFORM_FLAGS_TAG, { expire: 0 });
}

const updateSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  expectedUpdatedAt: z.string(),
});

const createSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only."),
  description: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
});

type PlatformFlagRow = {
  key: string;
  enabled: boolean;
  description: string;
  updated_by: string | null;
  updated_at: string;
};

function toPlatformFeatureFlag(row: PlatformFlagRow) {
  return {
    key: row.key,
    enabled: row.enabled,
    description: row.description,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireGridmasterSession(req);
  if ("response" in auth) return auth.response;

  try {
    const { data, error } = await getServiceClient()
      .from("platform_feature_flags")
      .select("key, enabled, description, updated_by, updated_at")
      .order("key");
    if (error) throw error;

    return NextResponse.json({ flags: (data as PlatformFlagRow[]).map(toPlatformFeatureFlag) });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-platform-flags-get" } });
    logger.error({ err }, "Failed to load platform feature flags");
    return NextResponse.json({ error: "Failed to load feature flags" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }
  const { key, enabled, expectedUpdatedAt } = parsed.data;

  try {
    const serviceClient = getServiceClient();

    const { data: updated, error } = await serviceClient
      .from("platform_feature_flags")
      .update({ enabled, updated_by: user.id })
      .eq("key", key)
      .eq("updated_at", expectedUpdatedAt)
      .select("key, enabled, description, updated_by, updated_at")
      .maybeSingle();
    if (error) throw error;

    if (!updated) {
      const { data: current } = await serviceClient
        .from("platform_feature_flags")
        .select("key, enabled, description, updated_by, updated_at")
        .eq("key", key)
        .maybeSingle();
      return NextResponse.json(
        {
          error: current
            ? "This flag was changed by someone else. Refresh and try again."
            : "Unknown feature flag.",
          flag: current ? toPlatformFeatureFlag(current as PlatformFlagRow) : null,
        },
        { status: current ? 409 : 404 },
      );
    }

    await dropFlagCaches();

    // Best-effort audit — the flag update itself already succeeded and must not
    // be reported as failed to the gridmaster just because the audit write hiccuped.
    try {
      await writeGridmasterAuditLog({
        serviceClient,
        actor: user,
        action: "platform_feature_flags.updated",
        resourceType: "platform_feature_flag",
        resourceId: key,
        details: { key, enabled },
        request: req,
      });
    } catch (auditErr) {
      logger.error(
        { err: auditErr, key },
        "Failed to write audit log for platform feature flag update",
      );
    }

    return NextResponse.json({ flag: toPlatformFeatureFlag(updated as PlatformFlagRow) });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-platform-flags-post" } });
    logger.error({ err, key }, "Failed to update platform feature flag");
    return NextResponse.json({ error: "Failed to update feature flag" }, { status: 500 });
  }
}

/**
 * PUT creates a new flag (POST above only toggles an existing one). This is what lets a
 * gridmaster add a new kill switch entirely from the UI — no migration or DB script needed,
 * since isFeatureEnabled() already fails open on any key that doesn't have a row yet.
 */
export async function PUT(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireGridmasterSession(req);
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { key, description, enabled } = parsed.data;

  try {
    const serviceClient = getServiceClient();

    const { data: created, error } = await serviceClient
      .from("platform_feature_flags")
      .insert({ key, description, enabled, updated_by: user.id })
      .select("key, enabled, description, updated_by, updated_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A feature control with that key already exists." },
          { status: 409 },
        );
      }
      throw error;
    }

    await dropFlagCaches();

    // Best-effort audit — the create already succeeded and must not be reported as
    // failed to the gridmaster just because the audit write hiccuped.
    try {
      await writeGridmasterAuditLog({
        serviceClient,
        actor: user,
        action: "platform_feature_flags.created",
        resourceType: "platform_feature_flag",
        resourceId: key,
        details: { key, enabled, description },
        request: req,
      });
    } catch (auditErr) {
      logger.error(
        { err: auditErr, key },
        "Failed to write audit log for platform feature flag creation",
      );
    }

    return NextResponse.json(
      { flag: toPlatformFeatureFlag(created as PlatformFlagRow) },
      { status: 201 },
    );
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gridmaster-platform-flags-put" } });
    logger.error({ err, key }, "Failed to create platform feature flag");
    return NextResponse.json({ error: "Failed to create feature flag" }, { status: 500 });
  }
}
