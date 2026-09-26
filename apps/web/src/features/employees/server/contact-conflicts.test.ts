import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEmployeeEmailConflict } from "./contact-conflicts";

function clientReturningMatch() {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "neq", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.ilike = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "other-employee" }, error: null });
  return { client: { from: vi.fn(() => chain) } as unknown as SupabaseClient, chain };
}

describe("checkEmployeeEmailConflict", () => {
  // `ilike` reads `_` and `%` as wildcards: unescaped, john_doe@x.com matched
  // john.doe@x.com and refused a valid change (41b2/F-06).
  it("matches the email literally, not as a pattern", async () => {
    const { client, chain } = clientReturningMatch();

    await checkEmployeeEmailConflict(client, {
      orgId: "org-1",
      email: " John_Doe%1\\x@Example.com ",
    });

    expect(chain.ilike).toHaveBeenCalledWith("email", "john\\_doe\\%1\\\\x@example.com");
  });

  it("reports another active person's matching email as a conflict", async () => {
    const { client } = clientReturningMatch();

    await expect(
      checkEmployeeEmailConflict(client, { orgId: "org-1", email: "mina@example.com" }),
    ).resolves.toMatchObject({ conflict: true, conflictingEmployeeId: "other-employee" });
  });
});
