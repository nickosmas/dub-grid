import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { trackUserSessionForUser } from "@/features/account/server";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import {
  isNewSignInSession,
  scheduleSecurityAlert,
} from "@/features/account/server/security-alerts";
import logger from "@/lib/logger";
import { getSessionLocation } from "@/features/account/server/session-location";

const bodySchema = z.object({
  platform: z.literal("web"),
  deviceLabel: z.string().min(1),
  appVersion: z.string().min(1).optional(),
  browserName: z.string().min(1).nullable().optional(),
  browserVersion: z.string().min(1).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedSession(req);
  if ("response" in auth) return auth.response;

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const sessionClaims = extractSupabaseSessionClaims(auth.session.access_token);
    if (!sessionClaims.supabaseSessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const { platform, deviceLabel, appVersion, browserName, browserVersion } = parsed.data;

    // Extract IP from request headers (Vercel / reverse proxy)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const location = getSessionLocation(req.headers);

    // Before the upsert, which records this session as seen.
    const isNewSignIn = await isNewSignInSession(auth.user.id, sessionClaims.supabaseSessionId);

    await trackUserSessionForUser({
      userId: auth.user.id,
      orgId: sessionClaims.orgId,
      supabaseSessionId: sessionClaims.supabaseSessionId,
      platform,
      deviceLabel,
      appVersion: appVersion ?? null,
      browserName: browserName ?? null,
      browserVersion: browserVersion ?? null,
      ipAddress: ip,
      locationCity: location.city,
      locationCountry: location.country,
    });

    if (isNewSignIn) {
      scheduleSecurityAlert(auth.user.id, {
        action: "security_new_device",
        orgId: sessionClaims.orgId,
        targetUserId: auth.user.id,
        supabaseSessionId: sessionClaims.supabaseSessionId,
        platform,
        deviceLabel,
        ipAddress: ip,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // FK violation (23503) means auth.users row doesn't exist yet — race condition
    // during sign-up. Return 409 so the client can retry silently.
    if (isSupabaseErrorCode(error, "23503")) {
      return NextResponse.json({ error: "User not ready" }, { status: 409 });
    }
    logger.error({ err: error }, "track-session upsert error");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}

function extractSupabaseSessionClaims(accessToken: string): {
  supabaseSessionId: string | null;
  orgId: string | null;
} {
  try {
    const [, encodedPayload] = accessToken.split(".");
    if (!encodedPayload) {
      return { supabaseSessionId: null, orgId: null };
    }

    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(
      Buffer.from(`${normalized}${padding}`, "base64").toString("utf8"),
    ) as Record<string, unknown>;
    return {
      supabaseSessionId: typeof payload.session_id === "string" ? payload.session_id : null,
      orgId: typeof payload.org_id === "string" ? payload.org_id : null,
    };
  } catch {
    return { supabaseSessionId: null, orgId: null };
  }
}

function isSupabaseErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
