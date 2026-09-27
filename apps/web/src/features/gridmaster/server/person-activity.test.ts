import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentLabelMap: vi.fn(async () => new Map([[1, "D"]])),
  fetchSegmentResolutionMaps: vi.fn(async () => ({
    assignmentIdByPair: new Map(),
    segmentCompatibility: null,
  })),
}));

import { loadPersonSchedule } from "./person-activity";

const EMPLOYEE_ID = "emp-1";
const ORG_ID = "org-1";
const NOW = Date.parse("2026-09-27T12:00:00.000Z");

type Filters = Array<[string, string, unknown]>;

function snapshot(kind: "published" | "draft", state: "absence" | "deleted", absenceTypeId = 5) {
  return {
    id: `${kind}-snap`,
    cell_id: "cell-1",
    org_id: ORG_ID,
    snapshot_kind: kind,
    state_kind: state,
    absence_type_id: state === "absence" ? absenceTypeId : null,
    custom_start_time: null,
    custom_end_time: null,
    segments: [],
  };
}

function makeClient(tables: Record<string, unknown>, filters: Record<string, Filters>) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { email: `${id}@dubgrid.test` } },
          error: null,
        })),
      },
    },
    from: vi.fn((table: string) => {
      const recorded: Filters = (filters[table] ??= []);
      // A list read of a table set up for a single-row read answers an empty list.
      const rows = tables[table];
      const result = { data: Array.isArray(rows) ? rows : [], error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve({ data: tables[table] ?? null, error: null }),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      for (const op of ["eq", "gte", "lte", "in", "or"]) {
        chain[op] = (column: string, value?: unknown) => {
          recorded.push([op, column, value]);
          return chain;
        };
      }
      return chain;
    }),
  };
}

