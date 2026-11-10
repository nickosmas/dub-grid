// @vitest-environment node

/**
 * Migration 131 (F-239, F-245): every Admin stores the permission set the app
 * resolves, so the database grants what the app shows, and anyone else stores
 * none, so a later promotion starts from the defaults. Runs 131 inside
 * BEGIN/ROLLBACK on the local database.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ADMIN_DEFAULT_PERMS, buildPermissionContext } from "@dubgrid/authz";
import type { AdminPermissions } from "@dubgrid/domain";
import { migrationPath } from "./helpers/sql-inventory";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

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

const MIGRATION = readFileSync(migrationPath("131_admin_permissions_complete.sql"), "utf8");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0131";
const SUPER_ADMIN = "11111111-1111-4111-8111-111111110131";
const MEMBER = "22222222-2222-4222-8222-222222220131";
const PERMISSION_KEYS = Object.keys(ADMIN_DEFAULT_PERMS) as (keyof AdminPermissions)[];

let db: Client;

/** What the app resolves for an Admin with `stored`, as the 25 stored keys. */
function resolved(stored: Partial<AdminPermissions> | null): Record<string, boolean> {
  const context = buildPermissionContext("admin", ORG, stored as AdminPermissions | null);
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, context[key]]));
}

async function asSuperuser(): Promise<void> {
  await db.query("RESET ROLE");
  await db.query("RESET request.jwt.claims");
}

async function seedFixture(): Promise<void> {
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'sa131@test.com'),($2,'member131@test.com')`,
    [SUPER_ADMIN, MEMBER],
  );
  await db.query(
    `INSERT INTO organizations (id, name, slug, workspace_kind) VALUES ($1,'Complete Sets','perms-131','real')`,
    [ORG],
  );
  await db.query(
    `INSERT INTO profiles (id, org_id, platform_role) VALUES ($1,$3,'none'),($2,$3,'none')
     ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, platform_role = EXCLUDED.platform_role`,
    [SUPER_ADMIN, MEMBER, ORG],
  );
  await db.query(`SELECT set_config('app.allow_role_change','true',true)`);
  await db.query(
    `INSERT INTO organization_memberships (user_id, org_id, org_role)
     VALUES ($1,$3,'super_admin'),($2,$3,'user')`,
    [SUPER_ADMIN, MEMBER, ORG],
  );
}

async function storedPermissions(): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query(
    `SELECT admin_permissions FROM organization_memberships WHERE user_id = $1 AND org_id = $2`,
    [MEMBER, ORG],
  );
  return rows[0]?.admin_permissions ?? null;
}

async function changeRole(role: "admin" | "user"): Promise<void> {
  await actAsAuthenticated(db, {
    sub: SUPER_ADMIN,
    role: "authenticated",
    org_id: ORG,
    org_role: "super_admin",
    platform_role: "none",
  });
  await db.query(`SELECT public.change_user_role($1, $2, $3, gen_random_uuid()::text, $4)`, [
    MEMBER,
    role,
    SUPER_ADMIN,
    ORG,
  ]);
  await asSuperuser();
}

async function memberMay(permission: string): Promise<boolean> {
  await actAsAuthenticated(db, {
    sub: MEMBER,
    role: "authenticated",
    org_id: ORG,
    org_role: "admin",
    platform_role: "none",
  });
  const { rows } = await db.query(`SELECT public.check_admin_permission($1) AS allowed`, [
    permission,
  ]);
  await asSuperuser();
  return rows[0].allowed as boolean;
}

describe.skipIf(!reachable)("131 complete Admin permission sets (live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });
  afterAll(async () => {
    await db?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    await seedFixture();
  });
  afterEach(async () => {
    await db.query("ROLLBACK").catch(() => undefined);
  });

  it("keeps the SQL defaults equal to ADMIN_DEFAULT_PERMS", async () => {
    const { rows } = await db.query(`SELECT public.admin_default_permissions() AS defaults`);
    expect(rows[0].defaults).toEqual(ADMIN_DEFAULT_PERMS);
  });

  it.each([
    ["nothing stored", null],
    ["an empty set", {}],
    ["one key turned off", { canEditShifts: false, canViewReports: false }],
    ["an Edit without its View", { canManageEmployees: true, canViewEmployeeDetails: false }],
    ["the settings key that never applies", { canManageOrgSettings: true, canViewStaff: false }],
    [
      "approvals only",
      { canEditShifts: false, canPublishSchedule: false, canApproveShiftRequests: true },
    ],
  ])("stores what the app resolves for %s", async (_name, stored) => {
    const { rows } = await db.query(`SELECT public.complete_admin_permissions($1) AS completed`, [
      stored === null ? null : JSON.stringify(stored),
    ]);
    expect(rows[0].completed).toEqual(resolved(stored));
  });

  it("drops keys it doesn't know and values that aren't true or false", async () => {
    const { rows } = await db.query(`SELECT public.complete_admin_permissions($1) AS completed`, [
      JSON.stringify({
        canPublishSchedule: false,
        canDeleteEverything: true,
        canViewReports: "no",
      }),
    ]);
    expect(rows[0].completed).toEqual(resolved({ canPublishSchedule: false }));
  });

  it("lets a User promoted by change_user_role edit and publish (F-239)", async () => {
    expect(await storedPermissions()).toBeNull();
    await changeRole("admin");

    expect(await storedPermissions()).toEqual(resolved(null));
    expect(await memberMay("canEditShifts")).toBe(true);
    expect(await memberMay("canPublishSchedule")).toBe(true);
    expect(await memberMay("canManageRecurringShifts")).toBe(true);
    expect(await memberMay("canManageEmployees")).toBe(false);
  });

  it("clears the set on demotion, so a re-promotion starts from the defaults (F-245)", async () => {
    await changeRole("admin");
    await db.query(
      `UPDATE organization_memberships SET admin_permissions = $3 WHERE user_id = $1 AND org_id = $2`,
      [MEMBER, ORG, JSON.stringify({ canManageEmployees: true, canPublishSchedule: false })],
    );
    expect(await storedPermissions()).toMatchObject({
      canManageEmployees: true,
      canPublishSchedule: false,
    });

    await changeRole("user");
    expect(await storedPermissions()).toBeNull();

    await changeRole("admin");
    expect(await storedPermissions()).toEqual(resolved(null));
  });

  it("stores the defaults for an Admin membership written without a set", async () => {
    await db.query(`DELETE FROM organization_memberships WHERE user_id = $1 AND org_id = $2`, [
      MEMBER,
      ORG,
    ]);
    await db.query(
      `INSERT INTO organization_memberships (user_id, org_id, org_role) VALUES ($1,$2,'admin')`,
      [MEMBER, ORG],
    );
    expect(await storedPermissions()).toEqual(resolved(null));
  });

  it("never stores the organization settings permission", async () => {
    await changeRole("admin");
    await db.query(
      `UPDATE organization_memberships SET admin_permissions = '{"canManageOrgSettings": true}'
       WHERE user_id = $1 AND org_id = $2`,
      [MEMBER, ORG],
    );
    expect((await storedPermissions())?.canManageOrgSettings).toBe(false);
  });

  it("stores no set for a Super Admin", async () => {
    const { rows } = await db.query(
      `UPDATE organization_memberships SET admin_permissions = '{"canEditShifts": true}'
       WHERE user_id = $1 AND org_id = $2 RETURNING admin_permissions`,
      [SUPER_ADMIN, ORG],
    );
    expect(rows[0].admin_permissions).toBeNull();
  });
});
