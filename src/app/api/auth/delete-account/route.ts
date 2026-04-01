import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { validateCsrfOrigin } from "@/lib/csrf";
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
    const userClient = getUserClient(req);
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

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

    const userId = session.user.id;
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

    // Audit log before deletion
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      actor_email: session.user.email,
      action: "account.deleted",
      resource_type: "user",
      resource_id: userId,
      details: { email: session.user.email },
    });

    // 1. Remove org memberships
    await serviceClient
      .from("organization_memberships")
      .delete()
      .eq("user_id", userId);

    // 2. Unlink employee records (set user_id to null)
    await serviceClient
      .from("employees")
      .update({ user_id: null })
      .eq("user_id", userId);

    // 3. Clear profile (or delete it — profile is auto-created by trigger)
    await serviceClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    // 4. Delete notification preferences
    await serviceClient
      .from("notification_preferences")
      .delete()
      .eq("user_id", userId);

    // 5. Delete user sessions
    await serviceClient
      .from("user_sessions")
      .delete()
      .eq("user_id", userId);

    // 6. Delete the auth user (cascades auth.users row)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      logger.error({ error: deleteError, userId }, "Failed to delete auth user");
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }

    logger.info({ userId }, "User account deleted");

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ error: err }, "Account deletion failed");
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }
}
