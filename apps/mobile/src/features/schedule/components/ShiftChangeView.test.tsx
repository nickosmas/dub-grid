import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { describeShiftChange, type ShiftChangeShiftInput } from "@dubgrid/schedule-core";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let ShiftChangeCard: (typeof import("./ShiftChangeView"))["ShiftChangeCard"];
let ShiftChangeWas: (typeof import("./ShiftChangeView"))["ShiftChangeWas"];

beforeAll(async () => {
  ({ ShiftChangeCard, ShiftChangeWas } = await import("./ShiftChangeView"));
});

function shift(overrides: Partial<ShiftChangeShiftInput> = {}): ShiftChangeShiftInput {
  return {
    kind: "shift",
    key: "1:10",
    shiftName: "Day Shift",
    jobName: "Registered Nurse",
    focusAreaName: "Skilled Nursing",
    start: "07:00",
    end: "15:00",
    ...overrides,
  };
}

const evening = shift({ key: "2:10", shiftName: "Evening Shift", start: "15:00", end: "23:00" });

describe("ShiftChangeCard (46d)", () => {
  it("shows Before and After with every field and marks a whole-day change", () => {
    const change = describeShiftChange(
      { items: [shift(), evening] },
      { items: [shift({ end: "11:00" })] },
      { date: "2026-10-22" },
    );
    render(<ShiftChangeCard change={change} showDayBar />);

    expect(screen.getByText("BEFORE · 16 hrs")).toBeInTheDocument();
    expect(screen.getByText("AFTER · 4 hrs")).toBeInTheDocument();
    expect(screen.getByText("Shift 2")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /^Before: Day Shift · Registered Nurse · 7:00 AM - 3:00 PM \(8 hrs\) · Skilled Nursing; Evening Shift .*After: Day Shift · Registered Nurse · 7:00 AM - 11:00 AM \(4 hrs\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM").length).toBeGreaterThan(0);
  });

  it("says No shift on an empty side", () => {
    const change = describeShiftChange({ items: [] }, { items: [shift()] }, { date: "2026-10-22" });
    render(<ShiftChangeCard change={change} />);

    expect(screen.getByText("No shift")).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
  });
});

describe("ShiftChangeWas (46d)", () => {
  it("shows the earlier side under a WAS heading", () => {
    const change = describeShiftChange(
      { items: [shift()] },
      { items: [shift({ focusAreaName: "Memory Care" })] },
      { date: "2026-10-22" },
    );
    render(<ShiftChangeWas change={change} />);

    expect(screen.getByText("WAS")).toBeInTheDocument();
    expect(screen.getByText(/Skilled Nursing/)).toBeInTheDocument();
    expect(screen.queryByText(/Memory Care/)).not.toBeInTheDocument();
  });
});
