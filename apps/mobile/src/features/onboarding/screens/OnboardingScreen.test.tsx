import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const routerReplace = vi.fn();
const saveHasSeenOnboarding = vi.fn(() => Promise.resolve());

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("expo-router", () => ({
  router: {
    replace: routerReplace,
  },
}));

vi.mock("../../../shared/lib/session", () => ({
  saveHasSeenOnboarding,
}));

let OnboardingScreen: (typeof import("./OnboardingScreen"))["default"];

beforeAll(async () => {
  OnboardingScreen = (await import("./OnboardingScreen")).default;
});

describe("OnboardingScreen", () => {
  beforeEach(() => {
    routerReplace.mockReset();
    saveHasSeenOnboarding.mockClear();
  });

  it("renders all three value-prop slides", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText("Your schedule, always with you")).toBeInTheDocument();
    expect(screen.getByText("Cover shifts on the go")).toBeInTheDocument();
    expect(screen.getByText("Stay in the loop")).toBeInTheDocument();
  });

  it("Skip persists the seen flag and routes to login", async () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await vi.waitFor(() => {
      expect(saveHasSeenOnboarding).toHaveBeenCalledWith(true);
    });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
  });
});
