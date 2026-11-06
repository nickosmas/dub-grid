// @vitest-environment node

/**
 * Migrations 121 to 124 (F-192, F-195, F-197, F-198): a row's links, a request
 * action and a schedule write all stay inside one organization. Each case runs
 * in a transaction that is rolled back.
 *
 * Skipped when the local Postgres is unreachable or behind migration 124.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type User } from "@supabase/supabase-js";
import { Client } from "pg";
import { createSandboxForUser, deleteSandboxForUser } from "@/features/test-sandbox/server";
import { SUPABASE_URL } from "./helpers/local-supabase-auth";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const LOCAL_DEMO_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_DEMO_SERVICE_KEY;

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    const { rows } = await probe.query<{ present: boolean }>(
      `SELECT to_regproc('public.refuse_org_id_change') IS NOT NULL AS present`,
    );
    return rows[0]?.present === true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
let db: Client;
let orgA: string;
let orgB: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (rows.length === 0) throw new Error(`No row for: ${sql}`);
  return Object.values(rows[0] as Record<string, T>)[0]!;
}

async function refusal(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
  }
}

describe.skipIf(!reachable)("organization-bound references", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    const { rows } = await db.query<{ org_id: string }>(
      `SELECT e.org_id
         FROM public.employees e
         JOIN public.organizations o ON o.id = e.org_id
        WHERE o.workspace_kind = 'real'
          AND EXISTS (SELECT 1 FROM public.focus_areas f WHERE f.org_id = e.org_id)
          AND EXISTS (SELECT 1 FROM public.absence_types a WHERE a.org_id = e.org_id)
        GROUP BY e.org_id
        ORDER BY e.org_id
        LIMIT 2`,
    );
    if (rows.length < 2) throw new Error("Local fixtures missing; run npm run db:reset");
    [orgA, orgB] = [rows[0]!.org_id, rows[1]!.org_id];
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  const employeeIn = (orgId: string) =>
    one<string>(`SELECT id FROM public.employees WHERE org_id = $1 LIMIT 1`, [orgId]);
  const focusAreaIn = (orgId: string) =>
    one<number>(`SELECT id FROM public.focus_areas WHERE org_id = $1 LIMIT 1`, [orgId]);

  it("refuses a cell for another organization's employee", async () => {
    const foreign = await employeeIn(orgB);

    expect(
      await refusal(
        `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, '2031-01-01')`,
        [orgA, foreign],
      ),
    ).toContain("schedule_cells_emp_id_org_fkey");
  });

  it("refuses a cell with another organization's focus area", async () => {
    const own = await employeeIn(orgA);
    const foreign = await focusAreaIn(orgB);

    expect(
      await refusal(
        `INSERT INTO public.schedule_cells (org_id, emp_id, date, focus_area_id)
         VALUES ($1, $2, '2031-01-01', $3)`,
        [orgA, own, foreign],
      ),
    ).toContain("schedule_cells_focus_area_id_org_fkey");
  });

  it("accepts a cell inside one organization", async () => {
    const own = await employeeIn(orgA);
    const area = await focusAreaIn(orgA);

    expect(
      await refusal(
        `INSERT INTO public.schedule_cells (org_id, emp_id, date, focus_area_id)
         VALUES ($1, $2, '2031-01-01', $3)`,
        [orgA, own, area],
      ),
    ).toBeNull();
  });

  it("refuses to move a row to another organization, even as the service role", async () => {
    const id = await one<number>(`SELECT id FROM public.absence_types WHERE org_id = $1 LIMIT 1`, [
      orgB,
    ]);

    expect(
      await refusal(`UPDATE public.absence_types SET org_id = $1 WHERE id = $2`, [orgA, id]),
    ).toContain("cannot move to another organization");
  });

  it("guards org_id on every table that always has one", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnotnull
          AND NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = c.oid AND t.tgname = 'trg_refuse_org_id_change'
          )`,
    );

    expect(rows).toEqual([]);
  });

  it("leaves no link between organization tables without org_id", async () => {
    const { rows } = await db.query<{ conname: string }>(
      `SELECT k.conname
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
         JOIN pg_class p ON p.oid = k.confrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND k.contype = 'f'
          AND p.relname NOT IN ('profiles', 'organizations')
          AND EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped)
          AND EXISTS (SELECT 1 FROM pg_attribute a
                       WHERE a.attrelid = p.oid AND a.attname = 'org_id' AND NOT a.attisdropped)
          AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                           WHERE a.attrelid = c.oid AND a.attname = 'org_id'
                             AND a.attnum = ANY (k.conkey))`,
    );

    expect(rows).toEqual([]);
  });

  it("refuses department ids from another organization", async () => {
    const own = await employeeIn(orgA);
    const foreign = await one<number>(
      `SELECT id FROM public.departments WHERE org_id = $1 AND archived_at IS NULL LIMIT 1`,
      [orgB],
    );

    expect(
      await refusal(
        `UPDATE public.employees SET department_ids = ARRAY[$1]::bigint[] WHERE id = $2`,
        [foreign, own],
      ),
    ).toContain("Invalid department_ids");
  });

  it("takes schedule writes away from signed-in callers (F-197)", async () => {
    const privileges = await one<boolean>(
      `SELECT has_table_privilege('authenticated', 'public.schedule_cells', 'INSERT')
           OR has_table_privilege('authenticated', 'public.schedule_cell_snapshots', 'UPDATE')
           OR has_table_privilege('authenticated', 'public.schedule_cell_segments', 'DELETE')`,
    );

    expect(privileges).toBe(false);
  });

  it("refuses an action on a request from another organization's session (F-195)", async () => {
    const requestId = await one<string>(`SELECT gen_random_uuid()`);
    const requester = await employeeIn(orgB);
    await db.query(
      `INSERT INTO public.shift_requests
         (id, org_id, type, requester_emp_id, requester_shift_date, requester_state)
       VALUES ($1, $2, 'pickup', $3, '2031-01-01', '{}'::jsonb)`,
      [requestId, orgB, requester],
    );
    const member = await one<string>(
      `SELECT user_id FROM public.organization_memberships
        WHERE org_id = $1 AND archived_at IS NULL LIMIT 1`,
      [orgA],
    );

    await db.query("SAVEPOINT attempt");
    await actAsAuthenticated(db, { sub: member, org_id: orgA, role: "authenticated" });
    await expect(
      db.query(`SELECT public.cancel_shift_request($1, $2)`, [requestId, requester]),
    ).rejects.toThrow("Request not found.");
    await db.query("ROLLBACK TO SAVEPOINT attempt");
  });

  it("keeps a Test Sandbox out of organization switching (F-198)", async () => {
    const member = await one<string>(
      `SELECT user_id FROM public.organization_memberships
        WHERE org_id = $1 AND archived_at IS NULL LIMIT 1`,
      [orgA],
    );
    const sandbox = await one<string>(
      `INSERT INTO public.organizations (name, slug, workspace_kind, sandbox_owner_user_id, sandbox_source_org_id)
       VALUES ('Sandbox', 'sandbox-org-bound-test', 'sandbox', $1, $2)
       RETURNING id`,
      [member, orgA],
    );
    await db.query(
      `INSERT INTO public.organization_memberships (user_id, org_id, org_role)
       VALUES ($1, $2, 'super_admin')`,
      [member, sandbox],
    );

    await db.query("SAVEPOINT attempt");
    await actAsAuthenticated(db, { sub: member, org_id: orgA, role: "authenticated" });
    await expect(db.query(`SELECT public.switch_org($1)`, [sandbox])).rejects.toThrow(
      "Organization not found",
    );
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    await db.query("SAVEPOINT listing");
    await actAsAuthenticated(db, { sub: member, org_id: orgA, role: "authenticated" });
    const { rows } = await db.query<{ org_id: string }>(
      `SELECT org_id FROM public.get_my_organizations()`,
    );
    await db.query("ROLLBACK TO SAVEPOINT listing");

    expect(rows.map((row) => row.org_id)).not.toContain(sandbox);
  });
});

describe.skipIf(!reachable)("a Test Sandbox clone under organization-bound references", () => {
  it("clones live staff and points only at the sandbox's own rows", async () => {
    const client = new Client(DB_CONFIG);
    await client.connect();
    const service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { rows } = await client.query<{ org_id: string; user_id: string }>(
      `SELECT m.org_id, m.user_id
         FROM public.organization_memberships m
         JOIN public.organizations o ON o.id = m.org_id AND o.workspace_kind = 'real'
        WHERE m.org_role = 'super_admin' AND m.archived_at IS NULL
          AND EXISTS (SELECT 1 FROM public.employees e WHERE e.org_id = m.org_id)
        LIMIT 1`,
    );
    const { org_id: sourceOrgId, user_id: userId } = rows[0]!;
    const actor = { id: userId } as User;

    try {
      await deleteSandboxForUser({ serviceClient: service, actor });
      const sandbox = await createSandboxForUser({
        serviceClient: service,
        actor,
        sessionId: crypto.randomUUID(),
        sourceOrgId,
      });

      const { rows: counts } = await client.query<{ cloned: number; live: number }>(
        `SELECT
           (SELECT count(*)::int FROM public.employees WHERE org_id = $1) AS cloned,
           (SELECT count(*)::int FROM public.employees
             WHERE org_id = $2 AND archived_at IS NULL AND status <> 'removed') AS live`,
        [sandbox.id, sourceOrgId],
      );
      expect(counts[0]!.cloned).toBe(counts[0]!.live);
      expect(counts[0]!.cloned).toBeGreaterThan(0);
    } finally {
      await deleteSandboxForUser({ serviceClient: service, actor });
      await client.end();
    }
  });
});
