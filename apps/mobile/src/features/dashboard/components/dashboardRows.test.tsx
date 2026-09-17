import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

const routerPush = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("expo-router", () => ({ router: { push: routerPush } }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("../../../shared/lib/haptics", () => ({ hapticSelection: vi.fn() }));

let ActionQueueRow: (typeof import("./ActionQueueCard"))["ActionQueueRow"];
let OpenShiftRow: (typeof import("./OpenShiftsCard"))["OpenShiftRow"];
let CoverageSectionRow: (typeof import("./CoverageBySectionCard"))["CoverageSectionRow"];
let StaffHoursRow: (typeof import("./StaffHoursCard"))["StaffHoursRow"];

beforeAll(async () => {
  ActionQueueRow = (await import("./ActionQueueCard")).ActionQueueRow;
  OpenShiftRow = (await import("./OpenShiftsCard")).OpenShiftRow;
  CoverageSectionRow = (await import("./CoverageBySectionCard")).CoverageSectionRow;
  StaffHoursRow = (await import("./StaffHoursCard")).StaffHoursRow;
});

beforeEach(() => {
  routerPush.mockReset();
});

// Every dashboard row that has somewhere to go, goes there itself, so the
// card preview and the "See all" screen behind it land in the same place.
describe("dashboard row drill-ins", () => {
  it("opens a pending approval on the Requests tab's Approval list", () => {
    render(
      <ActionQueueRow
        request={
          {
            id: "req-1",
            type: "swap",
            requesterName: "Alex Kim",
            requesterShiftDate: "2026-04-16",
            requesterPresentation: { label: "Day" },
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Alex Kim, Swap request" }));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/requests",
      params: { tab: "approval", requestId: "req-1" },
    });
  });

  it("opens an open shift on the Requests tab's Available list", () => {
    render(
      <OpenShiftRow
        shift={
          {
            id: "open-1",
            date: "2026-04-16",
            focusAreaId: 2,
            focusAreaName: "ICU",
            needed: 2,
            urgency: "high",
            presentation: { shiftName: "Day", startTime: "07:00", endTime: "15:30" },
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ICU open shift/ }));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/requests",
      params: { tab: "available" },
    });
  });

  it("opens a coverage section on the team schedule for that focus area", () => {
    render(
      <CoverageSectionRow
        section={
          {
            focusAreaId: 3,
            focusAreaName: "Memory Care",
            filledTotal: 6,
            requiredTotal: 8,
            openSlots: 2,
            pct: 75,
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Memory Care, 75 percent covered" }));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/team",
      params: { focusAreaId: "3" },
    });
  });

  it("opens an overtime entry on that person", () => {
    render(
      <StaffHoursRow
        entry={
          {
            employeeId: "emp-9",
            employeeName: "Chris Hall",
            totalHours: 46,
            overtimeHours: 6,
            focusAreaId: 1,
            focusAreaName: "Emergency",
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chris Hall, 6 hours overtime" }));

    expect(routerPush).toHaveBeenCalledWith({ pathname: "/person/[id]", params: { id: "emp-9" } });
  });
});
