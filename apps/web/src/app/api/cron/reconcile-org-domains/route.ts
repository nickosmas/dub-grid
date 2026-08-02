import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { registerOrgDomain } from "@/lib/vercel";
import { clientEnv, serverEnv } from "@/lib/env";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// Runs weekly via the vercel.json crons block. Self-healing sweep: re-registers
// every org's subdomain as a Vercel domain. registerOrgDomain treats an
// already-registered domain (409) as a no-op, so re-running this over every
// org is safe — it only does real work for the rare org whose registration
// never fired or failed at creation time (see the fire-and-forget call in
// organizations/manage/route.ts, which has no other retry path).
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject any
// request that doesn't carry it; the route is otherwise unauthenticated.
const PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured — refusing to run reconcile-org-domains");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isFeatureEnabled("cron_reconcile_org_domains"))) {
    // 200, not 503 — this is an intentional gridmaster kill-switch flip, not a
    // misconfiguration, and a status-code-only monitor shouldn't treat it as one.
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // Same production-only gate as the creation-time call: VERCEL_ENV
  // distinguishes real production from Preview (both have NODE_ENV=production
  // on Vercel), so this never registers domains against the live project from
  // a Preview deployment.
  const baseDomain = clientEnv?.NEXT_PUBLIC_BASE_DOMAIN;
  if (serverEnv?.VERCEL_ENV !== "production" || !baseDomain) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = getServiceClient();
  const orgs: { id: string; slug: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("organizations")
      .select("id, slug")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error({ error }, "reconcile-org-domains: query failed");
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    orgs.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let succeeded = 0;
  let failed = 0;
  for (const org of orgs) {
    if (!org.slug) continue;
    try {
      await registerOrgDomain(`${org.slug}.${baseDomain}`);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error({ err, orgId: org.id }, "reconcile-org-domains: registration failed");
    }
  }

  return NextResponse.json({ ok: true, succeeded, failed });
}
