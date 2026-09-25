// @vitest-environment node

/**
 * Migration 032: a schedule snapshot or segment can no longer name a parent
 * in another organization. Cases run inside BEGIN/ROLLBACK against the
 * seeded local database and simulate an authenticated admin the way
 * PostgREST does, so both the row policy and the composite key are exercised.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

interface Fixture {
  orgId: string;
  otherOrgId: string;
  adminUserId: string;
  empId: string;
  otherEmpId: string;
  jobId: number;
  date: string;
}

let db: Client;

async function loadFixture(): Promise<Fixture> {
  const { rows: orgs } = await db.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM public.organizations WHERE workspace_kind <> 'sandbox' AND archived_at IS NULL ORDER BY slug = 'calmhaven' DESC, slug LIMIT 2`,
  );
  if (orgs.length < 2 || orgs[0].slug !== "calmhaven") {
    throw new Error("Need Calm Haven plus one other seeded organization, run npm run db:reset");
  }
  const [org, other] = orgs;

  const { rows: admins } = await db.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
  );
  const employee = async (orgId: string) => {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM public.employees WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL ORDER BY seniority LIMIT 1`,
      [orgId],
    );
    return rows[0].id;
  };
  const { rows: jobs } = await db.query<{ id: number }>(
    `SELECT id FROM public.jobs WHERE org_id = $1 AND archived_at IS NULL ORDER BY id LIMIT 1`,
    [org.id],
  );

  return {
    orgId: org.id,
    otherOrgId: other.id,
    adminUserId: admins[0].id,
    empId: await employee(org.id),
    otherEmpId: await employee(other.id),
    jobId: Number(jobs[0].id),
    date: "2031-06-03",
  };
}

async function asAdmin(fx: Fixture, claims: Record<string, unknown> = {}): Promise<void> {
  await actAsAuthenticated(db, {
    sub: fx.adminUserId,
    role: "authenticated",
    org_id: fx.orgId,
    org_role: "super_admin",
    platform_role: "none",
    ...claims,
  });
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

async function insertCell(orgId: string, empId: string, date: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3::date) RETURNING id`,
    [orgId, empId, date],
  );
  return rows[0].id;
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("schedule children stay in their parent's organization (live DB)", () => {
  it("refuses an admin's snapshot under another organization's cell", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const foreignCell = await insertCell(fx.otherOrgId, fx.otherEmpId, fx.date);

      await expectRaise(async () => {
        await asAdmin(fx);
        await db.query(
          `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
           VALUES ($1, $2, 'draft', 'worked')`,
          [foreignCell, fx.orgId],
        );
      }, /row-level security|violates foreign key/);

      const { rows } = await db.query(
        `SELECT 1 FROM public.schedule_cell_snapshots WHERE cell_id = $1`,
        [foreignCell],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("refuses the same row from the service role through the composite key", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const foreignCell = await insertCell(fx.otherOrgId, fx.otherEmpId, fx.date);

      await expectRaise(
        () =>
          db.query(
            `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
             VALUES ($1, $2, 'draft', 'worked')`,
            [foreignCell, fx.orgId],
          ),
        /schedule_cell_snapshots_cell_org_fkey/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("refuses a segment under another organization's snapshot", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const foreignCell = await insertCell(fx.otherOrgId, fx.otherEmpId, fx.date);
      const { rows: snapshots } = await db.query<{ id: string }>(
        `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
         VALUES ($1, $2, 'draft', 'worked') RETURNING id`,
        [foreignCell, fx.otherOrgId],
      );

      await expectRaise(async () => {
        await asAdmin(fx);
        await db.query(
          `INSERT INTO public.schedule_cell_segments (snapshot_id, org_id, position, job_id)
           VALUES ($1, $2, 0, $3)`,
          [snapshots[0].id, fx.orgId, fx.jobId],
        );
      }, /row-level security|violates foreign key/);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("still accepts an admin's snapshot and segment under their own cell", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const cell = await insertCell(fx.orgId, fx.empId, fx.date);

      await asAdmin(fx);
      const { rows: snapshots } = await db.query<{ id: string }>(
        `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
         VALUES ($1, $2, 'draft', 'worked') RETURNING id`,
        [cell, fx.orgId],
      );
      await db.query(
        `INSERT INTO public.schedule_cell_segments (snapshot_id, org_id, position, job_id)
         VALUES ($1, $2, 0, $3)`,
        [snapshots[0].id, fx.orgId, fx.jobId],
      );
      await asSuperuser();

      const { rows } = await db.query<{ job_ids: number[] }>(
        `SELECT job_ids FROM public.get_schedule_cell_snapshot_payload($1, $2, $3::date, 'draft')`,
        [fx.orgId, fx.empId, fx.date],
      );
      expect(rows[0].job_ids.map(Number)).toEqual([fx.jobId]);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
