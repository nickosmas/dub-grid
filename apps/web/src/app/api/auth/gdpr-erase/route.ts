import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { canManageProfileChangeRequests } from "@/features/account/server";
import {
  forbidIfSandboxCookie,
  requireAuthenticatedUserWithClaims,
  requireFreshAuth,
} from "@/lib/api-auth";
import { extractJwtClaims } from "@/features/permissions/shared";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

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
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    // Irreversible: don't act on a locally verified token that could be up to
    // an hour old. Confirm with Supabase Auth that this caller is still live.
    const stale = await requireFreshAuth(req, user.id);
    if (stale) return stale;
    const { orgId } = extractJwtClaims(auth.session.access_token);

    const canEraseDirectly = orgId
      ? await canManageProfileChangeRequests({
          serviceClient: getServiceClient(),
          actorId: user.id,
          orgId,
        })
      : false;

    if (!canEraseDirectly) {
      return NextResponse.json(
        {
          error: "Account erasure must be requested and approved by an admin from People requests.",
        },
        { status: 403 },
      );
    }

    let body: { confirmation?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    if (body.confirmation !== "ERASE MY DATA") {
      return NextResponse.json(
        { error: "Confirmation text must be exactly: ERASE MY DATA" },
        { status: 400 },
      );
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

    const { data: memberships } = await serviceClient
      .from("organization_memberships")
      .select("org_id, org_role")
      .eq("user_id", userId)
      .is("archived_at", null);

    for (const membership of memberships ?? []) {
      if ((membership as Record<string, unknown>).org_role !== "super_admin") {
        continue;
      }
      const membershipOrgId = (membership as Record<string, unknown>).org_id as string;
      const { count } = await serviceClient
        .from("organization_memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", membershipOrgId)
        .eq("org_role", "super_admin")
        .is("archived_at", null);
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "You are the only super admin of an organization. Transfer ownership first." },
          { status: 409 },
        );
      }
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
      Sentry.captureException(deleteError, {
        extra: { userId, context: "gdpr-erase-delete-auth-user" },
      });
      logger.error({ error: deleteError, userId }, "Failed to delete auth user after GDPR erasure");
      return NextResponse.json(
        { error: "We erased the personal data, but couldn't delete the account. Try again." },
        { status: 500 },
      );
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
