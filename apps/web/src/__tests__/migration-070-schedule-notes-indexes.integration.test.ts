// @vitest-environment node

/**
 * Migration 070: the two schedule_notes indexes it drops are served by 063's
 * unique key (F-108). Each case runs 070 from its file inside BEGIN/ROLLBACK
 * against the local database; both statements are idempotent, so this holds
 * whether or not 070 is applied.
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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const EMP_ID = "00000000-0000-4000-8000-000000000070";

let db: Client;

async function plan(sql: string): Promise<string> {
  const { rows } = await db.query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql}`, [EMP_ID]);
  return rows.map((row) => row["QUERY PLAN"]).join("\n");
}

describe.skipIf(!reachable)(
  "migration 070: schedule_notes reads without the dropped indexes",
  () => {
    beforeAll(async () => {
      db = new Client(DB_CONFIG);
      await db.connect();
    });

    afterAll(async () => {
      await db?.end();
    });

    beforeEach(async () => {
      await db.query("BEGIN");
      // Dropping an index takes this lock anyway; taking it first means a
      // parallel suite's note write waits rather than deadlocks.
      await db.query("LOCK TABLE public.schedule_notes IN ACCESS EXCLUSIVE MODE");
      await db.query(
        readFileSync(migrationPath("070_schedule_notes_redundant_indexes.sql"), "utf8"),
      );
      await db.query("SET LOCAL enable_seqscan = off");
    });

    afterEach(async () => {
      await db.query("ROLLBACK");
    });

    it("drops both indexes and keeps the unique key and the organization-date index", async () => {
      const { rows } = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'schedule_notes'
        ORDER BY indexname`,
      );
      const names = rows.map((row) => row.indexname);

      expect(names).not.toContain("idx_schedule_notes_emp");
      expect(names).not.toContain("idx_schedule_notes_emp_date");
      expect(names).toEqual(
        expect.arrayContaining(["schedule_notes_segment_unique", "idx_schedule_notes_org_date"]),
      );
    });

    it("serves a person's notes from the unique key", async () => {
      const text = await plan(`SELECT id FROM public.schedule_notes WHERE emp_id = $1::uuid`);
      expect(text).toContain("schedule_notes_segment_unique");
      expect(text).not.toContain("Seq Scan");
    });

    it("serves a person's notes for a date range from the unique key", async () => {
      const text = await plan(
        `SELECT id FROM public.schedule_notes
        WHERE emp_id = $1::uuid AND date BETWEEN '2026-09-01' AND '2026-09-30'`,
      );
      expect(text).toMatch(/Index Cond: \(\(emp_id = [\s\S]*date >= /);
      expect(text).toContain("schedule_notes_segment_unique");
    });
  },
);
