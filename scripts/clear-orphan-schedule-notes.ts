/**
 * Deletes schedule notes that have no shift on their cell.
 *
 * A note is an indicator describing a shift, but `schedule_notes` carries no
 * foreign key to `schedule_cells`, so nothing in the database ever removed a
 * note when its shift was deleted. Every tagged shift that was later removed
 * left its indicators behind. The schedule API now clears notes on delete,
 * move, swap and paste, so this only has to clear what accumulated before it.
 *
 * Run against whichever database the env file points at:
 *   npx tsx --env-file=.env.remote scripts/clear-orphan-schedule-notes.ts
 *
 * This deletes rows outright rather than marking them draft_deleted: an orphan
 * has no shift left to publish against, so the draft lifecycle has nothing to
 * finalise. It reports what it removed, per organization, after the fact.
 */

import { connectSqlClient } from "./lib/db-client";

/**
 * A cell counts as carrying a shift when its effective snapshot is worked.
 * The draft supersedes the published row, including a draft that clears the
 * cell, which mirrors how the app resolves the same question.
 */
const ORPHAN_PREDICATE = `
  NOT EXISTS (
    SELECT 1
    FROM public.schedule_cells c
    JOIN LATERAL (
      SELECT s.state_kind
      FROM public.schedule_cell_snapshots s
      WHERE s.cell_id = c.id
      ORDER BY (s.snapshot_kind = 'draft') DESC
      LIMIT 1
    ) effective ON TRUE
    WHERE c.org_id = n.org_id
      AND c.emp_id = n.emp_id
      AND c.date = n.date
      AND effective.state_kind = 'worked'
  )
`;

interface OrphanSummaryRow {
  org_id: string;
  org_name: string | null;
  orphan_count: string;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL not found. Pass --env-file=.env.remote (or .env.local).");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const projectRef = supabaseUrl.includes("supabase.co")
    ? new URL(supabaseUrl).hostname.split(".")[0]
    : null;

  console.log(`Connecting to ${projectRef ?? "local database"}...\n`);
  const db = await connectSqlClient({ connectionString, projectRef });

  try {
    // Read the breakdown first so the log names what is about to go; the
    // delete is not gated on it.
    const summary = await db.query<OrphanSummaryRow>(`
      SELECT n.org_id, o.name AS org_name, COUNT(*)::text AS orphan_count
      FROM public.schedule_notes n
      LEFT JOIN public.organizations o ON o.id = n.org_id
      WHERE ${ORPHAN_PREDICATE}
      GROUP BY n.org_id, o.name
      ORDER BY COUNT(*) DESC
    `);

    if (summary.rows.length === 0) {
      console.log("No orphan schedule notes found. Nothing to do.");
      return;
    }

    for (const row of summary.rows) {
      console.log(`  ${row.org_name ?? row.org_id}: ${row.orphan_count}`);
    }

    const deleted = await db.query(`
      DELETE FROM public.schedule_notes n
      WHERE ${ORPHAN_PREDICATE}
    `);

    console.log(`\nDeleted ${deleted.rowCount} orphan schedule note(s).`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
