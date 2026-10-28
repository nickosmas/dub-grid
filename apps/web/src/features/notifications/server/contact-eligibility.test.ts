// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { contactChannels, loadContactFacts, type ContactFacts } from "./contact-eligibility";

const ALL = { inApp: true, push: true, email: true };
const NONE = { inApp: false, push: false, email: false };
const IN_APP_ONLY = { inApp: true, push: false, email: false };

function facts(overrides: Partial<ContactFacts> = {}): ContactFacts {
  return {
    account: { platformRole: "none", disabled: false },
    membership: true,
    employee: { status: "active", suspended: false },
    ...overrides,
  };
}

const ORG = { orgScoped: true };

describe("contactChannels", () => {
  it("reaches an active member everywhere", () => {
    expect(contactChannels(facts(), ORG)).toEqual(ALL);
  });

  it("reaches someone Away, who keeps their access", () => {
    expect(
      contactChannels(facts({ employee: { status: "inactive", suspended: false } }), ORG),
    ).toEqual(ALL);
  });

  it("reaches a member with no employee row, such as an unlinked Super Admin", () => {
    expect(contactChannels(facts({ employee: null }), ORG)).toEqual(ALL);
  });

  it("keeps a Suspended person's alerts in the app but never pushes or emails them", () => {
    expect(
      contactChannels(facts({ employee: { status: "active", suspended: true } }), ORG),
    ).toEqual(IN_APP_ONLY);
  });

  it("writes nothing for someone Offboarded", () => {
    expect(
      contactChannels(facts({ employee: { status: "removed", suspended: false } }), ORG),
    ).toEqual(NONE);
  });

  it("writes nothing for someone removed from the organization", () => {
    expect(contactChannels(facts({ membership: false }), ORG)).toEqual(NONE);
  });

  it("writes nothing for a deactivated or terminated account, even account-wide", () => {
    const disabled = facts({ account: { platformRole: "none", disabled: true } });
    expect(contactChannels(disabled, ORG)).toEqual(NONE);
    expect(contactChannels(disabled, { orgScoped: false })).toEqual(NONE);
    expect(contactChannels(facts({ account: null }), ORG)).toEqual(NONE);
  });

  it("reaches a Gridmaster about an organization they don't belong to", () => {
    expect(
      contactChannels(
        facts({
          account: { platformRole: "gridmaster", disabled: false },
          membership: false,
          employee: null,
        }),
        ORG,
      ),
    ).toEqual(ALL);
  });

  it("follows only the account for an account-wide alert", () => {
    expect(
      contactChannels(
        facts({ membership: false, employee: { status: "removed", suspended: true } }),
        {
          orgScoped: false,
        },
      ),
    ).toEqual(ALL);
  });

  it("keeps the alert but sends nothing when the facts couldn't be read", () => {
    expect(contactChannels(null, ORG)).toEqual(IN_APP_ONLY);
  });
});

type Row = Record<string, unknown> | null;

function client(rows: Record<string, Row>, failing?: string) {
  const reads: Array<{ table: string; filters: unknown[][] }> = [];
  const db = {
    from(table: string) {
      const read = { table, filters: [] as unknown[][] };
      reads.push(read);
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is"]) {
        chain[name] = (...args: unknown[]) => {
          read.filters.push([name, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = async () =>
        table === failing
          ? { data: null, error: { message: "boom" } }
          : { data: rows[table] ?? null, error: null };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, reads };
}

describe("loadContactFacts", () => {
  it("reads the account, the live membership and the employee row in the organization", async () => {
    const { db, reads } = client({
      profiles: { platform_role: "none", deactivated_at: null, terminated_at: null },
      organization_memberships: { user_id: "user-1" },
      employees: { status: "active", suspended_at: "2026-10-28T00:00:00Z" },
    });

    const result = await loadContactFacts(db, "user-1", "org-1");

    expect(result).toEqual({
      account: { platformRole: "none", disabled: false },
      membership: true,
      employee: { status: "active", suspended: true },
    });
    const membership = reads.find((read) => read.table === "organization_memberships");
    expect(membership?.filters).toContainEqual(["eq", "org_id", "org-1"]);
    expect(membership?.filters).toContainEqual(["is", "archived_at", null]);
    expect(reads.find((read) => read.table === "employees")?.filters).toContainEqual([
      "eq",
      "org_id",
      "org-1",
    ]);
  });

  it("counts a terminated account as disabled", async () => {
    const { db } = client({
      profiles: {
        platform_role: "none",
        deactivated_at: null,
        terminated_at: "2026-10-01T00:00:00Z",
      },
    });

    const result = await loadContactFacts(db, "user-1", "org-1");

    expect(result?.account).toEqual({ platformRole: "none", disabled: true });
    expect(result?.membership).toBe(false);
  });

  it("reads only the account for an account-wide alert", async () => {
    const { db, reads } = client({
      profiles: { platform_role: "none", deactivated_at: null, terminated_at: null },
    });

    await loadContactFacts(db, "user-1", null);

    expect(reads.map((read) => read.table)).toEqual(["profiles"]);
  });

  it("returns null when a read fails", async () => {
    const { db } = client({}, "employees");

    expect(await loadContactFacts(db, "user-1", "org-1")).toBeNull();
  });
});
