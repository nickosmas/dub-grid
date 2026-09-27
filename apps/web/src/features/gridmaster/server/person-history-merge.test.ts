import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/enrich", () => ({
  enrichAuditRows: vi.fn(async (_client: unknown, rows: unknown[]) => rows),
}));

import { EMPLOYEE_AUDIT_ROW_LIMIT } from "@/lib/audit/employee-activity";
import { loadPersonHistory } from "./person-history";

const USER = "11111111-1111-4111-8111-111111111111";
const EMP = "33333333-3333-4333-8333-333333333333";

interface Tables {
  profiles?: unknown;
  employees?: unknown[];
  staffAudit?: unknown[];
  accountAudit?: unknown[];
  role_change_log?: unknown[];
  impersonation_sessions?: unknown[];
}

function makeClient(tables: Tables) {
  const reads: string[] = [];
  return {
    reads,
    client: {
      from: (table: string) => {
        reads.push(table);
        let orFilter = "";
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "in", "order"]) chain[op] = () => chain;
        chain.or = (filter: string) => {
          orFilter = filter;
          return chain;
        };
        const rows = () => {
          if (table === "audit_log") {
            // The staff query targets the record; the account query targets the actor.
            return orFilter.startsWith("actor_id")
              ? (tables.accountAudit ?? [])
              : (tables.staffAudit ?? []);
          }
          const value = (tables as Record<string, unknown>)[table];
          return Array.isArray(value) ? value : [];
        };
        chain.limit = () => Promise.resolve({ data: rows(), error: null });
        chain.maybeSingle = () =>
          Promise.resolve({
            data:
              table === "profiles"
                ? (tables.profiles ?? null)
                : ((tables.employees ?? [])[0] ?? null),
            error: null,
          });
        chain.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve);
        return chain;
      },
    },
  };
}

const employee = { id: EMP, org_id: "org-1", user_id: USER, created_at: null, created_by: null };

describe("loadPersonHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges staff and account history newest first, once per event", async () => {
    const { client } = makeClient({
      profiles: { id: USER },
      employees: [employee],
      staffAudit: [
        { id: 7, action: "role.changed", created_at: "2026-09-20T10:00:00.000Z" },
        { id: 9, action: "employee.updated", created_at: "2026-09-25T10:00:00.000Z" },
      ],
      accountAudit: [
        { id: 7, action: "role.changed", created_at: "2026-09-20T10:00:00.000Z" },
        { id: 8, action: "security.auth.login", created_at: "2026-09-22T10:00:00.000Z" },
      ],
    });

    const history = await loadPersonHistory(client as never, { kind: "user", userId: USER });

    expect(history?.entries.map((entry) => entry.id)).toEqual(["9", "8", "7"]);
    expect(history?.truncated).toBe(false);
  });

  it("drops IP addresses and user agents from every row", async () => {
    const { client } = makeClient({
      profiles: { id: USER },
      employees: [employee],
      staffAudit: [
        {
          id: 1,
          action: "employee.updated",
          ip_address: "203.0.113.9",
          user_agent: "Safari",
          created_at: "2026-09-25T10:00:00.000Z",
        },
      ],
    });

    const history = await loadPersonHistory(client as never, { kind: "user", userId: USER });

    expect(history?.entries[0]).not.toHaveProperty("ip_address");
    expect(history?.entries[0]).not.toHaveProperty("user_agent");
  });

  it("reads only organization activity for a staff record with no account", async () => {
    const { client, reads } = makeClient({
      employees: [{ ...employee, user_id: null }],
      staffAudit: [{ id: 1, action: "employee.created", created_at: "2026-09-25T10:00:00.000Z" }],
    });

    const history = await loadPersonHistory(client as never, { kind: "staff", employeeId: EMP });

    expect(history?.entries.map((entry) => entry.id)).toEqual(["1"]);
    expect(reads).not.toContain("impersonation_sessions");
    expect(reads).not.toContain("profiles");
  });

  it("finds no one for an unknown account or staff record", async () => {
    expect(
      await loadPersonHistory(makeClient({}).client as never, { kind: "user", userId: USER }),
    ).toBeNull();
    expect(
      await loadPersonHistory(makeClient({}).client as never, { kind: "staff", employeeId: EMP }),
    ).toBeNull();
  });

  it("says the history is partial when an organization source was full", async () => {
    const { client } = makeClient({
      profiles: { id: USER },
      employees: [employee],
      staffAudit: Array.from({ length: EMPLOYEE_AUDIT_ROW_LIMIT }, (_, index) => ({
        id: index,
        action: "employee.updated",
        created_at: "2026-09-25T10:00:00.000Z",
      })),
    });

    const history = await loadPersonHistory(client as never, { kind: "user", userId: USER });

    expect(history?.truncated).toBe(true);
  });
});
