import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkMixCard } from "./WorkMixCard";
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

describe("WorkMixCard", () => {
  it("names the focus area only once the shifts come from more than one", () => {
    const { unmount } = render(<WorkMixCard mix={MIX} periodPhrase="in the last 12 weeks" />);
    expect(screen.queryByText(/Skilled Nursing/)).toBeNull();
    unmount();

    render(
      <WorkMixCard
        mix={[MIX[0], { ...MIX[1], shiftName: "Day Shift", focusAreaName: "Sheltered Care" }]}
        periodPhrase="in the last 12 weeks"
      />,
    );
    expect(screen.getAllByText(/Skilled Nursing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sheltered Care/).length).toBeGreaterThan(0);
  });

  it("spells out each shift, job and time with its share", () => {
    render(<WorkMixCard mix={MIX} periodPhrase="in the last 12 weeks" />);

    expect(
      screen.getByText("47 shifts in the last 12 weeks, by shift and job."),
    ).toBeInTheDocument();
    const legend = screen.getByRole("list");
    for (const text of [
      "Day Shift",
      "Day Shift Supervisor",
      "7:00 AM - 3:00 PM",
      "83%",
      "39 shifts",
    ]) {
      expect(within(legend).getByText(text)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("img", { name: "What they work in the last 12 weeks" }),
    ).toBeInTheDocument();
  });

  it("shows the same numbers as a table", () => {
    render(<WorkMixCard mix={MIX} periodPhrase="this month" />);

    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[2]).getByText("Charge Nurse")).toBeInTheDocument();
    expect(within(rows[2]).getByText("17%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show as chart" })).toBeInTheDocument();
  });

  it("draws a full ring when one shift and job is all they worked", () => {
    const { container } = render(<WorkMixCard mix={[MIX[0]]} periodPhrase="this week" />);
    const d = container.querySelector(`svg[role="img"] path`)?.getAttribute("d") ?? "";
    // Two half rings, each its own closed shape.
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it("says so when there are no shifts in the period", () => {
    render(<WorkMixCard mix={[]} periodPhrase="this week" />);

    expect(screen.getByText("No shifts this week")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show as table" })).not.toBeInTheDocument();
  });
});
