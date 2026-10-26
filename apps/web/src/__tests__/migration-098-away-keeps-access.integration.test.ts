// @vitest-environment node

/**
 * Migration 098: an inactive (Away) Admin keeps the power to manage people
 * through update_mobile_employee_with_audit, and the permission itself still
 * decides. Each case runs inside BEGIN/ROLLBACK against the seeded local
 * database.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    await probe.query("SELECT 1 FROM public.organization_memberships LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const REFUSED = /insufficient permissions to manage employees/;

interface Fixture {
  orgId: string;
  adminUserId: string;
  adminEmpId: string;
  targetEmpId: string;
}

let db: Client;
let fx: Fixture;

async function loadFixture(): Promise<Fixture> {
  const { rows: admins } = await db.query<{ org_id: string; user_id: string; emp_id: string }>(
    `SELECT m.org_id, m.user_id, e.id AS emp_id
       FROM public.organization_memberships m
       JOIN public.organizations o ON o.id = m.org_id
       JOIN public.employees e ON e.user_id = m.user_id AND e.org_id = m.org_id
      WHERE o.slug = 'calmhaven' AND m.org_role = 'admin'
        AND m.archived_at IS NULL AND e.archived_at IS NULL
      ORDER BY m.user_id LIMIT 1`,
  );
  if (!admins[0]) throw new Error("Need an Admin with a staff record. Run npm run db:reset");
  const { rows: targets } = await db.query<{ id: string }>(
    `SELECT id FROM public.employees
      WHERE org_id = $1 AND id <> $2 AND status = 'active' AND archived_at IS NULL
      ORDER BY seniority LIMIT 1`,
    [admins[0].org_id, admins[0].emp_id],
  );
  if (!targets[0]) throw new Error("Need another active employee. Run npm run db:reset");
  return {
    orgId: admins[0].org_id,
    adminUserId: admins[0].user_id,
    adminEmpId: admins[0].emp_id,
    targetEmpId: targets[0].id,
  };
}

async function setAdminPermission(canManageEmployees: boolean) {
  await db.query(
    `UPDATE public.organization_memberships
        SET admin_permissions = COALESCE(admin_permissions, '{}'::jsonb)
                                || jsonb_build_object('canManageEmployees', $3::boolean)
      WHERE user_id = $1 AND org_id = $2`,
    [fx.adminUserId, fx.orgId, canManageEmployees],
  );
}

async function markAdminInactive() {
  await db.query(
    `UPDATE public.employees SET status = 'inactive'::public.employee_status WHERE id = $1`,
    [fx.adminEmpId],
  );
}

/** Renames the target through the function as the Admin; returns the error, if any. */
async function renameTarget(firstName: string): Promise<Error | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(
      `SELECT public.update_mobile_employee_with_audit(
         e.org_id, e.id, e.version, $3, e.last_name, e.phone, e.email, e.contact_notes,
         e.certification_id, e.focus_area_ids, e.role_ids, e.department_ids,
         e.employment_type, $2, NULL, NULL, NULL, NULL)
       FROM public.employees e WHERE e.id = $1`,
      [fx.targetEmpId, fx.adminUserId, firstName],
    );
    await db.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    return error as Error;
  }
}

async function targetFirstName(): Promise<string> {
  const { rows } = await db.query<{ first_name: string }>(
    `SELECT first_name FROM public.employees WHERE id = $1`,
    [fx.targetEmpId],
  );
  return rows[0].first_name;
}

describe.skipIf(!reachable)("098 an Away Admin keeps managing people", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    fx = await loadFixture();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refused an inactive Admin before 098 and allows them after", async () => {
    await db.query(readFileSync(migrationPath("009_atomic_mobile_employee_audit.sql"), "utf8"));
    await setAdminPermission(true);
    await markAdminInactive();

    expect((await renameTarget("Before"))?.message).toMatch(REFUSED);

    await db.query(readFileSync(migrationPath("098_away_keeps_access.sql"), "utf8"));
    expect(await renameTarget("After")).toBeNull();
    expect(await targetFirstName()).toBe("After");
  });

  it("still refuses an inactive Admin without canManageEmployees", async () => {
    await db.query(readFileSync(migrationPath("098_away_keeps_access.sql"), "utf8"));
    await setAdminPermission(false);
    await markAdminInactive();

    expect((await renameTarget("Nope"))?.message).toMatch(REFUSED);
  });

  it("still allows an active Admin with canManageEmployees", async () => {
    await db.query(readFileSync(migrationPath("098_away_keeps_access.sql"), "utf8"));
    await setAdminPermission(true);

    expect(await renameTarget("Active")).toBeNull();
    expect(await targetFirstName()).toBe("Active");
  });
});
