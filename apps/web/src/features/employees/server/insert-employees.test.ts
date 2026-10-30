import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const validateStaffOrgReferences = vi.fn();
const dispatchNotificationEvent = vi.fn();
const fetchOrgToday = vi.fn();

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/staff-validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/staff-validation")>()),
  validateStaffOrgReferences: (...args: unknown[]) => validateStaffOrgReferences(...args),
}));
vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("./org-today", () => ({ fetchOrgToday: (...args: unknown[]) => fetchOrgToday(...args) }));

import { insertEmployees, type NewEmployeeInput } from "./insert-employees";

const ORG_ID = "org-1";
const TAKEN_EMAIL = "taken@example.com";
const CONFLICT = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "unique_active_employee_email_per_org"',
};

function person(firstName: string, email = ""): NewEmployeeInput {
  return {
    firstName,
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    focusAreaIds: [3],
    phone: "",
    email,
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  };
}

let inserts: unknown[];
let audits: Array<Record<string, unknown>>;

function client(): SupabaseClient {
  let nextId = 1;
  const withId = (row: Record<string, unknown>) => ({ id: `emp-${nextId++}`, ...row });
  return {
    from: (table: string) => {
      if (table === "audit_log") {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            audits.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      const read = {
        select: () => read,
        eq: () => read,
        order: () => read,
        limit: () => read,
        maybeSingle: () => Promise.resolve({ data: { seniority: 5 }, error: null }),
      };
      return {
        ...read,
        insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
          inserts.push(payload);
          const rows = [payload].flat();
          const refused = rows.some((row) => row.email === TAKEN_EMAIL);
          const result = refused
            ? { data: null, error: CONFLICT }
            : { data: rows.map(withId), error: null };
          const selected = Object.assign(Promise.resolve(result), {
            single: () =>
              Promise.resolve(refused ? result : { data: result.data?.[0], error: null }),
          });
          return { select: () => selected };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function run(employees: NewEmployeeInput[]) {
  return insertEmployees({
    serviceClient: client(),
    orgId: ORG_ID,
    actor: { id: "actor-1", email: "a@example.com" },
    employees,
    ip: "203.0.113.1",
    userAgent: "test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserts = [];
  audits = [];
  validateStaffOrgReferences.mockResolvedValue({});
  fetchOrgToday.mockResolvedValue("2026-10-29");
});

describe("insertEmployees", () => {
  it("adds everyone in one insert, after everyone else in seniority, with an audit row each", async () => {
    const result = await run([person("Ana"), person("Ben")]);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual([
      expect.objectContaining({ first_name: "Ana", seniority: 6, org_id: ORG_ID }),
      expect.objectContaining({ first_name: "Ben", seniority: 7, org_id: ORG_ID }),
    ]);
    expect(result).toEqual({
      employees: [
        expect.objectContaining({ firstName: "Ana", seniority: 6 }),
        expect.objectContaining({ firstName: "Ben", seniority: 7 }),
      ],
      failed: [],
    });
    expect(audits.map((audit) => [audit.action, audit.details, audit.ip_address])).toEqual([
      ["employee.created", { firstName: "Ana", lastName: "Smith" }, "203.0.113.1"],
      ["employee.created", { firstName: "Ben", lastName: "Smith" }, "203.0.113.1"],
    ]);
    expect(dispatchNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("adds the others when one person's email is taken, and says which one", async () => {
    const result = await run([person("Ana"), person("Ben", TAKEN_EMAIL), person("Cy")]);

    expect(result).toMatchObject({
      employees: [{ firstName: "Ana" }, { firstName: "Cy" }],
      failed: [{ index: 1, error: expect.stringContaining("email") }],
    });
    expect(audits).toHaveLength(2);
    expect(dispatchNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("answers with the conflict when nobody could be added", async () => {
    const result = await run([person("Ben", TAKEN_EMAIL)]);
    expect("response" in result && result.response.status).toBe(409);
    expect(audits).toEqual([]);
  });

  it("refuses the whole list before writing when one row names something removed", async () => {
    validateStaffOrgReferences.mockResolvedValueOnce({}).mockResolvedValueOnce({
      focusAreaIds: "One of these was removed. Refresh and choose again.",
    });

    const result = await run([person("Ana"), person("Ben")]);

    expect("response" in result && result.response.status).toBe(400);
    expect(inserts).toEqual([]);
  });

  it("refuses a first day outside today up to a year ahead", async () => {
    const result = await run([{ ...person("Ana"), firstDay: "2026-10-01" }]);
    expect("response" in result && result.response.status).toBe(400);
    expect(inserts).toEqual([]);
  });
});
