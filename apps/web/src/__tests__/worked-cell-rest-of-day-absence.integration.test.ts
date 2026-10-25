// @vitest-environment node
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
  shift_id: number;
  job_id: number;
  absence_id: number;
  other_org_absence_id: number;
}

const DAYS = ["2031-02-03", "2031-02-04", "2031-02-05", "2031-02-10", "2031-02-11", "2031-02-12"];

/** Runs `body` as a Calm Haven Super Admin inside a transaction that is always rolled back. */
async function asSuperAdmin(body: (fixture: Fixture) => Promise<void>) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '10s'");
    const {
      rows: [fixture],
    } = await db.query<Fixture>(`
      SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id,
        pair.shift_id, pair.job_id,
        (SELECT min(a.id)::integer FROM public.absence_types a
          WHERE a.org_id = o.id AND a.archived_at IS NULL) AS absence_id,
        (SELECT min(a.id)::integer FROM public.absence_types a
          WHERE a.org_id <> o.id AND a.archived_at IS NULL) AS other_org_absence_id
      FROM public.organizations o
      JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
        AND e.archived_at IS NULL
      JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
      -- Import copies only shifts the employee is qualified for.
      CROSS JOIN LATERAL (
        SELECT sc.id::integer AS shift_id, j.id::integer AS job_id
        FROM public.shift_categories sc
        JOIN public.jobs j ON j.org_id = o.id AND j.archived_at IS NULL
        WHERE sc.org_id = o.id AND sc.archived_at IS NULL
          AND public.is_employee_qualified_for_shift_job(e.id, sc.id, j.id) IS NULL
        ORDER BY sc.id, j.id
        LIMIT 1
      ) AS pair
      WHERE o.slug = 'calmhaven'
      ORDER BY e.id
      LIMIT 1
    `);
    if (!fixture?.shift_id || !fixture.job_id || !fixture.absence_id) {
      throw new Error("Local QA fixtures missing; run npm run db:reset");
    }
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

async function writeDraft(
  fixture: Fixture,
  date: string,
  stateKind: "worked" | "absence",
  options: { segments?: boolean; absenceId?: number | null } = {},
) {
  const segments = options.segments ?? stateKind === "worked";
  await db.query(
    // A full-shift absence covers no time, which the editor's save refuses
    // since 092; these cases are about storing the absence, so they save it
    // untimed, as a cell from before 50a was.
    `SELECT public.write_schedule_cell_snapshot(
       $1::uuid, $2::uuid, $3::date, 'draft', $4,
       $5::bigint[], $6::bigint[], $7::bigint,
       p_allow_untimed_absence => true
     )`,
    [
      fixture.org_id,
      fixture.emp_id,
      date,
      stateKind,
      segments ? [fixture.shift_id] : [],
      segments ? [fixture.job_id] : [],
      options.absenceId ?? null,
    ],
  );
}

async function snapshot(fixture: Fixture, date: string, kind: "draft" | "published") {
  const {
    rows: [row],
  } = await db.query<{ state_kind: string; absence_type_id: number | null; segments: number }>(
    `SELECT s.state_kind, s.absence_type_id::integer AS absence_type_id,
       (SELECT count(*)::integer FROM public.schedule_cell_segments seg
         WHERE seg.snapshot_id = s.id) AS segments
     FROM public.schedule_cells c
     JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = $3
     WHERE c.emp_id = $1 AND c.date = $2::date`,
    [fixture.emp_id, date, kind],
  );
  return row;
}

const draftSnapshot = (fixture: Fixture, date: string) => snapshot(fixture, date, "draft");

async function publish(fixture: Fixture, date: string) {
  const {
    rows: [row],
  } = await db.query<{ history_id: string }>(
    "SELECT public.publish_schedule($1::uuid, $2::date, $2::date, $3::uuid) AS history_id",
    [fixture.org_id, date, fixture.user_id],
  );
  return row.history_id;
}

async function changeRows(historyId: string, empId: string) {
  // Only service-role code reads change rows since 084, so read as the owner
  // and go back to the caller for the rest of the test.
  await db.query("RESET ROLE");
  try {
    return await readChangeRows(historyId, empId);
  } finally {
    await db.query("SET LOCAL ROLE authenticated");
  }
}

async function readChangeRows(historyId: string, empId: string) {
  const { rows } = await db.query<{
    kind: string;
    from_absence: number | null;
    to_absence: number | null;
    to_state_absence: number | null;
  }>(
    `SELECT kind, from_absence_type_id::integer AS from_absence,
       to_absence_type_id::integer AS to_absence,
       (to_state->>'absenceTypeId')::integer AS to_state_absence
     FROM public.schedule_publish_changes
     WHERE publish_history_id = $1 AND emp_id = $2`,
    [historyId, empId],
  );
  return rows;
}

