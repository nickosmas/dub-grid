import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const handleExpiredMobileSession = vi.fn();

vi.mock("expo-router", async () => {
  const React = await import("react");

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  Tabs.Screen = ({ name, options }: { name: string; options?: { title?: string } }) =>
    React.createElement("span", {}, `${name}:${options?.title ?? name}`);

  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
    Tabs,
  };
});

vi.mock("../shared/components/LoadingScreen", async () => {
  const React = await import("react");

  return {
    LoadingScreen: ({ title }: { title: string }) => React.createElement("div", {}, title),
  };
});

vi.mock("../features/auth/screens/OrganizationLockedScreen", async () => {
  const React = await import("react");

  return {
    OrganizationLockedScreen: ({
      message,
      onRetry,
      onSignOut,
    }: {
      message: string;
      onRetry: () => void;
      onSignOut: () => void;
    }) =>
      React.createElement(
        "section",
        {},
        React.createElement("h1", {}, "Organization unavailable"),
        React.createElement("p", {}, message),
        React.createElement("button", { type: "button", onClick: onRetry }, "Try again"),
        React.createElement("button", { type: "button", onClick: onSignOut }, "Sign out"),
      ),
  };
});

vi.mock("../features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession,
}));

vi.mock("../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

let TabsLayoutWeb: (typeof import("../../app/(tabs)/_layout.web"))["default"];

beforeAll(async () => {
  TabsLayoutWeb = (await import("../../app/(tabs)/_layout.web")).default;
});

describe("TabsLayoutWeb", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    handleExpiredMobileSession.mockReset();

    useSessionState.mockReturnValue({
      accessToken: "token-123",
      isLoading: false,
    });
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "admin",
        permissions: {
          canViewSchedule: true,
          canEditShifts: false,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders the Home and Schedule tab set without an Alerts tab", () => {
    render(<TabsLayoutWeb />);

    expect(screen.getByText("home:Home")).toBeInTheDocument();
    expect(screen.getByText("team:Schedule")).toBeInTheDocument();
    expect(screen.getByText("requests:Requests")).toBeInTheDocument();
    expect(screen.getByText("people:People")).toBeInTheDocument();
    expect(screen.getByText("profile:Profile")).toBeInTheDocument();
    expect(screen.queryByText(/alerts/i)).not.toBeInTheDocument();
  });

  it("hides the Schedule tab when the user cannot view the team schedule", () => {
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "user",
        permissions: {
          canViewSchedule: false,
          canEditShifts: false,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("home:Home")).toBeInTheDocument();
    expect(screen.queryByText("team:Schedule")).not.toBeInTheDocument();
  });

  it("shows the Schedule tab for regular users with schedule view access", () => {
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "user",
        permissions: {
          canViewSchedule: true,
          canEditShifts: false,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("team:Schedule")).toBeInTheDocument();
  });

  it("shows the Schedule tab for schedule editors without approval permission", () => {
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "user",
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("team:Schedule")).toBeInTheDocument();
  });

  it("shows the organization lock instead of web tabs when bootstrap reports the organization is unavailable", () => {
    const refetch = vi.fn();
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "super_admin",
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: new Error("Organization unavailable. Sign in on the web to manage billing."),
      isFetching: false,
      refetch,
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(screen.queryByText("team:Schedule")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Sign out"));
    expect(handleExpiredMobileSession).toHaveBeenCalledTimes(1);
  });
});
