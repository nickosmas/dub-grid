import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildScheduleWeekDays } from "@dubgrid/schedule-core";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let UpcomingShiftsSection: (typeof import("./MyScheduleSections"))["UpcomingShiftsSection"];

beforeAll(async () => {
  ({ UpcomingShiftsSection } = await import("./MyScheduleSections"));
});

const weekDays = buildScheduleWeekDays(
  { startDate: "2026-11-02", endDate: "2026-11-08" },
  "2026-11-02",
  "America/Los_Angeles",
  new Date("2026-10-30T20:00:00Z"),
);
const summary = { scheduledHours: 32, targetHours: 40, progress: 0.8, statusLabel: "" };

describe("UpcomingShiftsSection", () => {
  it("reads Your week with this week's hours by default", () => {
    render(
      <UpcomingShiftsSection
        items={[]}
        onPressEntry={() => {}}
        summary={summary}
        todayDate="2026-10-30"
        weekDays={weekDays}
      />,
    );

    expect(screen.getByText("Your week")).toBeInTheDocument();
    expect(screen.getByText("32h this week")).toBeInTheDocument();
    expect(screen.getAllByText("Unscheduled")).toHaveLength(7);
  });

  it("names one week of several by its heading, with that week's hours alone", () => {
    render(
      <UpcomingShiftsSection
        heading="Nov 2 - Nov 8"
        items={[]}
        onPressEntry={() => {}}
        summary={summary}
        todayDate="2026-10-30"
        weekDays={weekDays}
      />,
    );

    expect(screen.getByText("Nov 2 - Nov 8")).toBeInTheDocument();
    expect(screen.queryByText("Your week")).not.toBeInTheDocument();
    expect(screen.getByText("32h")).toBeInTheDocument();
  });
});
