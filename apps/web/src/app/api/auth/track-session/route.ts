import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { trackUserSessionForUser } from "@/features/account/server";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

const bodySchema = z.object({
  platform: z.literal("web"),
  deviceLabel: z.string().min(1),
  appVersion: z.string().min(1).optional(),
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

    const { platform, deviceLabel, appVersion } = parsed.data;

    // Extract IP from request headers (Vercel / reverse proxy)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // Detect a previously-unseen device before the upsert. "New" = no prior
    // user_sessions row for (user_id, platform, device_label) — not "no row
    // other than the current session's", which would refire on every refresh
    // within the same session.
    const isNewDevice = await isNewDeviceForUser({
      userId: auth.user.id,
      platform,
      deviceLabel,
    });

    await trackUserSessionForUser({
      userId: auth.user.id,
      orgId: sessionClaims.orgId,
      supabaseSessionId: sessionClaims.supabaseSessionId,
      platform,
      deviceLabel,
      appVersion: appVersion ?? null,
      ipAddress: ip,
    });

    if (isNewDevice) {
      // Fire-and-forget — a notification failure must not block sign-in.
      void dispatchNotificationEvent(auth.user.id, {
        action: "security_new_device",
        orgId: sessionClaims.orgId,
        targetUserId: auth.user.id,
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

async function isNewDeviceForUser(input: {
  userId: string;
  platform: "web" | "ios" | "android";
  deviceLabel: string;
}): Promise<boolean> {
  try {
    const { data, error } = await getServiceClient()
      .from("user_sessions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("platform", input.platform)
      .eq("device_label", input.deviceLabel)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length === 0;
  } catch (err) {
    // Detection is best-effort — never block sign-in over a notification
    // false-negative. Treat lookup failures as "not new".
    logger.warn({ err, userId: input.userId }, "new-device detection failed");
    return false;
  }
}
