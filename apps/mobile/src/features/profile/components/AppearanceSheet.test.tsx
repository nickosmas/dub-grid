import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

const useThemeMode = vi.fn();

vi.mock("../../../shared/providers/ThemeModeProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../shared/providers/ThemeModeProvider")>();
  return {
    ...actual,
    useThemeMode: () => useThemeMode(),
  };
});

import { AppearanceSheet, getThemePreferenceLabel } from "./AppearanceSheet";

describe("AppearanceSheet", () => {
  const setPreference = vi.fn();
  const onDismiss = vi.fn();

  beforeEach(() => {
    setPreference.mockReset();
    onDismiss.mockReset();
    useThemeMode.mockReturnValue({ preference: "system", setPreference });
  });

  it("renders all three appearance options", () => {
    render(<AppearanceSheet visible onDismiss={onDismiss} />);

    expect(screen.getByText("Display mode")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("marks the current preference as selected", () => {
    useThemeMode.mockReturnValue({ preference: "dark", setPreference });

    render(<AppearanceSheet visible onDismiss={onDismiss} />);

    expect(screen.getByLabelText("Dark")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Light")).toHaveAttribute("aria-selected", "false");
  });

  it("applies the chosen preference and closes the sheet", () => {
    render(<AppearanceSheet visible onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText("Light"));

    expect(setPreference).toHaveBeenCalledWith("light");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("labels the row that opens it with the current preference", () => {
    expect(getThemePreferenceLabel("system")).toBe("System");
    expect(getThemePreferenceLabel("dark")).toBe("Dark");
  });
});
