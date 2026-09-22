import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationPath } from "./helpers/sql-inventory";

function functionText(sql: string, header: string): string {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function: ${header}`);
  return sql.slice(start, sql.indexOf("\n$$;", start) + "\n$$;".length);
}

describe("publish and discard take locks in the same order (migration 039)", () => {
  const header = "CREATE OR REPLACE FUNCTION public.publish_schedule(";
  const previous = functionText(
    readFileSync(migrationPath("020_publish_repairs.sql"), "utf8"),
    header,
  );
  const migration = readFileSync(migrationPath("039_publish_lock_order.sql"), "utf8");
  const current = functionText(migration, header);

  it("restates publish_schedule from 020 with only the ordering hunk", () => {
    const anchor = `    WHERE c.org_id = p_org_id
      AND c.date >= p_start_date
      AND c.date <= p_end_date
  LOOP`;
    expect(previous.split(anchor)).toHaveLength(2);
    const added = current.slice(current.indexOf(anchor.split("\n")[0]));
    expect(added).toContain("ORDER BY c.id");
    // Everything outside that hunk is byte-identical.
    expect(current.replace(/\n    -- Same order[\s\S]*?\n    ORDER BY c\.id/, "")).toBe(previous);
  });

  it("matches the order discard_schedule_drafts locks in", () => {
    const discard = readFileSync(
      migrationPath("032_schedule_children_org_consistency.sql"),
      "utf8",
    );
    expect(discard).toContain("ORDER BY c.id");
    expect(current).toContain("ORDER BY c.id");
  });
});

describe("anon holds nothing (migration 040)", () => {
  const migration = readFileSync(migrationPath("040_anon_holds_nothing.sql"), "utf8");

  it("revokes the blanket table and sequence grants and the defaults behind them", () => {
    expect(migration).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;");
    expect(migration).toContain("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;");
    expect(migration).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*REVOKE ALL ON TABLES FROM anon;/);
    expect(migration).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*REVOKE ALL ON SEQUENCES FROM anon;/);
  });

  it("keeps only the cookie banner's write, which its policy gates", () => {
    const grants = migration.match(/GRANT [^;]+;/g) ?? [];
    expect(grants).toEqual(["GRANT INSERT ON public.cookie_consents TO anon;"]);
  });
});
