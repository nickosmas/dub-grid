import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const routerReplace = vi.fn();
let pathname = "/alerts/alert-42";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);
vi.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => routerReplace(...args) },
  usePathname: () => pathname,
}));
vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState: (...args: unknown[]) => useSessionState(...args),
}));
vi.mock("../hooks/useBootstrap", () => ({
  useBootstrap: (...args: unknown[]) => useBootstrap(...args),
}));
vi.mock("../../../shared/lib/auth-reset", () => ({ handleExpiredMobileSession: vi.fn() }));
vi.mock("../screens/OrganizationLockedScreen", () => ({
  OrganizationLockedScreen: ({ message }: { message: string }) => <div>locked:{message}</div>,
}));

import { ProtectedRoute } from "./ProtectedRoute";

function renderRoute() {
  return render(
    <ProtectedRoute>
      <div>the alert</div>
    </ProtectedRoute>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/alerts/alert-42";
    useBootstrap.mockReturnValue({ data: { currentOrg: { id: "org-1" } }, error: null });
  });

  it("renders nothing while the session is still restoring", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: true });
    const { container } = renderRoute();
    expect(container).toBeEmptyDOMElement();
  });

  it("sends a signed-out visitor to login with the way back", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });
    renderRoute();
    expect(routerReplace).toHaveBeenCalledWith({
      pathname: "/(auth)/login",
      params: { next: "/alerts/alert-42" },
    });
    expect(screen.queryByText("the alert")).not.toBeInTheDocument();
  });

  it("keeps the original destination while the redirect is in flight", () => {
    useSessionState.mockReturnValue({ accessToken: null, isLoading: false });
    const { rerender } = renderRoute();
    pathname = "/login";
    rerender(
      <ProtectedRoute>
        <div>the alert</div>
      </ProtectedRoute>,
    );
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith({
      pathname: "/(auth)/login",
      params: { next: "/alerts/alert-42" },
    });
  });

  it("renders the screen for a signed-in member", () => {
    useSessionState.mockReturnValue({ accessToken: "token", isLoading: false });
    renderRoute();
    expect(screen.getByText("the alert")).toBeInTheDocument();
  });

  it("holds a member whose organization is locked, like the tabs do", () => {
    useSessionState.mockReturnValue({ accessToken: "token", isLoading: false });
    useBootstrap.mockReturnValue({
      data: undefined,
      error: new Error("Organization unavailable. Contact your organization administrator."),
      isFetching: false,
      refetch: vi.fn(),
    });
    renderRoute();
    expect(screen.getByText(/^locked:/)).toBeInTheDocument();
    expect(screen.queryByText("the alert")).not.toBeInTheDocument();
  });
});
