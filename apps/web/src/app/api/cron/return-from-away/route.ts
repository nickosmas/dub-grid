import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { plannedLastDay } from "@dubgrid/domain";
import { getServiceClient } from "@/lib/supabase-service";
import { cacheDel, CacheKey } from "@/lib/db/shared";
import logger from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { serverEnv } from "@/lib/env.server";
import { bearerMatchesSecret } from "@/lib/cron-auth";
import { endOffboardedAccess } from "@/features/employees/server/offboard-access";
import { scheduleSuspensionNotice } from "@/features/employees/server/suspension-notice";
import { endUserSessions } from "@/lib/auth/revocation";
import { disableMobilePushTokensForOrg } from "@dubgrid/data-access";

export const dynamic = "force-dynamic";

// Runs daily via the vercel.json crons block, at 08:00 UTC so it lands just
// after midnight across US timezones. First anyone whose planned Away (51g1)
// starts today in their organization's timezone is marked Away, with the
// plan's return date and absence; their days were already cleared when it
// was planned. Next anyone whose last day (51g2) has passed is offboarded
// the way a manual Offboard does it; the days after it were cleared when it
// was planned. Next anyone whose suspension ends today (51g3) is reinstated,
// and anyone whose planned suspension starts today is suspended the way a
// manual Suspend does it. Then anyone Away whose return date has come is set
// back to Active. Their recurring schedules were kept while they were away and
// the fills already start from the return date, so nothing else changes.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.

const UPDATE_BATCH_SIZE = 25;
const DAY_MS = 86_400_000;

interface PlannedRow {
  id: string;
  org_id: string;
  planned_from: string;
  planned_until: string | null;
  planned_absence_type_id: number | null;
  planned_note: string | null;
  version: number;
  organization: { timezone: string | null } | null;
}

interface LastDayRow {
  id: string;
  org_id: string;
  user_id: string | null;
  planned_from: string;
  planned_note: string | null;
  planned_by: string | null;
  version: number;
  organization: { timezone: string | null } | null;
}

interface SuspendedRow {
  id: string;
  org_id: string;
  suspended_until: string;
  version: number;
  organization: { timezone: string | null } | null;
}

interface PlannedSuspensionRow {
  id: string;
  org_id: string;
  user_id: string | null;
  planned_from: string;
  planned_until: string | null;
  planned_by: string | null;
  version: number;
  organization: { timezone: string | null } | null;
}

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

  // A failed start never holds up the returns below.
  let started = 0;
  try {
    started = await startPlannedAways(db, now, latestToday);
  } catch (error) {
    logger.error({ error }, "return-from-away: starting planned aways failed");
  }
  let offboarded = 0;
  try {
    offboarded = await offboardAfterLastDays(db, now, latestToday);
  } catch (error) {
    logger.error({ error }, "return-from-away: offboarding after last days failed");
  }
  let reinstated = 0;
  try {
    reinstated = await reinstateEndedSuspensions(db, now, latestToday);
  } catch (error) {
    logger.error({ error }, "return-from-away: reinstating ended suspensions failed");
  }
  let suspended = 0;
  try {
    suspended = await startPlannedSuspensions(db, now, latestToday);
  } catch (error) {
    logger.error({ error }, "return-from-away: starting planned suspensions failed");
  }

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
    return NextResponse.json({ ok: true, started, offboarded, reinstated, suspended, returned: 0 });
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
    started,
    offboarded,
    reinstated,
    suspended,
    returned: returned.length,
    skipped: due.length - returned.length,
  });
}

type ServiceClient = ReturnType<typeof getServiceClient>;

/**
 * Marks Away everyone whose planned Away starts today or earlier in their
 * organization's timezone, in one version-guarded update each; a plan whose
 * return date has already come is dropped instead. Returns how many started.
 */
