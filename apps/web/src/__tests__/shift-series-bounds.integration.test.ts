// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";

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

describe.runIf(reachable)("shift series bounds against the local database", () => {
  it.each([
    { cap: 100_000, frequency: "daily", days: null, expected: MAX_SERIES_OCCURRENCES },
    { cap: null, frequency: "daily", days: null, expected: MAX_SERIES_OCCURRENCES },
    { cap: 1, frequency: "daily", days: null, expected: 1 },
    { cap: 100_000, frequency: "biweekly", days: null, expected: MAX_SERIES_OCCURRENCES },
    { cap: 100_000, frequency: "weekly", days: [9], expected: 0 },
  ])(
    "creates only $expected cells with requested cap $cap ($frequency)",
    async ({ cap, frequency, days, expected }) => {
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL statement_timeout = '10s'");
        const {
          rows: [fixture],
        } = await db.query<{
          org_id: string;
          emp_id: string;
          user_id: string;
          absence_id: number;
        }>(`
        SELECT o.id AS org_id, e.id AS emp_id, u.id AS user_id, a.id AS absence_id
        FROM public.organizations o
        JOIN public.employees e ON e.org_id = o.id AND e.status = 'active'
          AND e.archived_at IS NULL
        JOIN public.absence_types a ON a.org_id = o.id AND a.archived_at IS NULL
        JOIN auth.users u ON u.email = 'qa-super-admin@dubgrid.test'
        WHERE o.slug = 'calmhaven'
        LIMIT 1
      `);
        if (!fixture) throw new Error("Local QA fixtures missing; run npm run db:reset");
        await actAsAuthenticated(db, {
          sub: fixture.user_id,
          role: "authenticated",
          org_id: fixture.org_id,
          org_role: "super_admin",
          platform_role: "none",
        });
        const seriesId = randomUUID();
        await db.query(
          `
        SELECT public.create_shift_series(
          $1::uuid, $2::uuid, $3::uuid, $4::jsonb, $6::public.shift_series_frequency,
          $7::smallint[], '2031-01-01', '2099-12-31', $5::integer
        )
      `,
          [
            seriesId,
            fixture.emp_id,
            fixture.org_id,
            JSON.stringify({ kind: "absence", segments: [], absenceTypeId: fixture.absence_id }),
            cap,
            frequency,
            days,
          ],
        );
        const { rows } = await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM public.schedule_cells WHERE series_id = $1",
          [seriesId],
        );
        expect(rows[0].count).toBe(expected);
      } finally {
        await db.query("ROLLBACK");
      }
    },
  );
});