describe.skipIf(!reachable)("a worked cell can carry a rest-of-day absence (082)", () => {
  it("keeps the absence on a worked draft, with its segment", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeDraft(fixture, DAYS[0], "worked", { absenceId: fixture.absence_id });
      expect(await draftSnapshot(fixture, DAYS[0])).toEqual({
        state_kind: "worked",
        absence_type_id: fixture.absence_id,
        segments: 1,
      });
    });
  });

  it("leaves a plain worked cell and a whole-day absence as they were", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeDraft(fixture, DAYS[0], "worked");
      await writeDraft(fixture, DAYS[1], "absence", { absenceId: fixture.absence_id });
      expect(await draftSnapshot(fixture, DAYS[0])).toEqual({
        state_kind: "worked",
        absence_type_id: null,
        segments: 1,
      });
      expect(await draftSnapshot(fixture, DAYS[1])).toEqual({
        state_kind: "absence",
        absence_type_id: fixture.absence_id,
        segments: 0,
      });
    });
  });

  it("still refuses a whole-day absence with segments", async () => {
    await asSuperAdmin(async (fixture) => {
      await expect(
        writeDraft(fixture, DAYS[2], "absence", { segments: true, absenceId: fixture.absence_id }),
      ).rejects.toThrow(/Only worked snapshots may include segments/);
    });
  });

  it("resolves a worked state with an absence, and refuses one from another organization", async () => {
    await asSuperAdmin(async (fixture) => {
      await db.query("SET LOCAL ROLE postgres");
      const state = (absenceTypeId: number) =>
        JSON.stringify({
          kind: "worked",
          segments: [{ shiftId: fixture.shift_id, jobId: fixture.job_id, position: 0 }],
          absenceTypeId,
        });
      const {
        rows: [resolved],
      } = await db.query<{ state_kind: string; absence_type_id: number }>(
        `SELECT state_kind, absence_type_id::integer AS absence_type_id
         FROM public.resolve_schedule_state_storage($1::uuid, $2::jsonb)`,
        [fixture.org_id, state(fixture.absence_id)],
      );
      expect(resolved).toEqual({ state_kind: "worked", absence_type_id: fixture.absence_id });

      await db.query("SAVEPOINT foreign_absence");
      await expect(
        db.query("SELECT * FROM public.resolve_schedule_state_storage($1::uuid, $2::jsonb)", [
          fixture.org_id,
          state(fixture.other_org_absence_id),
        ]),
      ).rejects.toThrow(/Absence type not found in this organization/);
      await db.query("ROLLBACK TO SAVEPOINT foreign_absence");
    });
  });

  it("publishes the absence and records it in the change row", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeDraft(fixture, DAYS[0], "worked", { absenceId: fixture.absence_id });
      const historyId = await publish(fixture, DAYS[0]);
      expect(await snapshot(fixture, DAYS[0], "published")).toEqual({
        state_kind: "worked",
        absence_type_id: fixture.absence_id,
        segments: 1,
      });
      expect(await changeRows(historyId, fixture.emp_id)).toEqual([
        {
          kind: "new",
          from_absence: null,
          to_absence: fixture.absence_id,
          to_state_absence: fixture.absence_id,
        },
      ]);
    });
  });

  it("publishes an absence added to a published shift as one change", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeDraft(fixture, DAYS[1], "worked");
      await publish(fixture, DAYS[1]);
      await writeDraft(fixture, DAYS[1], "worked", { absenceId: fixture.absence_id });
      const historyId = await publish(fixture, DAYS[1]);
      expect(await changeRows(historyId, fixture.emp_id)).toEqual([
        {
          kind: "modified",
          from_absence: null,
          to_absence: fixture.absence_id,
          to_state_absence: fixture.absence_id,
        },
      ]);
      expect((await snapshot(fixture, DAYS[1], "published"))?.absence_type_id).toBe(
        fixture.absence_id,
      );
    });
  });

  it("imports a mixed cell into an empty week intact", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeDraft(fixture, DAYS[0], "worked", { absenceId: fixture.absence_id });
      const { rows } = await db.query<{ emp_id: string; outcome: string; reason: string | null }>(
        `SELECT emp_id, outcome, reason FROM public.import_previous_schedule(
           $1::uuid, $2::date, $2::date, $3::date, $3::date)`,
        [fixture.org_id, DAYS[0], DAYS[3]],
      );
      expect(rows.find((row) => row.emp_id === fixture.emp_id)).toMatchObject({
        outcome: "imported",
      });
      expect(await draftSnapshot(fixture, DAYS[3])).toEqual({
        state_kind: "worked",
        absence_type_id: fixture.absence_id,
        segments: 1,
      });
    });
  });

  it.each(["move", "copy"])(
    "keeps the absence when a worked cell is dragged (%s, 083)",
    async (dragMode) => {
      await asSuperAdmin(async (fixture) => {
        await writeDraft(fixture, DAYS[4], "worked", { absenceId: fixture.absence_id });
        await db.query(
          `SELECT public.move_shift(
             $1::uuid, $2::uuid, $3::date, $2::uuid, $4::date, 'worked',
             $5::bigint[], $6::bigint[], $7::bigint, NULL, NULL, $8, NULL, NULL, TRUE
           )`,
          [
            fixture.org_id,
            fixture.emp_id,
            DAYS[4],
            DAYS[5],
            [fixture.shift_id],
            [fixture.job_id],
            fixture.absence_id,
            dragMode,
          ],
        );
        expect(await draftSnapshot(fixture, DAYS[5])).toEqual({
          state_kind: "worked",
          absence_type_id: fixture.absence_id,
          segments: 1,
        });
      });
    },
  );

  it("builds the cell state with the absence on a worked cell only", async () => {
    await asSuperAdmin(async (fixture) => {
      // Only SQL functions call the builder since 092, so call it as the owner.
      await db.query("RESET ROLE");
      const {
        rows: [row],
      } = await db.query<{ worked: number | null; deleted: number | null }>(
        `SELECT
           (public.build_schedule_cell_state_json('worked', ARRAY[$1::bigint], ARRAY[$2::bigint], $3::bigint)
             ->>'absenceTypeId')::integer AS worked,
           (public.build_schedule_cell_state_json('deleted', '{}', '{}', $3::bigint)
             ->>'absenceTypeId')::integer AS deleted`,
        [fixture.shift_id, fixture.job_id, fixture.absence_id],
      );
      expect(row).toEqual({ worked: fixture.absence_id, deleted: null });
    });
  });
});
