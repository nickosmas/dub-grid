import type { SqlClient } from "./db-client";

/**
 * Four standing shift requests for the Calm Haven demo organization, so the
 * Requests screens (Available, Mine, Approval) have content on every reset:
 *
 *   1. a swap someone asks of the demo login (Jane Morgan), open
 *   2. a swap Jane asks of someone else, open
 *   3. a swap between two other staff, waiting for a manager
 *   4. an open pickup another person offers
 *
 * Nothing here is hand-picked. Each pair is chosen from the published schedule
 * the seed just wrote, restricted to single-segment shifts on future dates,
 * with both people free on the day they would take over, and only where the
 * database's own `swap_request_conflict` rule (migration 026) finds nothing
 * wrong. The same rule guards the insert, so a pair this picks can never be
 * one the app would refuse.
 */

const DEMO_LOGIN_EMAIL = "marketing-demo@dubgrid.test";

/** Fixed keys, so a re-run replaces rather than duplicates. */
const KEYS = {
  swapToDemo: "11111111-1111-4111-8111-111111111101",
  swapFromDemo: "11111111-1111-4111-8111-111111111102",
  swapPending: "11111111-1111-4111-8111-111111111103",
  pickup: "11111111-1111-4111-8111-111111111104",
} as const;

type ShiftCell = {
  emp_id: string;
  date: string;
  focus_area_id: number;
  is_login: boolean;
};

type Party = { empId: string; date: string };

async function loadCandidateCells(db: SqlClient, orgId: string): Promise<ShiftCell[]> {
  // Published, single-segment worked shifts with a real shift (not a general
  // job), from tomorrow to two weeks out, for active staff on the schedule.
  // A cell's focus area is its own when set, otherwise the shift category's,
  // the same fallback create_shift_request uses for eligibility.
  const { rows } = await db.query<ShiftCell>(
    `SELECT c.emp_id, c.date::text AS date,
            COALESCE(c.focus_area_id, seg.shift_focus_area_id) AS focus_area_id,
            (e.user_id IS NOT NULL) AS is_login
     FROM public.schedule_cells c
     JOIN public.employees e ON e.id = c.emp_id
     JOIN public.schedule_cell_snapshots s
       ON s.cell_id = c.id AND s.snapshot_kind = 'published' AND s.state_kind = 'worked'
     JOIN LATERAL (
       SELECT count(*) AS n,
              bool_and(g.shift_id IS NOT NULL) AS all_shifts,
              min(sc.focus_area_id) AS shift_focus_area_id
       FROM public.schedule_cell_segments g
       LEFT JOIN public.shift_categories sc ON sc.id = g.shift_id
       WHERE g.snapshot_id = s.id
     ) seg ON true
     WHERE c.org_id = $1
       AND c.date > CURRENT_DATE
       AND c.date <= CURRENT_DATE + 14
       AND e.archived_at IS NULL AND e.status = 'active'
       AND seg.n = 1 AND seg.all_shifts
       AND COALESCE(c.focus_area_id, seg.shift_focus_area_id) IS NOT NULL
       AND COALESCE(c.focus_area_id, seg.shift_focus_area_id) = ANY(e.focus_area_ids)
     ORDER BY c.date, c.emp_id`,
    [orgId],
  );
  return rows;
}

async function loadBusyDays(db: SqlClient, orgId: string): Promise<Set<string>> {
  // Any published cell at all (a shift or time off) makes that day taken.
  const { rows } = await db.query<{ key: string }>(
    `SELECT c.emp_id || ':' || c.date::text AS key
     FROM public.schedule_cells c
     JOIN public.schedule_cell_snapshots s
       ON s.cell_id = c.id AND s.snapshot_kind = 'published' AND s.state_kind <> 'deleted'
     WHERE c.org_id = $1`,
    [orgId],
  );
  return new Set(rows.map((row) => row.key));
}

/** The stored request state for one published cell, as the RPC would snapshot it. */
function stateSql(empParam: string, dateParam: string): string {
  return `(
    SELECT public.build_schedule_cell_state_json(
      'worked', p.shift_ids, p.job_ids, NULL, p.custom_start_time, p.custom_end_time,
      p.series_id, p.from_recurring, p.is_mentored_flags
    )
    FROM public.get_schedule_cell_snapshot_payload($1, ${empParam}, ${dateParam}::date, 'published') p
  )`;
}

async function swapConflict(
  db: SqlClient,
  orgId: string,
  requester: Party,
  target: Party,
): Promise<string | null> {
  const { rows } = await db.query<{ reason: string | null }>(
    `SELECT public.swap_request_conflict(
       $1, $2, $3::date, ${stateSql("$2", "$3")},
       $4, $5::date, ${stateSql("$4", "$5")}
     ) AS reason`,
    [orgId, requester.empId, requester.date, target.empId, target.date],
  );
  return rows[0]?.reason ?? null;
}

