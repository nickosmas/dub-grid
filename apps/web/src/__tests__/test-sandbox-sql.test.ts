import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveMigrationPath(fileName: string) {
  const cwd = process.cwd();
  const workspacePath = resolve(cwd, `supabase/migrations/${fileName}`);

  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  return resolve(cwd, `../../supabase/migrations/${fileName}`);
}

function functionBlock(sql: string, functionName: string): string {
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  );
  if (!match) throw new Error(`${functionName} block not found`);
  return match[0];
}

describe("test sandbox database contract", () => {
  it("does not return archived sandbox workspaces in the workspace switcher RPC", () => {
    const sql = readFileSync(
      resolveMigrationPath("002_functions_triggers.sql"),
      "utf8",
    );
    const block = functionBlock(sql, "get_my_organizations");

    expect(block).toContain("WHERE o.archived_at IS NULL");
    expect(block).toContain("WHERE cm.user_id = v_uid");
    expect(block).toContain("AND cm.archived_at IS NULL");
    expect(block).toContain("AND o.archived_at IS NULL");
  });

  it("grants the sandbox organization columns selected by the app org projection", () => {
    const grants = readFileSync(resolveMigrationPath("004_grants.sql"), "utf8");

    for (const column of [
      "workspace_kind",
      "sandbox_source_org_id",
      "sandbox_owner_user_id",
      "sandbox_expires_at",
      "sandbox_template_version",
    ]) {
      expect(grants).toContain(column);
    }
  });
});
