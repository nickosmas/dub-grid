import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateCsrfOrigin = vi.fn();
const requireAuthenticatedSession = vi.fn();
const requireOrgPermissions = vi.fn();
const fetchHiddenPeople = vi.fn();
const checkRateLimit = vi.fn();
const isFeatureEnabled = vi.fn();
const insertEmployees = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedSession: (req: NextRequest) => requireAuthenticatedSession(req),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  fetchHiddenPeople: (...args: unknown[]) => fetchHiddenPeople(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));
vi.mock("@/features/employees/server/insert-employees", () => ({
  MAX_EMPLOYEE_BATCH: 2,
  insertEmployees: (...args: unknown[]) => insertEmployees(...args),
}));
vi.mock("@/features/employees/server/org-today", () => ({
  fetchOrgToday: () => Promise.resolve("2026-11-10"),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function row(rowNumber: number, overrides: Record<string, string> = {}) {
  return {
    rowNumber,
    firstName: "Person",
    lastName: `Number ${["One", "Two", "Three", "Four", "Five", "Six"][rowNumber - 1] ?? rowNumber}`,
    focusAreaNames: "Skilled Nursing",
    ...overrides,
  };
}

function request(rows: unknown[]) {
  return new NextRequest("http://localhost/api/import/employees", {
    method: "POST",
    body: JSON.stringify({ orgId: ORG_ID, rows }),
  });
}

function createServiceClient(existing: Record<string, unknown>[] = []) {
  const orgFilters: string[] = [];
  const tables: Record<string, unknown> = {
    organizations: { focus_area_label: null, certification_label: null, role_label: null },
    focus_areas: [{ id: 1, name: "Skilled Nursing" }],
    certifications: [{ id: 10, name: "Registered Nurse", abbr: "RN" }],
    organization_roles: [],
    employees: existing,
  };
  return {
    orgFilters,
    serviceClient: {
      from(table: string) {
        const result = { data: tables[table] ?? [], error: null };
        const query = {
          select: () => query,
          eq: (column: string, value: string) => {
            if (column === "org_id" || column === "id") orgFilters.push(value);
            return query;
          },
          is: () => query,
          or: () => query,
          limit: () => query,
          single: () => Promise.resolve(result),
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return query;
      },
    },
  };
}

function authorize(serviceClient: unknown) {
  requireOrgPermissions.mockResolvedValue({
    serviceClient,
    orgId: SANDBOX_ORG_ID,
    actor: { id: "user-1", email: "admin@example.com" },
  });
}

function insertedFor(
  employees: { firstName: string; email: string }[],
  failIndexes: number[] = [],
) {
  return {
    employees: employees
      .map((employee, index) => ({
        id: `emp-${employee.firstName}-${index}`,
        email: employee.email,
        index,
      }))
      .filter(({ index }) => !failIndexes.includes(index)),
    failed: failIndexes.map((index) => ({
      index,
      error: "Someone already has this phone number.",
    })),
  };
}

describe("POST /api/import/employees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedSession.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
    });
    checkRateLimit.mockResolvedValue({ limited: false, reset: 0, misconfigured: false });
    isFeatureEnabled.mockResolvedValue(true);
    fetchHiddenPeople.mockResolvedValue([]);
  });

  it("adds clean rows through insertEmployees and reports every refused row by its row number", async () => {
    const { serviceClient, orgFilters } = createServiceClient([
      { id: "e1", first_name: "Grace", last_name: "Okafor", email: "grace@x.org", phone: "" },
    ]);
    authorize(serviceClient);
    insertEmployees.mockImplementation(({ employees }) =>
      Promise.resolve(insertedFor(employees, employees.length === 1 ? [0] : [])),
    );

    const response = await POST(
      request([
        row(1, { email: "one@x.org", certificationName: "rn", employment: "Part-time" }),
        row(2, { focusAreaNames: "ICU" }),
        row(3, { focusAreaNames: "" }),
        row(4, { firstDay: "2029-01-05" }),
        row(5, { firstName: "Gracie", lastName: "Oka", email: "grace@x.org" }),
        row(6, { email: "six@x.org", firstDay: "2026-12-01" }),
        row(7, { firstName: "Last", lastName: "Person", phone: "555-201-0100" }),
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(7);
    expect(body.added).toEqual([
      { rowNumber: 1, id: "emp-Person-0", email: "one@x.org" },
      { rowNumber: 6, id: "emp-Person-1", email: "six@x.org" },
    ]);
    expect(body.refused).toEqual([
      { rowNumber: 2, name: "Person Number Two", reason: "No schedule area is called ICU." },
      {
        rowNumber: 3,
        name: "Person Number Three",
        reason: "Each person needs at least one schedule area.",
      },
      {
        rowNumber: 4,
        name: "Person Number Four",
        reason: "A first day can be from today up to a year ahead, not Jan 5, 2029.",
      },
      {
        rowNumber: 5,
        name: "Gracie Oka",
        reason: "Already on staff: Grace Okafor has this email.",
      },
      { rowNumber: 7, name: "Last Person", reason: "Someone already has this phone number." },
    ]);

    // Batches of MAX_EMPLOYEE_BATCH, into the effective organization, one audit row each.
    expect(insertEmployees).toHaveBeenCalledTimes(2);
    const first = insertEmployees.mock.calls[0][0];
    expect(first).toMatchObject({
      orgId: SANDBOX_ORG_ID,
      auditDetails: { source: "import" },
      reportEveryFailure: true,
    });
    expect(first.employees[0]).toMatchObject({
      email: "one@x.org",
      focusAreaIds: [1],
      certificationId: 10,
      employmentType: "part_time",
      firstDay: null,
    });
    expect(first.employees[1]).toMatchObject({ firstDay: "2026-12-01" });
    expect(insertEmployees.mock.calls[1][0].employees[0]).toMatchObject({
      phone: "(555) 201-0100",
    });
    expect(orgFilters.every((id) => id === SANDBOX_ORG_ID)).toBe(true);
  });

  it("needs an impersonation for a Gridmaster and lets setup imports through", async () => {
    requireOrgPermissions.mockResolvedValue({
      response: Response.json({ error: "Start an impersonation" }, { status: 403 }),
    });
    const response = await POST(request([row(1)]));
    expect(response.status).toBe(403);
    expect(requireOrgPermissions.mock.calls[0][3]).toEqual({
      allowDuringSetup: true,
      gridmasterNeedsImpersonation: true,
    });
    expect(insertEmployees).not.toHaveBeenCalled();
  });

  it("refuses the whole batch with the reason when insertEmployees refuses it", async () => {
    const { serviceClient } = createServiceClient();
    authorize(serviceClient);
    insertEmployees.mockResolvedValue({
      response: Response.json({ error: "That schedule area was just archived." }, { status: 400 }),
    });
    const body = await (await POST(request([row(1)]))).json();
    expect(body.added).toEqual([]);
    expect(body.refused).toEqual([
      { rowNumber: 1, name: "Person Number One", reason: "That schedule area was just archived." },
    ]);
  });

  it("refuses a malformed body before checking permissions", async () => {
    const response = await POST(request([{ firstName: "No row number" }]));
    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("is unavailable while the import flag is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const response = await POST(request([row(1)]));
    expect(response.status).toBe(503);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });
});
