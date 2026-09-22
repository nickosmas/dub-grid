import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function functionBody(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  const bodyStart = sql.indexOf("AS $$\n", start) + "AS $$\n".length;
  return sql.slice(bodyStart, sql.indexOf("\n$$;", bodyStart));
}

describe("schedule children organization consistency (migration 032)", () => {
  const original = readFileSync(migrationPath("002_functions_triggers.sql"), "utf8");
  const migration = readFileSync(
    migrationPath("032_schedule_children_org_consistency.sql"),
    "utf8",
  );

  it("refuses to run over rows that already cross organizations", () => {
    expect(migration).toMatch(/WHERE c\.org_id <> s\.org_id/);
    expect(migration).toMatch(/WHERE s\.org_id <> g\.org_id/);
    expect(migration).toContain("RAISE EXCEPTION");
  });

  it("carries org_id through the relationship from cell to snapshot to segment", () => {
    expect(migration).toContain("UNIQUE (id, org_id)");
    // One relationship per pair, or PostgREST cannot embed the child table.
    expect(migration).toContain("DROP CONSTRAINT schedule_cell_snapshots_cell_id_fkey,");
    expect(migration).toContain("DROP CONSTRAINT schedule_cell_segments_snapshot_id_fkey,");
    expect(migration).toMatch(
      /FOREIGN KEY \(cell_id, org_id\) REFERENCES public\.schedule_cells\(id, org_id\) ON DELETE CASCADE/,
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(snapshot_id, org_id\) REFERENCES public\.schedule_cell_snapshots\(id, org_id\) ON DELETE CASCADE/,
    );
  });

  it("makes both admin write policies check the parent's organization", () => {
    for (const [policy, parentTable, childColumn] of [
      ["admin_write_schedule_cell_snapshots", "schedule_cells", "cell_id"],
      ["admin_write_schedule_cell_segments", "schedule_cell_snapshots", "snapshot_id"],
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS "${policy}"`);
      const start = migration.indexOf(`CREATE POLICY "${policy}"`);
      const body = migration.slice(start, migration.indexOf(");", start));
      expect(body).toContain(`SELECT 1 FROM public.${parentTable} parent`);
      expect(body).toContain(`parent.id = ${policy.replace("admin_write_", "")}.${childColumn}`);
    }
  });

  it("restates the two readers from 002 with only the join guards added", () => {
    const header = "CREATE OR REPLACE FUNCTION public.get_schedule_cell_snapshot_payload(";
    const rebuilt = functionBody(original, header)
      .replace(
        "      ON snapshot.cell_id = c.id\n",
        "      ON snapshot.cell_id = c.id\n     AND snapshot.org_id = c.org_id\n",
      )
      .replace(
        "      ON segments.snapshot_id = snapshot.id\n",
        "      ON segments.snapshot_id = snapshot.id\n     AND segments.org_id = snapshot.org_id\n",
      );
    expect(functionBody(migration, header)).toBe(rebuilt);

    const contentHeader = "CREATE OR REPLACE FUNCTION public.schedule_cell_has_effective_content(";
    const rebuiltContent = functionBody(original, contentHeader)
      .replace(
        "      ON draft.cell_id = c.id\n",
        "      ON draft.cell_id = c.id\n     AND draft.org_id = c.org_id\n",
      )
      .replace(
        "      ON published.cell_id = c.id\n",
        "      ON published.cell_id = c.id\n     AND published.org_id = c.org_id\n",
      );
    expect(functionBody(migration, contentHeader)).toBe(rebuiltContent);
  });

  it("moves the discard into one locked, service-only transaction (F-03)", () => {
    const discard = functionBody(
      migration,
      "CREATE OR REPLACE FUNCTION public.discard_schedule_drafts(",
    );
    expect(discard).toContain("FOR UPDATE OF c");
    // Decided per cell after the lock, never from the selection.
    expect(discard).toMatch(
      /IF EXISTS \(\s*SELECT 1 FROM public\.schedule_cell_snapshots p\s+WHERE p\.cell_id = v_cell\.id AND p\.org_id = p_org_id AND p\.snapshot_kind = 'published'/,
    );
    expect(discard).toContain("DELETE FROM public.schedule_cells WHERE id = v_cell.id;");
    expect(discard).toContain("SET status = 'published'");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE)\n  FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE) TO service_role;",
    );
  });
});
