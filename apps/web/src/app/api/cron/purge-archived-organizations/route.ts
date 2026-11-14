import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serverEnv } from "@/lib/env.server";
import { bearerMatchesSecret } from "@/lib/cron-auth";
import { deleteUserAccountWithCleanup } from "@/features/account/server/account-deletion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;
/** A run's share of work, so one run stays well inside its time limit. */
const ORGANIZATIONS_PER_RUN = 5;

/**
 * Whether deleting `userId` loses nothing: no membership in any other
 * organization (an offboarded one can still be restored), and not a
 * Gridmaster or an internal account.
 */
async function isOrphanAccount(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<boolean> {
  const [{ count, error }, { data: profile, error: profileError }] = await Promise.all([
    db
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    db.from("profiles").select("platform_role, is_internal").eq("id", userId).maybeSingle(),
  ]);
  if (error || profileError) throw error ?? profileError;
  if ((count ?? 0) > 0) return false;
  return profile?.platform_role !== "gridmaster" && profile?.is_internal !== true;
}

/**
 * Runs daily via the vercel.json crons block (F-203). An organization deleted
 * more than 90 days ago is deleted for good with its staff data, and each
 * account that belonged to it and to no other organization goes with it.
 */
export async function GET(req: NextRequest) {
  const secret = serverEnv?.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured; refusing to run purge-archived-organizations");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!bearerMatchesSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: API_ERRORS.UNAUTHORIZED }, { status: 401 });
  }
  if (!(await isFeatureEnabled("cron_purge_archived_orgs"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const db = getServiceClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due, error } = await db
    .from("organizations")
    .select("id")
    .eq("workspace_kind", "real")
    .not("archived_at", "is", null)
    .lte("archived_at", cutoff)
    .order("archived_at", { ascending: true })
    .limit(ORGANIZATIONS_PER_RUN);
  if (error) {
    logger.error({ error }, "purge-archived-organizations: query failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }

  let purged = 0;
  let accountsDeleted = 0;
  const failures: string[] = [];
  for (const org of due ?? []) {
    const orgId = org.id as string;
    const { data: userIds, error: purgeError } = await db.rpc("purge_archived_organization", {
      p_org_id: orgId,
    });
    if (purgeError) {
      failures.push(orgId);
      Sentry.captureException(purgeError, { extra: { orgId, context: "org-purge" } });
      logger.error({ error: purgeError, orgId }, "purge-archived-organizations: purge failed");
      continue;
    }
    purged += 1;

    for (const userId of (userIds as string[] | null) ?? []) {
      try {
        if (!(await isOrphanAccount(db, userId))) continue;
        await deleteUserAccountWithCleanup({
          serviceClient: db,
          userId,
          actorId: null,
          actorEmail: null,
          reason: "organization_purged",
        });
        accountsDeleted += 1;
      } catch (accountError) {
        // The organization is already gone; an account left behind is
        // reported, and its owner can still delete it themselves.
        Sentry.captureException(accountError, { extra: { orgId, userId, context: "org-purge" } });
        logger.error(
          { error: accountError, orgId, userId },
          "purge-archived-organizations: account deletion failed",
        );
      }
    }
  }

  return NextResponse.json(
    { ok: failures.length === 0, purged, accountsDeleted, failed: failures.length },
    { status: failures.length === 0 ? 200 : 500 },
  );
}
