import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkMixBreakdown } from "./WorkMixBreakdown";
import type { WorkMixEntry } from "@/lib/staff-detail-stats";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const MIX: WorkMixEntry[] = [
  {
    key: "10:100",
    shiftName: "Day Shift",
    jobName: "Day Shift Supervisor",
    focusAreaName: "Skilled Nursing",
    time: "7:00 AM - 3:00 PM",
    count: 39,
    share: 83,
  },
  {
    key: "11:101",
    shiftName: "Evening Shift",
    jobName: "Charge Nurse",
    focusAreaName: "Skilled Nursing",
    time: "3:00 PM - 11:00 PM",
    count: 8,
    share: 17,
  },
];

describe("WorkMixBreakdown", () => {
  it("names the focus area only once the shifts come from more than one", () => {
    const { unmount } = render(<WorkMixBreakdown mix={MIX} periodPhrase="in the last 12 weeks" />);
    expect(screen.queryByText(/Skilled Nursing/)).toBeNull();
    unmount();

    render(
      <WorkMixBreakdown
        mix={[MIX[0], { ...MIX[1], shiftName: "Day Shift", focusAreaName: "Sheltered Care" }]}
        periodPhrase="in the last 12 weeks"
      />,
    );
    expect(screen.getAllByText(/Skilled Nursing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sheltered Care/).length).toBeGreaterThan(0);
  });

  it("spells out each shift, job and time with its count and share", () => {
    render(<WorkMixBreakdown mix={MIX} periodPhrase="in the last 12 weeks" />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Day Shift Supervisor · 7:00 AM - 3:00 PM");
    for (const text of ["Day Shift", "39 shifts", "83%"]) {
      expect(within(rows[0]).getByText(text)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("img", {
        name: "Day Shift as Day Shift Supervisor: 39 shifts, 83%; Evening Shift as Charge Nurse: 8 shifts, 17%",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "What they work in the last 12 weeks" }),
    ).toBeInTheDocument();
  });

  it("shows one kind of work as a plain row, with no bar or share", () => {
    render(<WorkMixBreakdown mix={[{ ...MIX[0], share: 100 }]} periodPhrase="this month" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.getByText("39 shifts")).toBeInTheDocument();
  });

  it("renders nothing without shifts", () => {
    const { container } = render(<WorkMixBreakdown mix={[]} periodPhrase="this month" />);
    expect(container).toBeEmptyDOMElement();
  });
});
