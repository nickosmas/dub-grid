import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The web layout no longer re-derives the gating rules — it renders whatever
// `useTabsGate` decides. Those rules (auth, org-locked, per-role tab
// visibility) are covered directly in
// `features/auth/hooks/useTabsGate.test.tsx`. What's left to prove here is that
// the web tab bar renders the right tab set for a given gate result, and that a
// blocked gate short-circuits the tabs entirely.
const useTabsGate = vi.fn();

// The web layout now shares `useTabsGate` with the native one instead of
// re-deriving the rules, so these tests exercise the real gate — same mock set
// as tabs-layout.test.tsx.
vi.mock("react-native", async () => {
  const React = await import("react");

  return {
    AppState: {
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: {
      OS: "web",
    },
    View: ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children),
  };
});

vi.mock("../features/notifications/hooks/usePushRegistration", () => ({
  usePushRegistration: vi.fn(),
}));

vi.mock("../features/notifications/hooks/usePushResponseHandler", () => ({
  usePushResponseHandler: vi.fn(),
}));

vi.mock("expo-router", async () => {
  const React = await import("react");

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  Tabs.Screen = ({ name, options }: { name: string; options?: { title?: string } }) =>
    React.createElement("span", {}, `${name}:${options?.title ?? name}`);

  return { Tabs };
});

vi.mock("../features/auth/hooks/useTabsGate", () => ({
  useTabsGate,
}));

let TabsLayoutWeb: (typeof import("../../app/(tabs)/_layout.web"))["default"];

beforeAll(async () => {
  TabsLayoutWeb = (await import("../../app/(tabs)/_layout.web")).default;
});

function readyGate(overrides?: {
  canViewTeamSchedule?: boolean;
  canViewRequestsTab?: boolean;
  canViewHomeTab?: boolean;
}) {
  return {
    kind: "ready" as const,
    canViewTeamSchedule: overrides?.canViewTeamSchedule ?? true,
    canViewRequestsTab: overrides?.canViewRequestsTab ?? true,
    canViewHomeTab: overrides?.canViewHomeTab ?? true,
  };
}

describe("TabsLayoutWeb", () => {
  beforeEach(() => {
    useTabsGate.mockReset();
    useTabsGate.mockReturnValue(readyGate());
  });

  it("renders the full tab set without an Alerts tab", () => {
    render(<TabsLayoutWeb />);

    expect(screen.getByText("home:Home")).toBeInTheDocument();
    expect(screen.getByText("team:Schedule")).toBeInTheDocument();
    expect(screen.getByText("requests:Requests")).toBeInTheDocument();
    expect(screen.getByText("people:People")).toBeInTheDocument();
    expect(screen.getByText("profile:Profile")).toBeInTheDocument();
    expect(screen.queryByText(/alerts/i)).not.toBeInTheDocument();
  });

  it("hides the Schedule tab when the gate withholds team schedule access", () => {
    useTabsGate.mockReturnValue(readyGate({ canViewTeamSchedule: false }));

    render(<TabsLayoutWeb />);

    expect(screen.getByText("home:Home")).toBeInTheDocument();
    expect(screen.queryByText("team:Schedule")).not.toBeInTheDocument();
  });

  it("hides the Requests tab when the gate withholds it", () => {
    useTabsGate.mockReturnValue(readyGate({ canViewRequestsTab: false }));

    render(<TabsLayoutWeb />);

    expect(screen.queryByText("requests:Requests")).not.toBeInTheDocument();
  });

  it("hides the Home tab for management-only users", () => {
    useTabsGate.mockReturnValue(readyGate({ canViewHomeTab: false }));

    render(<TabsLayoutWeb />);

    expect(screen.queryByText("home:Home")).not.toBeInTheDocument();
    expect(screen.getByText("team:Schedule")).toBeInTheDocument();
  });

  it("always keeps People and Profile available", () => {
    useTabsGate.mockReturnValue(
      readyGate({
        canViewTeamSchedule: false,
        canViewRequestsTab: false,
        canViewHomeTab: false,
      }),
    );

    render(<TabsLayoutWeb />);

    expect(screen.getByText("people:People")).toBeInTheDocument();
    expect(screen.getByText("profile:Profile")).toBeInTheDocument();
  });

  it("renders the blocking element instead of tabs when the gate blocks", () => {
    useTabsGate.mockReturnValue({
      kind: "blocked",
      element: <div>organization-locked</div>,
    });

    render(<TabsLayoutWeb />);

    expect(screen.getByText("organization-locked")).toBeInTheDocument();
    expect(screen.queryByText("people:People")).not.toBeInTheDocument();
  });
});
