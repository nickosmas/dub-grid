import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

const useThemeMode = vi.fn();

vi.mock("../../../shared/providers/ThemeModeProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/providers/ThemeModeProvider")>();
  return {
    ...actual,
    useThemeMode: () => useThemeMode(),
  };
});

import ProfileAppearanceScreen from "./ProfileAppearanceScreen";

describe("ProfileAppearanceScreen", () => {
  const setPreference = vi.fn();

  beforeEach(() => {
    setPreference.mockReset();
    useThemeMode.mockReturnValue({ preference: "system", setPreference });
  });

  it("renders all three appearance options", () => {
    render(<ProfileAppearanceScreen />);

    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("marks the current preference as selected", () => {
    useThemeMode.mockReturnValue({ preference: "dark", setPreference });

    render(<ProfileAppearanceScreen />);

    expect(screen.getByText("Dark").closest("[role='button']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Light").closest("[role='button']")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("calls setPreference when a different option is chosen", () => {
    render(<ProfileAppearanceScreen />);

    fireEvent.click(screen.getByText("Light"));

    expect(setPreference).toHaveBeenCalledWith("light");
  });
});
