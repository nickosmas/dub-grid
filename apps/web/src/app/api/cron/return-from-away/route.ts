import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/db/shared";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serverEnv } from "@/lib/env.server";
import { bearerMatchesSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Runs daily via the vercel.json crons block, at 08:00 UTC so it lands just
// after midnight across US timezones: anyone Away whose return date has come
// in their organization's timezone is set back to Active. Their
// recurring schedules were kept while they were away and the fills already
// start from the return date, so nothing else changes.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.

const UPDATE_BATCH_SIZE = 25;
const DAY_MS = 86_400_000;

interface AwayRow {
  id: string;
  org_id: string;
  away_until: string;
  version: number;
  organization: { timezone: string | null } | null;
}

export async function GET(req: NextRequest) {
  const secret = serverEnv?.CRON_SECRET;
  if (!secret) {
    logger.error("CRON_SECRET not configured, refusing to run return-from-away");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!bearerMatchesSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: API_ERRORS.UNAUTHORIZED }, { status: 401 });
  }
  if (!(await isFeatureEnabled("cron_return_from_away"))) {
    // 200: a Gridmaster's kill switch, not a misconfiguration.
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const db = getServiceClient();
  const now = new Date();
  // No timezone is more than a day ahead of UTC, so this bounds every
  // organization's today; each row is then checked against its own.
  const latestToday = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("employees")
    .select("id, org_id, away_until, version, organization:organizations(timezone)")
    .eq("status", "inactive")
    .is("archived_at", null)
    .not("away_until", "is", null)
    .lte("away_until", latestToday);
  if (error) {
    logger.error({ error }, "return-from-away: query failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }

  // org_id is a many-to-one foreign key, so the embed is one row.
  const due = ((data ?? []) as unknown as AwayRow[]).filter(
    (row) => row.away_until <= getIsoDateInTimeZone(now, row.organization?.timezone ?? null),
  );
  if (due.length === 0) {
    return NextResponse.json({ ok: true, returned: 0 });
  }

  const statusChangedAt = now.toISOString();
  const returned: AwayRow[] = [];
  for (let start = 0; start < due.length; start += UPDATE_BATCH_SIZE) {
    const batch = due.slice(start, start + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        // The version guard leaves anyone a manager changed meanwhile alone.
        const { data: updated, error: updateError } = await db
          .from("employees")
          .update({
            status: "active",
            status_note: "",
            away_until: null,
            status_changed_at: statusChangedAt,
            version: row.version + 1,
          })
          .eq("id", row.id)
          .eq("org_id", row.org_id)
          .eq("version", row.version)
          .select("id")
          .maybeSingle();
        if (updateError) {
          logger.error({ error: updateError, empId: row.id }, "return-from-away: update failed");
          return null;
        }
        return updated ? row : null;
      }),
    );
    returned.push(...results.filter((row): row is AwayRow => row !== null));
  }

  if (returned.length > 0) {
    const { error: auditError } = await db.from("audit_log").insert(
      returned.map((row) => ({
        org_id: row.org_id,
        actor_id: null,
        actor_email: null,
        action: "employee.activated",
        resource_type: "employee",
        resource_id: row.id,
        details: {
          fromStatus: "inactive",
          toStatus: "active",
          awayUntil: row.away_until,
          changedFields: ["status"],
        },
      })),
    );
    if (auditError) {
      logger.error({ error: auditError }, "return-from-away: audit log write failed");
    }
    await cacheDel(...new Set(returned.map((row) => CacheKey.employees(row.org_id))));
  }

  return NextResponse.json({
    ok: true,
    returned: returned.length,
    skipped: due.length - returned.length,
  });
}