async function startPlannedAways(
  db: ServiceClient,
  now: Date,
  latestToday: string,
): Promise<number> {
  const { data, error } = await db
    .from("employees")
    .select(
      "id, org_id, planned_from, planned_until, planned_absence_type_id, planned_note, version, organization:organizations(timezone)",
    )
    .eq("status", "active")
    .is("archived_at", null)
    .is("suspended_at", null)
    .eq("planned_status", "away")
    .lte("planned_from", latestToday);
  if (error) throw error;

  const due = ((data ?? []) as unknown as PlannedRow[]).flatMap((row) => {
    const today = getIsoDateInTimeZone(now, row.organization?.timezone ?? null);
    return row.planned_from <= today ? [{ row, today }] : [];
  });
  if (due.length === 0) return 0;

  const statusChangedAt = now.toISOString();
  const startedRows: PlannedRow[] = [];
  for (let start = 0; start < due.length; start += UPDATE_BATCH_SIZE) {
    const batch = due.slice(start, start + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ row, today }) => {
        const over = row.planned_until !== null && row.planned_until <= today;
        const { data: updated, error: updateError } = await db
          .from("employees")
          .update(
            over
              ? { planned_status: null, version: row.version + 1 }
              : {
                  status: "inactive",
                  status_note: row.planned_note ?? "",
                  status_changed_at: statusChangedAt,
                  away_until: row.planned_until,
                  away_absence_type_id: row.planned_absence_type_id,
                  planned_status: null,
                  version: row.version + 1,
                },
          )
          .eq("id", row.id)
          .eq("org_id", row.org_id)
          .eq("version", row.version)
          .select("id")
          .maybeSingle();
        if (updateError) {
          logger.error({ error: updateError, empId: row.id }, "return-from-away: start failed");
          return null;
        }
        return updated && !over ? row : null;
      }),
    );
    startedRows.push(...results.filter((row): row is PlannedRow => row !== null));
  }

  if (startedRows.length > 0) {
    const { error: auditError } = await db.from("audit_log").insert(
      startedRows.map((row) => ({
        org_id: row.org_id,
        actor_id: null,
        actor_email: null,
        action: "employee.deactivated",
        resource_type: "employee",
        resource_id: row.id,
        details: {
          fromStatus: "active",
          toStatus: "inactive",
          plannedFrom: row.planned_from,
          ...(row.planned_until ? { awayUntil: row.planned_until } : {}),
          ...(row.planned_absence_type_id
            ? { awayAbsenceTypeId: row.planned_absence_type_id }
            : {}),
          changedFields: ["status"],
        },
      })),
    );
    if (auditError) {
      logger.error({ error: auditError }, "return-from-away: start audit log write failed");
    }
    await cacheDel(...new Set(startedRows.map((row) => CacheKey.employees(row.org_id))));
  }
  return startedRows.length;
}