describe("loadPersonSchedule", () => {
  let filters: Record<string, Filters>;

  beforeEach(() => {
    filters = {};
  });

  function load(tables: Record<string, unknown>) {
    const client = makeClient(
      { employees: { id: EMPLOYEE_ID, org_id: ORG_ID }, ...tables },
      filters,
    );
    return loadPersonSchedule(client as never, EMPLOYEE_ID, NOW);
  }

  it("returns null for a staff record that does not exist", async () => {
    expect(await load({ employees: null })).toBeNull();
  });

  it("labels each day's published and draft state, keeping the draft only when it differs", async () => {
    const schedule = await load({
      absence_types: [
        { id: 5, name: "Vacation" },
        { id: 6, name: "Sick" },
      ],
      schedule_cells: [
        {
          id: "cell-1",
          emp_id: EMPLOYEE_ID,
          date: "2026-10-01",
          org_id: ORG_ID,
          version: 2,
          series_id: null,
          from_recurring: true,
          updated_at: "2026-09-20T00:00:00.000Z",
          snapshots: [snapshot("published", "absence", 5), snapshot("draft", "absence", 6)],
        },
        {
          id: "cell-2",
          emp_id: EMPLOYEE_ID,
          date: "2026-09-30",
          org_id: ORG_ID,
          version: 1,
          series_id: "series-1",
          from_recurring: false,
          snapshots: [snapshot("published", "absence", 5), snapshot("draft", "absence", 5)],
        },
      ],
    });

    expect(schedule?.shifts).toEqual([
      expect.objectContaining({
        date: "2026-10-01",
        published: "Vacation",
        draft: "Sick",
        source: "recurring",
      }),
      expect.objectContaining({
        date: "2026-09-30",
        published: "Vacation",
        draft: null,
        source: "series",
      }),
    ]);
  });

  it("marks a draft deletion as an empty draft label", async () => {
    const schedule = await load({
      absence_types: [{ id: 5, name: "Vacation" }],
      schedule_cells: [
        {
          id: "cell-1",
          emp_id: EMPLOYEE_ID,
          date: "2026-10-01",
          org_id: ORG_ID,
          version: 3,
          series_id: null,
          from_recurring: false,
          snapshots: [snapshot("published", "absence", 5), snapshot("draft", "deleted")],
        },
      ],
    });

    expect(schedule?.shifts[0]).toMatchObject({
      published: "Vacation",
      draft: "",
      source: "manual",
    });
  });

  it("labels recurring shifts and series, archived ones included", async () => {
    const schedule = await load({
      absence_types: [{ id: 5, name: "Vacation" }],
      recurring_shifts: [
        {
          id: "rec-1",
          emp_id: EMPLOYEE_ID,
          org_id: ORG_ID,
          day_of_week: 1,
          state: { kind: "absence", absenceTypeId: 5 },
          effective_from: "2026-01-01",
          effective_until: null,
          archived_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      shift_series: [
        {
          id: "series-1",
          state: { kind: "absence", absenceTypeId: 5 },
          frequency: "weekly",
          days_of_week: [2, 4],
          start_date: "2026-09-01",
          end_date: null,
          max_occurrences: 10,
          archived_at: null,
        },
      ],
    });

    expect(schedule?.recurring).toEqual([
      expect.objectContaining({
        id: "rec-1",
        label: "Vacation",
        archivedAt: "2026-06-01T00:00:00.000Z",
      }),
    ]);
    expect(schedule?.series).toEqual([
      expect.objectContaining({
        id: "series-1",
        label: "Vacation",
        daysOfWeek: [2, 4],
        maxOccurrences: 10,
      }),
    ]);
  });

  it("names indicators and keeps their draft state", async () => {
    const schedule = await load({
      schedule_notes: [
        { date: "2026-10-01", status: "draft", indicator: { name: "Charge" } },
        { date: "2026-09-29", status: "published", indicator: null },
      ],
    });

    expect(schedule?.indicators).toEqual([
      { date: "2026-10-01", name: "Charge", status: "draft" },
      { date: "2026-09-29", name: "Note", status: "published" },
    ]);
  });

  it("scopes every read to the staff record and its organization, in the window", async () => {
    const schedule = await load({});

    expect(schedule?.window).toEqual({ from: "2026-08-30", to: "2026-11-22" });
    for (const table of ["recurring_shifts", "shift_series", "schedule_cells", "schedule_notes"]) {
      expect(filters[table]).toEqual(
        expect.arrayContaining([
          ["eq", "org_id", ORG_ID],
          ["eq", "emp_id", EMPLOYEE_ID],
        ]),
      );
    }
    for (const table of ["schedule_cells", "schedule_notes"]) {
      expect(filters[table]).toEqual(
        expect.arrayContaining([
          ["gte", "date", "2026-08-30"],
          ["lte", "date", "2026-11-22"],
        ]),
      );
    }
    expect(filters.absence_types).toEqual([["eq", "org_id", ORG_ID]]);
  });

  describe("requests and changes", () => {
    const OLD = "2026-05-01T00:00:00.000Z";
    const RECENT = "2026-09-20T00:00:00.000Z";

    it("reads requests on either side, keeping every open one and 90 days of the rest", async () => {
      const schedule = await load({
        shift_requests: [
          {
            id: "req-mine",
            type: "swap",
            status: "approved",
            requester_emp_id: EMPLOYEE_ID,
            target_emp_id: "emp-2",
            requester_shift_date: "2026-09-22",
            target_shift_date: "2026-09-23",
            admin_user_id: "admin-1",
            admin_note: "Covered",
            created_at: RECENT,
            resolved_at: RECENT,
          },
          {
            id: "req-theirs",
            type: "swap",
            status: "open",
            requester_emp_id: "emp-2",
            target_emp_id: EMPLOYEE_ID,
            requester_shift_date: "2026-10-02",
            target_shift_date: "2026-10-03",
            admin_user_id: null,
            admin_note: null,
            created_at: OLD,
            resolved_at: null,
          },
          {
            id: "req-old-settled",
            type: "calloff",
            status: "approved",
            requester_emp_id: EMPLOYEE_ID,
            target_emp_id: null,
            requester_shift_date: "2026-04-30",
            target_shift_date: null,
            admin_user_id: "admin-1",
            admin_note: null,
            created_at: OLD,
            resolved_at: OLD,
          },
        ],
        employees: { id: EMPLOYEE_ID, org_id: ORG_ID },
      });

      expect(schedule?.shiftRequests.map((request) => request.id)).toEqual([
        "req-mine",
        "req-theirs",
      ]);
      expect(schedule?.shiftRequests[0]).toMatchObject({
        side: "requester",
        shiftDate: "2026-09-22",
        partnerShiftDate: "2026-09-23",
        settledBy: "admin-1",
        adminNote: "Covered",
      });
      expect(schedule?.shiftRequests[1]).toMatchObject({
        side: "target",
        shiftDate: "2026-10-03",
        partnerShiftDate: "2026-10-02",
        status: "open",
      });
      expect(filters.shift_requests).toEqual(
        expect.arrayContaining([
          ["eq", "org_id", ORG_ID],
          ["or", `requester_emp_id.eq.${EMPLOYEE_ID},target_emp_id.eq.${EMPLOYEE_ID}`, undefined],
        ]),
      );
      expect(schedule?.actors).toEqual({ "admin-1": "admin-1@dubgrid.test" });
    });

    it("names the partner from their staff record in the same organization", async () => {
      const partnerClient = makeClient(
        {
          employees: { id: EMPLOYEE_ID, org_id: ORG_ID },
          shift_requests: [
            {
              id: "req-1",
              type: "pickup",
              status: "open",
              requester_emp_id: EMPLOYEE_ID,
              target_emp_id: "emp-2",
              created_at: RECENT,
            },
          ],
        },
        filters,
      );
      // The partner read is the second `employees` query; answer it with a list.
      const from = partnerClient.from;
      let employeeReads = 0;
      partnerClient.from = vi.fn((table: string) => {
        if (table === "employees" && ++employeeReads === 2) {
          const chain = from("partners");
          return Object.assign(chain, {
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve({
                data: [{ id: "emp-2", first_name: "Ada", last_name: "Lovelace" }],
                error: null,
              }).then(resolve),
          });
        }
        return from(table);
      });

      const schedule = await loadPersonSchedule(partnerClient as never, EMPLOYEE_ID, NOW);

      expect(schedule?.shiftRequests[0].partner).toBe("Ada Lovelace");
      expect(filters.partners).toEqual(
        expect.arrayContaining([
          ["eq", "org_id", ORG_ID],
          ["in", "id", ["emp-2"]],
        ]),
      );
    });

    it("labels publish changes and names who published them, newest first", async () => {
      const schedule = await load({
        absence_types: [{ id: 5, name: "Vacation" }],
        schedule_publish_changes: [
          {
            date: "2026-09-10",
            kind: "new",
            from_state: null,
            to_state: { kind: "absence", absenceTypeId: 5 },
            publish: { published_at: "2026-09-01T10:00:00.000Z", published_by: "admin-2" },
          },
          {
            date: "2026-09-11",
            kind: "deleted",
            from_state: { kind: "absence", absenceTypeId: 5 },
            to_state: null,
            publish: { published_at: "2026-09-15T10:00:00.000Z", published_by: "admin-2" },
          },
        ],
      });

      expect(schedule?.publishChanges).toEqual([
        {
          publishedAt: "2026-09-15T10:00:00.000Z",
          date: "2026-09-11",
          kind: "deleted",
          from: "Vacation",
          to: null,
          publishedBy: "admin-2",
        },
        {
          publishedAt: "2026-09-01T10:00:00.000Z",
          date: "2026-09-10",
          kind: "new",
          from: null,
          to: "Vacation",
          publishedBy: "admin-2",
        },
      ]);
      expect(filters.schedule_publish_changes).toEqual(
        expect.arrayContaining([
          ["eq", "emp_id", EMPLOYEE_ID],
          ["gte", "publish.published_at", "2026-06-29T12:00:00.000Z"],
        ]),
      );
      expect(schedule?.actors["admin-2"]).toBe("admin-2@dubgrid.test");
    });

    it("lists the profile change requests the person submitted", async () => {
      const schedule = await load({
        profile_change_requests: [
          {
            id: "pcr-1",
            request_type: "contact",
            status: "approved",
            requested_changes: { phone: "555-0100" },
            request_note: "New number",
            resolver_note: "Done",
            resolver_user_id: "admin-3",
            created_at: RECENT,
            resolved_at: RECENT,
          },
        ],
      });

      expect(schedule?.profileChangeRequests).toEqual([
        {
          id: "pcr-1",
          type: "contact",
          status: "approved",
          requested: { phone: "555-0100" },
          note: "New number",
          resolverNote: "Done",
          resolvedBy: "admin-3",
          createdAt: RECENT,
          resolvedAt: RECENT,
        },
      ]);
      expect(filters.profile_change_requests).toEqual(
        expect.arrayContaining([
          ["eq", "org_id", ORG_ID],
          ["eq", "requester_employee_id", EMPLOYEE_ID],
        ]),
      );
    });
  });
});
