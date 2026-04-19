import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

const GDPR_ERASE_AUDIT_ACTION = "gdpr.erased";

/**
 * POST /api/auth/gdpr-erase
 * GDPR Right-to-Erasure: anonymizes all user PII and deletes auth user.
 * Body: { confirmation: "ERASE MY DATA" }
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;

    let body: { confirmation?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.confirmation !== "ERASE MY DATA") {
      return NextResponse.json({ error: "Confirmation text must be exactly: ERASE MY DATA" }, { status: 400 });
    }

    const userId = user.id;
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
      Sentry.captureException(deleteError, { extra: { userId, context: "gdpr-erase-delete-auth-user" } });
      logger.error({ error: deleteError, userId }, "Failed to delete auth user after GDPR erasure");
      return NextResponse.json({ error: "Failed to delete account after data erasure" }, { status: 500 });
    }

    try {
      await serviceClient.from("audit_log").insert({
        actor_id: userId,
        actor_email: user.email,
        action: GDPR_ERASE_AUDIT_ACTION,
        resource_type: "user",
        resource_id: userId,
        details: { email: user.email, reason: "user_request" },
      });
    } catch (auditError) {
      logger.error({ error: auditError, userId }, "Failed to write GDPR erasure audit log");
    }

    logger.info({ userId, result }, "GDPR data erasure completed");

    return NextResponse.json({ success: true, result });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "gdpr-erase" } });
    logger.error({ error: err }, "GDPR erasure failed");
    return NextResponse.json({ error: "Data erasure failed" }, { status: 500 });
  }
}
