import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const validateCsrfOrigin = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/app/api/shared/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/shared/permissions")>()),
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

const REAL_ORG = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG = "22222222-2222-2222-2222-222222222222";

/** Captures the org id passed to `.eq("org_id", <id>)` on the certifications read. */
function buildServiceClient() {
  const captured: { orgId: string | null } = { orgId: null };
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.select = passthrough;
  chain.order = passthrough;
  chain.is = passthrough;
  chain.eq = (col: string, val: string) => {
    if (col === "org_id") captured.orgId = val;
    return chain;
  };
  // The query is awaited at the end of the chain.
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  const client = { from: () => chain };
  return { client, captured };
}

function makeRequest(orgId: string): NextRequest {
  return new NextRequest(
    `https://app.test/api/settings/config?action=fetchCertifications&orgId=${orgId}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validateCsrfOrigin.mockReturnValue(null);
});

describe("GET /api/settings/config", () => {
  it("reads from the effective (sandbox-redirected) org, not the raw query orgId", async () => {
    const { client, captured } = buildServiceClient();
    getServiceClient.mockReturnValue(client);
    // requireOrgPermissions redirects a sandbox caller to their sandbox org.
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "actor-1" },
      serviceClient: client,
      orgId: SANDBOX_ORG,
    });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(REAL_ORG));

    expect(res?.status).toBe(200);
    // The query param was the real org, but the read must hit the sandbox org.
    expect(captured.orgId).toBe(SANDBOX_ORG);
    expect(captured.orgId).not.toBe(REAL_ORG);
  });
});

describe("department authorization", () => {
  function forbid() {
    requireOrgPermissions.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
  }

  it("lets label viewers read departments but only focus-area managers change them", async () => {
    const { client } = buildServiceClient();
    getServiceClient.mockReturnValue(client);
    forbid();
    const { GET, POST } = await import("./route");

    await GET(
      new NextRequest(
        `https://app.test/api/settings/config?action=fetchDepartments&orgId=${REAL_ORG}`,
      ),
    );
    const canRead = requireOrgPermissions.mock.calls[0][2];
    expect(canRead({ canViewOrgLabels: true })).toBe(true);
    expect(canRead({ canViewFocusAreas: true })).toBe(true);
    expect(canRead({})).toBeFalsy();

    await POST(
      new NextRequest("https://app.test/api/settings/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveDepartments",
          orgId: REAL_ORG,
          items: [],
          existing: [],
        }),
      }),
    );
    const canManage = requireOrgPermissions.mock.calls[1][2];
    expect(canManage({ canManageFocusAreas: true })).toBe(true);
    expect(canManage({ isSuperAdmin: true })).toBe(true);
    expect(canManage({ canManageOrgLabels: true })).toBeFalsy();
  });
});

describe("delete dependency checks", () => {
  it("counts schedule usage with one RPC instead of reading every cell", async () => {
    const tables: string[] = [];
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = passthrough;
    chain.is = passthrough;
    chain.eq = passthrough;
    chain.then = (resolve: (v: { data: unknown[]; count: number; error: null }) => unknown) =>
      resolve({ data: [], count: 0, error: null });
    const rpc = vi.fn(async () => ({ data: 3, error: null }));
    const client = {
      from: (table: string) => {
        tables.push(table);
        return chain;
      },
      rpc,
    };
    getServiceClient.mockReturnValue(client);
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "actor-1" },
      serviceClient: client,
      orgId: REAL_ORG,
    });

    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest(
        `https://app.test/api/settings/config?action=checkJobDependencies&orgId=${REAL_ORG}&itemId=42`,
      ),
    );

    expect(res?.status).toBe(200);
    expect(await res?.json()).toMatchObject({ hasDependencies: true, summary: "Used by 3 shifts" });
    expect(rpc).toHaveBeenCalledWith("count_schedule_cell_usage", {
      p_org_id: REAL_ORG,
      p_shift_id: null,
      p_job_id: 42,
      p_absence_type_id: null,
    });
    expect(tables).not.toContain("schedule_cells");
  });

  it("leaves internal accounts out of a client's count but still blocks the delete", async () => {
    // Two staff hold the role; one is an internal account.
    const client = {
      from: (table: string) => {
        let count = table === "employees" ? 2 : 0;
        const chain: Record<string, unknown> = {};
        const passthrough = () => chain;
        chain.select = passthrough;
        chain.is = passthrough;
        chain.eq = passthrough;
        chain.contains = passthrough;
        chain.or = () => {
          count = 1;
          return chain;
        };
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve(
            table === "profiles"
              ? { data: [{ id: "qa-person" }], error: null }
              : { data: [], count, error: null },
          );
        return chain;
      },
    };
    getServiceClient.mockReturnValue(client);
    const { GET } = await import("./route");

    async function roleCheckFor(isGridmaster: boolean) {
      requireOrgPermissions.mockResolvedValue({
        actor: { id: "actor-1" },
        permissions: { isGridmaster },
        serviceClient: client,
        orgId: REAL_ORG,
      });
      const res = await GET(
        new NextRequest(
          `https://app.test/api/settings/config?action=checkRoleDependencies&orgId=${REAL_ORG}&itemId=7`,
        ),
      );
      return res?.json();
    }

    expect(await roleCheckFor(false)).toMatchObject({
      summary: "Used by 1 employee",
      hasAnyReferences: true,
    });
    expect(await roleCheckFor(true)).toMatchObject({
      summary: "Used by 2 employees",
      hasAnyReferences: true,
    });
  });
});

