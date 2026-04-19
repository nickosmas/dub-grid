import { describe, expect, it, vi } from "vitest";
import { fetchMobileScheduleEntries } from "./data";

function createThenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return query;
}

function createServiceClientForSchedule(
  employeeRelation: unknown,
  options?: {
    absenceTypeId?: number | null;
    customEndTime?: string | null;
    customStartTime?: string | null;
    shiftCodeIds?: number[];
    shiftCodes?: Array<{
      id: number;
      label: string;
      name: string;
      focusAreaId: number | null;
      defaultStartTime: string | null;
      defaultEndTime: string | null;
    }>;
    shiftFocusAreaId?: number | null;
    shiftCodeFocusAreaId?: number | null;
    employeeFocusAreaIds?: number[];
  },
) {
  const shiftCodes = options?.shiftCodes ?? [
    {
      id: 44,
      label: "D",
      name: "Day Shift",
      focusAreaId: options?.shiftCodeFocusAreaId ?? null,
      defaultStartTime: "07:00:00",
      defaultEndTime: "15:00:00",
    },
  ];
  const shiftCodesQuery = createThenableQuery({
    data: shiftCodes.map((shiftCode) => ({
      id: shiftCode.id,
      label: shiftCode.label,
      name: shiftCode.name,
      focus_area_id: shiftCode.focusAreaId,
      color: "#eff6ff",
      border_color: "#60a5fa",
      text_color: "#1d4ed8",
      default_start_time: shiftCode.defaultStartTime,
      default_end_time: shiftCode.defaultEndTime,
    })),
    error: null,
  });
  const absencesQuery = createThenableQuery({
    data: [
      {
        id: 56,
        label: "X",
        name: "Off",
        color: "#fef3c7",
        border_color: "#f59e0b",
        text_color: "#92400e",
      },
    ],
    error: null,
  });
  const focusAreasQuery = createThenableQuery({
    data: [{ id: 12, name: "Skilled Nursing" }],
    error: null,
  });
  const shiftsQuery = createThenableQuery({
    data: [
      {
        emp_id: "196d610f-2283-486c-a9e0-197852969a31",
        date: "2026-04-18",
        focus_area_id:
          options && "shiftFocusAreaId" in options
            ? (options.shiftFocusAreaId ?? null)
            : 12,
        published_shift_code_ids: options?.shiftCodeIds ?? [44],
        published_absence_type_id: options?.absenceTypeId ?? null,
        published_custom_start_time: options?.customStartTime ?? null,
        published_custom_end_time: options?.customEndTime ?? null,
        employees: employeeRelation,
      },
    ],
    error: null,
  });
  const employeesQuery = createThenableQuery({
    data: [
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        focus_area_ids: options?.employeeFocusAreaIds ?? [12],
      },
    ],
    error: null,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "employees") {
        return employeesQuery;
      }
      if (table === "shift_codes") {
        return shiftCodesQuery;
      }
      if (table === "absence_types") {
        return absencesQuery;
      }
      if (table === "focus_areas") {
        return focusAreasQuery;
      }
      if (table === "shifts") {
        return shiftsQuery;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn((fn: string) => {
      if (fn === "get_publish_history") {
        return Promise.resolve({
          data: [
            {
              start_date: "2026-04-16",
              end_date: "2026-04-22",
              published_at: "2026-04-15T18:30:00.000Z",
              published_by_name: "Mina Diaz",
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected rpc ${fn}`);
    }),
  };
}

describe("fetchMobileScheduleEntries", () => {
  it.each([
    {
      name: "object relations returned by many-to-one embeds",
      employeeRelation: {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
    },
    {
      name: "array relations from legacy/mock callers",
      employeeRelation: [
        {
          id: "196d610f-2283-486c-a9e0-197852969a31",
          first_name: "Nic",
          last_name: "Kosmas",
          org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        },
      ],
    },
  ])(
    "keeps published schedule entries when employees comes back as $name",
    async ({ employeeRelation }) => {
      const serviceClient = createServiceClientForSchedule(employeeRelation);

      const entries = await fetchMobileScheduleEntries(serviceClient as never, {
        orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        startDate: "2026-04-18",
        endDate: "2026-04-24",
        employeeId: "196d610f-2283-486c-a9e0-197852969a31",
      });

      expect(entries).toEqual([
        {
          employeeId: "196d610f-2283-486c-a9e0-197852969a31",
          employeeName: "Nic Kosmas",
          date: "2026-04-18",
          shiftCodeIds: [44],
          shiftLabel: "D",
          shiftCodeLabel: "D",
          shiftName: "Day Shift",
          absenceTypeId: null,
          focusAreaId: 12,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftName: "Day Shift",
              startTime: "07:00:00",
              endTime: "15:00:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
          shiftColor: "#eff6ff",
          shiftBorderColor: "#60a5fa",
          shiftTextColor: "#1d4ed8",
          publishedAt: "2026-04-15T18:30:00.000Z",
          publishedByName: "Mina Diaz",
        },
      ]);
    },
  );

  it("falls back to the primary shift code focus area when the shift row focus area is null", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        shiftCodeFocusAreaId: 12,
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.focusAreaId).toBe(12);
    expect(entries[0]?.focusAreaName).toBe("Skilled Nursing");
    expect(entries[0]?.displayFocusAreaName).toBe("Skilled Nursing");
  });

  it("falls back to the employee home focus area when both shift and shift code focus areas are null", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        shiftCodeFocusAreaId: null,
        employeeFocusAreaIds: [12],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.focusAreaId).toBe(12);
    expect(entries[0]?.focusAreaName).toBe("Skilled Nursing");
    expect(entries[0]?.displayFocusAreaName).toBeNull();
  });

  it("prefers the queried employee focus areas when the embedded employee relation omits them", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        shiftCodeFocusAreaId: null,
        employeeFocusAreaIds: [12],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.focusAreaId).toBe(12);
    expect(entries[0]?.focusAreaName).toBe("Skilled Nursing");
    expect(entries[0]?.displayFocusAreaName).toBeNull();
  });

  it("omits display focus areas for absence entries", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        absenceTypeId: 56,
        shiftCodeIds: [],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.shiftName).toBe("Off");
    expect(entries[0]?.displayFocusAreaName).toBeNull();
    expect(entries[0]?.segments).toEqual([
      {
        shiftName: "Off",
        startTime: null,
        endTime: null,
        displayFocusAreaName: null,
      },
    ]);
  });

  it("builds separate schedule segments for multi-shift entries", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        shiftCodeIds: [44, 45],
        shiftCodes: [
          {
            id: 44,
            label: "D",
            name: "Day Shift",
            focusAreaId: 12,
            defaultStartTime: "07:00:00",
            defaultEndTime: "15:00:00",
          },
          {
            id: 45,
            label: "E",
            name: "Evening Shift",
            focusAreaId: null,
            defaultStartTime: "15:00:00",
            defaultEndTime: "23:00:00",
          },
        ],
        customStartTime: "07:30:00|15:30:00",
        customEndTime: "15:30:00|23:30:00",
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.shiftName).toBe("Day Shift / Evening Shift");
    expect(entries[0]?.segments).toEqual([
      {
        shiftName: "Day Shift",
        startTime: "07:30:00",
        endTime: "15:30:00",
        displayFocusAreaName: "Skilled Nursing",
      },
      {
        shiftName: "Evening Shift",
        startTime: "15:30:00",
        endTime: "23:30:00",
        displayFocusAreaName: null,
      },
    ]);
  });
});
