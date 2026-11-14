import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEmployeeEmailConflict, checkOwnContact } from "./contact-conflicts";

const findAuthUserByEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-admin-users", () => ({ findAuthUserByEmail }));

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

  // PostgREST reads `*` as `%`, so a bare one matched every address.
  it("escapes an asterisk so it can't act as a wildcard", async () => {
    const { client, chain } = clientReturningMatch();

    await checkEmployeeEmailConflict(client, { orgId: "org-1", email: "*@example.com" });

    expect(chain.ilike).toHaveBeenCalledWith("email", "\\*@example.com");
  });

  it("reports another active person's matching email as a conflict", async () => {
    const { client } = clientReturningMatch();

    await expect(
      checkEmployeeEmailConflict(client, { orgId: "org-1", email: "mina@example.com" }),
    ).resolves.toMatchObject({ conflict: true, conflictingEmployeeId: "other-employee" });
  });
});

describe("checkOwnContact", () => {
  /** Own records, plus what each organization's other active records hold. */
  function clientFor(input: {
    own: Array<{ id: string; org_id: string }>;
    emailHolders?: Record<string, string>;
    phones?: Record<string, Array<{ id: string; phone: string }>>;
  }) {
    return {
      from: () => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "is", "neq", "limit", "ilike"]) {
          chain[method] = vi.fn(() => chain);
        }
        chain.eq = vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        });
        chain.maybeSingle = vi.fn(async () => ({
          data: input.emailHolders?.[filters.org_id as string]
            ? { id: input.emailHolders[filters.org_id as string] }
            : null,
          error: null,
        }));
        chain.then = (resolve: (value: unknown) => void) =>
          resolve({
            data: filters.user_id ? input.own : (input.phones?.[filters.org_id as string] ?? []),
            error: null,
          });
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  /**
   * Answers each query from per-table rows, applying the eq, in and ilike
   * filters the check uses.
   */
  function tablesClient(tables: {
    employees: Array<{ id: string; org_id: string; user_id: string | null; email: string }>;
    organization_memberships: Array<{ org_id: string; user_id: string }>;
  }) {
    return {
      from: (table: keyof typeof tables) => {
        const rows = tables[table] as Array<Record<string, unknown>>;
        const tests: Array<(row: Record<string, unknown>) => boolean> = [];
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "is", "limit"]) chain[method] = vi.fn(() => chain);
        chain.eq = vi.fn((column: string, value: unknown) => {
          tests.push((row) => row[column] === value);
          return chain;
        });
        chain.in = vi.fn((column: string, values: unknown[]) => {
          tests.push((row) => values.includes(row[column]));
          return chain;
        });
        chain.ilike = vi.fn((column: string, value: string) => {
          tests.push((row) => String(row[column]).toLowerCase() === value.toLowerCase());
          return chain;
        });
        chain.then = (resolve: (value: unknown) => void) =>
          resolve({ data: rows.filter((row) => tests.every((test) => test(row))), error: null });
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  const me = { id: "e1", org_id: "org-1", user_id: "me", email: "me@example.com" };

  it("calls an email free when only an account outside your organizations holds it", async () => {
    findAuthUserByEmail.mockResolvedValue({ id: "gridmaster-1" });
    const client = tablesClient({
      employees: [me],
      organization_memberships: [{ org_id: "org-1", user_id: "me" }],
    });

    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-1",
        email: "gm@example.com",
        phone: null,
      }),
    ).resolves.toEqual({ emailTaken: false, phoneTaken: false });
  });

  it("calls an email taken when a member of your organization signs in with it", async () => {
    findAuthUserByEmail.mockResolvedValue({ id: "admin-1" });
    const client = tablesClient({
      employees: [me],
      organization_memberships: [
        { org_id: "org-1", user_id: "me" },
        { org_id: "org-1", user_id: "admin-1" },
      ],
    });

    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-1",
        email: "a@example.com",
        phone: null,
      }),
    ).resolves.toEqual({ emailTaken: true, phoneTaken: false });
  });

  it("calls your own account's email free", async () => {
    findAuthUserByEmail.mockResolvedValue({ id: "me" });
    const client = tablesClient({
      employees: [me],
      organization_memberships: [{ org_id: "org-1", user_id: "me" }],
    });

    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-1",
        email: "me@example.com",
        phone: null,
      }),
    ).resolves.toEqual({ emailTaken: false, phoneTaken: false });
  });

  it("calls an email taken when a staff record in any of your organizations holds it", async () => {
    findAuthUserByEmail.mockResolvedValue(null);
    const client = tablesClient({
      employees: [
        me,
        { id: "e2", org_id: "org-2", user_id: "me", email: "me@example.com" },
        { id: "other", org_id: "org-2", user_id: null, email: "New@Example.com" },
      ],
      organization_memberships: [],
    });

    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-1",
        email: "new@example.com",
        phone: null,
      }),
    ).resolves.toEqual({ emailTaken: true, phoneTaken: false });
  });

  it("checks a phone only in the organization you're in, leaving out your own record", async () => {
    const client = clientFor({
      own: [
        { id: "e1", org_id: "org-1" },
        { id: "e2", org_id: "org-2" },
      ],
      phones: {
        "org-1": [{ id: "e1", phone: "(503) 555-0142" }],
        "org-2": [{ id: "other", phone: "(503) 555-0142" }],
      },
    });

    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-1",
        email: null,
        phone: "5035550142",
      }),
    ).resolves.toEqual({ emailTaken: false, phoneTaken: false });
    await expect(
      checkOwnContact(client, {
        userId: "me",
        orgId: "org-2",
        email: null,
        phone: "5035550142",
      }),
    ).resolves.toEqual({ emailTaken: false, phoneTaken: true });
  });

  it("asks nothing about a phone outside your organizations", async () => {
    await expect(
      checkOwnContact(clientFor({ own: [{ id: "e1", org_id: "org-1" }] }), {
        userId: "me",
        orgId: "org-9",
        email: null,
        phone: "5035550142",
      }),
    ).resolves.toEqual({ emailTaken: false, phoneTaken: false });
  });
});
