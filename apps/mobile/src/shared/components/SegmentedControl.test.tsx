import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const hapticSelection = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../lib/haptics", () => ({
  hapticSelection: () => hapticSelection(),
  hapticImpact: vi.fn(),
  hapticNotify: vi.fn(),
}));

let SegmentedControl: (typeof import("./SegmentedControl"))["SegmentedControl"];

beforeAll(async () => {
  SegmentedControl = (await import("./SegmentedControl")).SegmentedControl;
});

beforeEach(() => {
  hapticSelection.mockClear();
});

const OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "2weeks", label: "2 Weeks" },
] as const;

function renderControl(overrides?: {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return render(
    <SegmentedControl
      disabled={overrides?.disabled}
      onChange={overrides?.onChange ?? vi.fn()}
      options={OPTIONS}
      value={overrides?.value ?? "day"}
    />,
  );
}

describe("SegmentedControl", () => {
  // Regression: the segments once carried `flex: 1` inside a content-sized
  // track, which collapses every child to zero width under Yoga and rendered
  // the control as an empty pill. jsdom does no real layout, so this asserts
  // the labels are at least present and reachable — the width collapse itself
  // is only visible on a device.
  it("renders every option's label", () => {
    renderControl();

    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
    expect(screen.getByText("2 Weeks")).toBeInTheDocument();
  });

  // Counts render as a badge beside the label, the way `ScrollableTabStrip`
  // draws them — People's roster tabs once spelled theirs into the label as
  // "Schedule (12)", which is the same number in a different vocabulary.
  it("shows a count badge only for positive counts", () => {
    render(
      <SegmentedControl
        onChange={vi.fn()}
        options={[
          { value: "schedule", label: "Schedule", count: 12 },
          { value: "management", label: "Management", count: 0 },
        ]}
        value="schedule"
      />,
    );

    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("reports the selected option to assistive tech", () => {
    renderControl({ value: "week" });

    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange with the pressed option's value", () => {
    const onChange = vi.fn();
    renderControl({ onChange, value: "day" });

    fireEvent.click(screen.getByRole("button", { name: "2 Weeks" }));
    expect(onChange).toHaveBeenCalledWith("2weeks");
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it("ignores a press on the already-selected option", () => {
    const onChange = vi.fn();
    renderControl({ onChange, value: "day" });

    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("blocks selection while disabled", () => {
    const onChange = vi.fn();
    renderControl({ disabled: true, onChange });

    const week = screen.getByRole("button", { name: "Week" });
    expect(week).toBeDisabled();

    fireEvent.click(week);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("survives a value that is not in the options list", () => {
    renderControl({ value: "unknown" });

    // No option is marked selected, and nothing throws.
    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-selected", "false");
  });
});
