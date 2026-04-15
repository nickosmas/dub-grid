import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

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

  try {
    // Auth check
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;

    // Require explicit confirmation
    let body: { confirmation?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json({ error: "Confirmation text must be exactly: DELETE MY ACCOUNT" }, { status: 400 });
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

    // Prevent super_admins who are the sole super_admin of an org
    const { data: memberships } = await serviceClient
      .from("organization_memberships")
      .select("org_id, org_role")
      .eq("user_id", userId);

    for (const m of memberships ?? []) {
      if ((m as Record<string, unknown>).org_role === "super_admin") {
        const orgId = (m as Record<string, unknown>).org_id as string;
        const { count } = await serviceClient
          .from("organization_memberships")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("org_role", "super_admin");
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "You are the only super admin of an organization. Transfer ownership first." },
            { status: 409 },
          );
        }
      }
    }

    // Delete auth first so we never leave a live user half-deleted if this hard
    // gate fails. App-data cleanup is performed after the account is revoked.
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      Sentry.captureException(deleteError, { extra: { userId, context: "account-deletion" } });
      logger.error({ error: deleteError, userId }, "Failed to delete auth user");
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }

    const cleanupFailures: string[] = [];
    async function runCleanupStep(
      step: string,
      operation: () => Promise<{ error?: unknown } | void>,
    ) {
      try {
        const result = await operation();
        if (
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error
        ) {
          throw result.error;
        }
      } catch (error) {
        cleanupFailures.push(step);
        Sentry.captureException(error, {
          extra: { userId, context: "account-deletion-cleanup", step },
        });
        logger.error({ error, userId, step }, "Account deletion cleanup step failed");
      }
    }

    await runCleanupStep("organization_memberships", () =>
      Promise.resolve(
        serviceClient
          .from("organization_memberships")
          .delete()
          .eq("user_id", userId),
      ),
    );
    await runCleanupStep("employees", () =>
      Promise.resolve(
        serviceClient
          .from("employees")
          .update({ user_id: null })
          .eq("user_id", userId),
      ),
    );
    await runCleanupStep("profiles", () =>
      Promise.resolve(
        serviceClient
          .from("profiles")
          .delete()
          .eq("id", userId),
      ),
    );
    await runCleanupStep("notification_preferences", () =>
      Promise.resolve(
        serviceClient
          .from("notification_preferences")
          .delete()
          .eq("user_id", userId),
      ),
    );
    await runCleanupStep("user_sessions", () =>
      Promise.resolve(
        serviceClient
          .from("user_sessions")
          .delete()
          .eq("user_id", userId),
      ),
    );
    await runCleanupStep("cookie_consents", () =>
      Promise.resolve(
        serviceClient
          .from("cookie_consents")
          .delete()
          .eq("user_id", userId),
      ),
    );
    await runCleanupStep("terms_acceptances", () =>
      Promise.resolve(
        serviceClient
          .from("terms_acceptances")
          .delete()
          .eq("user_id", userId),
      ),
    );

    try {
      await serviceClient.from("audit_log").insert({
        actor_id: userId,
        actor_email: user.email,
        action: DELETE_ACCOUNT_AUDIT_ACTION,
        resource_type: "user",
        resource_id: userId,
        details: {
          email: user.email,
          cleanupFailures,
        },
      });
    } catch (auditError) {
      logger.error({ error: auditError, userId }, "Failed to write account deletion audit log");
    }

    logger.info({ userId }, "User account deleted");

    return NextResponse.json({
      success: true,
      cleanupPending: cleanupFailures.length > 0,
      cleanupFailures: cleanupFailures.length > 0 ? cleanupFailures : undefined,
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "account-deletion" } });
    logger.error({ error: err }, "Account deletion failed");
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
