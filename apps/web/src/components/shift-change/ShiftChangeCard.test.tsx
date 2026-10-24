import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeShiftChange, type ShiftChangeShiftInput } from "@dubgrid/schedule-core";
import { ShiftChangeCard, ShiftChangeWas } from "./ShiftChangeCard";

const day: ShiftChangeShiftInput = {
  kind: "shift",
  key: "1:10",
  shiftName: "Day Shift",
  jobName: "Supervisor",
  start: "07:00",
  end: "15:30",
  focusAreaName: "Skilled Nursing",
};

describe("ShiftChangeCard", () => {
  it("shows a day that had nothing as New, without Before and After", () => {
    const change = describeShiftChange({ items: [] }, { items: [day] }, { date: "2026-10-24" });
    render(<ShiftChangeCard change={change} layout="stacked" />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Before")).not.toBeInTheDocument();
    expect(screen.queryByText("After")).not.toBeInTheDocument();
    expect(screen.queryByText("No shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Added")).not.toBeInTheDocument();
  });

  it("keeps Before and After for a changed shift", () => {
    const change = describeShiftChange(
      { items: [day] },
      { items: [{ ...day, end: "12:00" }] },
      { date: "2026-10-24" },
    );
    render(<ShiftChangeCard change={change} layout="stacked" />);
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("shows no Was for a day that had nothing", () => {
    const change = describeShiftChange({ items: [] }, { items: [day] }, { date: "2026-10-24" });
    const { container } = render(<ShiftChangeWas change={change} />);
    expect(container).toBeEmptyDOMElement();
  });
});
