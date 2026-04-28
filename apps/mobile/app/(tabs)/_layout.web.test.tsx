import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();

vi.mock("expo-router", async () => {
  const React = await import("react");

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: { title?: string };
  }) => React.createElement("span", {}, `${name}:${options?.title ?? name}`);

  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement("div", {}, `redirect:${href}`),
    Tabs,
  };
});

vi.mock("../../src/shared/components/LoadingScreen", async () => {
  const React = await import("react");

  return {
    LoadingScreen: ({ title }: { title: string }) =>
      React.createElement("div", {}, title),
  };
});

vi.mock("../../src/features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../src/shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

let TabsLayoutWeb: (typeof import("./_layout.web"))["default"];

beforeAll(async () => {
  TabsLayoutWeb = (await import("./_layout.web")).default;
});

describe("TabsLayoutWeb", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();

    useSessionState.mockReturnValue({
      accessToken: "token-123",
      isLoading: false,
    });
    useBootstrap.mockReturnValue({
      data: {
        effectiveRole: "admin",
        permissions: {
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
    });
  });

  it("renders the Me and Schedule tab set without an Alerts tab", () => {
    render(<TabsLayoutWeb />);

    expect(screen.getByText("me:Me")).toBeInTheDocument();
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
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("me:Me")).toBeInTheDocument();
    expect(screen.queryByText("team:Schedule")).not.toBeInTheDocument();
  });
});
