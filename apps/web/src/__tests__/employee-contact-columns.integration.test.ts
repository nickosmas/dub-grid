// @vitest-environment node

/**
 * Migration 036: employee contact details leave the member-readable column
 * set, so the data API and the Realtime payload cannot carry them. Every
 * application path already masks them behind canViewEmployeeDetails or
 * canManageEmployees and reads through the service role.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const CONTACT_COLUMNS = ["phone", "email", "contact_notes", "status_note"] as const;

interface Member {
  email: string;
  orgRole: "super_admin" | "admin" | "user";
}

const MEMBERS: Member[] = [
  { email: "qa-super-admin@dubgrid.test", orgRole: "super_admin" },
  // Holds canViewEmployeeDetails through the seeded admin permissions.
  { email: "qa-admin@dubgrid.test", orgRole: "admin" },
  { email: "qa-regular@dubgrid.test", orgRole: "user" },
];

let db: Client;
let orgId: string;

async function asUser(member: Member): Promise<void> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    member.email,
  ]);
  if (rows.length === 0) throw new Error(`Missing seeded account ${member.email}`);
  const claims = JSON.stringify({
    sub: rows[0].id,
    role: "authenticated",
    mfa_enrolled: false,
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
}

async function asSuperuser(): Promise<void> {
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

/** Runs a statement expected to raise without aborting the outer transaction. */
async function expectRaise(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await db.query("SAVEPOINT expected_failure");
  try {
    await expect(run()).rejects.toThrow(pattern);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT expected_failure");
    await asSuperuser();
  }
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven' AND archived_at IS NULL`,
  );
  if (rows.length === 0) throw new Error("Need the seeded Calm Haven organization");
  orgId = rows[0].id;
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("employee contact columns are server-owned (live DB)", () => {
  it("refuses every member tier on every contact column", async () => {
    await db.query("BEGIN");
    try {
      for (const member of MEMBERS) {
        for (const column of CONTACT_COLUMNS) {
          await expectRaise(async () => {
            await asUser(member);
            await db.query(`SELECT ${column} FROM public.employees WHERE org_id = $1 LIMIT 1`, [
              orgId,
            ]);
          }, /permission denied for table employees/);
        }
        // A bare star is the same query PostgREST builds for select=*.
        await expectRaise(async () => {
          await asUser(member);
          await db.query(`SELECT * FROM public.employees WHERE org_id = $1 LIMIT 1`, [orgId]);
        }, /permission denied for table employees/);
      }
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("still reads the roster columns the directory needs", async () => {
    await db.query("BEGIN");
    try {
      await asUser(MEMBERS[2]);
      const { rows } = await db.query<{ first_name: string }>(
        `SELECT id, first_name, last_name, status, focus_area_ids, role_ids, certification_id
           FROM public.employees WHERE org_id = $1 ORDER BY seniority LIMIT 1`,
        [orgId],
      );
      await asSuperuser();
      expect(rows[0].first_name).toBeTruthy();
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps the service role, which every route uses, reading everything", async () => {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE service_role`);
      const { rows } = await db.query(
        `SELECT phone, email, contact_notes, status_note FROM public.employees WHERE org_id = $1 LIMIT 1`,
        [orgId],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("leaves no readable contact column in the member grant", async () => {
    // anon holds the project-wide blanket grant from 004 and no policy on
    // this table targets it, so row-level security refuses it every row.
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE table_name = 'employees' AND grantee = 'authenticated'
          AND privilege_type = 'SELECT' AND column_name = ANY($1::text[])`,
      [[...CONTACT_COLUMNS]],
    );
    expect(rows).toEqual([]);
  });
});
