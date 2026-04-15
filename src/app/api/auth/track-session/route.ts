import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";

const bodySchema = z.object({
  refreshTokenHash: z.string().min(1),
  deviceLabel: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { refreshTokenHash, deviceLabel } = parsed.data;

    // Extract IP from request headers (Vercel / reverse proxy)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    const { error } = await getServiceClient()
      .from("user_sessions")
      .upsert(
        {
          user_id: auth.user.id,
          refresh_token_hash: refreshTokenHash,
          device_label: deviceLabel,
          ip_address: ip,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "refresh_token_hash" },
      );

    if (error) {
      // FK violation (23503) means auth.users row doesn't exist yet — race condition
      // during sign-up. Return 409 so the client can retry silently.
      if (error.code === "23503") {
        return NextResponse.json({ error: "User not ready" }, { status: 409 });
      }
      console.error("track-session upsert error:", error);
      return NextResponse.json({ error: "Failed to track session" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
