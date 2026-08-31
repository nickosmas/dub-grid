import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionList } from "@/components/profile/SessionList";

const mockSignOut = vi.fn();
const fetchAccountSessions = vi.fn();
const getBrowserAuthSession = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false }),
}));

vi.mock("@/features/account/client", () => ({
  fetchAccountSessions: () => fetchAccountSessions(),
  getBrowserAuthSession: () => getBrowserAuthSession(),
  revokeAccountSession: vi.fn(),
}));

vi.mock("@/hooks/useLogout", () => ({
  useLogout: () => ({ signOut: mockSignOut }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderSessionList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionList />
    </QueryClientProvider>,
  );
}

describe("SessionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrowserAuthSession.mockResolvedValue({
      access_token: "header.eyJzZXNzaW9uX2lkIjoic2Vzc2lvbi0xIn0.signature",
    });
    fetchAccountSessions.mockResolvedValue({
      active: [
        {
          id: "session-row-1",
          userId: "user-1",
          orgId: "org-1",
          supabaseSessionId: "session-1",
          platform: "web",
          appVersion: null,
          deviceLabel: "Chrome on macOS",
          browserName: "Chrome",
          browserVersion: "127",
          ipAddress: "127.0.0.1",
          locationCity: null,
          locationCountry: null,
          lastActiveAt: "2026-08-29T08:00:00.000Z",
          createdAt: "2026-08-29T08:00:00.000Z",
          refreshTokenHash: "refresh-token-hash",
        },
      ],
      stale: [],
    });
  });

  it("asks before signing out the current device", async () => {
    renderSessionList();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    const confirmationDialog = screen.getByRole("dialog", { name: "Sign out this device?" });
    expect(confirmationDialog).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(within(confirmationDialog).getByRole("button", { name: "Sign out" }));

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
