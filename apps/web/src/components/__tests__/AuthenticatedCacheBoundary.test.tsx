import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthenticatedCacheBoundary from "@/components/AuthenticatedCacheBoundary";
import { AuthContext, type AuthContextType } from "@/lib/auth-context";

const mocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  removeChannel: vi.fn(),
  reloadOrganization: vi.fn(),
}));

vi.mock("@/features/account/client", () => ({
  getBrowserRealtimeChannels: (...args: unknown[]) => mocks.getChannels(...args),
  removeBrowserRealtimeChannel: (...args: unknown[]) => mocks.removeChannel(...args),
}));

vi.mock("@/lib/auth-boundary-navigation", () => ({
  reloadForWebAuthOrganizationChange: () => mocks.reloadOrganization(),
}));

function authSession(userId: string, orgId: string, issuedAt = 1): Session {
  const token = `header.${btoa(JSON.stringify({ sub: userId, org_id: orgId, iat: issuedAt }))}.signature`;
  return {
    access_token: token,
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

function authValue(session: Session | null): AuthContextType {
  return {
    user: session?.user ?? null,
    session,
    isLoading: false,
    signOut: vi.fn(),
  };
}

function Harness({
  client,
  session,
  children,
}: {
  client: QueryClient;
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={authValue(session)}>
      <QueryClientProvider client={client}>
        <AuthenticatedCacheBoundary>{children}</AuthenticatedCacheBoundary>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getChannels.mockReturnValue([]);
  mocks.removeChannel.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("AuthenticatedCacheBoundary", () => {
  it("retains mounted content and cached data for token-only rotation", async () => {
    const client = new QueryClient();
    const clear = vi.spyOn(client, "clear");
    const first = authSession("user-1", "org-1", 1);
    const second = authSession("user-1", "org-1", 2);
    client.setQueryData(["tenant-data"], "kept");

    const view = render(
      <Harness client={client} session={first}>
        <span>authenticated content</span>
      </Harness>,
    );

    view.rerender(
      <Harness client={client} session={second}>
        <span>authenticated content</span>
      </Harness>,
    );

    await act(async () => Promise.resolve());
    expect(screen.getByText("authenticated content")).toBeInTheDocument();
    expect(client.getQueryData(["tenant-data"])).toBe("kept");
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });

  it("clears queries and realtime before exposing a different user", async () => {
    const client = new QueryClient();
    const clear = vi.spyOn(client, "clear");
    const channel = { topic: "tenant-channel" };
    mocks.getChannels.mockReturnValue([channel]);
    client.setQueryData(["tenant-data"], "old-user");

    const view = render(
      <Harness client={client} session={authSession("user-1", "org-1")}>
        <span>authenticated content</span>
      </Harness>,
    );

    view.rerender(
      <Harness client={client} session={authSession("user-2", "org-1")}>
        <span>authenticated content</span>
      </Harness>,
    );

    expect(screen.queryByText("authenticated content")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("authenticated content")).toBeInTheDocument());

    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["tenant-data"])).toBeUndefined();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("clears the old organization once and reloads before showing the new one", async () => {
    const client = new QueryClient();
    const clear = vi.spyOn(client, "clear");
    mocks.getChannels.mockReturnValue([{ topic: "org-1" }]);

    const view = render(
      <Harness client={client} session={authSession("user-1", "org-1")}>
        <span>authenticated content</span>
      </Harness>,
    );

    view.rerender(
      <Harness client={client} session={authSession("user-1", "org-2")}>
        <span>authenticated content</span>
      </Harness>,
    );

    expect(screen.queryByText("authenticated content")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.reloadOrganization).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("authenticated content")).not.toBeInTheDocument();
  });

  it("does not finish a stale organization reload after a newer sign-out", async () => {
    const client = new QueryClient();
    let finishFirstCancellation!: () => void;
    const firstCancellation = new Promise<void>((resolve) => {
      finishFirstCancellation = resolve;
    });
    vi.spyOn(client, "cancelQueries")
      .mockReturnValueOnce(firstCancellation)
      .mockResolvedValue(undefined);

    const view = render(
      <Harness client={client} session={authSession("user-1", "org-1")}>
        <span>route content</span>
      </Harness>,
    );

    view.rerender(
      <Harness client={client} session={authSession("user-1", "org-2")}>
        <span>route content</span>
      </Harness>,
    );
    await waitFor(() => expect(client.cancelQueries).toHaveBeenCalledTimes(1));

    view.rerender(
      <Harness client={client} session={null}>
        <span>route content</span>
      </Harness>,
    );
    await waitFor(() => expect(client.cancelQueries).toHaveBeenCalledTimes(2));

    await act(async () => {
      finishFirstCancellation();
      await firstCancellation;
    });

    expect(mocks.reloadOrganization).not.toHaveBeenCalled();
    expect(screen.getByText("route content")).toBeInTheDocument();
  });

  it("clears authenticated state on sign-out without blocking the route guard", async () => {
    const client = new QueryClient();
    const clear = vi.spyOn(client, "clear");
    const view = render(
      <Harness client={client} session={authSession("user-1", "org-1")}>
        <span>route guard remains mounted</span>
      </Harness>,
    );

    view.rerender(
      <Harness client={client} session={null}>
        <span>route guard remains mounted</span>
      </Harness>,
    );

    expect(screen.getByText("route guard remains mounted")).toBeInTheDocument();
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
  });
});
