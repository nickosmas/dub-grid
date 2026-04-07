import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const { userId, refreshTokenHash, deviceLabel } = await req.json();

    if (!userId || !refreshTokenHash || !deviceLabel) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Extract IP from request headers (Vercel / reverse proxy)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    const { error } = await getSupabaseAdmin()
      .from("user_sessions")
      .upsert(
        {
          user_id: userId,
          refresh_token_hash: refreshTokenHash,
          device_label: deviceLabel,
          ip_address: ip,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "refresh_token_hash" },
      );

    if (error) {
      console.error("track-session upsert error:", error);
      return NextResponse.json({ error: "Failed to track session" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
