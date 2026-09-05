// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationPath(): string {
  const fromRoot = resolve(process.cwd(), "supabase/migrations/011_calendar_feed_tokens.sql");
  try {
    readFileSync(fromRoot);
    return fromRoot;
  } catch {
    return resolve(process.cwd(), "../../supabase/migrations/011_calendar_feed_tokens.sql");
  }
}

describe("calendar feed token migration", () => {
  const sql = readFileSync(migrationPath(), "utf8");

  it("stores one hashed token per user, organization, and employee scope", () => {
    // Idempotent form: a retried push must converge rather than fail halfway.
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens");
    expect(sql).toContain("UNIQUE (user_id, org_id, employee_id)");
    expect(sql).toContain("UNIQUE (token_hash)");
    expect(sql).toContain("token_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).not.toMatch(/\braw_token\b/i);
  });

  it("keeps the token table service-only", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.calendar_feed_tokens FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("GRANT ALL ON TABLE public.calendar_feed_tokens TO service_role");
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+calendar_feed_tokens/);
  });
});
