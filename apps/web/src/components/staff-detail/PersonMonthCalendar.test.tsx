import { fireEvent, render as baseRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PersonMonthCalendar, monthWeeks, monthsInRange } from "./PersonMonthCalendar";
import type { AssignmentDefinition, ShiftCategory, ShiftMap } from "@/types";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const render = (ui: ReactElement) =>
  baseRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("monthsInRange", () => {
  it("lists every month a range touches, across a year end", () => {
    expect(monthsInRange({ startDate: "2026-11-20", endDate: "2027-02-03" })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("monthWeeks", () => {
  it("covers the month in Sunday-to-Saturday weeks", () => {
    const weeks = monthWeeks("2026-10");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-27");
    expect(weeks[4][6]).toBe("2026-10-31");
  });
});

describe("PersonMonthCalendar", () => {
  const assignment = {
    id: 1,
    name: "Day Mentor",
    color: "#dbeafe",
    text: "#1e3a8a",
    border: "#93c5fd",
    shiftId: 10,
    jobId: 100,
  } as AssignmentDefinition;
  const lookups = {
    assignmentById: new Map([[1, assignment]]),
    shiftById: new Map([[10, { id: 10, name: "Day Shift" } as ShiftCategory]]),
    jobById: new Map([[100, { name: "Mentor" }]]),
    focusAreaById: new Map(),
    absenceById: new Map(),
  };
  const shifts = {
    "emp_2026-10-29": { assignmentIds: [1], isDelete: false, isDraft: false },
    "emp_2026-11-02": { assignmentIds: [1], isDelete: false, isDraft: true, draftKind: "new" },
  } as unknown as ShiftMap;

  it("opens on today's month, spells out the shift, and steps between the period's months", () => {
    render(
      <PersonMonthCalendar
        employeeId="emp"
        shifts={shifts}
        range={{ startDate: "2026-10-01", endDate: "2026-11-30" }}
        today="2026-10-29"
        lookups={lookups}
      />,
    );

    const grid = screen.getByRole("grid", { name: "October 2026" });
    const day = within(grid).getByRole("gridcell", { name: "2026-10-29" });
    expect(within(day).getByText("Day Shift")).toBeInTheDocument();
    expect(within(day).getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier month in these dates" })).toBeDisabled();
    // A card with a job and one without are the same size.
    const cards = document.querySelectorAll("[data-calendar-pill]");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card).toHaveClass("h-10");

    fireEvent.click(screen.getByRole("button", { name: "Later month in these dates" }));
    const november = screen.getByRole("grid", { name: "November 2026" });
    expect(
      within(within(november).getByRole("gridcell", { name: "2026-11-02" })).getByText("Day Shift"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later month in these dates" })).toBeDisabled();
  });

  it("shows one month with no arrows when the period is that month", () => {
    render(
      <PersonMonthCalendar
        employeeId="emp"
        shifts={shifts}
        range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
        today="2026-10-29"
        lookups={lookups}
      />,
    );

    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Later month in these dates" })).toBeNull();
  });

  it("fills the whole month around a shorter period when it can load it", async () => {
    const load = vi.fn(async () => shifts);
    render(
      <PersonMonthCalendar
        employeeId="emp"
        shifts={{}}
        range={{ startDate: "2026-10-25", endDate: "2026-10-31" }}
        today="2026-10-29"
        lookups={lookups}
        loadMonth={{ key: ["test"], load }}
      />,
    );

    await waitFor(() => expect(load).toHaveBeenCalledWith("2026-09-27", "2026-10-31"));
    expect(
      await within(screen.getByRole("gridcell", { name: "2026-10-29" })).findByText("Day Shift"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Later month in these dates" })).toBeNull();
  });
});
