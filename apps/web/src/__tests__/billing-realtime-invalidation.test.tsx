import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBillingRealtimeInvalidationKeys,
  useBillingRealtimeInvalidation,
} from "@/features/billing/useBillingRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

const mockRemoveBrowserRealtimeChannel = vi.fn((_channel: unknown) => Promise.resolve());
const mockChannel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
const mockCreateBrowserRealtimeChannel = vi.fn((_name: string) => mockChannel);

vi.mock("@/features/account/client", () => ({
  createBrowserRealtimeChannel: (name: string) => mockCreateBrowserRealtimeChannel(name),
  removeBrowserRealtimeChannel: (channel: unknown) => mockRemoveBrowserRealtimeChannel(channel),
}));

vi.mock("@/lib/cache-broadcast", () => ({
  broadcastInvalidation: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("billing realtime invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it("targets billing and shell queries for billing changes", () => {
    expect(getBillingRealtimeInvalidationKeys("org-1")).toEqual([
      queryKeys.org.billing("org-1"),
      queryKeys.org.bootstrapAll(),
      queryKeys.org.detail("org-1"),
    ]);
  });

  it("subscribes to organization and subscription changes for the org", () => {
    const queryClient = new QueryClient();

    const { unmount } = renderHook(() => useBillingRealtimeInvalidation("org-1"), {
      wrapper: createWrapper(queryClient),
    });

    expect(mockCreateBrowserRealtimeChannel).toHaveBeenCalledWith(
      expect.stringMatching(/^billing-freshness:org-1:/),
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "organizations",
        filter: "id=eq.org-1",
      }),
      expect.any(Function),
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "subscriptions",
        filter: "org_id=eq.org-1",
      }),
      expect.any(Function),
    );

    unmount();

    expect(mockRemoveBrowserRealtimeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