/** Whether offboarding `userId` would leave the organization with no Super Admin. */
async function isOnlySuperAdmin(
  db: ServiceClient,
  orgId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const { data: membership } = await db
    .from("organization_memberships")
    .select("org_role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (membership?.org_role !== "super_admin") return false;
  const { count } = await db
    .from("organization_memberships")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("org_role", "super_admin")
    .is("archived_at", null);
  return (count ?? 0) <= 1;
}

/**
 * Offboards everyone whose last day was before today in their organization's
 * timezone, with the update and follow-up a manual Offboard makes, credited
 * to whoever set the last day. The org's only Super Admin is left as they
 * are, plan and all, as the status route refuses them. Returns how many.
 */
async function offboardAfterLastDays(
  db: ServiceClient,
  now: Date,
  latestToday: string,
): Promise<number> {
  const { data, error } = await db
    .from("employees")
    .select(
      "id, org_id, user_id, planned_from, planned_note, planned_by, version, organization:organizations(timezone)",
    )
    .eq("status", "active")
    .is("archived_at", null)
    .is("suspended_at", null)
    .eq("planned_status", "removed")
    .lte("planned_from", latestToday);
  if (error) throw error;

  const due = ((data ?? []) as unknown as LastDayRow[]).filter(
    (row) => row.planned_from <= getIsoDateInTimeZone(now, row.organization?.timezone ?? null),
  );
  const at = now.toISOString();
  const done: LastDayRow[] = [];
  // One at a time: two Super Admins leaving the same day must not both pass
  // the only-Super-Admin check before either is offboarded.
  for (const row of due) {
    if (await isOnlySuperAdmin(db, row.org_id, row.user_id)) {
      logger.warn(
        { empId: row.id, orgId: row.org_id },
        "return-from-away: last day passed for the only super admin; left as they are",
      );
      continue;
    }
    const { data: updated, error: updateError } = await db
      .from("employees")
      .update({
        status: "removed",
        status_note: row.planned_note ?? "",
        archived_at: at,
        status_changed_at: at,
        updated_by: row.planned_by,
        version: row.version + 1,
      })
      .eq("id", row.id)
      .eq("org_id", row.org_id)
      .eq("version", row.version)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logger.error({ error: updateError, empId: row.id }, "return-from-away: offboard failed");
      continue;
    }
    if (!updated) continue;
    await endOffboardedAccess(db, {
      orgId: row.org_id,
      empId: row.id,
      userId: row.user_id,
      actorId: row.planned_by,
      at,
    });
    done.push(row);
  }

  if (done.length > 0) {
    const { error: auditError } = await db.from("audit_log").insert(
      done.map((row) => ({
        org_id: row.org_id,
        actor_id: null,
        actor_email: null,
        action: "employee.removed",
        resource_type: "employee",
        resource_id: row.id,
        details: {
          fromStatus: "active",
          toStatus: "removed",
          note: row.planned_note ?? "",
          lastDay: plannedLastDay({ plannedStatus: "removed", plannedFrom: row.planned_from }),
          changedFields: ["status"],
        },
      })),
    );
    if (auditError) {
      logger.error({ error: auditError }, "return-from-away: offboard audit log write failed");
    }
    await cacheDel(...new Set(done.map((row) => CacheKey.employees(row.org_id))));
  }
  return done.length;
}

/**
 * Reinstates everyone whose suspension ends today or earlier in their
 * organization's timezone (51g3), clearing the columns a manual Reinstate
 * clears, in one version-guarded update each. Returns how many.
 */
async function reinstateEndedSuspensions(
  db: ServiceClient,
  now: Date,
  latestToday: string,
): Promise<number> {
  const { data, error } = await db
    .from("employees")
    .select("id, org_id, suspended_until, version, organization:organizations(timezone)")
    .eq("status", "active")
    .is("archived_at", null)
    .not("suspended_at", "is", null)
    .not("suspended_until", "is", null)
    .lte("suspended_until", latestToday);
  if (error) throw error;

  const due = ((data ?? []) as unknown as SuspendedRow[]).filter(
    (row) => row.suspended_until <= getIsoDateInTimeZone(now, row.organization?.timezone ?? null),
  );
  const at = now.toISOString();
  const done: SuspendedRow[] = [];
  for (const row of due) {
    const { data: updated, error: updateError } = await db
      .from("employees")
      .update({
        suspended_at: null,
        suspended_by: null,
        status_changed_at: at,
        version: row.version + 1,
      })
      .eq("id", row.id)
      .eq("org_id", row.org_id)
      .eq("version", row.version)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logger.error({ error: updateError, empId: row.id }, "return-from-away: reinstate failed");
      continue;
    }
    if (updated) done.push(row);
  }

  if (done.length > 0) {
    const { error: auditError } = await db.from("audit_log").insert(
      done.map((row) => ({
        org_id: row.org_id,
        actor_id: null,
        actor_email: null,
        action: "employee.reinstated",
        resource_type: "employee",
        resource_id: row.id,
        details: { suspendedUntil: row.suspended_until, changedFields: ["suspended_at"] },
      })),
    );
    if (auditError) {
      logger.error({ error: auditError }, "return-from-away: reinstate audit log write failed");
    }
    await cacheDel(...new Set(done.map((row) => CacheKey.employees(row.org_id))));
  }
  return done.length;
}

