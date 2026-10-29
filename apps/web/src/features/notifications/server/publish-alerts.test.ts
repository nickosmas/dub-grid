import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftChangeResolvers } from "@dubgrid/schedule-core";

const sendNotification = vi.fn();
const loggerError = vi.fn();

vi.mock("./sender", () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: (...args: unknown[]) => loggerError(...args) },
}));

const resolvers: ShiftChangeResolvers = {
  segment: (shiftId) =>
    shiftId === 1
      ? {
          shiftName: "Day Shift",
          jobName: "Registered Nurse",
          focusAreaId: 5,
          defaultStart: "07:00",
          defaultEnd: "15:00",
        }
      : {
          shiftName: "Night Shift",
          jobName: "Registered Nurse",
          focusAreaId: 5,
          defaultStart: "23:00",
          defaultEnd: "07:00",
        },
  absenceType: () => ({ name: "Sick" }),
  focusArea: () => "Skilled Nursing",
};

import { notifyPublishedShiftChanges } from "./publish-alerts";

const ORG = "org-1";
const PUBLISHER = "user-publisher";

const worked = (shiftId: number) => ({
  kind: "worked",
  segments: [{ shiftId, jobId: 7, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

function changeRow(empId: string, date: string, from: unknown, to: unknown) {
  return {
    emp_id: empId,
    date,
    kind: from ? (to ? "modified" : "deleted") : "new",
    from_state: from,
    to_state: to,
  };
}

function fakeClient(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        is: () => builder,
        maybeSingle: async () => result,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  } as never;
}

function run(tables: Record<string, unknown>) {
  return notifyPublishedShiftChanges({
    serviceClient: fakeClient(tables),
    orgId: ORG,
    publishHistoryId: "history-1",
    actorId: PUBLISHER,
    loadResolvers: async () => resolvers,
  });
}

const baseTables = {
  employees: [
    { id: "emp-staff", user_id: "user-staff" },
    { id: "emp-editor", user_id: "user-editor" },
    { id: "emp-publisher", user_id: PUBLISHER },
    { id: "emp-unlinked", user_id: null },
  ],
  organization_memberships: [
    { user_id: "user-staff", org_role: "user", admin_permissions: null },
    { user_id: "user-editor", org_role: "admin", admin_permissions: { canEditShifts: true } },
  ],
};

describe("notifyPublishedShiftChanges", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    loggerError.mockReset();
  });

  it("sends each changed person one alert with every day, and nobody else", async () => {
    await run({
      ...baseTables,
      organizations: { staff_see_shift_changes: true },
      schedule_publish_changes: [
        changeRow("emp-staff", "2026-10-22", worked(1), worked(2)),
        changeRow("emp-staff", "2026-10-20", worked(1), null),
        changeRow("emp-publisher", "2026-10-22", null, worked(1)),
        changeRow("emp-unlinked", "2026-10-22", null, worked(1)),
      ],
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, orgId, type, title, message, metadata, options] =
      sendNotification.mock.calls[0]!;
    expect([userId, orgId, type, title]).toEqual([
      "user-staff",
      ORG,
      "shift_change",
      "Your schedule changed on 2 days",
    ]);
    expect(message).toMatch(
      /^Tue, Oct 20: Day Shift .* → No shift\nThu, Oct 22: Day Shift .* → Night Shift/,
    );
    expect(metadata).toEqual({
      date: "2026-10-20",
      dates: ["2026-10-20", "2026-10-22"],
      publishHistoryId: "history-1",
    });
    expect(options.email.details).toHaveLength(4);
    expect(JSON.stringify(sendNotification.mock.calls)).not.toContain(PUBLISHER);
  });

  it("names only the days to staff when the organization hides what changed, but not to an editor", async () => {
    await run({
      ...baseTables,
      organizations: { staff_see_shift_changes: false },
      schedule_publish_changes: [
        changeRow("emp-staff", "2026-10-22", worked(1), worked(2)),
        changeRow("emp-editor", "2026-10-22", worked(1), worked(2)),
      ],
    });

    const byUser = new Map(sendNotification.mock.calls.map((call) => [call[0], call]));
    expect(byUser.get("user-staff")?.[4]).toBe("Open the schedule to see what changed.");
    expect(byUser.get("user-editor")?.[4]).toMatch(/Day Shift .* → Night Shift/);
  });

  it("sends nothing for a publish of schedule notes only", async () => {
    await run({
      ...baseTables,
      organizations: { staff_see_shift_changes: true },
      schedule_publish_changes: [
        {
          emp_id: "emp-staff",
          date: "2026-10-22",
          kind: "new",
          from_state: null,
          to_state: {
            kind: "note",
            indicatorTypeId: 3,
            focusAreaId: null,
            indicatorName: "Float",
            indicatorColor: "#fff",
          },
        },
      ],
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("logs a failed send without throwing", async () => {
    sendNotification.mockRejectedValueOnce(new Error("push down"));
    await expect(
      run({
        ...baseTables,
        organizations: { staff_see_shift_changes: true },
        schedule_publish_changes: [changeRow("emp-staff", "2026-10-22", worked(1), worked(2))],
      }),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});
