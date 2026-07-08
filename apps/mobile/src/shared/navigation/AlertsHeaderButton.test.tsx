import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const routerPush = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("../../features/auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

let AlertsHeaderButton: (typeof import("./AlertsHeaderButton"))["AlertsHeaderButton"];

beforeAll(async () => {
  AlertsHeaderButton = (await import("./AlertsHeaderButton")).AlertsHeaderButton;
});

describe("AlertsHeaderButton", () => {
  beforeEach(() => {
    routerPush.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        unreadNotificationCount: 3,
      },
    });
  });

  it("opens the Alerts screen from the bell button", () => {
    render(<AlertsHeaderButton />);

    fireEvent.click(screen.getByRole("button", { name: "Open alerts" }));

    expect(routerPush).toHaveBeenCalledWith("/alerts");
  });

  it("shows the unread badge count on the bell button", () => {
    render(<AlertsHeaderButton />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
