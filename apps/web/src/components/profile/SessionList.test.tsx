import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionList } from "@/components/profile/SessionList";

const mockSignOut = vi.fn();
const fetchAccountSessions = vi.fn();
const getBrowserAuthSession = vi.fn();
const revokeAccountSession = vi.fn();
const stepUpMocks = vi.hoisted(() => ({ context: vi.fn(), confirm: vi.fn() }));
vi.mock("@/features/account/client/step-up", async (load) => ({
  ...(await load<typeof import("@/features/account/client/step-up")>()),
  readStepUpContext: stepUpMocks.context,
  confirmBrowserStepUp: stepUpMocks.confirm,
}));
vi.mock("@/features/account/client/auth", () => ({}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false }),
}));

vi.mock("@/features/account/client", () => ({
  fetchAccountSessions: () => fetchAccountSessions(),
  getBrowserAuthSession: () => getBrowserAuthSession(),
  revokeAccountSession: (...args: unknown[]) => revokeAccountSession(...args),
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

  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionList />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("SessionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpMocks.context.mockResolvedValue({ key: "same-account-org", accessToken: "old-token" });
    stepUpMocks.confirm.mockResolvedValue("fresh-token");
    revokeAccountSession.mockReset();
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
    expect(stepUpMocks.context).not.toHaveBeenCalled();
    expect(revokeAccountSession).not.toHaveBeenCalled();
  });

  it("retains the selected device through a fresh-proof challenge and revokes once", async () => {
    getBrowserAuthSession.mockResolvedValue(null);
    revokeAccountSession
      .mockRejectedValueOnce(
        Object.assign(new Error("Confirm"), {
          status: 403,
          code: "STEP_UP_REQUIRED",
          method: "totp",
        }),
      )
      .mockResolvedValue({ success: true });
    renderSessionList();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(revokeAccountSession).toHaveBeenCalledTimes(2));
    expect(revokeAccountSession).toHaveBeenNthCalledWith(1, "refresh-token-hash", "old-token");
    expect(revokeAccountSession).toHaveBeenNthCalledWith(2, "refresh-token-hash", "fresh-token");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("keeps the device listed when identity confirmation is cancelled", async () => {
    getBrowserAuthSession.mockResolvedValue(null);
    revokeAccountSession.mockRejectedValueOnce(
      Object.assign(new Error("Confirm"), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "password",
      }),
    );
    renderSessionList();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
    expect(revokeAccountSession).toHaveBeenCalledOnce();
  });

  it("keeps the challenge dismissible when a background refresh empties the device list", async () => {
    getBrowserAuthSession.mockResolvedValue(null);
    revokeAccountSession.mockRejectedValueOnce(
      Object.assign(new Error("Confirm"), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "password",
      }),
    );
    const { queryClient } = renderSessionList();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "unfinished" } });
    act(() => {
      queryClient.setQueryData(queryKeys.account.sessions("user-1"), { active: [], stale: [] });
    });
    expect(await screen.findByText("No active sessions")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("unfinished");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(revokeAccountSession).toHaveBeenCalledOnce();
  });
});