/**
 * Suspends everyone whose planned suspension (51g3) starts today or earlier
 * in their organization's timezone, through the update and follow-up a
 * manual Suspend makes, credited to whoever planned it: signed out
 * everywhere, push off, the notice email and the Super Admin alert; 102
 * closes their requests. A plan whose end has come, or whose person no
 * longer has an account, is dropped; the org's only Super Admin is left as
 * they are, plan and all, as the status route refuses them. Returns how many.
 */
async function startPlannedSuspensions(
  db: ServiceClient,
  now: Date,
  latestToday: string,
): Promise<number> {
  const { data, error } = await db
    .from("employees")
    .select(
      "id, org_id, user_id, planned_from, planned_until, planned_by, version, organization:organizations(timezone)",
    )
    .eq("status", "active")
    .is("archived_at", null)
    .is("suspended_at", null)
    .eq("planned_status", "suspended")
    .lte("planned_from", latestToday);
  if (error) throw error;

  const due = ((data ?? []) as unknown as PlannedSuspensionRow[]).flatMap((row) => {
    const today = getIsoDateInTimeZone(now, row.organization?.timezone ?? null);
    return row.planned_from <= today ? [{ row, today }] : [];
  });
  const at = now.toISOString();
  const done: PlannedSuspensionRow[] = [];
  // One at a time: two Super Admins suspended the same day must not both pass
  // the only-Super-Admin check before either is suspended.
  for (const { row, today } of due) {
    const drop = !row.user_id || (row.planned_until !== null && row.planned_until <= today);
    if (!drop && (await isOnlySuperAdmin(db, row.org_id, row.user_id))) {
      logger.warn(
        { empId: row.id, orgId: row.org_id },
        "return-from-away: planned suspension due for the only super admin; left as they are",
      );
      continue;
    }
    const { data: updated, error: updateError } = await db
      .from("employees")
      .update(
        drop
          ? { planned_status: null, version: row.version + 1 }
          : {
              suspended_at: at,
              suspended_by: row.planned_by,
              suspended_until: row.planned_until,
              status_changed_at: at,
              updated_by: row.planned_by,
              version: row.version + 1,
            },
      )
      .eq("id", row.id)
      .eq("org_id", row.org_id)
      .eq("version", row.version)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logger.error({ error: updateError, empId: row.id }, "return-from-away: suspend failed");
      continue;
    }
    if (!updated || drop || !row.user_id) continue;
    try {
      await endUserSessions(row.user_id);
      await disableMobilePushTokensForOrg(db, { userId: row.user_id, orgId: row.org_id });
    } catch (sessionError) {
      logger.error(
        { error: sessionError, empId: row.id, orgId: row.org_id },
        "return-from-away: ending sessions or push after a planned suspension failed",
      );
    }
    scheduleSuspensionNotice({ orgId: row.org_id, empId: row.id, actorId: row.planned_by ?? "" });
    done.push(row);
  }

  if (done.length > 0) {
    const { error: auditError } = await db.from("audit_log").insert(
      done.map((row) => ({
        org_id: row.org_id,
        actor_id: null,
        actor_email: null,
        action: "employee.suspended",
        resource_type: "employee",
        resource_id: row.id,
        details: {
          plannedFrom: row.planned_from,
          ...(row.planned_until ? { suspendedUntil: row.planned_until } : {}),
          changedFields: ["suspended_at"],
        },
      })),
    );
    if (auditError) {
      logger.error({ error: auditError }, "return-from-away: suspend audit log write failed");
    }
    await cacheDel(...new Set(done.map((row) => CacheKey.employees(row.org_id))));
  }
  return done.length;
}
