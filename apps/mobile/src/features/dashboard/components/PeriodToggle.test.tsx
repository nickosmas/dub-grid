import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let PeriodToggle: (typeof import("./PeriodToggle"))["PeriodToggle"];

beforeAll(async () => {
  PeriodToggle = (await import("./PeriodToggle")).PeriodToggle;
});

describe("PeriodToggle", () => {
  it("marks the active mode as selected", () => {
    render(<PeriodToggle mode="week" onChange={vi.fn()} />);

    expect(screen.getByText("Week").closest("button")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("2 Weeks").closest("button")).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange with the pressed mode", () => {
    const onChange = vi.fn();
    render(<PeriodToggle mode="week" onChange={onChange} />);

    fireEvent.click(screen.getByText("2 Weeks"));

    expect(onChange).toHaveBeenCalledWith("2weeks");
  });

  it("stays pressable while a period is still loading", () => {
    // A locked toggle read as a hang; the cards dim instead, and a second tap
    // just moves the query on.
    const onChange = vi.fn();
    render(<PeriodToggle mode="2weeks" onChange={onChange} />);

    fireEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("offers Week and 2 Weeks only", () => {
    render(<PeriodToggle mode="week" onChange={vi.fn()} />);

    expect(screen.queryByText("Day")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