/**
 * The first requester/target pair, in schedule order, that the app itself
 * would accept: different people and days, the same focus area, neither day
 * already spoken for by an earlier pick, and no conflict by the database's
 * rule. Pairs where each person is entirely free on the day they would take
 * are tried first; the app also allows a second, non-overlapping shift on a
 * day someone already works, and that is the fallback when the demo login's
 * cloned schedule leaves no free day.
 */
async function pickSwap(
  db: SqlClient,
  orgId: string,
  cells: ShiftCell[],
  busy: Set<string>,
  taken: Set<string>,
  requesterOk: (cell: ShiftCell) => boolean,
  targetOk: (cell: ShiftCell) => boolean,
): Promise<{ requester: Party; target: Party } | null> {
  for (const requireFreeDay of [true, false]) {
    for (const r of cells.filter(requesterOk)) {
      if (taken.has(`${r.emp_id}:${r.date}`)) continue;
      for (const t of cells.filter(targetOk)) {
        if (t.emp_id === r.emp_id || t.date === r.date) continue;
        if (t.focus_area_id !== r.focus_area_id) continue;
        if (taken.has(`${t.emp_id}:${t.date}`)) continue;
        if (
          requireFreeDay &&
          (busy.has(`${r.emp_id}:${t.date}`) || busy.has(`${t.emp_id}:${r.date}`))
        ) {
          continue;
        }
        const requester = { empId: r.emp_id, date: r.date };
        const target = { empId: t.emp_id, date: t.date };
        if ((await swapConflict(db, orgId, requester, target)) !== null) continue;
        taken.add(`${r.emp_id}:${r.date}`);
        taken.add(`${t.emp_id}:${t.date}`);
        return { requester, target };
      }
    }
  }
  return null;
}

async function insertSwap(
  db: SqlClient,
  orgId: string,
  key: string,
  status: "open" | "pending_approval",
  requester: Party,
  target: Party,
): Promise<void> {
  await db.query(
    `INSERT INTO public.shift_requests (
       org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
       target_emp_id, target_shift_date, target_state, expires_at, idempotency_key
     ) VALUES (
       $1, 'swap', $6, $2, $3::date, ${stateSql("$2", "$3")},
       $4, $5::date, ${stateSql("$4", "$5")},
       LEAST($3::date, $5::date)::timestamptz, $7
     )`,
    [orgId, requester.empId, requester.date, target.empId, target.date, status, key],
  );
}

export async function seedCalmHavenShiftRequests(db: SqlClient): Promise<number> {
  const { rows: orgRows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const orgId = orgRows[0]?.id;
  if (!orgId) return 0;

  const { rows: demoRows } = await db.query<{ id: string }>(
    `SELECT e.id FROM public.employees e
     JOIN auth.users u ON u.id = e.user_id
     WHERE e.org_id = $1 AND u.email = $2 AND e.archived_at IS NULL`,
    [orgId, DEMO_LOGIN_EMAIL],
  );
  const demoEmpId = demoRows[0]?.id;
  if (!demoEmpId) return 0;

  // Replace rather than pile up: the keys are fixed, and a stale request on
  // a date that has since passed would only clutter the screens.
  await db.query(`DELETE FROM public.shift_requests WHERE idempotency_key = ANY($1::uuid[])`, [
    Object.values(KEYS),
  ]);

  const cells = await loadCandidateCells(db, orgId);
  const busy = await loadBusyDays(db, orgId);
  const taken = new Set<string>();
  const isDemo = (cell: ShiftCell) => cell.emp_id === demoEmpId;
  const isOtherStaff = (cell: ShiftCell) => !cell.is_login;
  let count = 0;

  const toDemo = await pickSwap(db, orgId, cells, busy, taken, isOtherStaff, isDemo);
  if (toDemo) {
    await insertSwap(db, orgId, KEYS.swapToDemo, "open", toDemo.requester, toDemo.target);
    count += 1;
  }

  const fromDemo = await pickSwap(db, orgId, cells, busy, taken, isDemo, isOtherStaff);
  if (fromDemo) {
    await insertSwap(db, orgId, KEYS.swapFromDemo, "open", fromDemo.requester, fromDemo.target);
    count += 1;
  }

  const pending = await pickSwap(db, orgId, cells, busy, taken, isOtherStaff, isOtherStaff);
  if (pending) {
    await insertSwap(
      db,
      orgId,
      KEYS.swapPending,
      "pending_approval",
      pending.requester,
      pending.target,
    );
    count += 1;
  }

  const offer = cells.find(
    (cell) => isOtherStaff(cell) && !taken.has(`${cell.emp_id}:${cell.date}`),
  );
  if (offer) {
    await db.query(
      `INSERT INTO public.shift_requests (
         org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
         expires_at, idempotency_key
       ) VALUES ($1, 'pickup', 'open', $2, $3::date, ${stateSql("$2", "$3")}, $3::date::timestamptz, $4)`,
      [orgId, offer.emp_id, offer.date, KEYS.pickup],
    );
    count += 1;
  }

  return count;
}
