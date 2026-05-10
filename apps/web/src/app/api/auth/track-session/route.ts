import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackUserSessionForUser } from "@/features/account/server";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

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

    await trackUserSessionForUser({
      userId: auth.user.id,
      orgId: sessionClaims.orgId,
      supabaseSessionId: sessionClaims.supabaseSessionId,
      platform,
      deviceLabel,
      appVersion: appVersion ?? null,
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // FK violation (23503) means auth.users row doesn't exist yet — race condition
    // during sign-up. Return 409 so the client can retry silently.
    if (isSupabaseErrorCode(error, "23503")) {
      return NextResponse.json({ error: "User not ready" }, { status: 409 });
    }
    console.error("track-session upsert error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
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
    const padding =
      normalized.length % 4 === 0
        ? ""
        : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(
      Buffer.from(`${normalized}${padding}`, "base64").toString("utf8"),
    ) as Record<string, unknown>;
    return {
      supabaseSessionId:
        typeof payload.session_id === "string" ? payload.session_id : null,
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
