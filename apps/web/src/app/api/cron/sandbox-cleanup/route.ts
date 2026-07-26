import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Runs daily via the vercel.json crons block. Garbage-collects abandoned Test
// Sandbox organizations. The sandbox cookie's maxAge is 7 days
// (SANDBOX_COOKIE_MAX_AGE_SECONDS in api/test-sandbox/route.ts), so any
// sandbox whose cookie has expired with no re-entry is abandoned — re-entry
// reuses the existing row via findActiveSandboxForUser but does not bump
// created_at, so age-based deletion won't reap an actively-reused sandbox.
// 14 days (roughly 2x the cookie lifetime) gives slack for a re-entry right
// at cookie expiry without leaving orphans around indefinitely.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject any
// request that doesn't carry it; the route is otherwise unauthenticated.
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured — refusing to run sandbox-cleanup");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data: stale, error } = await db
    .from("organizations")
    .select("id")
    .eq("workspace_kind", "sandbox")
    // Defense in depth: no code path creates a sandbox row without an owner
    // today, but this cron is unattended and has no per-user scoping, so
    // require it explicitly rather than relying solely on workspace_kind.
    .not("sandbox_owner_user_id", "is", null)
    .lt("created_at", cutoff);
  if (error) {
    logger.error({ error }, "sandbox-cleanup: query failed");
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  if (!stale?.length) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  // FK cascades (organization_memberships, employees, departments, etc.) take
  // care of child rows — same reliance as deleteSandboxForUser.
  const { error: delErr } = await db
    .from("organizations")
    .delete()
    .in(
      "id",
      stale.map((org) => org.id as string),
    );
  if (delErr) {
    logger.error({ delErr }, "sandbox-cleanup: delete failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: stale.length });
}
