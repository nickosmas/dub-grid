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

let PressableRow: (typeof import("./PressableRow"))["PressableRow"];

beforeAll(async () => {
  PressableRow = (await import("./PressableRow")).PressableRow;
});

beforeEach(() => {
  hapticSelection.mockClear();
});

describe("PressableRow", () => {
  it("fires onPress with a selection haptic", () => {
    const onPress = vi.fn();
    render(
      <PressableRow onPress={onPress}>
        <span>Nurse Betty</span>
      </PressableRow>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nurse Betty/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it("blocks press and haptics while disabled", () => {
    const onPress = vi.fn();
    render(
      <PressableRow disabled onPress={onPress}>
        <span>Nurse Betty</span>
      </PressableRow>,
    );

    const row = screen.getByRole("button", { name: /Nurse Betty/ });
    expect(row).toBeDisabled();

    fireEvent.click(row);
    expect(onPress).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("can opt out of the haptic", () => {
    render(
      <PressableRow haptic={false} onPress={vi.fn()}>
        <span>Quiet row</span>
      </PressableRow>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Quiet row/ }));
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("surfaces selected state to assistive tech", () => {
    render(
      <PressableRow onPress={vi.fn()} selected>
        <span>Skilled Nursing</span>
      </PressableRow>,
    );

    expect(screen.getByRole("button", { name: /Skilled Nursing/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("supports a link role for rows that navigate out of the app", () => {
    render(
      <PressableRow accessibilityRole="link" onPress={vi.fn()}>
        <span>Cookie policy</span>
      </PressableRow>,
    );

    expect(screen.getByRole("link", { name: /Cookie policy/ })).toBeInTheDocument();
  });
});
