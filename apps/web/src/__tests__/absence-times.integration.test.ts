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
  /** The shift's scheduled start, a time two hours in, and its scheduled end, all HH:MM. */
  start: string;
  left: string;
  end: string;
}

const DAYS = ["2032-05-03", "2032-05-04", "2032-05-05", "2032-05-10", "2032-05-11"];

/** Runs `body` as a Calm Haven Super Admin inside a transaction that is always rolled back. */
async function asSuperAdmin(body: (fixture: Fixture) => Promise<void>) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '10s'");
    const {
      rows: [fixture],
    } = await db.query<Fixture>(`
      SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id,
        pair.shift_id, pair.job_id, pair.start, pair.left, pair.end,
        (SELECT min(a.id)::integer FROM public.absence_types a
          WHERE a.org_id = o.id AND a.archived_at IS NULL) AS absence_id
      FROM public.organizations o
      JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
        AND e.archived_at IS NULL
      JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
      -- A daytime shift of four hours or more the employee is qualified for,
      -- with its effective times, so "left two hours in" falls inside it.
      CROSS JOIN LATERAL (
        SELECT sc.id::integer AS shift_id, j.id::integer AS job_id,
          to_char(r.start_time, 'HH24:MI') AS start,
          to_char(r.start_time + interval '2 hours', 'HH24:MI') AS left,
          to_char(r.end_time, 'HH24:MI') AS end
        FROM public.shift_categories sc
        JOIN public.jobs j ON j.org_id = o.id AND j.archived_at IS NULL
        CROSS JOIN LATERAL public.resolve_work_assignment_time_ranges(
          ARRAY[sc.id], ARRAY[j.id], NULL, NULL
        ) r
        WHERE sc.org_id = o.id AND sc.archived_at IS NULL
          AND r.end_time - r.start_time >= interval '4 hours'
          AND public.is_employee_qualified_for_shift_job(e.id, sc.id, j.id) IS NULL
        ORDER BY sc.id, j.id
        LIMIT 1
      ) AS pair
      WHERE o.slug = 'calmhaven'
      ORDER BY e.id
      LIMIT 1
    `);
    if (!fixture?.shift_id || !fixture.absence_id) {
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

interface MixedDraft {
  customStart?: string | null;
  customEnd?: string | null;
  absenceStart?: string | null;
  absenceEnd?: string | null;
  absenceId?: number | null;
}

async function writeMixed(fixture: Fixture, date: string, draft: MixedDraft) {
  await db.query(
    `SELECT public.write_schedule_cell_snapshot(
       $1::uuid, $2::uuid, $3::date, 'draft', 'worked',
       ARRAY[$4::bigint], ARRAY[$5::bigint], $6::bigint, $7, $8,
       p_absence_start_time => $9, p_absence_end_time => $10
     )`,
    [
      fixture.org_id,
      fixture.emp_id,
      date,
      fixture.shift_id,
      fixture.job_id,
      draft.absenceId === undefined ? fixture.absence_id : draft.absenceId,
      draft.customStart ?? null,
      draft.customEnd ?? null,
      draft.absenceStart ?? null,
      draft.absenceEnd ?? null,
    ],
  );
}

/** Reads as the owner (snapshot internals are revoked from callers) and returns to the caller. */
async function asOwner<T>(read: () => Promise<T>): Promise<T> {
  await db.query("RESET ROLE");
  try {
    return await read();
  } finally {
    await db.query("SET LOCAL ROLE authenticated");
  }
}

async function absenceTimes(fixture: Fixture, date: string, kind: "draft" | "published") {
  const {
    rows: [row],
  } = await db.query<{ start: string | null; end: string | null }>(
    `SELECT s.absence_start_time AS start, s.absence_end_time AS "end"
     FROM public.schedule_cells c
     JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = $3
     WHERE c.emp_id = $1 AND c.date = $2::date`,
    [fixture.emp_id, date, kind],
  );
  return row;
}

async function publish(fixture: Fixture, date: string) {
  const {
    rows: [row],
  } = await db.query<{ history_id: string }>(
    "SELECT public.publish_schedule($1::uuid, $2::date, $2::date, $3::uuid) AS history_id",
    [fixture.org_id, date, fixture.user_id],
  );
  return row.history_id;
}

function changeRows(historyId: string, empId: string) {
  return asOwner(async () => {
    const { rows } = await db.query<{ from_times: string | null; to_times: string | null }>(
      `SELECT
         NULLIF(concat_ws('-', from_state->>'absenceStartTime', from_state->>'absenceEndTime'), '') AS from_times,
         NULLIF(concat_ws('-', to_state->>'absenceStartTime', to_state->>'absenceEndTime'), '') AS to_times
       FROM public.schedule_publish_changes
       WHERE publish_history_id = $1 AND emp_id = $2`,
      [historyId, empId],
    );
    return rows;
  });
}

describe.skipIf(!reachable)("an absence beside a shift keeps its own times (092)", () => {
  it("fills from the last shift's effective end, and finds nothing for a full shift", async () => {
    await asSuperAdmin(async (fixture) => {
      const fill = (customStart: string | null, customEnd: string | null) =>
        asOwner(async () => {
          const { rows } = await db.query<{ start_time: string; end_time: string }>(
            `SELECT * FROM public.rest_of_day_absence_fill_times(
               ARRAY[$1::bigint], ARRAY[$2::bigint], $3, $4)`,
            [fixture.shift_id, fixture.job_id, customStart, customEnd],
          );
          return rows;
        });

      expect(await fill(fixture.start, fixture.left)).toEqual([
        { start_time: fixture.left, end_time: fixture.end },
      ]);
      expect(await fill(null, null)).toEqual([]);
    });
  });

  it("refuses times on a whole-day absence, one time without the other, and equal times", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], { customStart: fixture.start, customEnd: fixture.left });
      // Each refused update aborts only its own savepoint, taken as the owner.
      const refusal = async (start: string | null, end: string | null) => {
        await db.query("RESET ROLE");
        await db.query("SAVEPOINT refused");
        try {
          await db.query(
            `UPDATE public.schedule_cell_snapshots s
             SET absence_start_time = $3, absence_end_time = $4
             FROM public.schedule_cells c
             WHERE s.cell_id = c.id AND c.emp_id = $1 AND c.date = $2::date`,
            [fixture.emp_id, DAYS[0], start, end],
          );
          return "accepted";
        } catch (error) {
          return (error as Error).message;
        } finally {
          await db.query("ROLLBACK TO SAVEPOINT refused");
          await db.query("SET LOCAL ROLE authenticated");
        }
      };

      expect(await refusal("13:00", null)).toMatch(/schedule_cell_snapshots_absence_times/);
      expect(await refusal("13:00", "13:00")).toMatch(/schedule_cell_snapshots_absence_times/);
      expect(await refusal("1pm", "15:00")).toMatch(/schedule_cell_snapshots_absence_times/);

      await db.query(
        `SELECT public.write_schedule_cell_snapshot(
           $1::uuid, $2::uuid, $3::date, 'draft', 'absence', '{}', '{}', $4::bigint,
           p_absence_start_time => '09:00', p_absence_end_time => '11:00'
         )`,
        [fixture.org_id, fixture.emp_id, DAYS[1], fixture.absence_id],
      );
      expect(await asOwner(() => absenceTimes(fixture, DAYS[1], "draft"))).toEqual({
        start: null,
        end: null,
      });
    });
  });

  it("stores sent times, so an absence can come before the work", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], {
        customStart: fixture.left,
        customEnd: fixture.end,
        absenceStart: fixture.start,
        absenceEnd: fixture.left,
      });
      expect(await asOwner(() => absenceTimes(fixture, DAYS[0], "draft"))).toEqual({
        start: fixture.start,
        end: fixture.left,
      });
    });
  });

  it("fills the times when the editor sends none", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], { customStart: fixture.start, customEnd: fixture.left });
      expect(await asOwner(() => absenceTimes(fixture, DAYS[0], "draft"))).toEqual({
        start: fixture.left,
        end: fixture.end,
      });
    });
  });

  it("refuses an absence that covers no time or overlaps the work", async () => {
    await asSuperAdmin(async (fixture) => {
      await db.query("SAVEPOINT refused");
      // Worked to the scheduled end: nothing left for the absence.
      await expect(writeMixed(fixture, DAYS[0], {})).rejects.toThrow(
        /The absence has to cover some of the shift's time/,
      );
      await db.query("ROLLBACK TO SAVEPOINT refused");
      await expect(
        writeMixed(fixture, DAYS[0], {
          customStart: fixture.start,
          customEnd: fixture.left,
          absenceStart: fixture.start,
          absenceEnd: fixture.end,
        }),
      ).rejects.toThrow(/apart from the time worked/);
      await db.query("ROLLBACK TO SAVEPOINT refused");
      await expect(
        writeMixed(fixture, DAYS[0], {
          customStart: fixture.start,
          customEnd: fixture.left,
          absenceStart: fixture.left,
          absenceEnd: fixture.left,
        }),
      ).rejects.toThrow(/The absence has to cover some of the shift's time/);
      await db.query("ROLLBACK TO SAVEPOINT refused");
    });
  });

  it("leaves a plain worked cell untimed", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], {
        absenceId: null,
        absenceStart: fixture.left,
        absenceEnd: fixture.end,
      });
      expect(await asOwner(() => absenceTimes(fixture, DAYS[0], "draft"))).toEqual({
        start: null,
        end: null,
      });
    });
  });

  it("publishes the times, and a change to them alone is one change", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], { customStart: fixture.start, customEnd: fixture.left });
      const first = await publish(fixture, DAYS[0]);
      expect(await asOwner(() => absenceTimes(fixture, DAYS[0], "published"))).toEqual({
        start: fixture.left,
        end: fixture.end,
      });
      expect(await changeRows(first, fixture.emp_id)).toEqual([
        { from_times: null, to_times: `${fixture.left}-${fixture.end}` },
      ]);

      // Arrived late instead: the same hours, so only the absence's times move.
      await writeMixed(fixture, DAYS[0], {
        customStart: fixture.left,
        customEnd: fixture.end,
        absenceStart: fixture.start,
        absenceEnd: fixture.left,
      });
      const second = await publish(fixture, DAYS[0]);
      expect(await changeRows(second, fixture.emp_id)).toEqual([
        {
          from_times: `${fixture.left}-${fixture.end}`,
          to_times: `${fixture.start}-${fixture.left}`,
        },
      ]);
    });
  });

  it("imports and drags a mixed cell with its times", async () => {
    await asSuperAdmin(async (fixture) => {
      await writeMixed(fixture, DAYS[0], {
        customStart: fixture.left,
        customEnd: fixture.end,
        absenceStart: fixture.start,
        absenceEnd: fixture.left,
      });
      await db.query(
        "SELECT * FROM public.import_previous_schedule($1::uuid, $2::date, $2::date, $3::date, $3::date)",
        [fixture.org_id, DAYS[0], DAYS[3]],
      );
      expect(await asOwner(() => absenceTimes(fixture, DAYS[3], "draft"))).toEqual({
        start: fixture.start,
        end: fixture.left,
      });

      await db.query(
        `SELECT public.move_shift(
           $1::uuid, $2::uuid, $3::date, $2::uuid, $4::date, 'worked',
           ARRAY[$5::bigint], ARRAY[$6::bigint], $7::bigint, $8, $9, 'move',
           p_target_was_empty => true,
           p_absence_start_time => $10, p_absence_end_time => $11
         )`,
        [
          fixture.org_id,
          fixture.emp_id,
          DAYS[3],
          DAYS[4],
          fixture.shift_id,
          fixture.job_id,
          fixture.absence_id,
          fixture.left,
          fixture.end,
          fixture.start,
          fixture.left,
        ],
      );
      expect(await asOwner(() => absenceTimes(fixture, DAYS[4], "draft"))).toEqual({
        start: fixture.start,
        end: fixture.left,
      });
    });
  });

  it("still drags a cell saved untimed before 50a", async () => {
    await asSuperAdmin(async (fixture) => {
      // A full-shift absence as 082 saved it: the snapshot sync alone, no times.
      await asOwner(async () => {
        await db.query(
          `INSERT INTO public.schedule_cells (org_id, emp_id, date, version)
           VALUES ($1::uuid, $2::uuid, $3::date, 0)`,
          [fixture.org_id, fixture.emp_id, DAYS[0]],
        );
        await db.query(
          `SELECT public.sync_schedule_cell_snapshot(
             c.id, c.org_id, 'draft', 'worked', $3::bigint, NULL, NULL,
             ARRAY[$4::bigint], ARRAY[$5::bigint])
           FROM public.schedule_cells c WHERE c.emp_id = $1::uuid AND c.date = $2::date`,
          [fixture.emp_id, DAYS[0], fixture.absence_id, fixture.shift_id, fixture.job_id],
        );
      });
      await db.query(
        `SELECT public.move_shift(
           $1::uuid, $2::uuid, $3::date, $2::uuid, $4::date, 'worked',
           ARRAY[$5::bigint], ARRAY[$6::bigint], $7::bigint, NULL, NULL, 'copy',
           p_target_was_empty => true
         )`,
        [
          fixture.org_id,
          fixture.emp_id,
          DAYS[0],
          DAYS[1],
          fixture.shift_id,
          fixture.job_id,
          fixture.absence_id,
        ],
      );
      expect(await asOwner(() => absenceTimes(fixture, DAYS[1], "draft"))).toEqual({
        start: null,
        end: null,
      });
    });
  });
});