describe("saving coverage requirements", () => {
  function recordingClient() {
    const inserts: { table: string; rows: unknown }[] = [];
    const client = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const passthrough = () => chain;
        chain.delete = passthrough;
        chain.select = passthrough;
        chain.order = passthrough;
        chain.eq = passthrough;
        chain.is = passthrough;
        chain.in = passthrough;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.insert = (rows: unknown) => {
          inserts.push({ table, rows });
          return chain;
        };
        chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null });
        return chain;
      },
    };
    return { client, inserts };
  }

  async function save(requirements: unknown[]) {
    const { client, inserts } = recordingClient();
    getServiceClient.mockReturnValue(client);
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "actor-1" },
      serviceClient: client,
      orgId: REAL_ORG,
    });
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("https://app.test/api/settings/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveCoverageRequirements",
          orgId: REAL_ORG,
          focusAreaId: 1,
          jobId: 2,
          preferredShiftId: 3,
          requirements,
        }),
      }),
    );
    return {
      status: res?.status,
      rows: inserts.filter((insert) => insert.table === "coverage_requirements"),
    };
  }

  it("stores the maximum with each row", async () => {
    const { status, rows } = await save([{ dayOfWeek: null, minStaff: 1, maxStaff: 1 }]);
    expect(status).toBe(200);
    expect(rows).toEqual([
      {
        table: "coverage_requirements",
        rows: [
          {
            org_id: REAL_ORG,
            focus_area_id: 1,
            job_id: 2,
            preferred_shift_id: 3,
            day_of_week: null,
            min_staff: 1,
            max_staff: 1,
          },
        ],
      },
    ]);
  });

  it("refuses a maximum below the minimum, and saves no limit when none is sent", async () => {
    expect((await save([{ dayOfWeek: 1, minStaff: 3, maxStaff: 2 }])).status).toBe(400);
    const { rows } = await save([{ dayOfWeek: 1, minStaff: 3 }]);
    expect(rows[0].rows).toEqual([expect.objectContaining({ min_staff: 3, max_staff: null })]);
  });
});

