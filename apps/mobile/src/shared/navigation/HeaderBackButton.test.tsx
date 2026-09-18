import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const routerBack = vi.fn();
const routerReplace = vi.fn();
const routerCanGoBack = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("expo-router", () => ({
  router: { back: routerBack, canGoBack: routerCanGoBack, replace: routerReplace },
}));

let HeaderBackButton: (typeof import("./HeaderBackButton"))["HeaderBackButton"];

beforeAll(async () => {
  HeaderBackButton = (await import("./HeaderBackButton")).HeaderBackButton;
});

beforeEach(() => {
  routerBack.mockReset();
  routerReplace.mockReset();
  routerCanGoBack.mockReset();
});

describe("HeaderBackButton", () => {
  it("pops the stack when there is a screen to go back to", () => {
    routerCanGoBack.mockReturnValue(true);
    render(<HeaderBackButton />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(routerBack).toHaveBeenCalledTimes(1);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("falls back to Home when the stack has nothing behind it", () => {
    routerCanGoBack.mockReturnValue(false);
    render(<HeaderBackButton />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(routerBack).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
