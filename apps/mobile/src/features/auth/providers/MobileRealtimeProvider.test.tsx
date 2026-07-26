import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const useMobileRealtimeInvalidation = vi.fn();
const useMobileAccountRealtimeInvalidation = vi.fn();
const useMobilePermissionsRealtime = vi.fn();
const mockQueryClient = { invalidateQueries: vi.fn() };

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/hooks/useMobileRealtimeInvalidation", () => ({
  useMobileRealtimeInvalidation,
}));

vi.mock("../../../shared/hooks/useMobileAccountRealtimeInvalidation", () => ({
  useMobileAccountRealtimeInvalidation,
}));

vi.mock("../hooks/useMobilePermissionsRealtime", () => ({
  useMobilePermissionsRealtime,
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: mockQueryClient,
}));

let MobileRealtimeProvider: (typeof import("./MobileRealtimeProvider"))["MobileRealtimeProvider"];

beforeAll(async () => {
  MobileRealtimeProvider = (await import("./MobileRealtimeProvider")).MobileRealtimeProvider;
});

describe("MobileRealtimeProvider", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    useMobileRealtimeInvalidation.mockReset();
    useMobileAccountRealtimeInvalidation.mockReset();
    useMobilePermissionsRealtime.mockReset();
    mockQueryClient.invalidateQueries.mockReset();
  });

  it("subscribes once for the signed-in user's current org", () => {
    useSessionState.mockReturnValue({
      accessToken: "token-1",
      isLoading: false,
      session: { user: { id: "user-1" } },
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          id: "org-1",
          featureFlags: {
            disable_realtime: false,
          },
        },
      },
    });

    render(
      <MobileRealtimeProvider>
        <div>App content</div>
      </MobileRealtimeProvider>,
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(useBootstrap).toHaveBeenCalledWith("token-1");
    expect(useMobileRealtimeInvalidation).toHaveBeenCalledWith({
      accessToken: "token-1",
      orgId: "org-1",
      disabled: false,
      queryClient: mockQueryClient,
    });
    expect(useMobilePermissionsRealtime).toHaveBeenCalledWith({
      accessToken: "token-1",
      userId: "user-1",
      disabled: false,
      queryClient: mockQueryClient,
    });
  });

  it("respects the current org realtime feature flag", () => {
    useSessionState.mockReturnValue({
      accessToken: "token-1",
      isLoading: false,
      session: { user: { id: "user-1" } },
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: {
          id: "org-1",
          featureFlags: {
            disable_realtime: true,
          },
        },
      },
    });

    render(
      <MobileRealtimeProvider>
        <div>App content</div>
      </MobileRealtimeProvider>,
    );

    expect(useMobileRealtimeInvalidation).toHaveBeenCalledWith({
      accessToken: "token-1",
      orgId: "org-1",
      disabled: true,
      queryClient: mockQueryClient,
    });
    expect(useMobilePermissionsRealtime).toHaveBeenCalledWith({
      accessToken: "token-1",
      userId: "user-1",
      disabled: true,
      queryClient: mockQueryClient,
    });
  });
});
