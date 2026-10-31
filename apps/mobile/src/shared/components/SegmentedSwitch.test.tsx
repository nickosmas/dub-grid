import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../lib/haptics", () => ({
  hapticSelection: vi.fn(),
  hapticImpact: vi.fn(),
  hapticNotify: vi.fn(),
}));

let SegmentedSwitch: (typeof import("./SegmentedSwitch"))["SegmentedSwitch"];

beforeAll(async () => {
  SegmentedSwitch = (await import("./SegmentedSwitch")).SegmentedSwitch;
});

const OPTIONS = [
  { value: "mine", label: "My schedule" },
  { value: "team", label: "Team" },
] as const;

describe("SegmentedSwitch (web and test fallback)", () => {
  it("marks the current view selected and reports a switch", () => {
    const onChange = vi.fn();
    render(
      <SegmentedSwitch
        accessibilityLabel="Home view"
        options={OPTIONS}
        value="mine"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "My schedule" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Team" })).toHaveAttribute("aria-selected", "false");

    fireEvent.click(screen.getByRole("button", { name: "Team" }));

    expect(onChange).toHaveBeenCalledWith("team");
  });
});
