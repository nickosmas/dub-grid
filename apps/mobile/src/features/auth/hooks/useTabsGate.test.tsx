import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const usePushRegistration = vi.fn();
const usePushResponseHandler = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
  };
});

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("./useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../notifications/hooks/usePushRegistration", () => ({
  usePushRegistration,
}));

vi.mock("../../notifications/hooks/usePushResponseHandler", () => ({
  usePushResponseHandler,
}));

let useTabsGate: (typeof import("./useTabsGate"))["useTabsGate"];

beforeAll(async () => {
  useTabsGate = (await import("./useTabsGate")).useTabsGate;
});

function TestHost() {
  const gate = useTabsGate();
  if (gate.kind === "blocked") {
    return <>{gate.element}</>;
  }
  return (
    <div>
      <span data-testid="team">{String(gate.canViewTeamSchedule)}</span>
      <span data-testid="requests">{String(gate.canViewRequestsTab)}</span>
      <span data-testid="home">{String(gate.canViewHomeTab)}</span>
    </div>
  );
}

function mockReady(overrides: {
  effectiveRole?: string;
  focusAreaIds?: number[];
  departmentIds?: number[];
  canViewSchedule?: boolean;
  canApproveShiftRequests?: boolean;
}) {
  useSessionState.mockReturnValue({ accessToken: "token-1", isLoading: false });
  useBootstrap.mockReturnValue({
    data: {
      currentOrg: { id: "org-1", featureFlags: {} },
      effectiveRole: overrides.effectiveRole ?? "user",
      linkedEmployee: {
        focusAreaIds: overrides.focusAreaIds ?? [],
        departmentIds: overrides.departmentIds ?? [],
      },
      permissions: {
        canViewSchedule: overrides.canViewSchedule ?? true,
        canApproveShiftRequests: overrides.canApproveShiftRequests ?? false,
      },
    },
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
}

describe("useTabsGate canViewRequestsTab", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    usePushRegistration.mockReset();
    usePushResponseHandler.mockReset();
  });

  it("shows the Requests tab for an employee on the schedule", () => {
    mockReady({ focusAreaIds: [1], canApproveShiftRequests: false });

    render(<TestHost />);

    expect(screen.getByTestId("requests")).toHaveTextContent("true");
  });

  it("shows the Requests tab for an unscheduled admin who can approve requests", () => {
    mockReady({ focusAreaIds: [], canApproveShiftRequests: true });

    render(<TestHost />);

    expect(screen.getByTestId("requests")).toHaveTextContent("true");
  });

  it("hides the Requests tab for a management-only user with no approval rights", () => {
    mockReady({ focusAreaIds: [], canApproveShiftRequests: false });

    render(<TestHost />);

    expect(screen.getByTestId("requests")).toHaveTextContent("false");
  });
});

describe("useTabsGate canViewHomeTab", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    usePushRegistration.mockReset();
    usePushResponseHandler.mockReset();
  });

  it("hides the Home tab for a management-only regular user", () => {
    mockReady({ effectiveRole: "user", focusAreaIds: [], departmentIds: [9] });

    render(<TestHost />);

    expect(screen.getByTestId("home")).toHaveTextContent("false");
  });

  it("shows the Home tab for a scheduled regular user", () => {
    mockReady({ effectiveRole: "user", focusAreaIds: [1], departmentIds: [9] });

    render(<TestHost />);

    expect(screen.getByTestId("home")).toHaveTextContent("true");
  });

  it("shows the Home tab for a management-only admin", () => {
    mockReady({ effectiveRole: "admin", focusAreaIds: [], departmentIds: [9] });

    render(<TestHost />);

    expect(screen.getByTestId("home")).toHaveTextContent("true");
  });
});
