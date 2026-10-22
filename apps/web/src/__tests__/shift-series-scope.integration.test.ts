// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

// These write tests only ever target the local development database.
const connectionString = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const probe = new Client({ connectionString, connectionTimeoutMillis: 2000 });
const reachable = await probe.connect().then(
  () => true,
  () => false,
);
await probe.end();
const db = new Client({ connectionString });

beforeAll(async () => {
  if (reachable) await db.connect();
});
afterAll(async () => {
  if (reachable) await db.end();
});

interface Fixture {
  org_id: string;
  emp_id: string;
  user_id: string;
  absence_id: number;
  other_absence_id: number;
}

const DAYS = ["2031-01-01", "2031-01-02", "2031-01-03", "2031-01-04", "2031-01-05"];

function absence(id: number) {
  return JSON.stringify({ kind: "absence", segments: [], absenceTypeId: id });
}

/** Runs `body` as a Calm Haven Super Admin inside a transaction that is always rolled back. */
async function asSuperAdmin(body: (fixture: Fixture) => Promise<void>) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '10s'");
    const {
      rows: [fixture],
    } = await db.query<Fixture>(`
      SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id,
        (SELECT min(a.id)::integer FROM public.absence_types a
          WHERE a.org_id = o.id AND a.archived_at IS NULL) AS absence_id,
        (SELECT max(a.id)::integer FROM public.absence_types a
          WHERE a.org_id = o.id AND a.archived_at IS NULL) AS other_absence_id
      FROM public.organizations o
      JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
        AND e.archived_at IS NULL
      JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
      WHERE o.slug = 'calmhaven'
      LIMIT 1
    `);
    if (!fixture || fixture.absence_id === fixture.other_absence_id) {
      throw new Error("Local QA fixtures missing; run npm run db:reset");
    }
    // The employee's own cells on these dates would make every count wrong.
    await db.query(
      "DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = ANY($2::date[])",
      [fixture.emp_id, DAYS],
    );
    await actAsAuthenticated(db, {
      sub: fixture.user_id,
      role: "authenticated",
      org_id: fixture.org_id,
      org_role: "super_admin",
      platform_role: "none",
    });
    await body(fixture);
  } finally {
    await db.query("ROLLBACK");
  }
}

async function createDailySeries(
  fixture: Fixture,
  options: { keepExisting?: boolean; originDate?: string } = {},
) {
  const seriesId = randomUUID();
  await db.query(
    `SELECT public.create_shift_series(
       $1::uuid, $2::uuid, $3::uuid, $4::jsonb, 'daily', NULL,
       '2031-01-01', '2031-01-05', NULL, $5::boolean, $6::date
     )`,
    [
      seriesId,
      fixture.emp_id,
      fixture.org_id,
      absence(fixture.absence_id),
      options.keepExisting ?? false,
      options.originDate ?? null,
    ],
  );
  return seriesId;
}

/** Puts an existing absence on `date` the way an earlier edit would have. */
async function writeCell(fixture: Fixture, date: string, absenceId: number) {
  // The internal writer is not granted to callers, so step out of the role.
  await db.query("SET LOCAL ROLE postgres");
  await db.query(
    `SELECT public.write_schedule_cell_snapshot_internal(
       $1::uuid, $2::uuid, $3::date, 'draft', 'absence', '{}', '{}', $4::bigint
     )`,
    [fixture.org_id, fixture.emp_id, date, absenceId],
  );
  await db.query("SET LOCAL ROLE authenticated");
}

async function seriesDates(seriesId: string): Promise<string[]> {
  const { rows } = await db.query<{ date: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public.schedule_cells
     WHERE series_id = $1 ORDER BY date`,
    [seriesId],
  );
  return rows.map((row) => row.date);
}

async function draftAbsences(fixture: Fixture): Promise<Record<string, number | null>> {
  const { rows } = await db.query<{ date: string; absence_type_id: number | null }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date, s.absence_type_id::integer AS absence_type_id
     FROM public.schedule_cells c
     JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = 'draft'
     WHERE c.emp_id = $1 AND c.date = ANY($2::date[])`,
    [fixture.emp_id, DAYS],
  );
  return Object.fromEntries(rows.map((row) => [row.date, row.absence_type_id]));
}

async function seriesRecord(seriesId: string) {
  const { rows } = await db.query<{
    end_date: string | null;
    archived: boolean;
    absence_type_id: number;
  }>(
    `SELECT to_char(end_date, 'YYYY-MM-DD') AS end_date, archived_at IS NOT NULL AS archived,
       (state->>'absenceTypeId')::integer AS absence_type_id
     FROM public.shift_series WHERE id = $1`,
    [seriesId],
  );
  return rows[0];
}

