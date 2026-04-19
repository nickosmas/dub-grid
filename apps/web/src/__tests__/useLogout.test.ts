import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/hooks/useLogout";

const mockQueryClientClear = vi.fn();
const mockSignOut = vi.fn();
const mockGetChannels = vi.fn();
const mockRemoveChannel = vi.fn();
const mockFrom = vi.fn();
const mockGetVerifiedBrowserUser = vi.fn();
const mockClearImpersonationCookie = vi.fn();
const mockClearPermsCache = vi.fn();
const mockParseHost = vi.fn();
const mockReplace = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    clear: mockQueryClientClear,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    getChannels: (...args: unknown[]) => mockGetChannels(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/lib/browser-auth", () => ({
  getVerifiedBrowserUser: (...args: unknown[]) =>
    mockGetVerifiedBrowserUser(...args),
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
    mockSignOut.mockResolvedValue({ error: null });
    mockGetChannels.mockReturnValue([]);
    mockRemoveChannel.mockResolvedValue("ok");
    mockGetVerifiedBrowserUser.mockResolvedValue(null);
    mockParseHost.mockReturnValue({ rootDomain: "localhost", port: "" });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn(),
      }),
    });
  });

  it("tears down realtime presence before signing out locally", async () => {
    const joinedChannel = {
      state: "joined",
      untrack: vi.fn().mockResolvedValue("ok"),
    };
    const closedChannel = {
      state: "closed",
      untrack: vi.fn().mockResolvedValue("ok"),
    };
    mockGetChannels.mockReturnValue([joinedChannel, closedChannel]);

    const { result } = renderHook(() => useLogout());

    await act(async () => {
      await result.current.signOutLocal("/login");
    });

    expect(joinedChannel.untrack).toHaveBeenCalledTimes(1);
    expect(closedChannel.untrack).not.toHaveBeenCalled();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(joinedChannel.untrack.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
