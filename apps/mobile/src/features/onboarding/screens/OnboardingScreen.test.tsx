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

  it("starts on the first slide with an advance action, not a finish action", () => {
    render(<OnboardingScreen />);

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Started" })).not.toBeInTheDocument();
  });

  // The primary button doubles as advance and finish. If it ever completed on
  // the first slide, every new user would be dropped straight onto login and
  // never see the value props — and the flag is device-local, so they would
  // never be shown them again either.
  it("Continue advances instead of completing onboarding", () => {
    render(<OnboardingScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(saveHasSeenOnboarding).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