describe.runIf(reachable)("shift series scope against the local database", () => {
  it("overwrites existing days unless asked to keep them, and always writes the origin day", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeCell(fixture, "2031-01-01", fixture.other_absence_id);
      await writeCell(fixture, "2031-01-03", fixture.other_absence_id);

      const kept = await createDailySeries(fixture, {
        keepExisting: true,
        originDate: "2031-01-01",
      });

      expect(await seriesDates(kept)).toEqual([
        "2031-01-01",
        "2031-01-02",
        "2031-01-04",
        "2031-01-05",
      ]);
      expect((await draftAbsences(fixture))["2031-01-03"]).toBe(fixture.other_absence_id);
    });

    await asSuperAdmin(async (fixture) => {
      await writeCell(fixture, "2031-01-03", fixture.other_absence_id);

      const replaced = await createDailySeries(fixture);

      expect(await seriesDates(replaced)).toEqual(DAYS);
      expect((await draftAbsences(fixture))["2031-01-03"]).toBe(fixture.absence_id);
    });
  });

  it("removes this and later, ending the series the day before", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);

      const { rows } = await db.query<{ count: number }>(
        "SELECT public.delete_shift_series($1, $2, '2031-01-03', NULL) AS count",
        [seriesId, fixture.org_id],
      );

      expect(rows[0].count).toBe(3);
      expect(await seriesDates(seriesId)).toEqual(["2031-01-01", "2031-01-02"]);
      expect(Object.keys(await draftAbsences(fixture)).sort()).toEqual([
        "2031-01-01",
        "2031-01-02",
      ]);
      expect(await seriesRecord(seriesId)).toMatchObject({
        end_date: "2031-01-02",
        archived: false,
      });
    });
  });

  it("removes this and earlier, leaving later dates in the series", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);

      await db.query("SELECT public.delete_shift_series($1, $2, NULL, '2031-01-03')", [
        seriesId,
        fixture.org_id,
      ]);

      expect(await seriesDates(seriesId)).toEqual(["2031-01-04", "2031-01-05"]);
      expect(await seriesRecord(seriesId)).toMatchObject({
        end_date: "2031-01-05",
        archived: false,
      });
    });
  });

  it("archives the series once a ranged removal leaves no occurrence", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);

      await db.query("SELECT public.delete_shift_series($1, $2, '2031-01-01', NULL)", [
        seriesId,
        fixture.org_id,
      ]);

      expect(await seriesDates(seriesId)).toEqual([]);
      expect((await seriesRecord(seriesId)).archived).toBe(true);
    });
  });

  it("edits this and later, and the series template follows", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);

      await db.query(
        "SELECT public.update_series_all_shifts($1, $2, $3::jsonb, '2031-01-04', NULL)",
        [seriesId, fixture.org_id, absence(fixture.other_absence_id)],
      );

      const absences = await draftAbsences(fixture);
      expect(DAYS.map((day) => absences[day])).toEqual([
        fixture.absence_id,
        fixture.absence_id,
        fixture.absence_id,
        fixture.other_absence_id,
        fixture.other_absence_id,
      ]);
      expect((await seriesRecord(seriesId)).absence_type_id).toBe(fixture.other_absence_id);
    });
  });

  it("does not bring back a published occurrence that was removed on its own", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);
      await db.query("SET LOCAL ROLE postgres");
      for (const kind of ["published", "draft"]) {
        await db.query(
          `SELECT public.write_schedule_cell_snapshot_internal(
             $1::uuid, $2::uuid, '2031-01-03', $3, $4, '{}', '{}', $5::bigint
           )`,
          [
            fixture.org_id,
            fixture.emp_id,
            kind,
            kind === "draft" ? "deleted" : "absence",
            kind === "draft" ? null : fixture.absence_id,
          ],
        );
      }
      await db.query("SET LOCAL ROLE authenticated");

      await db.query("SELECT public.update_series_all_shifts($1, $2, $3::jsonb)", [
        seriesId,
        fixture.org_id,
        absence(fixture.other_absence_id),
      ]);

      const { rows } = await db.query<{ state_kind: string }>(
        `SELECT s.state_kind FROM public.schedule_cells c
         JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = 'draft'
         WHERE c.emp_id = $1 AND c.date = '2031-01-03'`,
        [fixture.emp_id],
      );
      expect(rows[0].state_kind).toBe("deleted");
    });
  });

  it("edits this and earlier, and the template keeps describing later dates", async () => {
    await asSuperAdmin(async (fixture) => {
      const seriesId = await createDailySeries(fixture);

      await db.query(
        "SELECT public.update_series_all_shifts($1, $2, $3::jsonb, NULL, '2031-01-02')",
        [seriesId, fixture.org_id, absence(fixture.other_absence_id)],
      );

      const absences = await draftAbsences(fixture);
      expect(DAYS.map((day) => absences[day])).toEqual([
        fixture.other_absence_id,
        fixture.other_absence_id,
        fixture.absence_id,
        fixture.absence_id,
        fixture.absence_id,
      ]);
      expect((await seriesRecord(seriesId)).absence_type_id).toBe(fixture.absence_id);
    });
  });
});
