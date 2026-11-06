import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeShiftChange, type ShiftChangeShiftInput } from "@dubgrid/schedule-core";
import { ShiftChangeBesideCurrent, ShiftChangeCard, ShiftChangeWas } from "./ShiftChangeCard";

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

  it("shows only what the day was beside the current shift, with no lone Shift 1 label", () => {
    const sick = {
      kind: "absence" as const,
      key: "absence:8",
      name: "Sick",
      scope: "restOfDay" as const,
      start: "12:00",
      end: "15:30",
    };
    const change = describeShiftChange(
      { items: [day] },
      { items: [{ ...day, end: "12:00" }, sick] },
      { date: "2026-10-24" },
    );
    expect(change.kind).toBe("multi");
    render(<ShiftChangeBesideCurrent change={change} />);
    expect(screen.getByText("Was")).toBeInTheDocument();
    expect(screen.queryByText("After")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Sick")).not.toBeInTheDocument();
  });

  it("keeps Shift 1 and Shift 2 when the day was two shifts", () => {
    const evening = {
      ...day,
      key: "2:10",
      shiftName: "Evening Shift",
      start: "15:30",
      end: "23:00",
    };
    const change = describeShiftChange(
      { items: [day, evening] },
      { items: [day] },
      { date: "2026-10-24" },
    );
    render(<ShiftChangeBesideCurrent change={change} />);
    expect(screen.getByText("Shift 1")).toBeInTheDocument();
    expect(screen.getByText("Shift 2")).toBeInTheDocument();
  });

  it("says a day that had nothing was added", () => {
    const change = describeShiftChange({ items: [] }, { items: [day] }, { date: "2026-10-24" });
    render(<ShiftChangeBesideCurrent change={change} />);
    expect(screen.getByText(/^Added: Day Shift/)).toBeInTheDocument();
  });
});
