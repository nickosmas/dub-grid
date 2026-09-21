import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { canDeleteAccountDirectly } from "@/features/account/server";
import { forbidIfSandboxCookie, requireSensitiveActionAuth } from "@/lib/api-auth";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const DELETE_ACCOUNT_AUDIT_ACTION = "account.deleted";

/**
 * DELETE /api/auth/delete-account
 * Permanently deletes the authenticated user's account and all related data.
 * Body: { confirmation: "DELETE MY ACCOUNT" }
 */
export async function DELETE(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  try {
    // Auth check
    const auth = await requireSensitiveActionAuth(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    const orgId = typeof auth.claims.org_id === "string" ? auth.claims.org_id : null;

    // Rate-limit: this is a destructive, irreversible endpoint.
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
    if (misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) },
        },
      );
    }

    const canDeleteDirectly = orgId
      ? await canDeleteAccountDirectly({
          serviceClient: getServiceClient(),
          actorId: user.id,
          orgId,
        })
      : false;

    if (!canDeleteDirectly) {
      return NextResponse.json(
        {
          error:
            "Account deletion must be requested and approved by an admin from People requests.",
        },
        { status: 403 },
      );
    }

    // Require explicit confirmation
    let body: { confirmation?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    if (body.confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: "Confirmation text must be exactly: DELETE MY ACCOUNT" },
        { status: 400 },
      );
    }

    const userId = user.id;
    const serviceClient = getServiceClient();

    // Prevent gridmasters from deleting their account via this endpoint
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", userId)
      .single();

    if (profile?.platform_role === "gridmaster") {
      return NextResponse.json(
        { error: "Gridmaster accounts cannot be self-deleted. Contact support." },
        { status: 403 },
      );
    }

    // Prevent super_admins who are the sole super_admin of an org. Archived
    // memberships are removed people, so they never count as a peer.
    const { data: memberships } = await serviceClient
      .from("organization_memberships")
      .select("org_id, org_role")
      .eq("user_id", userId)
      .is("archived_at", null);

    for (const m of memberships ?? []) {
      if ((m as Record<string, unknown>).org_role === "super_admin") {
        const membershipOrgId = (m as Record<string, unknown>).org_id as string;
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
    }

    // App-data cleanup runs BEFORE auth.admin.deleteUser. If any step throws,
    // we abort with 500 and the auth user is preserved so the caller can retry.
    // If cleanup succeeds but auth-delete fails, we land in a "data gone, auth
    // lingers" state which is recoverable on next signin (vs. the previous
    // "auth gone, data orphaned" which was irrecoverable).
    //
    // Order respects FK direction: memberships first (FK→profiles), employees
    // nullified (FK→profiles via user_id), then profiles, then leaf tables.
    async function runCleanupStep(
      step: string,
      operation: () => Promise<{ error?: unknown } | void>,
    ) {
      const result = await operation();
      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }
    }

    try {
      await runCleanupStep("organization_memberships", () =>
        Promise.resolve(
          serviceClient.from("organization_memberships").delete().eq("user_id", userId),
        ),
      );
      await runCleanupStep("employees", () =>
        Promise.resolve(
          serviceClient.from("employees").update({ user_id: null }).eq("user_id", userId),
        ),
      );
      await runCleanupStep("profiles", () =>
        Promise.resolve(serviceClient.from("profiles").delete().eq("id", userId)),
      );
      await runCleanupStep("notification_preferences", () =>
        Promise.resolve(
          serviceClient.from("notification_preferences").delete().eq("user_id", userId),
        ),
      );
      await runCleanupStep("user_sessions", () =>
        Promise.resolve(serviceClient.from("user_sessions").delete().eq("user_id", userId)),
      );
      await runCleanupStep("cookie_consents", () =>
        Promise.resolve(serviceClient.from("cookie_consents").delete().eq("user_id", userId)),
      );
      await runCleanupStep("terms_acceptances", () =>
        Promise.resolve(serviceClient.from("terms_acceptances").delete().eq("user_id", userId)),
      );
    } catch (cleanupError) {
      Sentry.captureException(cleanupError, {
        extra: { userId, context: "account-deletion-cleanup" },
      });
      logger.error(
        { error: cleanupError, userId },
        "Account deletion cleanup failed; auth user preserved",
      );
      return NextResponse.json(
        { error: "We couldn't delete that account. Try again." },
        { status: 500 },
      );
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      Sentry.captureException(deleteError, {
        extra: { userId, context: "auth-delete-after-cleanup" },
      });
      logger.error(
        { error: deleteError, userId },
        "Auth delete failed after successful cleanup; user has no profile",
      );
      return NextResponse.json(
        { error: "We couldn't delete that account. Try again." },
        { status: 500 },
      );
    }

    try {
      await serviceClient.from("audit_log").insert({
        actor_id: userId,
        actor_email: user.email,
        action: DELETE_ACCOUNT_AUDIT_ACTION,
        resource_type: "user",
        resource_id: userId,
        details: { email: user.email },
      });
    } catch (auditError) {
      logger.error({ error: auditError, userId }, "Failed to write account deletion audit log");
    }

    logger.info({ userId }, "User account deleted");

    return NextResponse.json({ success: true });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "account-deletion" } });
    logger.error({ error: err }, "Account deletion failed");
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
