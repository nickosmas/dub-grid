import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/hooks/useLogout";

const mockQueryClientClear = vi.fn();
const mockSignOut = vi.fn();
const mockGetChannels = vi.fn();
const mockRemoveChannel = vi.fn();
const mockUntrackChannel = vi.fn();
const mockClearLogoutCleanup = vi.fn();
const mockClearImpersonationCookie = vi.fn();
const mockClearPermsCache = vi.fn();
const mockParseHost = vi.fn();
const mockReplace = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    clear: mockQueryClientClear,
  }),
}));

vi.mock("@/features/account/client", () => ({
  clearLogoutCleanup: (...args: unknown[]) =>
    mockClearLogoutCleanup(...args),
  getBrowserRealtimeChannels: (...args: unknown[]) =>
    mockGetChannels(...args),
  removeBrowserRealtimeChannel: (...args: unknown[]) =>
    mockRemoveChannel(...args),
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
  untrackBrowserRealtimeChannel: (...args: unknown[]) =>
    mockUntrackChannel(...args),
}));

vi.mock("@/lib/subdomain", () => ({
  parseHost: (...args: unknown[]) => mockParseHost(...args),
}));

vi.mock("@/lib/impersonation", () => ({
  clearImpersonationCookie: () => mockClearImpersonationCookie(),
}));

vi.mock("@/features/permissions/client", () => ({
  clearPermsCache: () => mockClearPermsCache(),
}));

Object.defineProperty(window, "location", {
  value: { replace: mockReplace, href: "http://localhost" },
  writable: true,
});

describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined);
    mockGetChannels.mockReturnValue([]);
    mockRemoveChannel.mockResolvedValue("ok");
    mockUntrackChannel.mockResolvedValue("ok");
    mockClearLogoutCleanup.mockResolvedValue({ success: true });
    mockParseHost.mockReturnValue({ rootDomain: "localhost", port: "" });
  });

  it("tears down realtime presence before signing out locally", async () => {
    const joinedChannel = {
      state: "joined",
    };
    const closedChannel = {
      state: "closed",
    };
    mockGetChannels.mockReturnValue([joinedChannel, closedChannel]);

    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.signOutLocal("/login");
    });

    expect(mockUntrackChannel).toHaveBeenCalledTimes(1);
    expect(mockUntrackChannel).toHaveBeenCalledWith(joinedChannel);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledWith("local");
    expect(mockUntrackChannel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
