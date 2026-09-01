import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchMobilePeopleRows,
  fetchMobileRoleRows,
  fetchMobileShiftRequestHistoryRows,
  insertMobileAuditLogEntry,
  type MobilePeopleQueryRow,
  type MobileShiftRequestQueryRow,
} from "./mobile";

function makeRow(n: number): MobilePeopleQueryRow {
  return {
    id: `emp-${n}`,
    employee_number: n,
    first_name: `First${n}`,
    last_name: "Last",
    employment_type: null,
    status: "active",
    status_changed_at: null,
    status_note: null,
    certification_id: null,
    role_ids: null,
    seniority: null,
    focus_area_ids: null,
    department_ids: null,
    dept_admin_ids: null,
    phone: null,
    email: null,
    contact_notes: null,
    user_id: null,
    version: null,
  };
}

/** Fakes the `.from().select().eq().order().range()` chain, returning one page per call. */
function makeServiceClient(pages: Array<{ data: MobilePeopleQueryRow[] | null; error: unknown }>) {
  const range = vi.fn(async () => pages.shift() ?? { data: [], error: null });
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range,
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, range };
}

describe("fetchMobilePeopleRows", () => {
  it("returns all rows after one page when the result is shorter than pageSize", async () => {
    const rows = [makeRow(1), makeRow(2)];
    const { client, range } = makeServiceClient([{ data: rows, error: null }]);

    const result = await fetchMobilePeopleRows(client, "org-1", 5);

    expect(result).toEqual(rows);
    expect(range).toHaveBeenCalledTimes(1);
    expect(range).toHaveBeenCalledWith(0, 4);
  });

  it("pages past PostgREST's row cap instead of silently truncating", async () => {
    const page1 = [makeRow(1), makeRow(2)];
    const page2 = [makeRow(3), makeRow(4)];
    const page3: MobilePeopleQueryRow[] = [];
    const { client, range } = makeServiceClient([
      { data: page1, error: null },
      { data: page2, error: null },
      { data: page3, error: null },
    ]);

    const result = await fetchMobilePeopleRows(client, "org-1", 2);

    expect(result).toEqual([...page1, ...page2]);
    expect(range).toHaveBeenCalledTimes(3);
    expect(range).toHaveBeenNthCalledWith(1, 0, 1);
    expect(range).toHaveBeenNthCalledWith(2, 2, 3);
    expect(range).toHaveBeenNthCalledWith(3, 4, 5);
  });

  it("propagates an error without swallowing it", async () => {
    const { client } = makeServiceClient([{ data: null, error: { message: "boom" } }]);

    await expect(fetchMobilePeopleRows(client, "org-1", 5)).rejects.toEqual({
      message: "boom",
    });
  });
});

function makeShiftRequestRow(id: string, createdAt: string): MobileShiftRequestQueryRow {
  return {
    id,
    org_id: "org-1",
    type: "calloff",
    status: "approved",
    requester_emp_id: "emp-1",
    requester_shift_date: "2025-12-01",
    requester_state: {
      kind: "deleted",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    target_emp_id: null,
    target_shift_date: null,
    target_state: null,
    absence_type_id: null,
    parent_request_id: null,
    admin_user_id: null,
    admin_note: null,
    expires_at: "2026-04-30T00:00:00.000Z",
    resolved_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    requester: { first_name: "Alex", last_name: "River" },
    target: null,
  };
}

function makeShiftRequestHistoryClient(rows: MobileShiftRequestQueryRow[]) {
  const result = { data: rows, error: null };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    or: vi.fn(() => chain),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, chain, from };
}

describe("fetchMobileShiftRequestHistoryRows", () => {
  it("keeps terminal history tenant-scoped without filtering old shift dates", async () => {
    const oldRequest = makeShiftRequestRow(
      "00000000-0000-4000-8000-000000000001",
      "2026-04-01T10:00:00.000Z",
    );
    const { client, chain } = makeShiftRequestHistoryClient([oldRequest]);

    await expect(
      fetchMobileShiftRequestHistoryRows(client, {
        orgId: "org-1",
        employeeId: "emp-1",
        limit: 25,
      }),
    ).resolves.toEqual({ rows: [oldRequest], nextCursor: null });

    expect(chain.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(chain.in).toHaveBeenCalledWith("status", [
      "approved",
      "rejected",
      "cancelled",
      "expired",
    ]);
    expect(chain.or).toHaveBeenCalledWith("requester_emp_id.eq.emp-1,target_emp_id.eq.emp-1");
    expect(chain.limit).toHaveBeenCalledWith(26);
  });

  it("uses both sort keys for deterministic pages and returns the last visible cursor", async () => {
    const first = makeShiftRequestRow(
      "00000000-0000-4000-8000-000000000003",
      "2026-04-03T10:00:00.000Z",
    );
    const second = makeShiftRequestRow(
      "00000000-0000-4000-8000-000000000002",
      "2026-04-02T10:00:00.000Z",
    );
    const overflow = makeShiftRequestRow(
      "00000000-0000-4000-8000-000000000001",
      "2026-04-01T10:00:00.000Z",
    );
    const { client, chain } = makeShiftRequestHistoryClient([first, second, overflow]);

    const result = await fetchMobileShiftRequestHistoryRows(client, {
      orgId: "org-1",
      limit: 2,
      cursor: {
        createdAt: "2026-04-04T10:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000004",
      },
    });

    expect(result).toEqual({
      rows: [first, second],
      nextCursor: { createdAt: second.created_at, id: second.id },
    });
    expect(chain.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(chain.or).toHaveBeenCalledWith(
      "created_at.lt.2026-04-04T10:00:00.000Z,and(created_at.eq.2026-04-04T10:00:00.000Z,id.lt.00000000-0000-4000-8000-000000000004)",
    );
  });
});

describe("fetchMobileRoleRows", () => {
  it("selects role certification requirements for the mobile bootstrap", async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() =>
        Promise.resolve({
          data: [{ id: 4, name: "Nurse", abbr: "RN", required_certification_ids: [9] }],
          error: null,
        }),
      ),
    };
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    await expect(fetchMobileRoleRows(client, "org-1")).resolves.toEqual([
      { id: 4, name: "Nurse", abbr: "RN", required_certification_ids: [9] },
    ]);
    expect(chain.select).toHaveBeenCalledWith("id, name, abbr, required_certification_ids");
  });
});

describe("insertMobileAuditLogEntry", () => {
  it("does not fail an already-committed mutation when activity logging fails", async () => {
    const error = { message: "audit_log unavailable" };
    const insert = vi.fn(async () => ({ error }));
    const from = vi.fn(() => ({ insert }));
    const serviceClient = { from } as unknown as SupabaseClient;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      insertMobileAuditLogEntry(serviceClient, {
        org_id: "org-1",
        actor_id: "actor-1",
        actor_email: "actor@example.com",
        action: "employee.updated",
        resource_type: "employee",
        resource_id: "employee-1",
        details: {},
        ip_address: null,
        user_agent: null,
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "Mobile activity-log write failed",
      expect.objectContaining({ action: "employee.updated", orgId: "org-1" }),
    );
    errorSpy.mockRestore();
  });
});
