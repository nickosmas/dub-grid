// @vitest-environment node

/**
 * discard_schedule_drafts (migration 032, audit finding F-03) against the
 * seeded local database. The last case uses a second connection to hold an
 * uncommitted publish on one cell while the discard runs, the exact
 * interleaving that used to delete published data.
 *
 * Rows are created on a far-future date and removed again by each case, so
 * the seed is untouched. Skipped when the local Postgres is unreachable.
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

interface Fixture {
  orgId: string;
  userId: string;
  empIds: string[];
  date: string;
}

let db: Client;

async function loadFixture(): Promise<Fixture> {
  const { rows: orgs } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  if (orgs.length === 0) throw new Error("Calm Haven is not seeded, run npm run db:reset");
  const { rows: users } = await db.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
  );
  const { rows: employees } = await db.query<{ id: string }>(
    `SELECT id FROM public.employees WHERE org_id = $1 AND status = 'active' AND archived_at IS NULL ORDER BY seniority LIMIT 3`,
    [orgs[0].id],
  );
  if (employees.length < 3) throw new Error("Need three active Calm Haven employees");
  return {
    orgId: orgs[0].id,
    userId: users[0].id,
    empIds: employees.map((row) => row.id),
    date: "2031-07-08",
  };
}

async function seedCell(
  client: Client,
  fx: Fixture,
  empId: string,
  kinds: Array<"draft" | "published">,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date, updated_by)
     VALUES ($1, $2, $3::date, $4) RETURNING id`,
    [fx.orgId, empId, fx.date, fx.userId],
  );
  for (const kind of kinds) {
    await client.query(
      `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
       VALUES ($1, $2, $3, 'worked')`,
      [rows[0].id, fx.orgId, kind],
    );
  }
  return rows[0].id;
}

async function cellState(cellId: string) {
  const { rows } = await db.query<{ version: string; kinds: string[] | null }>(
    `SELECT c.version, array_agg(s.snapshot_kind ORDER BY s.snapshot_kind) AS kinds
       FROM public.schedule_cells c
       LEFT JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.id = $1
      GROUP BY c.id`,
    [cellId],
  );
  return rows[0] ? { version: Number(rows[0].version), kinds: rows[0].kinds ?? [] } : null;
}

async function cleanup(fx: Fixture) {
  await db.query(`DELETE FROM public.schedule_cells WHERE org_id = $1 AND date = $2::date`, [
    fx.orgId,
    fx.date,
  ]);
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("discard_schedule_drafts (live DB)", () => {
  it("removes draft-only cells and keeps published cells with their draft stripped", async () => {
    const fx = await loadFixture();
    try {
      const draftOnly = await seedCell(db, fx, fx.empIds[0], ["draft"]);
      const publishedWithDraft = await seedCell(db, fx, fx.empIds[1], ["draft", "published"]);
      const publishedOnly = await seedCell(db, fx, fx.empIds[2], ["published"]);

      await db.query(`SELECT public.discard_schedule_drafts($1, $2, $3::date, $3::date)`, [
        fx.orgId,
        fx.userId,
        fx.date,
      ]);

      expect(await cellState(draftOnly)).toBeNull();
      expect(await cellState(publishedWithDraft)).toEqual({ version: 1, kinds: ["published"] });
      expect(await cellState(publishedOnly)).toEqual({ version: 0, kinds: ["published"] });
    } finally {
      await cleanup(fx);
    }
  });

  it("leaves another person's drafts alone when scoped to one author", async () => {
    const fx = await loadFixture();
    try {
      const mine = await seedCell(db, fx, fx.empIds[0], ["draft"]);
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.schedule_cells (org_id, emp_id, date, updated_by)
         VALUES ($1, $2, $3::date, NULL) RETURNING id`,
        [fx.orgId, fx.empIds[1], fx.date],
      );
      await db.query(
        `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
         VALUES ($1, $2, 'draft', 'worked')`,
        [rows[0].id, fx.orgId],
      );

      await db.query(`SELECT public.discard_schedule_drafts($1, $2, $3::date, $3::date)`, [
        fx.orgId,
        fx.userId,
        fx.date,
      ]);

      expect(await cellState(mine)).toBeNull();
      expect(await cellState(rows[0].id)).toEqual({ version: 0, kinds: ["draft"] });
    } finally {
      await cleanup(fx);
    }
  });

  it("waits for an in-flight publish and then keeps the cell it promoted", async () => {
    const fx = await loadFixture();
    const publisher = new Client(DB_CONFIG);
    await publisher.connect();
    try {
      const raced = await seedCell(db, fx, fx.empIds[0], ["draft"]);
      const untouched = await seedCell(db, fx, fx.empIds[1], ["draft"]);

      // The publish holds its snapshot write open; its foreign key share-locks
      // the cell, so the discard must queue behind it rather than run ahead.
      await publisher.query("BEGIN");
      await publisher.query(
        `INSERT INTO public.schedule_cell_snapshots (cell_id, org_id, snapshot_kind, state_kind)
         VALUES ($1, $2, 'published', 'worked')`,
        [raced, fx.orgId],
      );

      let discardSettled = false;
      const discard = db
        .query(`SELECT public.discard_schedule_drafts($1, NULL, $2::date, $2::date)`, [
          fx.orgId,
          fx.date,
        ])
        .then(() => {
          discardSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(discardSettled).toBe(false);

      await publisher.query("COMMIT");
      await discard;

      expect(await cellState(raced)).toEqual({ version: 1, kinds: ["published"] });
      expect(await cellState(untouched)).toBeNull();
    } finally {
      await publisher.end().catch(() => undefined);
      await cleanup(fx);
    }
  });

  it("is not callable by an organization member", async () => {
    const fx = await loadFixture();
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE authenticated`);
      await expect(
        db.query(`SELECT public.discard_schedule_drafts($1, NULL, NULL, NULL)`, [fx.orgId]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
