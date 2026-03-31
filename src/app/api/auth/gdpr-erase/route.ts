import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";

function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/auth/gdpr-erase
 * GDPR Right-to-Erasure: anonymizes all user PII and deletes auth user.
 * Body: { confirmation: "ERASE MY DATA" }
 */
export async function POST(req: NextRequest) {
  try {
    const userClient = getUserClient(req);
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    let body: { confirmation?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.confirmation !== "ERASE MY DATA") {
      return NextResponse.json({ error: "Confirmation text must be exactly: ERASE MY DATA" }, { status: 400 });
    }

    const userId = session.user.id;
    const serviceClient = getServiceClient();

    // Prevent gridmaster self-erasure
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", userId)
      .single();

    if (profile?.platform_role === "gridmaster") {
      return NextResponse.json(
        { error: "Gridmaster accounts cannot be self-erased. Contact support." },
        { status: 403 },
      );
    }

    // Audit log before erasure
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      actor_email: session.user.email,
      action: "gdpr.erased",
      resource_type: "user",
      resource_id: userId,
      details: { email: session.user.email, reason: "user_request" },
    });

    // Call the GDPR erasure function
    const { data: result, error: rpcError } = await serviceClient.rpc("gdpr_erase_user_data", {
      p_user_id: userId,
    });

    if (rpcError) {
      logger.error({ error: rpcError, userId }, "GDPR erasure RPC failed");
      return NextResponse.json({ error: "Data erasure failed" }, { status: 500 });
    }

    // Delete the auth user
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      logger.error({ error: deleteError, userId }, "Failed to delete auth user after GDPR erasure");
    }

    logger.info({ userId, result }, "GDPR data erasure completed");

    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error({ error: err }, "GDPR erasure failed");
    return NextResponse.json({ error: "Data erasure failed" }, { status: 500 });
  }
}
