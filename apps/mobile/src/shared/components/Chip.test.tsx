import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", async () => {
  const React = await import("react");
  return {
    default: ({ name }: { name: string }) => React.createElement("i", { "data-icon": name }),
  };
});

let Chip: (typeof import("./Chip"))["Chip"];

beforeAll(async () => {
  Chip = (await import("./Chip")).Chip;
});

describe("Chip overflow", () => {
  it("lets a display-only label wrap inside a bounded pill", () => {
    render(<Chip label="Journal Listed Christian Science Nurse" />);

    const label = screen.getByText("Journal Listed Christian Science Nurse");
    expect(label).not.toHaveAttribute("data-number-of-lines");
  });

  it("keeps an interactive label to one line without changing its accessible name", () => {
    render(<Chip label="Journal Listed Christian Science Nurse" onPress={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Journal Listed Christian Science Nurse" }),
    ).toBeInTheDocument();
    const label = screen.getByText("Journal Listed Christian Science Nurse");
    expect(label).toHaveAttribute("data-number-of-lines", "1");
    expect(label).toHaveAttribute("data-ellipsize-mode", "tail");
  });
});