describe("batch saves", () => {
  type Failures = { name?: string; rpcFocusAreaId?: number; coverageJobId?: number };

  /** Records writes; a row named `failures.name` (or a matching rpc or coverage job) is refused. */
  function batchClient(failures: Failures = {}) {
    const audits: Array<Record<string, unknown>> = [];
    const writes: Array<{ table: string; op: string; payload: unknown }> = [];
    let nextId = 100;
    const client = {
      from: (table: string) => {
        let payload: unknown = null;
        const chain: Record<string, unknown> = {};
        const passthrough = () => chain;
        for (const method of ["select", "eq", "is", "in", "order", "limit", "not", "contains"]) {
          chain[method] = passthrough;
        }
        chain.delete = () => {
          writes.push({ table, op: "delete", payload: null });
          return chain;
        };
        chain.insert = (rows: unknown) => {
          payload = rows;
          if (table === "audit_log") audits.push(...([rows].flat() as Record<string, unknown>[]));
          else writes.push({ table, op: "insert", payload: rows });
          return chain;
        };
        chain.update = (row: unknown) => {
          payload = row;
          writes.push({ table, op: "update", payload: row });
          return chain;
        };
        chain.single = async () => {
          const row = payload as Record<string, unknown>;
          if (failures.name && row.name === failures.name) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "shift_categories_global_name_unique"',
              },
            };
          }
          return { data: { id: nextId++, ...row }, error: null };
        };
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (v: unknown) => unknown) => {
          const rows = [payload].flat() as Array<Record<string, unknown> | null>;
          const refused =
            table === "coverage_requirements" &&
            failures.coverageJobId != null &&
            rows.some((row) => row?.job_id === failures.coverageJobId);
          return resolve(
            refused
              ? { data: null, error: { message: "boom" } }
              : { data: [], count: 0, error: null },
          );
        };
        return chain;
      },
      rpc: async (fn: string, args: Record<string, unknown>) =>
        fn === "remove_focus_area_from_employees" &&
        args.p_focus_area_id === failures.rpcFocusAreaId
          ? { data: null, error: { message: "boom" } }
          : { data: null, error: null },
    };
    return { client, audits, writes };
  }

  async function send(body: Record<string, unknown>) {
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("https://app.test/api/settings/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId: REAL_ORG, ...body }),
      }),
    );
    if (!res) throw new Error("The route returned no response.");
    return res;
  }

  async function post(body: Record<string, unknown>, failures: Failures = {}) {
    const recorded = batchClient(failures);
    getServiceClient.mockReturnValue(recorded.client);
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "actor-1", email: "a@example.com" },
      serviceClient: recorded.client,
      orgId: SANDBOX_ORG,
    });
    return { res: await send(body), ...recorded };
  }

  async function refusedByAuth(body: Record<string, unknown>) {
    const recorded = batchClient();
    getServiceClient.mockReturnValue(recorded.client);
    requireOrgPermissions.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const res = await send(body);
    return { res, predicate: requireOrgPermissions.mock.calls[0][2], ...recorded };
  }

  const focusArea = (name: string, sortOrder: number, id?: number) => ({
    ...(id ? { id } : {}),
    orgId: REAL_ORG,
    departmentId: 1,
    name,
    color: null,
    sortOrder,
  });

  describe("saveFocusAreas", () => {
    it("removes and saves every focus area in one request, in the effective org", async () => {
      const { res, audits, writes } = await post({
        action: "saveFocusAreas",
        upserts: [focusArea("North", 0, 7), focusArea("South", 1)],
        deletes: [{ itemId: 9, hard: false }],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.upserts).toEqual([
        { ok: true, item: expect.objectContaining({ name: "North", orgId: SANDBOX_ORG }) },
        { ok: true, item: expect.objectContaining({ name: "South", sortOrder: 1 }) },
      ]);
      expect(body.deletes).toEqual([{ itemId: 9, ok: true }]);
      const focusAreaRows = writes.filter(
        (write) => write.table === "focus_areas" && write.op !== "delete",
      );
      expect(focusAreaRows.map((write) => (write.payload as { org_id?: string }).org_id)).toEqual([
        undefined,
        SANDBOX_ORG,
        SANDBOX_ORG,
      ]);
      expect(audits.map((audit) => [audit.action, audit.org_id])).toEqual([
        ["focus_area.archived", SANDBOX_ORG],
        ["focus_area.upserted", SANDBOX_ORG],
        ["focus_area.upserted", SANDBOX_ORG],
      ]);
    });

    it("saves the rest when one item fails, and audits only what saved", async () => {
      const { res, audits } = await post(
        {
          action: "saveFocusAreas",
          upserts: [focusArea("North", 0), focusArea("Broken", 1)],
          deletes: [
            { itemId: 9, hard: false },
            { itemId: 10, hard: false },
          ],
        },
        { name: "Broken", rpcFocusAreaId: 10 },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.upserts[0]).toMatchObject({ ok: true });
      expect(body.upserts[1]).toMatchObject({ ok: false, error: expect.any(String) });
      expect(body.deletes).toEqual([
        { itemId: 9, ok: true },
        { itemId: 10, ok: false },
      ]);
      expect(audits.map((audit) => audit.action)).toEqual([
        "focus_area.archived",
        "focus_area.upserted",
      ]);
    });

    it("refuses an invalid item before writing anything", async () => {
      const { res, writes, audits } = await post({
        action: "saveFocusAreas",
        upserts: [focusArea("North", 0), focusArea("x".repeat(81), 1)],
        deletes: [{ itemId: 9 }],
      });
      expect(res.status).toBe(400);
      expect(writes).toEqual([]);
      expect(audits).toEqual([]);
    });

    it("refuses a caller who can't manage focus areas", async () => {
      const { res, predicate, writes } = await refusedByAuth({
        action: "saveFocusAreas",
        upserts: [focusArea("North", 0)],
        deletes: [],
      });
      expect(res.status).toBe(403);
      expect(writes).toEqual([]);
      expect(predicate({ canManageFocusAreas: true })).toBe(true);
      expect(predicate({ canViewFocusAreas: true })).toBeFalsy();
    });
  });

  const shift = (name: string) => ({
    orgId: REAL_ORG,
    name,
    abbr: name.slice(0, 3).toUpperCase(),
    startTime: "07:00",
    endTime: "15:00",
    color: "#E2E8F0",
    sortOrder: 0,
    focusAreaId: 1,
    breakMinutes: null,
  });

  describe("saveShiftCategories", () => {
    it("saves every shift and audits each one", async () => {
      const { res, audits } = await post({
        action: "saveShiftCategories",
        items: [shift("Day"), shift("Night")],
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results.map((result: { ok: boolean }) => result.ok)).toEqual([true, true]);
      expect(audits.map((audit) => [audit.action, audit.details])).toEqual([
        ["shift_category.upserted", { name: "Day" }],
        ["shift_category.upserted", { name: "Night" }],
      ]);
    });

    it("names the conflict for the shift that failed, and a whole failure is a 409", async () => {
      const partial = await post(
        { action: "saveShiftCategories", items: [shift("Day"), shift("Night")] },
        { name: "Night" },
      );
      expect(partial.res.status).toBe(200);
      expect((await partial.res.json()).results[1]).toEqual({
        ok: false,
        error: "Another shift already uses that name.",
      });
      expect(partial.audits).toHaveLength(1);

      const whole = await post(
        { action: "saveShiftCategories", items: [shift("Night")] },
        { name: "Night" },
      );
      expect(whole.res.status).toBe(409);
      expect(whole.audits).toEqual([]);
    });

    it("refuses a caller who can't manage schedule definitions", async () => {
      const { res, predicate } = await refusedByAuth({
        action: "saveShiftCategories",
        items: [shift("Day")],
      });
      expect(res.status).toBe(403);
      expect(predicate({ canManageScheduleDefinitions: true })).toBe(true);
      expect(predicate({ canViewScheduleDefinitions: true })).toBeFalsy();
    });
  });

  const job = (name: string) => ({
    orgId: REAL_ORG,
    name,
    abbr: name.slice(0, 3).toUpperCase(),
    showOnGrid: true,
    assignmentMode: "with_shift",
    eligibilityMode: "and",
    focusAreaIds: [1],
    departmentIds: [1],
    applicableShiftIds: [2],
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "",
    border: "",
    text: "",
    shiftTimeOverrides: {},
    shiftColorOverrides: {},
    sortOrder: 0,
    defaultStartTime: null,
    defaultEndTime: null,
    defaultDurationHours: null,
    defaultDurationMinutes: null,
  });

  describe("saveJobDefinitions", () => {
    it("saves the jobs that can be saved and reports the one that can't", async () => {
      const { res, audits } = await post(
        { action: "saveJobDefinitions", items: [job("Nurse"), job("Broken")] },
        { name: "Broken" },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results[0]).toMatchObject({ ok: true, item: { name: "Nurse" } });
      expect(body.results[1]).toMatchObject({ ok: false });
      expect(audits.map((audit) => audit.action)).toEqual(["job.upserted"]);
    });

    it("refuses an invalid job before writing, and a caller without access", async () => {
      const invalid = await post({
        action: "saveJobDefinitions",
        items: [job("Nurse"), { ...job("Aide"), abbr: "" }],
      });
      expect(invalid.res.status).toBe(400);
      expect(invalid.writes).toEqual([]);

      const refused = await refusedByAuth({ action: "saveJobDefinitions", items: [job("Nurse")] });
      expect(refused.res.status).toBe(403);
      expect(refused.predicate({ canManageScheduleDefinitions: true })).toBe(true);
    });
  });

  const entry = (jobId: number) => ({
    focusAreaId: 1,
    jobId,
    preferredShiftId: null,
    requirements: [{ dayOfWeek: null, minStaff: 2, maxStaff: null }],
  });

  describe("saveCoverageRequirementsBatch", () => {
    it("replaces each option's requirements and audits each", async () => {
      const { res, audits, writes } = await post({
        action: "saveCoverageRequirementsBatch",
        entries: [entry(5), entry(6)],
      });
      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([{ ok: true }, { ok: true }]);
      expect(
        writes.filter((write) => write.table === "coverage_requirements" && write.op === "insert"),
      ).toHaveLength(2);
      expect(audits.map((audit) => audit.resource_id)).toEqual(["1_5_null", "1_6_null"]);
    });

    it("reports the option that failed and keeps the others", async () => {
      const { res, audits } = await post(
        { action: "saveCoverageRequirementsBatch", entries: [entry(5), entry(6)] },
        { coverageJobId: 6 },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([{ ok: true }, { ok: false }]);
      expect(audits.map((audit) => audit.resource_id)).toEqual(["1_5_null"]);
    });

    it("refuses a maximum below the minimum and a caller without access", async () => {
      const bad = { ...entry(5), requirements: [{ dayOfWeek: null, minStaff: 3, maxStaff: 2 }] };
      const invalid = await post({
        action: "saveCoverageRequirementsBatch",
        entries: [entry(6), bad],
      });
      expect(invalid.res.status).toBe(400);
      expect(invalid.writes).toEqual([]);

      const refused = await refusedByAuth({
        action: "saveCoverageRequirementsBatch",
        entries: [entry(5)],
      });
      expect(refused.res.status).toBe(403);
      expect(refused.predicate({ canManageCoverageRequirements: true })).toBe(true);
      expect(refused.predicate({ canViewCoverageRequirements: true })).toBeFalsy();
    });
  });
});
