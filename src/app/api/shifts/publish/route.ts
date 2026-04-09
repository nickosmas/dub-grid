import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { publishSchedule } from "@/lib/db/schedule";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});

function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handler — cookies are read-only
        },
      },
    },
  );
}

/**
 * POST /api/shifts/publish
 * Server-side schedule publish with permission validation.
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ────────────────────────────────────────────────────
  const userClient = getUserClient(req);
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // ── Rate limit by user ID ─────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, session.user.id);
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

  const { orgId, startDate, endDate } = parsed.data;

  try {
    // ── Permission check ──────────────────────────────────────────────
    const serviceClient = getServiceClient();
    const [{ data: membership }, { data: profile }] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", session.user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";
    const isAdmin = membership?.org_role === "admin";
    const adminPerms = membership?.admin_permissions as Record<string, boolean> | null;

    const hasPermission =
      isGridmaster ||
      isSuperAdmin ||
      (isAdmin && adminPerms?.canPublishSchedule === true);

    if (!hasPermission) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // ── Execute publish ─────────────────────────────────────────────
    await publishSchedule(orgId, new Date(startDate), new Date(endDate));

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "shifts/publish", orgId } });
    logger.error({ error: err, orgId }, "Schedule publish failed");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
