import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchOrganizationInvitations } from "@/features/organization/client";
import { queryKeys } from "@/lib/query-keys";
import type { Invitation } from "@/types";
import { useDashboardInvitations } from "./useDashboardInvitations";

vi.mock("@/features/organization/client", () => ({
  fetchOrganizationInvitations: vi.fn(),
}));

const invitation = {
  id: "invite-1",
  orgId: "org-1",
  email: "private@example.com",
} as Invitation;

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDashboardInvitations", () => {
  it("does not query or expose cached administrator data in regular-user mode", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.org.invitations("org-1"), [invitation]);

    const { result } = renderHook(() => useDashboardInvitations("org-1", false), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current).toEqual([]);
    expect(fetchOrganizationInvitations).not.toHaveBeenCalled();
  });

  it("retains the invitation query for administrator dashboards", async () => {
    vi.mocked(fetchOrganizationInvitations).mockResolvedValue([invitation]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useDashboardInvitations("org-1", true), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current).toEqual([invitation]));
    expect(fetchOrganizationInvitations).toHaveBeenCalledWith("org-1");
  });
});
